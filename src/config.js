import dotenv from 'dotenv';
dotenv.config();

export const config = {
    apiId: Number(process.env.API_ID),
    apiHash: process.env.API_HASH,
    targetChannel: process.env.TARGET_CHANNEL,
    niche: process.env.NICHE,
    
    llm: {
        model: process.env.LLM_MODEL || 'grok-3-auto',
    },

    // Daily add limit setup
    dailyAddLimit: 20,
    searchGroupsLimit: 10,
    scrapeUsersPerGroup: 30, // to get around 300 total
    
    // Delays
    delayBetweenAddsMinMs: 25000,
    delayBetweenAddsMaxMs: 45000,
};

if (!config.apiId || !config.apiHash || !config.targetChannel || !config.niche) {
    console.error("Missing required environment variables (API_ID, API_HASH, TARGET_CHANNEL, NICHE). Please check .env file.");
    process.exit(1);
}
