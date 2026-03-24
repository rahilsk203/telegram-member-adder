import { generateKeywords, scoreUsers } from './src/llm.js';
import { logger } from './src/utils.js';

async function test() {
    logger.info("Testing Grok Keywords generation...");
    const keywords = await generateKeywords("crypto trading india");
    logger.info("Generated Keywords:", keywords);

    if (keywords.length > 0) {
        logger.info("Testing user scoring...");
        const mockUsers = [
            { id: 1, username: "john_crypto" },
            { id: 2, username: "betting_bot_1" },
            { id: 3, username: "crypto_guy_india" },
            { id: 4, username: "asdf_zxcv_123" }
        ];
        const scores = await scoreUsers(mockUsers, "crypto trading india");
        logger.info("Scored Users:", scores.map(u => u.username));
    }
}

test().then(() => logger.success("Test complete.")).catch(err => logger.error("Test failed:", err));
