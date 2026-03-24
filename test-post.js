import { getClient } from './src/client.js';
import { runPostForwardingJob } from './src/daily-job.js';
import { logger } from './src/utils.js';

async function test() {
    logger.info("Initializing client for post test...");
    const client = await getClient();
    
    logger.info("Running post forwarding test...");
    await runPostForwardingJob(client);
    
    logger.success("Post test completed.");
}

test().then(() => process.exit(0)).catch(err => {
    logger.error("Post test failed:", err);
    process.exit(1);
});
