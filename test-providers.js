import { PollinationsProvider, GrokProvider, LLMRouter, TaskType } from './src/llm-providers.js';
import { logger } from './src/utils.js';

async function testPollinations() {
    logger.info("=== Testing Pollinations AI Provider ===");
    const provider = new PollinationsProvider();

    try {
        const response = await provider.chat([
            { role: 'user', content: 'Say "Hello from Pollinations AI!" in exactly those words.' }
        ]);
        logger.success("Pollinations AI Response:", response);
        return true;
    } catch (err) {
        logger.error("Pollinations AI failed:", err.message);
        return false;
    }
}

async function testGrok() {
    logger.info("=== Testing Grok Provider ===");
    const provider = new GrokProvider();

    try {
        const response = await provider.chat('Say "Hello from Grok!" in exactly those words.');
        logger.success("Grok Response:", response);
        return true;
    } catch (err) {
        logger.error("Grok failed:", err.message);
        return false;
    }
}

async function testRouter() {
    logger.info("=== Testing LLMRouter ===");
    const router = new LLMRouter();

    // Test general task routing to Pollinations
    logger.info("Testing general task (should route to Pollinations)...");
    try {
        const generalResponse = await router.getResponse(
            TaskType.GENERAL,
            'Return the JSON array ["task1", "task2"] only, nothing else.'
        );
        logger.success("General task response:", generalResponse);
    } catch (err) {
        logger.error("General task failed:", err.message);
    }

    // Test web search task routing to Grok
    logger.info("Testing web search task (should route to Grok)...");
    try {
        const webResponse = await router.getResponse(
            TaskType.WEB_SEARCH,
            'Return the JSON array ["web1", "web2"] only, nothing else.'
        );
        logger.success("Web search task response:", webResponse);
    } catch (err) {
        logger.error("Web search task failed:", err.message);
    }

    // Test task classification
    logger.info("Testing task classification...");
    const tests = [
        { task: 'generateKeywords', expected: TaskType.GENERAL },
        { task: 'scoreUsers', expected: TaskType.GENERAL },
        { task: 'searchGroups', expected: TaskType.WEB_SEARCH },
        { task: 'find online resources', expected: TaskType.WEB_SEARCH },
    ];

    for (const t of tests) {
        const result = router.classifyTask(t.task);
        const status = result === t.expected ? '✓' : '✗';
        logger.info(`${status} "${t.task}" classified as ${result} (expected: ${t.expected})`);
    }
}

async function main() {
    logger.info("Starting LLM Providers Test...\n");

    // Test Pollinations
    const pollinationsOk = await testPollinations();
    console.log('');

    // Test Grok
    const grokOk = await testGrok();
    console.log('');

    // Test Router
    await testRouter();

    console.log('\n=== Summary ===');
    logger.info(`Pollinations AI: ${pollinationsOk ? '✓ Working' : '✗ Failed'}`);
    logger.info(`Grok: ${grokOk ? '✓ Working' : '✗ Failed'}`);

    if (pollinationsOk || grokOk) {
        logger.success("\nDual LLM System is working!");
    } else {
        logger.error("\nNo LLM providers are working. Check API keys and configuration.");
    }
}

main().then(() => process.exit(0)).catch(err => {
    logger.error("Test suite failed:", err);
    process.exit(1);
});
