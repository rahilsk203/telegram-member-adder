import { runSuperAgentCycle } from './src/super-agent.js';
import { logger } from './src/utils.js';

async function test() {
    logger.info("Starting Super Advanced Agent Test...");
    logger.info("This will run the full discovery and posting cycle.");
    logger.info("");

    await runSuperAgentCycle();

    logger.success("Super Agent test completed.");
}

test().catch(err => {
    logger.error("Super Agent test failed:", err);
    process.exit(1);
});
