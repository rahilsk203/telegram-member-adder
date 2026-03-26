import { Grok } from '../core/grok.js';
import { config } from './config.js';
import { logger } from './utils.js';

/**
 * Task types for LLM routing
 */
export const TaskType = {
    GENERAL: 'general',           // Non-web search tasks (keywords, scoring)
    WEB_SEARCH: 'web_search',      // Tasks requiring web search (agent decisions)
};

/**
 * Pollinations AI Provider (OpenAI-compatible, for general tasks)
 */
export class PollinationsProvider {
    constructor() {
        this.baseUrl = config.pollinations.baseUrl;
        this.model = config.pollinations.model;
        this.apiKey = config.pollinations.apiKey;
    }

    async chat(messages, retries = 3) {
        const url = `${this.baseUrl}/chat/completions`;

        const headers = {
            'Content-Type': 'application/json',
        };

        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: this.model,
                        messages: messages,
                        stream: false,
                    }),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Pollinations API error: ${response.status} - ${errorText}`);
                }

                const data = await response.json();
                return data.choices[0].message.content;
            } catch (err) {
                logger.warn(`Pollinations attempt ${i + 1} failed:`, err.message);
                if (i === retries - 1) throw err;
                await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
            }
        }
        throw new Error("Pollinations AI failed after all retries");
    }

    async * chatStream(messages) {
        const url = `${this.baseUrl}/chat/completions`;

        const headers = {
            'Content-Type': 'application/json',
        };

        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: this.model,
                messages: messages,
                stream: true,
            }),
        });

        if (!response.ok) {
            throw new Error(`Pollinations API error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        yield { type: 'done' };
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content;
                        if (content) {
                            yield { type: 'token', data: content };
                        }
                    } catch (e) { }
                }
            }
        }

        yield { type: 'done' };
    }
}

/**
 * Grok Provider (for web search tasks)
 */
export class GrokProvider {
    constructor(model = null) {
        this.model = model || config.llm.model;
    }

    async chat(prompt, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const grok = new Grok(this.model);
                const stream = await grok.startConvo(prompt);

                let fullResponse = "";
                let finalData = null;

                for await (const chunk of stream) {
                    if (chunk.type === 'token') {
                        fullResponse += chunk.data;
                    } else if (chunk.type === 'final') {
                        finalData = chunk.data.response;
                    }
                }

                const result = finalData || fullResponse;
                if (result && result.trim().length > 0) {
                    return result;
                }

                logger.warn(`Grok (${this.model}) attempt ${i + 1} empty. Retrying...`);
                this.model = "grok-3-fast"; // Fallback to fast model
            } catch (err) {
                logger.error(`Grok attempt ${i + 1} failed:`, err.message);
                if (i === retries - 1) throw err;
            }
            await new Promise(r => setTimeout(r, 6000 + Math.random() * 2000));
        }
        throw new Error("Grok failed after all retries");
    }
}

/**
 * LLM Router - Routes requests to appropriate provider based on task type
 */
export class LLMRouter {
    constructor() {
        this.pollinations = new PollinationsProvider();
        this.grok = new GrokProvider();
    }

    /**
     * Get response from appropriate LLM based on task type
     * @param {string} taskType - TaskType.GENERAL or TaskType.WEB_SEARCH
     * @param {string|object} input - Prompt string or messages array
     * @returns {Promise<string>} - LLM response
     */
    async getResponse(taskType, input) {
        if (taskType === TaskType.WEB_SEARCH) {
            logger.info("Routing to Grok (web search task)");
            try {
                return await this.grok.chat(input);
            } catch (grokError) {
                logger.error(`❌ Grok failed: ${grokError.message}`);
                logger.warn("⚠️ Falling back to Pollinations AI...");

                // Fallback to Pollinations
                try {
                    const messages = [{ role: 'user', content: input }];
                    return await this.pollinations.chat(messages);
                } catch (pollError) {
                    logger.error(`❌ Pollinations also failed: ${pollError.message}`);
                    throw new Error("All LLM providers failed");
                }
            }
        } else {
            logger.info("Routing to Pollinations AI (general task)");
            // Convert prompt string to messages format for Pollinations
            const messages = typeof input === 'string'
                ? [{ role: 'user', content: input }]
                : input;
            return await this.pollinations.chat(messages);
        }
    }

    /**
     * Classify task type based on prompt/task content
     * @param {string} task - Task identifier or description
     * @returns {string} - TaskType
     */
    classifyTask(task) {
        // Web search tasks
        const webSearchKeywords = [
            'search', 'web', 'internet', 'online', 'latest', 'news',
            'find groups', 'discover', 'research'
        ];

        const taskLower = task.toLowerCase();

        // Check if task explicitly needs web search
        for (const keyword of webSearchKeywords) {
            if (taskLower.includes(keyword)) {
                return TaskType.WEB_SEARCH;
            }
        }

        // Default to general for keyword generation and user scoring
        return TaskType.GENERAL;
    }
}

// Singleton instance
export const llmRouter = new LLMRouter();
