import { getClient, getAvailableSessions } from './client.js';
import { getAgentDecision, scoreGroups } from './llm.js';
import {
    searchPublicGroups, joinChannel, getJoinedGroups, getLatestMessage,
    forwardMessage, handleTelegramError, leaveChannel, getParticipantCount,
    sendMessage, sendCustomMessage, checkGroupPermissions, getGroupInfo
} from './telegram-actions.js';
import {
    saveAgentActivity, getRecentAgentHistory, hasAlreadyPosted, recordPost,
    recordGroupQuality, getGroupQuality, recordRestrictedGroup, isRestrictedGroup,
    getAllPostedGroups
} from './storage.js';
import { config } from './config.js';
import { logger, sleep, randomDelay } from './utils.js';

/**
 * Advanced Telegram Posting Agent
 * - Finds high-quality groups based on niche
 * - Posts content to multiple groups
 * - Handles errors gracefully with retry logic
 * - Cleans up restricted groups
 */
export class GrokAgent {
    constructor() {
        this.client = null;
        const sessions = getAvailableSessions();
        this.state = {
            accounts: sessions,
            currentAccountIndex: 0,
            currentAccount: sessions[0] || 'session',
            postedToday: 0,
            postLimit: config.dailyPostLimit,
            targetChannel: config.targetChannel,
            sourceChannelId: config.sourceChannel,
            joinedGroupsCount: 0,
            niche: config.niche,
            lastAction: "Power Agent initialized",
            floodWaitSeconds: 0,
            currentTime: new Date().toLocaleString(),
            lastPostTimestamp: "Never",
            recentErrors: [],
            groupsToPost: [],
            qualityGroups: [],
            history: []
        };

        // Tools - POSTING ONLY
        this.tools = [
            {
                name: "searchGroups",
                description: "Discover new Telegram groups by keyword. Returns quality-scored groups.",
                args: ["query"]
            },
            {
                name: "joinGroup",
                description: "Join a specific group to prepare for posting",
                args: ["username"]
            },
            {
                name: "postToGroups",
                description: "Post latest content from source channel to joined groups with quality scoring",
                args: []
            },
            {
                name: "searchAndPost",
                description: "Combined action: search for groups, join them, and post content in one go",
                args: ["keywords"]
            },
            {
                name: "cleanupGroups",
                description: "Leave restricted, inactive, or low-quality groups",
                args: []
            },
            {
                name: "wait",
                description: "Sleep for cooldown period (use for flood waits or breaks)",
                args: ["seconds"]
            },
            {
                name: "finishTask",
                description: "Complete daily posting tasks and exit",
                args: []
            }
        ];
    }

    async init() {
        this.client = await getClient(this.state.currentAccount);
        this.state.history = getRecentAgentHistory(15);
        await this.updateState();
        logger.info("✅ Advanced Post Agent initialized");
    }

    async switchAccount() {
        if (this.state.accounts.length <= 1) {
            logger.warn("No other accounts available for rotation.");
            return false;
        }
        this.state.currentAccountIndex = (this.state.currentAccountIndex + 1) % this.state.accounts.length;
        this.state.currentAccount = this.state.accounts[this.state.currentAccountIndex];
        logger.info(`🔄 Rotating to account: [${this.state.currentAccount}]`);

        if (this.client) await this.client.disconnect();
        this.client = await getClient(this.state.currentAccount);
        await this.updateState();
        return true;
    }

    async updateState() {
        this.state.currentTime = new Date().toLocaleString();
        const postedGroups = getAllPostedGroups();
        this.state.postedToday = postedGroups.length;

        // Update joined groups count
        const joinedGroups = await getJoinedGroups(this.client);
        this.state.joinedGroupsCount = joinedGroups.length;
    }

    async run() {
        if (!this.client) await this.init();

        logger.info("🚀 Advanced Post Agent activated!");
        logger.info(`📊 Daily post limit: ${this.state.postLimit}`);

        let loop = true;
        let cycles = 0;
        const maxCycles = 50; // More cycles for comprehensive posting

        while (loop && cycles < maxCycles) {
            await this.updateState();
            cycles++;

            logger.info(`--- Power Agent Cycle ${cycles}/${maxCycles} ---`);
            logger.info(`📤 Posted: ${this.state.postedToday}/${this.state.postLimit} | Groups: ${this.state.joinedGroupsCount}`);

            // Check if daily limit reached
            if (this.state.postedToday >= this.state.postLimit) {
                logger.success("🎯 Daily posting limit reached!");
                break;
            }

            const decision = await getAgentDecision(this.state, this.tools);

            logger.info("🤔 Agent Thought: " + (decision.thought || "Analyzing..."));

            if (decision.action === "finishTask") {
                logger.success("✅ Agent completed posting tasks!");
                loop = false;
                break;
            }

            try {
                await this.executeAction(decision.action, decision.args || {});
                saveAgentActivity(decision.action, decision.thought, this.state.lastAction);

                // Account rotation on long flood waits
                if (this.state.floodWaitSeconds >= 7200) { // > 2 hours
                    logger.warn("⚠️ Long flood wait detected. Attempting account rotation...");
                    const success = await this.switchAccount();
                    if (success) {
                        this.state.floodWaitSeconds = 0;
                        this.state.lastAction = "Rotated to new account";
                    }
                }
            } catch (err) {
                logger.error(`❌ Error executing ${decision.action}:`, err.message);
                this.state.lastAction = `Failed: ${decision.action}`;
                this.state.recentErrors.push(err.message);

                // Keep only last 5 errors
                if (this.state.recentErrors.length > 5) {
                    this.state.recentErrors.shift();
                }

                saveAgentActivity(decision.action, decision.thought, this.state.lastAction);
            }

            this.state.history = getRecentAgentHistory(5);
            await randomDelay(8000, 15000);
        }

        logger.success(`🎉 Post Agent finished! Total cycles: ${cycles}`);
    }

    async executeAction(action, args) {
        this.state.lastAction = `Executing ${action}`;

        switch (action) {
            case 'searchGroups':
                await this.handleSearchGroups(args.query);
                break;

            case 'joinGroup':
                await this.handleJoinGroup(args.username);
                break;

            case 'postToGroups':
                await this.handlePostToGroups();
                break;

            case 'searchAndPost':
                await this.handleSearchAndPost(args.keywords);
                break;

            case 'cleanupGroups':
                await this.handleCleanup();
                break;

            case 'wait':
                const sec = parseInt(args.seconds) || 60;
                logger.info(`⏰ Waiting for ${sec} seconds...`);
                await sleep(sec * 1000);
                this.state.floodWaitSeconds = Math.max(0, this.state.floodWaitSeconds - sec);
                this.state.lastAction = `Waited ${sec}s`;
                break;

            default:
                logger.warn(`⚠️ Unknown action: ${action}`);
                break;
        }
    }

    /**
     * Search for groups and score them by quality
     */
    async handleSearchGroups(query) {
        logger.info(`🔍 Searching groups: "${query}"`);

        const groups = await searchPublicGroups(this.client, query);
        logger.info(`📋 Found ${groups.length} groups`);

        if (groups.length === 0) {
            this.state.lastAction = `No groups found for "${query}"`;
            return;
        }

        // Score groups for quality
        const scoredGroups = await scoreGroups(groups, this.state.niche);
        this.state.qualityGroups = scoredGroups;

        const topGroups = scoredGroups.slice(0, 5);
        logger.info(`🏆 Top 5 quality groups:`);
        topGroups.forEach((g, i) => {
            logger.info(`  ${i + 1}. ${g.username} (score: ${g.qualityScore}/10)`);
        });

        this.state.lastAction = `Found ${groups.length} groups, top 5 scored`;
    }

    /**
     * Join a specific group and verify it
     */
    async handleJoinGroup(username) {
        // Check if already restricted
        if (isRestrictedGroup(username)) {
            logger.warn(`⛔ Skipping restricted group: ${username}`);
            this.state.lastAction = `Skipped restricted: ${username}`;
            return;
        }

        logger.info(`📥 Joining group: ${username}`);

        const joined = await joinChannel(this.client, username);

        if (joined) {
            await randomDelay(3000, 6000);

            // Check group permissions
            const permissions = await checkGroupPermissions(this.client, username);

            if (permissions.canPost) {
                logger.success(`✅ Joined ${username} (can post: YES)`);
                recordGroupQuality(username, permissions);
                this.state.joinedGroupsCount++;
                this.state.lastAction = `Joined ${username} ✓`;
            } else {
                logger.warn(`⚠️ Joined ${username} but posting restricted`);
                recordRestrictedGroup(username, 'no_post_permission');
                await leaveChannel(this.client, username);
                this.state.lastAction = `Left ${username} - no posting`;
            }
        } else {
            this.state.lastAction = `Failed to join ${username}`;
        }
    }

    /**
     * Post latest message to all joined groups
     */
    async handlePostToGroups() {
        const msg = await getLatestMessage(this.client, this.state.sourceChannelId);

        if (!msg) {
            logger.error("❌ No message found in source channel");
            this.state.lastAction = "No message to post";
            return;
        }

        logger.info(`📝 Posting message ID: ${msg.id}`);
        logger.info(`   Content: ${msg.message?.substring(0, 50)}...`);

        const joinedGroups = await getJoinedGroups(this.client);
        logger.info(`📋 Total joined groups: ${joinedGroups.length}`);

        let postedCount = 0;
        let failedCount = 0;
        let skippedCount = 0;

        for (const group of joinedGroups) {
            // Check daily limit
            if (this.state.postedToday + postedCount >= this.state.postLimit) {
                logger.info("📊 Daily post limit approaching, stopping...");
                break;
            }

            const groupUsername = group.username || group.title;

            // Skip restricted groups
            if (isRestrictedGroup(groupUsername)) {
                skippedCount++;
                continue;
            }

            // Check duplicate
            if (hasAlreadyPosted(group.id, msg.id)) {
                skippedCount++;
                logger.info(`⏭️ Already posted to ${groupUsername}`);
                continue;
            }

            // Get group quality
            const quality = getGroupQuality(groupUsername);

            // Skip very low quality groups
            if (quality && quality.qualityScore < 3) {
                logger.info(`⏭️ Skipping low-quality group: ${groupUsername}`);
                skippedCount++;
                continue;
            }

            // Attempt to post
            const result = await this.postWithRetry(group, msg, groupUsername);

            if (result.success) {
                postedCount++;
                recordPost(group.id, msg.id);
                this.state.lastPostTimestamp = new Date().toLocaleString();
                logger.success(`✅ Posted to ${groupUsername} (${postedCount}/${this.state.postLimit})`);
            } else if (result.restricted) {
                failedCount++;
                recordRestrictedGroup(groupUsername, result.reason);
                await leaveChannel(this.client, group);
                logger.warn(`🚫 Left restricted group: ${groupUsername}`);
            } else {
                failedCount++;
                logger.error(`❌ Failed to post to ${groupUsername}: ${result.error}`);
            }

            // Random delay between posts (15-45 seconds)
            if (postedCount < this.state.postLimit) {
                await randomDelay(15000, 45000);
            }
        }

        logger.success(`📊 Posting complete! Posted: ${postedCount} | Failed: ${failedCount} | Skipped: ${skippedCount}`);
        this.state.lastAction = `Posted ${postedCount} groups`;
    }

    /**
     * Search, join, and post in one comprehensive action
     */
    async handleSearchAndPost(keywords) {
        logger.info(`🚀 Starting search-and-post for: ${keywords}`);

        // Generate keywords if not provided
        let searchTerms = keywords;
        if (!keywords || keywords.length === 0) {
            const { generateKeywords } = await import('./llm.js');
            searchTerms = await generateKeywords(this.state.niche);
        }

        const keywordList = Array.isArray(searchTerms) ? searchTerms : [searchTerms];
        logger.info(`🔑 Using keywords: ${keywordList.join(', ')}`);

        // Phase 1: Search and discover groups
        const allGroups = [];
        for (const kw of keywordList) {
            if (allGroups.length >= 15) break; // Limit discovery

            const groups = await searchPublicGroups(this.client, kw);
            logger.info(`🔍 "${kw}" → Found ${groups.length} groups`);

            for (const g of groups) {
                if (!allGroups.find(existing => existing.id.toString() === g.id.toString())) {
                    allGroups.push(g);
                }
            }

            await randomDelay(2000, 4000);
        }

        logger.info(`📋 Total unique groups discovered: ${allGroups.length}`);

        if (allGroups.length === 0) {
            this.state.lastAction = "No groups found";
            return;
        }

        // Phase 2: Score and filter groups
        const scoredGroups = await scoreGroups(allGroups, this.state.niche);
        const goodGroups = scoredGroups.filter(g => g.qualityScore >= 6);

        logger.info(`🏆 Quality groups (score ≥6): ${goodGroups.length}`);

        // Phase 3: Join promising groups
        const groupsToJoin = goodGroups.slice(0, 10);
        const joined = [];

        for (const group of groupsToJoin) {
            if (isRestrictedGroup(group.username)) continue;

            const success = await joinChannel(this.client, group.username);
            if (success) {
                joined.push(group);
                recordGroupQuality(group.username, { qualityScore: group.qualityScore });
                logger.success(`✅ Joined ${group.username}`);
            }

            await randomDelay(5000, 10000);
        }

        logger.info(`📥 Successfully joined: ${joined.length} groups`);

        // Phase 4: Get latest message
        const msg = await getLatestMessage(this.client, this.state.sourceChannelId);
        if (!msg) {
            logger.error("❌ No message in source channel!");
            this.state.lastAction = "No message to post";
            return;
        }

        // Phase 5: Post to joined groups
        let posted = 0;
        for (const group of joined) {
            if (this.state.postedToday + posted >= this.state.postLimit) break;
            if (hasAlreadyPosted(group.id, msg.id)) continue;

            const result = await this.postWithRetry(group, msg, group.username);

            if (result.success) {
                posted++;
                recordPost(group.id, msg.id);
                logger.success(`✅ Posted to ${group.username}`);
            } else if (result.restricted) {
                recordRestrictedGroup(group.username, result.reason);
                await leaveChannel(this.client, group);
            }

            await randomDelay(20000, 40000);
        }

        logger.success(`🎯 Search-and-post complete! Posted: ${posted}`);
        this.state.lastAction = `Search-post: ${posted} new groups`;
    }

    /**
     * Clean up restricted or low-quality groups
     */
    async handleCleanup() {
        logger.info(`🧹 Starting group cleanup...`);

        const joinedGroups = await getJoinedGroups(this.client);
        let cleaned = 0;

        for (const group of joinedGroups) {
            const username = group.username || group.title;

            // Check if restricted
            if (isRestrictedGroup(username)) {
                await leaveChannel(this.client, group);
                cleaned++;
                logger.info(`🚫 Left restricted group: ${username}`);
                continue;
            }

            // Check group permissions
            const permissions = await checkGroupPermissions(this.client, username);

            if (!permissions.canPost && permissions.canLeave) {
                await leaveChannel(this.client, group);
                cleaned++;
                recordRestrictedGroup(username, 'no_post_permission');
                logger.warn(`⚠️ Left non-postable group: ${username}`);
            }

            await randomDelay(1000, 2000);
        }

        logger.success(`🧹 Cleanup complete! Left ${cleaned} groups`);
        this.state.joinedGroupsCount = joinedGroups.length - cleaned;
        this.state.lastAction = `Cleaned ${cleaned} groups`;
    }

    /**
     * Post message with smart retry logic
     */
    async postWithRetry(group, msg, groupUsername, maxRetries = 3) {
        // Resolve entities properly for forwarding
        let targetPeer;
        let sourcePeer;

        try {
            targetPeer = await this.client.getEntity(groupUsername);
        } catch (err) {
            logger.error(`❌ Cannot resolve target entity ${groupUsername}:`, err.message);
            return { success: false, error: 'Cannot resolve group entity' };
        }

        try {
            sourcePeer = await this.client.getEntity(this.state.sourceChannelId);
        } catch (err) {
            logger.error(`❌ Cannot resolve source channel:`, err.message);
            return { success: false, error: 'Cannot resolve source channel' };
        }

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Try forward with properly resolved entities
                const forwardResult = await forwardMessage(
                    this.client,
                    targetPeer,
                    sourcePeer,
                    msg.id
                );

                if (forwardResult.success) {
                    return { success: true };
                }

                if (forwardResult.errorType === 'FORBIDDEN') {
                    return { success: false, restricted: true, reason: 'forbidden' };
                }

                // If TOPIC_CLOSED or forwarding error, try text message as fallback
                if (forwardResult.errorType === 'TOPIC_CLOSED' || forwardResult.errorType === 'OTHER') {
                    logger.warn(`⚠️ Forward failed for ${groupUsername}, trying text message...`);

                    if (msg.message) {
                        const textResult = await sendCustomMessage(
                            this.client,
                            targetPeer,
                            msg.message,
                            groupUsername
                        );

                        if (textResult.success) {
                            logger.success(`✅ Text message sent to ${groupUsername}`);
                            return { success: true, method: 'text' };
                        }

                        if (textResult.errorType === 'FLOOD') {
                            return { success: false, restricted: true, reason: 'flood_wait' };
                        }
                    }

                    return { success: false, restricted: true, reason: 'cannot_post' };
                }

                // Retry with exponential backoff
                if (attempt < maxRetries - 1) {
                    const delay = Math.pow(2, attempt) * 5000; // 5s, 10s, 20s
                    logger.info(`🔄 Retry ${attempt + 1} for ${groupUsername} in ${delay / 1000}s...`);
                    await sleep(delay);
                }

            } catch (err) {
                const handled = await handleTelegramError(err);

                if (handled?.type === 'FLOOD') {
                    this.state.floodWaitSeconds = handled.seconds;
                    return { success: false, restricted: true, reason: 'flood_wait' };
                }

                if (handled?.type === 'FORBIDDEN') {
                    return { success: false, restricted: true, reason: 'forbidden' };
                }

                // Last attempt failed - try text message as final fallback
                if (attempt === maxRetries - 1 && msg.message) {
                    logger.warn(`⚠️ Forward failed, trying text message as last resort...`);

                    try {
                        const textResult = await sendCustomMessage(
                            this.client,
                            targetPeer,
                            msg.message,
                            groupUsername
                        );

                        if (textResult.success) {
                            logger.success(`✅ Text message sent to ${groupUsername}`);
                            return { success: true, method: 'text' };
                        }
                    } catch (e) {
                        logger.error(`❌ Text message also failed:`, e.message);
                    }

                    return { success: false, error: err.message };
                }

                return { success: false, error: err.message };
            }
        }

        return { success: false, error: 'Max retries exceeded' };
    }
}

export async function runAgentCycle() {
    const agent = new GrokAgent();
    await agent.run();
}
