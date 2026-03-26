import dotenv from 'dotenv';
dotenv.config();

export const config = {
    apiId: Number(process.env.API_ID),
    apiHash: process.env.API_HASH,

    // Channel configuration
    targetChannel: process.env.TARGET_CHANNEL || '',
    sourceChannel: process.env.SOURCE_CHANNEL || '-1003899699628',
    niche: process.env.NICHE || 'Technology and AI Tools',

    // LLM Configuration
    llm: {
        model: process.env.LLM_MODEL || 'grok-3-auto',
    },

    // Pollinations AI Config
    pollinations: {
        apiKey: process.env.POLLINATIONS_API_KEY || '',
        baseUrl: process.env.POLLINATIONS_BASE_URL || 'https://gen.pollinations.ai/v1',
        model: process.env.POLLINATIONS_MODEL || 'openai',
    },

    // Posting Configuration
    dailyPostLimit: 50,                    // Max posts per day
    searchGroupsLimit: 15,                 // Groups to find per search
    maxGroupsToJoin: 10,                   // Max new groups per session

    // Group Quality Thresholds
    minQualityScore: 5.0,                  // Minimum quality score to join
    minGroupMembers: 500,                 // Minimum members for a group
    maxGroupMembers: 100000,               // Maximum members (avoid huge corporate groups)

    // Delays (in milliseconds)
    delayBetweenPostsMin: 20000,          // 20 seconds minimum between posts
    delayBetweenPostsMax: 45000,           // 45 seconds maximum between posts
    delayAfterJoinMin: 5000,               // 5 seconds after joining
    delayAfterJoinMax: 10000,               // 10 seconds after joining
    delayBetweenSearchMin: 3000,           // 3 seconds between searches
    delayBetweenSearchMax: 6000,           // 6 seconds between searches

    // Retry Configuration
    maxRetriesPerGroup: 3,                // Max retry attempts per group
    retryDelayBase: 5000,                 // Base retry delay (5s, 10s, 20s exponential)

    // Cleanup Configuration
    cleanupEnabled: true,                  // Auto-cleanup restricted groups
    minQualityToKeep: 3.0,                 // Remove groups below this score

    // Safety Limits
    maxCyclesPerSession: 50,              // Max agent cycles per session
    maxErrorsBeforePause: 10,             // Pause after this many errors

    // Advanced Features
    useQualityScoring: true,               // Use LLM to score groups
    useContentCustomization: true,        // Customize messages per group
    autoLeaveRestricted: true,            // Automatically leave restricted groups
    trackGroupQuality: true,              // Track and update group quality scores
};

// Validation
if (!config.apiId || !config.apiHash) {
    console.error("❌ Missing required environment variables:");
    console.error("   - API_ID");
    console.error("   - API_HASH");
    console.error("\nPlease check your .env file.");
    process.exit(1);
}

console.log("✅ Configuration loaded:");
console.log(`   📤 Daily post limit: ${config.dailyPostLimit}`);
console.log(`   🔍 Group discovery limit: ${config.searchGroupsLimit}`);
console.log(`   📊 Quality threshold: ${config.minQualityScore}`);
console.log(`   🎯 Niche: ${config.niche}`);
