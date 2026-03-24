import { runAgentCycle } from './src/agent.js';
import { logger } from './src/utils.js';

async function test() {
    logger.info("Starting Agentic Mode Test...");
    // We only run for a short time or limit the cycles in test if needed, 
    // but runAgentCycle already has a maxCycles limit.
    await runAgentCycle();
}

test().catch(err => {
    logger.error("Agent test failed:", err);
    process.exit(1);
});
