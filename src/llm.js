import { Grok } from '../core/grok.js';
import { config } from './config.js';
import { logger } from './utils.js';

// Helper to get the final result from Grok stream with retries
async function getGrokResponse(prompt, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const grok = new Grok(config.llm.model);
            const stream = await grok.startConvo(prompt);
            
            let finalData = null;
            for await (const chunk of stream) {
                if (chunk.type === 'final') {
                    finalData = chunk.data.response;
                }
            }
            
            if (finalData) return finalData;
            
            logger.warn(`Grok response attempt ${i + 1} failed (no final message). Retrying...`);
        } catch (err) {
            logger.error(`Grok connection attempt ${i + 1} failed:`, err.message);
            if (i === retries - 1) throw err;
        }
        await new Promise(r => setTimeout(r, 5000)); // Wait before retry
    }
    throw new Error("Failed to get final response from Grok after multiple attempts");
}

export async function generateKeywords(niche) {
    try {
        const prompt = `You are a Telegram group analysis expert. The user wants to find public Telegram groups related to the niche: "${niche}".
Provide a JSON array of 8-12 smart, highly relevant search keywords to find groups where active users might be. Do not include '#' symbols. Use language that users looking for this niche would search for.
Output ONLY a valid JSON array of strings, nothing else. Example: ["keyword1", "keyword 2"]`;

        const reply = await getGrokResponse(prompt);
        const jsonMatch = reply.match(/\[.*\]/s);
        const keywordsArray = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(reply);
        
        return keywordsArray.slice(0, 12);
    } catch (error) {
        logger.error("Error generating keywords from Grok:", error.message);
        return [niche]; // Fallback
    }
}

export async function scoreUsers(users, niche) {
    if (!users || users.length === 0) return [];

    try {
        // We only send minimal data to save tokens
        const userData = users.map(u => ({ id: u.id, username: u.username }));
        
        const prompt = `You are an expert at selecting high-quality Telegram users for the niche: "${niche}".
Here is a list of scraped users:
${JSON.stringify(userData)}

Select the top 20 users who are most likely to be engaged, real users based on their username (avoid obvious bots, spam names, admins, or support accounts). 
Return ONLY a JSON array of the "id"s of the selected users (as strings or numbers). Do not return anything else.`;

        const reply = await getGrokResponse(prompt);
        const jsonMatch = reply.match(/\[.*\]/s);
        let selectedIds = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(reply);

        selectedIds = selectedIds.map(String);
        return users.filter(u => selectedIds.includes(String(u.id))).slice(0, 20);
    } catch (error) {
        logger.error("Error scoring users from Grok:", error.message);
        // Fallback: return random 20 users
        return users.sort(() => 0.5 - Math.random()).slice(0, 20);
    }
}
export async function getAgentDecision(state, tools) {
    try {
        const prompt = `You are a TELEGRAM CHANNEL MANAGER AGENT. Your mission: Grow the channel to 20 daily members and keep it active with tech posts.

STRATEGY & PRIORITIES:
1. DYNAMIC SWITCHING: If "addMembers" is blocked by a high "floodWaitSeconds", DO NOT wait doing nothing. SWITCH to "postToGroups" or "searchGroups" to stay productive.
2. TIMING: Use "currentTime" vs "lastPostTimestamp" and "lastAddTimestamp" to decide if enough time has passed to look human.
3. FORWARDING: You must post high-quality content to groups to keep the channel visible.
4. SAFETY: If everything is blocked, use the "wait" tool for a long duration.

AVAILABLE TOOLS:
${JSON.stringify(tools, null, 2)}

CURRENT STATE:
${JSON.stringify(state, null, 2)}

YOUR THINKING PROCESS:
- Analyze what is already done (added count, messages posted).
- Decide the NEXT logical step.
- If you have enough users scraped, add them.
- If you haven't posted today, find groups and post.
- If everything is done for today, use "finishTask".

OUTPUT FORMAT:
Return ONLY a valid JSON object with "thought" (your reasoning) and "action" (tool name) with "args" (object).
Example: { "thought": "I need more users to add.", "action": "searchGroups", "args": { "query": "AI tools" } }`;

        const reply = await getGrokResponse(prompt);
        const jsonMatch = reply.match(/\{.*\}/s);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(reply);
    } catch (error) {
        logger.error("Error getting agent decision:", error.message);
        return { thought: "Error in reasoning, skipping.", action: "wait", args: { ms: 10000 } };
    }
}
