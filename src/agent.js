import { getClient, getAvailableSessions } from './client.js';
import { getAgentDecision, scoreUsers } from './llm.js';
import { 
    searchPublicGroups, joinChannel, getActiveParticipants, 
    inviteToChannel, addContact, getJoinedGroups, getLatestMessage,
    forwardMessage, handleTelegramError, leaveChannel, getParticipantCount
} from './telegram-actions.js';
import { 
    saveScrapedUsers, getAddedTodayCount, isUserAlreadyAdded, 
    getAllScrapedUsers, saveAgentActivity, getRecentAgentHistory,
    hasAlreadyPosted, recordPost
} from './storage.js';
import { config } from './config.js';
import { logger, sleep, randomDelay } from './utils.js';

export class GrokAgent {
    constructor() {
        this.client = null;
        const sessions = getAvailableSessions();
        this.state = {
            accounts: sessions,
            currentAccountIndex: 0,
            currentAccount: sessions[0] || 'session',
            addedToday: 0,
            dailyLimit: config.dailyAddLimit,
            targetChannel: "-1003899699628",
            sourceChannelId: "-1003899699628",
            recentlyScrapedCount: 0,
            currentParticipantCount: 0,
            niche: config.niche,
            lastAction: "Just started",
            floodWaitSeconds: 0,
            peerFloodDetected: false,
            currentTime: new Date().toLocaleString(),
            lastPostTimestamp: "Never",
            lastAddTimestamp: "Never",
            history: []
        };
        this.tools = [
            { name: "searchGroups", description: "Search for public tech groups by keyword", args: ["query"] },
            { name: "joinGroup", description: "Join a public group or channel", args: ["username"] },
            { name: "scrapeMembers", description: "Scrape members from a group you just joined", args: ["groupUsername"] },
            { name: "addMembers", description: "Select the best members from scraped list and invite them to target channel", args: [] },
            { name: "postToGroups", description: "Find tech groups and post the latest message from source channel", args: ["keywords"] },
            { name: "wait", description: "Sleep for a specific number of seconds (use for long flood waits or breaks)", args: ["seconds"] },
            { name: "finishTask", description: "Exit the agent loop for today", args: [] }
        ];
    }

    async init() {
        this.client = await getClient(this.state.currentAccount);
        this.state.history = getRecentAgentHistory(15);
        await this.updateState();
    }

    async switchAccount() {
        if (this.state.accounts.length <= 1) {
            logger.warn("No other accounts available for rotation.");
            return false;
        }
        this.state.currentAccountIndex = (this.state.currentAccountIndex + 1) % this.state.accounts.length;
        this.state.currentAccount = this.state.accounts[this.state.currentAccountIndex];
        logger.info(`Rotating to account: [${this.state.currentAccount}]`);
        
        if (this.client) await this.client.disconnect();
        this.client = await getClient(this.state.currentAccount);
        await this.updateState();
        return true;
    }

    async updateState() {
        this.state.addedToday = getAddedTodayCount(this.state.currentAccount);
        const scraped = getAllScrapedUsers().filter(u => !isUserAlreadyAdded(u.user_id));
        this.state.recentlyScrapedCount = scraped.length;
        this.state.currentParticipantCount = await getParticipantCount(this.client, this.state.targetChannel);
        this.state.currentTime = new Date().toLocaleString();
    }

    async run() {
        if (!this.client) await this.init();
        
        logger.info("Agentic Mode activated. Reasoning initiated...");
        
        let loop = true;
        let cycles = 0;
        const maxCycles = 30; // Increased for advanced long-term tasks

        while (loop && cycles < maxCycles) {
            await this.updateState();
            cycles++;
            
            logger.info(`--- Power Agent Cycle ${cycles} ---`);
            const decision = await getAgentDecision(this.state, this.tools);
            
            logger.info("Agent Thought: " + (decision.thought || "No clear thought."));
            
            if (decision.action === "finishTask") {
                logger.success("Agent decided to finish task for today.");
                loop = false;
                break;
            }

            try {
                await this.executeAction(decision.action, decision.args || {});
                saveAgentActivity(decision.action, decision.thought, this.state.lastAction);

                // Auto-Rotation Check: If flood wait is > 1 hour, switch account!
                if (this.state.floodWaitSeconds >= 3600 || this.state.peerFloodDetected) {
                    logger.warn("Long-term block detected on current account. Attempting rotation...");
                    const success = await this.switchAccount();
                    if (success) {
                        this.state.floodWaitSeconds = 0;
                        this.state.peerFloodDetected = false;
                        this.state.lastAction = "Rotated account to bypass limit";
                    }
                }
            } catch (err) {
                logger.error(`Error executing agent action ${decision.action}:`, err.message);
                this.state.lastAction = `Failed: ${decision.action} (${err.message})`;
                saveAgentActivity(decision.action, decision.thought, this.state.lastAction);
            }

            // Keep in-memory history fresh for the prompt
            this.state.history = getRecentAgentHistory(5);

            await randomDelay(10000, 20000); 
        }
    }

    async executeAction(action, args) {
        this.state.lastAction = `Executing ${action}`;
        
        switch (action) {
            case 'searchGroups':
                const groups = await searchPublicGroups(this.client, args.query);
                this.state.lastAction = `Found ${groups.length} groups for ${args.query}`;
                break;

            case 'joinGroup':
                await joinChannel(this.client, args.username);
                this.state.lastAction = `Joined ${args.username}`;
                break;

            case 'scrapeMembers':
                const groupEntity = await this.client.getEntity(args.groupUsername);
                const users = await getActiveParticipants(this.client, groupEntity);
                const fresh = users.filter(u => !isUserAlreadyAdded(u.id));
                saveScrapedUsers(fresh, args.groupUsername);
                this.state.lastAction = `Scraped ${fresh.length} users from ${args.groupUsername}`;
                break;

            case 'addMembers':
                const allScraped = getAllScrapedUsers().filter(u => !isUserAlreadyAdded(u.user_id));
                if (allScraped.length === 0) {
                    this.state.lastAction = "No users to add in DB";
                    return;
                }
                if (this.state.addedToday >= this.state.dailyLimit) {
                    logger.info(`Account [${this.state.currentAccount}] reached daily limit. Attempting rotation...`);
                    const success = await this.switchAccount();
                    if (!success) {
                        this.state.lastAction = "Daily limit reached, no more accounts.";
                        return;
                    }
                }

                const usersToAdd = getAllScrapedUsers().filter(u => !isUserAlreadyAdded(u.user_id));
                const selected = await scoreUsers(usersToAdd, config.niche);
                
                if (selected.length === 0) {
                    this.state.lastAction = "No users to add.";
                    return;
                }

                // Add to contacts first
                for (const u of selected) {
                    const addResult = await addContact(this.client, u);
                    if (addResult.floodWait > 0) {
                        logger.warn(`Throttled at AddContact level! Stopping batch.`);
                        this.state.floodWaitSeconds = addResult.floodWait;
                        if (addResult.floodWait >= 3600) this.state.peerFloodDetected = true;
                        this.state.lastAction = `Contact Flood Wait: ${addResult.floodWait}s`;
                        return;
                    }
                    await randomDelay(2000, 5000);
                }
                const result = await inviteToChannel(this.client, this.state.targetChannel, selected, this.state.currentAccount);
                this.state.floodWaitSeconds = result.floodWait;
                if (result.floodWait >= 3600) this.state.peerFloodDetected = true;
                this.state.lastAction = `Added ${result.addedCount} users. Flood wait: ${result.floodWait}s`;
                this.state.lastAddTimestamp = new Date().toLocaleString();
                break;

            case 'postToGroups':
                const msg = await getLatestMessage(this.client, this.state.sourceChannelId);
                if (!msg) {
                    this.state.lastAction = "Post not found";
                    return;
                }
                const existing = await getJoinedGroups(this.client);
                let count = 0;
                for (const g of existing) {
                    if (count >= 5) break;
                    if (g.username && !g.username.toLowerCase().includes("dailyaitoolsfree")) {
                        // Duplicate Check
                        if (hasAlreadyPosted(g.id, msg.id)) {
                            logger.info(`Skipping duplicate post for ${g.username || g.title}`);
                            continue;
                        }

                        const forwardResult = await forwardMessage(this.client, g, this.state.sourceChannelId, msg.id);
                        
                        if (forwardResult.success) {
                            recordPost(g.id, msg.id);
                            count++;
                            await randomDelay(15000, 30000);
                        } else if (forwardResult.errorType === 'FORBIDDEN') {
                            logger.warn(`Group ${g.username || g.title} is forbidden. Cleaning up...`);
                            await leaveChannel(this.client, g);
                        }
                    }
                }
                this.state.lastAction = `Posted to ${count} groups. Cleaned up restricted ones.`;
                this.state.lastPostTimestamp = new Date().toLocaleString();
                break;

            case 'wait':
                const sec = parseInt(args.seconds) || 60;
                logger.info(`Agent initiated wait for ${sec} seconds...`);
                await sleep(sec * 1000);
                this.state.lastAction = `Waited for ${sec}s`;
                this.state.floodWaitSeconds = Math.max(0, this.state.floodWaitSeconds - sec);
                break;

            default:
                logger.warn(`Unknown action: ${action}`);
                break;
        }
    }
}

export async function runAgentCycle() {
    const agent = new GrokAgent();
    await agent.run();
}
