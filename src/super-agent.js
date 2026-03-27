import { getClient, getAvailableSessions } from './client.js';
import { SmartDiscoveryEngine } from './discovery/smart-discovery.js';
import {
    joinChannel, forwardMessage, handleTelegramError, leaveChannel,
    getJoinedGroups, getLatestMessage, checkGroupPermissions
} from './telegram-actions.js';
import {
    saveAgentActivity, getRecentAgentHistory, recordPost, getGroupQuality,
    recordRestrictedGroup, getAllPostedGroups
} from './storage.js';
import { config } from './config.js';
import { logger, sleep, randomDelay } from './utils.js';
import { llmRouter, TaskType } from './llm-providers.js';

/**
 * Super Advanced Telegram Posting Agent
 * Features:
 * - Smart Keyword Expansion
 * - Multi-Hop Group Discovery
 * - Predictive Quality Scoring
 * - Adaptive Learning
 * - Content-Aware Matching
 */
export class SuperAgent {
    constructor() {
        this.client = null;
        this.discoveryEngine = null;
        this.state = {
            accounts: getAvailableSessions(),
            currentAccountIndex: 0,
            currentAccount: 'session',
            postedToday: 0,
            postLimit: config.dailyPostLimit,
            targetChannel: config.targetChannel,
            sourceChannelId: config.sourceChannel,
            niche: config.niche,
            lastAction: "Super Agent initialized",
            recentErrors: [],
            groupsToPost: [],
            qualityGroups: [],
            history: [],
            cycleCount: 0
        };

        // Enhanced tools for super agent
        this.tools = [
            {
                name: "smartDiscover",
                description: "Use advanced multi-strategy discovery to find high-quality groups",
                args: []
            },
            {
                name: "quickDiscover",
                description: "Quick discovery using learned successful keywords",
                args: ["count"]
            },
            {
                name: "joinQualityGroup",
                description: "Join a quality-scored group and prepare for posting",
                args: ["username"]
            },
            {
                name: "postWithTracking",
                description: "Post content to joined groups with full result tracking",
                args: []
            },
            {
                name: "cleanupRestricted",
                description: "Remove restricted or low-performing groups",
                args: []
            },
            {
                name: "getInsights",
                description: "Get learning insights and strategy recommendations",
                args: []
            },
            {
                name: "wait",
                description: "Wait for cooldown period",
                args: ["seconds"]
            },
            {
                name: "finishTask",
                description: "Complete daily posting and exit",
                args: []
            }
        ];
    }

    async init() {
        this.client = await getClient(this.state.currentAccount);
        this.discoveryEngine = new SmartDiscoveryEngine(this.client, this.state.niche);
        this.state.history = getRecentAgentHistory(15);
        await this.updateState();
        logger.success("Super Advanced Agent initialized with Smart Discovery");
    }

    async switchAccount() {
        if (this.state.accounts.length <= 1) {
            logger.warn("No other accounts available for rotation");
            return false;
        }

        this.state.currentAccountIndex = (this.state.currentAccountIndex + 1) % this.state.accounts.length;
        this.state.currentAccount = this.state.accounts[this.state.currentAccountIndex];
        logger.info("Rotating to account: [" + this.state.currentAccount + "]");

        if (this.client) await this.client.disconnect();
        this.client = await getClient(this.state.currentAccount);
        this.discoveryEngine = new SmartDiscoveryEngine(this.client, this.state.niche);
        await this.updateState();
        return true;
    }

    async updateState() {
        this.state.currentTime = new Date().toLocaleString();

        // Track actual posts from storage
        const postedGroups = getAllPostedGroups();
        this.state.postedToday = postedGroups.length;

        const joinedGroups = await getJoinedGroups(this.client);
        this.state.joinedGroupsCount = joinedGroups.length;
    }

    /**
     * Main agent loop
     */
    async run() {
        if (!this.client) await this.init();

        logger.info("SUPER ADVANCED AGENT ACTIVATED!");
        logger.info("Daily post limit: " + this.state.postLimit);
        logger.info("Target niche: " + this.state.niche);

        // Show initial insights
        const recommendations = this.discoveryEngine.getRecommendations();
        if (recommendations.length > 0) {
            logger.info("Strategy Insights:");
            recommendations.slice(0, 3).forEach(r => {
                logger.info("  [" + r.priority + "] " + r.message);
            });
        }

        let cycles = 0;
        const maxCycles = config.maxCyclesPerSession;

        while (cycles < maxCycles) {
            await this.updateState();
            cycles++;
            this.state.cycleCount = cycles;

            logger.info("");
            logger.info("--- Super Agent Cycle " + cycles + "/" + maxCycles + " ---");
            logger.info("Posted: " + this.state.postedToday + "/" + this.state.postLimit + " | Groups: " + this.state.joinedGroupsCount);

            // Check limits
            if (this.state.postedToday >= this.state.postLimit) {
                logger.success("Daily posting limit reached!");
                break;
            }

            // Get agent decision
            const decision = await this.getSuperDecision();
            logger.info("Agent Thought: " + (decision.thought || "Analyzing..."));

            if (decision.action === "finishTask") {
                logger.success("Super Agent completed tasks!");
                break;
            }

            try {
                await this.executeSuperAction(decision.action, decision.args || {});
                saveAgentActivity(decision.action, decision.thought, this.state.lastAction);
            } catch (err) {
                logger.error("Error in " + decision.action + ":", err.message);
                this.state.recentErrors.push(err.message);
                if (this.state.recentErrors.length > 5) {
                    this.state.recentErrors.shift();
                }
            }

            this.state.history = getRecentAgentHistory(5);
            await randomDelay(5000, 10000);
        }

        // Final report
        this.printFinalReport();
        logger.success("Super Agent finished! Total cycles: " + cycles);
    }

    /**
     * Get agent decision using LLM
     */
    async getSuperDecision() {
        const stats = this.discoveryEngine.getStats();
        const recommendations = this.discoveryEngine.getRecommendations();

        const prompt = `You are a SUPER ADVANCED TELEGRAM CONTENT AGENT with intelligent discovery capabilities.

CURRENT STATE:
- Posted today: ${this.state.postedToday}/${this.state.postLimit}
- Joined groups: ${this.state.joinedGroupsCount}
- Cycle: ${this.state.cycleCount}
- Niche: "${this.state.niche}"

AVAILABLE TOOLS:
${JSON.stringify(this.tools, null, 2)}

DISCOVERY STATS:
Keywords tried: ${stats.discovery.keywordsTried}
Groups found: ${stats.discovery.groupsFound}
Groups scored: ${stats.discovery.groupsScored}

STRATEGY:
1. Use "smartDiscover" for comprehensive group discovery
2. Use "quickDiscover" with small count for fast finds
3. Only join groups with quality score >= 6.0
4. Learn from every posting result
5. Balance discovery with posting

DECISION RULES:
- If cycle 1: Use smartDiscover for comprehensive analysis
- If postedToday < 20: Mix discovery + posting
- If postedToday >= 20: Focus on posting + cleanup
- If errors > 3: Use wait tool

OUTPUT FORMAT:
Return ONLY valid JSON:
{ "thought": "Your reasoning", "action": "toolName", "args": { "param": "value" } }`;

        try {
            const reply = await llmRouter.getResponse(TaskType.WEB_SEARCH, prompt);
            const decision = this.extractJSON(reply);

            if (decision && decision.action) {
                return decision;
            }
        } catch (error) {
            logger.error("Decision error:", error.message);
        }

        // Default fallback
        return {
            thought: "Continuing with smart discovery",
            action: "smartDiscover",
            args: {}
        };
    }

    /**
     * Execute super agent action
     */
    async executeSuperAction(action, args) {
        this.state.lastAction = "Executing " + action;

        switch (action) {
            case 'smartDiscover':
                await this.handleSmartDiscover();
                break;

            case 'quickDiscover':
                await this.handleQuickDiscover(args.count || 5);
                break;

            case 'joinQualityGroup':
                await this.handleJoinGroup(args.username);
                break;

            case 'postWithTracking':
                await this.handlePostWithTracking();
                break;

            case 'cleanupRestricted':
                await this.handleCleanup();
                break;

            case 'getInsights':
                await this.handleGetInsights();
                break;

            case 'wait':
                const sec = parseInt(args.seconds) || 60;
                logger.info("Waiting " + sec + "s...");
                await sleep(sec * 1000);
                this.state.lastAction = "Waited " + sec + "s";
                break;

            default:
                logger.warn("Unknown action: " + action);
        }
    }

    /**
     * Handle comprehensive smart discovery
     */
    async handleSmartDiscover() {
        logger.info("Running Smart Discovery Cycle...");

        const result = await this.discoveryEngine.runDiscoveryCycle();

        this.state.qualityGroups = result.groups;
        this.state.groupsToPost = result.groups
            .filter(g => g.recommendation === 'JOIN' || g.recommendation === 'STRONG_JOIN')
            .slice(0, 5)
            .map(g => g.username);

        logger.success("Smart Discovery complete!");
        logger.info("   Groups found: " + result.stats.groupsFound);
        logger.info("   Groups scored: " + result.stats.groupsScored);
        logger.info("   Groups recommended: " + result.stats.groupsRecommended);

        // Show top 5
        if (result.groups.length > 0) {
            logger.info("Top 5 Recommended Groups:");
            result.groups.slice(0, 5).forEach((g, i) => {
                logger.info("   " + (i + 1) + ". " + g.username + " - Score: " + g.qualityScore.toFixed(1));
            });
        }

        this.state.lastAction = "Discovered " + result.groups.length + " quality groups";
    }

    /**
     * Handle quick discovery
     */
    async handleQuickDiscover(count) {
        logger.info("Quick Discovery (" + count + " groups)...");

        const groups = await this.discoveryEngine.getNextBestGroups(count);

        logger.success("Found " + groups.length + " groups:");
        groups.forEach((g, i) => {
            logger.info("   " + (i + 1) + ". " + g.username + " - Score: " + g.qualityScore.toFixed(1));
        });

        this.state.qualityGroups = groups;
        this.state.groupsToPost = groups.map(g => g.username);

        this.state.lastAction = "Quick discovery: " + groups.length + " groups";
    }

    /**
     * Handle joining a group
     */
    async handleJoinGroup(username) {
        logger.info("Joining group: " + username);

        try {
            const joined = await joinChannel(this.client, username);

            if (joined) {
                await randomDelay(3000, 6000);

                // Check permissions
                const perms = await checkGroupPermissions(this.client, username);

                if (perms.canPost) {
                    logger.success("Joined " + username + " - Can post!");
                    this.state.lastAction = "Joined " + username;
                } else {
                    logger.warn("Joined " + username + " - Cannot post (restricted)");
                    recordRestrictedGroup(username);
                    this.state.lastAction = "Joined " + username + " (restricted)";
                }
            }
        } catch (err) {
            const handled = await handleTelegramError(err);
            if (handled) {
                logger.warn("Telegram error joining " + username + ":", handled);
            }
            throw err;
        }
    }

    /**
     * Handle posting with result tracking
     */
    async handlePostWithTracking() {
        const groups = this.state.groupsToPost.slice(0, 3);

        if (groups.length === 0) {
            logger.warn("No groups to post to!");
            return;
        }

        logger.info("Posting to " + groups.length + " groups...");

        // Get latest message
        const message = await getLatestMessage(this.client, this.state.sourceChannelId);
        if (!message) {
            logger.error("No message found in source channel");
            return;
        }

        for (const username of groups) {
            try {
                // Try to forward first
                let success = false;
                try {
                    await forwardMessage(this.client, username, this.state.sourceChannelId, message.id);
                    success = true;
                } catch (e) {
                    // Try sending as text
                    success = await this.client.sendMessage(username, { message: message.text || message.message });
                }

                if (success) {
                    logger.success("Posted to " + username);
                    recordPost(username, message.id);
                    this.state.postedToday++;

                    // Learn from success
                    this.discoveryEngine.recordPostResult(
                        { username: username, keywordSource: 'discovery' },
                        true,
                        { engagement: 7 }
                    );
                }

                await randomDelay(config.delayBetweenPostsMin, config.delayBetweenPostsMax);

            } catch (err) {
                logger.error("Failed to post to " + username + ":", err.message);

                // Learn from failure
                this.discoveryEngine.recordPostResult(
                    { username: username, keywordSource: 'discovery' },
                    false,
                    { error: err.message }
                );

                // Handle errors
                const handled = await handleTelegramError(err);
                if (handled && handled.type === 'FLOOD') {
                    logger.warn("Flood wait " + handled.seconds + "s - pausing...");
                    await sleep(handled.seconds * 1000);
                }
            }
        }

        this.state.lastAction = "Posted to " + groups.length + " groups";
    }

    /**
     * Handle cleanup of restricted groups
     */
    async handleCleanup() {
        logger.info("Cleaning up restricted groups...");

        const joinedGroups = await getJoinedGroups(this.client);
        let cleaned = 0;

        for (const group of joinedGroups) {
            try {
                const perms = await checkGroupPermissions(this.client, group.username);

                if (!perms.canPost || perms.isRestricted) {
                    logger.info("Leaving " + group.username + " (restricted)");
                    await leaveChannel(this.client, group.username);
                    recordRestrictedGroup(group.username);
                    cleaned++;
                }
            } catch (err) {
                // Group might already be left
            }

            await randomDelay(1000, 2000);
        }

        logger.success("Cleaned " + cleaned + " restricted groups");
        this.state.lastAction = "Cleaned " + cleaned + " groups";

        await this.updateState();
    }

    /**
     * Handle getting insights
     */
    async handleGetInsights() {
        const stats = this.discoveryEngine.getStats();
        const recommendations = this.discoveryEngine.getRecommendations();

        logger.info("SUPER AGENT INSIGHTS:");
        logger.info("   Keywords tried: " + stats.discovery.keywordsTried);
        logger.info("   Groups found: " + stats.discovery.groupsFound);
        logger.info("   Groups scored: " + stats.discovery.groupsScored);
        logger.info("   Success rate: " + (stats.learner.successRate * 100).toFixed(1) + "%");

        if (recommendations.length > 0) {
            logger.info("");
            logger.info("RECOMMENDATIONS:");
            recommendations.forEach(r => {
                logger.info("   [" + r.priority + "] " + r.message);
            });
        }

        this.state.lastAction = "Displayed insights";
    }

    /**
     * Print final report
     */
    printFinalReport() {
        const stats = this.discoveryEngine.getStats();

        logger.info("");
        logger.info("==================================================");
        logger.info("SUPER AGENT FINAL REPORT");
        logger.info("==================================================");
        logger.info("Posts made: " + this.state.postedToday);
        logger.info("Cycles run: " + this.state.cycleCount);
        logger.info("Groups discovered: " + stats.discovery.groupsFound);
        logger.info("Groups scored: " + stats.discovery.groupsScored);
        logger.info("Success rate: " + (stats.learner.successRate * 100).toFixed(1) + "%");
        logger.info("==================================================");
    }

    /**
     * Extract JSON from response
     */
    extractJSON(text) {
        try {
            try {
                return JSON.parse(text);
            } catch (e) { }

            const match = text.match(/\{[\s\S]*?\}/);
            if (match) {
                return JSON.parse(match[0]);
            }
        } catch (e) { }
        return null;
    }
}

/**
 * Run single agent cycle
 */
export async function runSuperAgentCycle() {
    const agent = new SuperAgent();
    await agent.run();
}
