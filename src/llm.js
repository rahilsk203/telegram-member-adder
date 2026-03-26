import { llmRouter, TaskType } from './llm-providers.js';
import { logger } from './utils.js';

/**
 * Extract JSON from LLM response with better handling
 */
function extractJSON(text, isArray = false) {
    try {
        // Try direct parse first
        try {
            return JSON.parse(text);
        } catch (e) {
            // Continue to regex extraction
        }

        // Try to find JSON with regex
        let regex;
        if (isArray) {
            regex = /\[[\s\S]*?\]/;
        } else {
            regex = /\{[\s\S]*?\}/;
        }

        const match = text.match(regex);
        if (match) {
            return JSON.parse(match[0]);
        }

        // Try stripping markdown code blocks
        const stripped = text.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();
        try {
            return JSON.parse(stripped);
        } catch (e) {
            // Continue
        }

        // Try stripping "Thinking" or other prefixes
        const lines = text.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if ((isArray && trimmed.startsWith('[')) || (!isArray && trimmed.startsWith('{'))) {
                try {
                    return JSON.parse(trimmed);
                } catch (e) {
                    // Continue
                }
            }
        }

        logger.error("Failed to extract JSON from response");
        return null;
    } catch (err) {
        logger.error("JSON extraction error:", err.message);
        return null;
    }
}

/**
 * Generate search keywords for a niche using LLM
 */
export async function generateKeywords(niche) {
    try {
        const prompt = `You are a Telegram group discovery expert. The user wants to find public Telegram groups related to the niche: "${niche}".
        
Provide a JSON array of 8-12 smart, highly relevant search keywords to find groups where active users might be interested in this topic. 

Requirements:
- Do not include '#' symbols
- Use language that users looking for this niche would search for
- Include variations: broad terms, specific terms, trending terms
- Mix of English and local language terms if appropriate

Output ONLY a valid JSON array of strings, nothing else. 
Example: ["keyword1", "keyword 2", "ai tools", "chatgpt alternatives"]`;

        const reply = await llmRouter.getResponse(TaskType.GENERAL, prompt);
        const keywordsArray = extractJSON(reply, true);

        if (!keywordsArray || !Array.isArray(keywordsArray)) {
            logger.error("Invalid keywords response, using fallback");
            return [niche];
        }

        return keywordsArray.slice(0, 12);
    } catch (error) {
        logger.error("Error generating keywords:", error.message);
        return [niche]; // Fallback
    }
}

/**
 * Score and rank Telegram groups by quality for posting
 */
export async function scoreGroups(groups, niche) {
    if (!groups || groups.length === 0) return [];

    try {
        const groupData = groups.map(g => ({
            username: g.username,
            title: g.title,
            members: g.participantsCount || g.members || 0
        }));

        const prompt = `You are an expert at evaluating Telegram groups for content posting suitability.

Niche: "${niche}"

Here is a list of Telegram groups to evaluate:
${JSON.stringify(groupData, null, 2)}

Scoring Criteria (1-10 scale):
1. RELEVANCE (0-3 points): How directly related is the group to the niche?
2. QUALITY (0-3 points): Is it a professional, active community (not spam/bot-filled)?
3. POSTING POTENTIAL (0-2 points): Likely to accept and engage with content?
4. SIZE APPROPRIATENESS (0-2 points): Sweet spot is 500-50k members (not too small, not too corporate)

Return ONLY a valid JSON array where each element contains:
{
  "username": "groupusername",
  "qualityScore": 8.5,
  "reasoning": "Brief explanation"
}

Order by qualityScore descending. Return all groups with scores.

Example output:
[{"username": "technews", "qualityScore": 8.5, "reasoning": "Active tech community..."}]`;

        const reply = await llmRouter.getResponse(TaskType.GENERAL, prompt);
        const scoredGroups = extractJSON(reply, true);

        if (!scoredGroups || !Array.isArray(scoredGroups)) {
            logger.error("Invalid scored groups response, using defaults");
            return groups.map(g => ({
                ...g,
                qualityScore: 5.0,
                reasoning: 'Default score (LLM unavailable)'
            }));
        }

        // Merge scores with original group data
        return groups.map(g => {
            const scoreData = scoredGroups.find(s => s.username === g.username) || {};
            return {
                ...g,
                qualityScore: scoreData.qualityScore || 5.0,
                reasoning: scoreData.reasoning || 'No analysis available'
            };
        }).sort((a, b) => b.qualityScore - a.qualityScore);

    } catch (error) {
        logger.error("Error scoring groups:", error.message);
        // Fallback: return groups with default score
        return groups.map(g => ({
            ...g,
            qualityScore: 5.0,
            reasoning: 'Default score (LLM unavailable)'
        }));
    }
}

/**
 * Customize message for specific group
 */
export async function customizeMessage(message, groupName, niche) {
    try {
        const prompt = `You are a Telegram content curator. Adapt the following message for posting in a specific group.

Original Message:
"${message}"

Target Group: "${groupName}"
Group Niche: "${niche}"

Requirements:
- Keep the core message intact
- Add a brief, relevant intro if appropriate (1-2 lines max)
- Add relevant hashtags (max 3)
- Keep it natural, not spammy
- If the message is already perfect, return it unchanged

Return ONLY the adapted message, nothing else.`;

        const reply = await llmRouter.getResponse(TaskType.GENERAL, prompt);
        return reply.trim();
    } catch (error) {
        logger.error("Error customizing message:", error.message);
        return message; // Fallback: return original
    }
}

/**
 * Get agent decision using LLM
 */
export async function getAgentDecision(state, tools) {
    try {
        const prompt = `You are a TELEGRAM CONTENT DISTRIBUTION AGENT. Your mission: Maximize posting reach by finding quality groups and distributing content.

CURRENT STATE:
${JSON.stringify(state, null, 2)}

AVAILABLE TOOLS:
${JSON.stringify(tools, null, 2)}

STRATEGY & PRIORITIES:
1. BALANCED APPROACH: Mix finding new groups with posting to existing ones
2. QUALITY OVER QUANTITY: Prefer quality groups over just joining many
3. EFFICIENCY: Use "searchAndPost" for comprehensive action
4. DAILY LIMITS: Respect daily post limits (${state.postLimit})
5. CLEANUP: Remove restricted groups to keep account healthy

DECISION GUIDELINES:
- If postedToday < 10: Focus on finding NEW groups and posting
- If postedToday 10-30: Continue posting to new groups  
- If postedToday >= 30: Mix posting + cleanup
- If flood wait detected: Use wait tool or switch strategy
- Always maintain variety in group discovery

YOUR THINKING:
- Analyze current posting progress
- Decide next best action to maximize reach
- Consider group quality and posting success rates

OUTPUT FORMAT:
Return ONLY valid JSON:
{ "thought": "Your reasoning here", "action": "toolName", "args": { "param": "value" } }

Example actions:
- { "action": "searchGroups", "args": { "query": "AI tools" } }
- { "action": "searchAndPost", "args": { "keywords": ["tech", "ai"] } }
- { "action": "postToGroups", "args": {} }
- { "action": "cleanupGroups", "args": {} }
- { "action": "wait", "args": { "seconds": 300 } }
- { "action": "finishTask", "args": {} }`;

        const reply = await llmRouter.getResponse(TaskType.WEB_SEARCH, prompt);
        const decision = extractJSON(reply, false);

        if (!decision || !decision.action) {
            logger.error("Invalid decision response, using default");
            return {
                thought: "Error in reasoning, continuing with safe action",
                action: "wait",
                args: { seconds: 60 }
            };
        }

        return decision;
    } catch (error) {
        logger.error("Error getting agent decision:", error.message);
        return {
            thought: "Error in reasoning, continuing with safe action",
            action: "wait",
            args: { seconds: 60 }
        };
    }
}

/**
 * Analyze group performance
 */
export async function analyzeGroupPerformance(groupStats) {
    try {
        const prompt = `Analyze this Telegram group's posting performance:

Group Stats:
${JSON.stringify(groupStats, null, 2)}

Provide insights on:
1. Success rate (posts made vs attempts)
2. Engagement quality
3. Recommendations for improvement

Return ONLY valid JSON with analysis and recommendations.`;

        const reply = await llmRouter.getResponse(TaskType.GENERAL, prompt);
        return extractJSON(reply, false);
    } catch (error) {
        logger.error("Error analyzing group:", error.message);
        return null;
    }
}
