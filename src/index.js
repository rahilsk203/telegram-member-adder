import cron from 'node-cron';
import { runAgentCycle } from './agent.js';
import { getClient } from './client.js';
import { logger } from './utils.js';
import { fileURLToPath } from 'url';

export async function runSetup() {
    logger.info("Setup mode. Initializing client...");
    try {
        await getClient();
        logger.success("Setup complete. Session created successfully in sessions/session.txt");
        process.exit(0);
    } catch (err) {
        logger.error("Setup failed:", err);
        process.exit(1);
    }
}

// Check if running as main script
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
    if (process.argv.includes('--run-now')) {
        logger.info("Manual trigger detected. Starting Agentic Reasoning...");
        runAgentCycle().then(() => {
            logger.success("Agentic cycle finished.");
            process.exit(0);
        }).catch(err => {
            logger.error("Error during agentic run:", err);
            process.exit(1);
        });
    } else {
        logger.info("Starting Telegram Daily Adder Scheduler...");
        logger.info("Job will run every day at 10:00 UTC.");
        
        cron.schedule('0 10 * * *', async () => {
            logger.info("Cron triggered: Starting agentic cycle...");
            try {
                await runAgentCycle();
            } catch (error) {
                logger.error("Unhandled error in agent cycle:", error);
            }
        }, {
            timezone: "UTC"
        });
    
        logger.info("Scheduler running in background. Waiting for next execution...");
    }
}
