import { getClient } from './client.js';
import { generateKeywords, scoreGroups } from './llm.js';
import {
    searchPublicGroups, joinChannel, getJoinedGroups, getLatestMessage,
    forwardMessage, sendMessage, sendCustomMessage, checkGroupPermissions, leaveChannel,
    getGroupInfo
} from './telegram-actions.js';
import {
    recordPost, getAllPostedGroups, recordGroupQuality, isRestrictedGroup,
    recordRestrictedGroup, getGroupQuality
} from './storage.js';
import { config } from './config.js';
import { logger, randomDelay, sleep } from './utils.js';

/**
 * Advanced Daily Posting Job
 * - Discovers high-quality groups
 * - Joins and posts content
 * - Cleans up restricted groups
 * - Tracks quality metrics
 */
export async function runDailyPostJob() {
    logger.info("========================================");
    logger.info("🚀 STARTING ADVANCED DAILY POST JOB");
    logger.info("========================================");

    let client;
    try {
        client = await getClient();
    } catch (err) {
        logger.error("❌ Failed to initialize Telegram client:", err.message);
        return;
    }

    const sourceChannelId = config.sourceChannel;

    // Step 1: Get latest message from source
    logger.info("📥 Fetching latest message...");
    const msg = await getLatestMessage(client, sourceChannelId);
    if (!msg) {
        logger.error("❌ No message found in source channel!");
        return;
    }
    logger.success(`✅ Got message (ID: ${msg.id})`);
    logger.info(`   Preview: ${msg.message?.substring(0, 80)}...`);

    // Step 2: Get existing joined groups
    logger.info("📋 Checking existing groups...");
    const existingGroups = await getJoinedGroups(client);
    logger.info(`   Already joined: ${existingGroups.length} groups`);

    const targetGroups = [];

    // Add existing high-quality groups
    for (const g of existingGroups) {
        const username = g.username || g.title;

        // Skip if restricted
        if (isRestrictedGroup(username)) {
            continue;
        }

        // Check quality
        const quality = getGroupQuality(username);

        // Add if quality is good or unknown
        if (!quality || quality.qualityScore >= 5) {
            targetGroups.push(g);
        } else {
            logger.info(`⏭️ Skipping low-quality group: ${username}`);
        }
    }

    logger.info(`📊 Target groups after filtering: ${targetGroups.length}`);

    // Step 3: Discover NEW groups using LLM keywords
    logger.info("🔍 Generating search keywords...");
    const keywords = await generateKeywords(config.niche);
    logger.info(`   Keywords: ${keywords.join(', ')}`);

    for (const kw of keywords) {
        if (targetGroups.length >= 15) break; // Limit to 15 groups

        logger.info(`\n🔎 Searching: "${kw}"`);
        const groups = await searchPublicGroups(client, kw);
        logger.info(`   Found ${groups.length} groups`);

        for (const g of groups) {
            if (targetGroups.length >= 15) break;

            const username = g.username;

            // Skip if already in list
            if (targetGroups.find(tg => tg.id.toString() === g.id.toString())) {
                continue;
            }

            // Skip restricted
            if (isRestrictedGroup(username)) {
                continue;
            }

            // Get group info
            const groupInfo = await getGroupInfo(client, username);

            // Quality filter: member count 500-100k
            if (groupInfo.members >= 500 && groupInfo.members <= 100000) {
                targetGroups.push(g);
                logger.success(`   ✅ Added ${username} (${groupInfo.members} members)`);
            } else {
                logger.info(`   ⏭️ Skipped ${username} (${groupInfo.members} members)`);
            }
        }

        await randomDelay(3000, 6000);
    }

    logger.info(`\n📊 Total groups to process: ${targetGroups.length}`);

    // Step 4: Score all groups for quality
    logger.info("\n🏆 Scoring groups for quality...");
    const scoredGroups = await scoreGroups(targetGroups, config.niche);

    // Sort by quality
    scoredGroups.sort((a, b) => b.qualityScore - a.qualityScore);

    // Log top 5
    logger.info("🏆 Top 5 quality groups:");
    scoredGroups.slice(0, 5).forEach((g, i) => {
        logger.info(`   ${i + 1}. ${g.username} - Score: ${g.qualityScore}/10`);
    });

    // Step 5: Join and post to groups
    logger.info("\n📥 Joining and posting...");
    let postedCount = 0;
    let joinedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const group of scoredGroups) {
        const username = group.username;

        // Check daily limit
        if (postedCount >= config.dailyPostLimit) {
            logger.info("📊 Daily post limit reached!");
            break;
        }

        // Skip if already posted
        if (hasAlreadyPosted(group.id, msg.id)) {
            skippedCount++;
            logger.info(`⏭️ Already posted to ${username}`);
            continue;
        }

        // Check if already joined
        let alreadyJoined = existingGroups.some(g => g.id.toString() === group.id.toString());

        if (!alreadyJoined) {
            // Try to join
            logger.info(`📥 Joining ${username}...`);
            const joined = await joinChannel(client, username);

            if (!joined) {
                failedCount++;
                logger.error(`❌ Failed to join ${username}`);
                continue;
            }

            // Verify permissions
            await randomDelay(2000, 4000);
            const permissions = await checkGroupPermissions(client, username);

            if (!permissions.canPost) {
                logger.warn(`⚠️ ${username} doesn't allow posting`);
                recordRestrictedGroup(username, 'no_post_permission');
                await leaveChannel(client, username);
                failedCount++;
                continue;
            }

            joinedCount++;
            recordGroupQuality(username, {
                qualityScore: group.qualityScore,
                members: group.members || 0
            });
        }

        // Post the message
        logger.info(`📤 Posting to ${username}...`);
        const posted = await postMessage(client, group, sourceChannelId, msg.id, username);

        if (posted) {
            postedCount++;
            recordPost(group.id, msg.id);
            logger.success(`✅ Posted to ${username} (${postedCount}/${config.dailyPostLimit})`);
        } else {
            failedCount++;
            logger.error(`❌ Failed to post to ${username}`);
        }

        // Delay between posts
        if (postedCount < config.dailyPostLimit) {
            await randomDelay(20000, 45000);
        }
    }

    // Step 6: Cleanup low-quality groups
    logger.info("\n🧹 Starting cleanup...");
    const allGroups = await getJoinedGroups(client);
    let cleaned = 0;

    for (const g of allGroups) {
        const username = g.username || g.title;

        // Check if restricted
        if (isRestrictedGroup(username)) {
            await leaveChannel(client, g);
            cleaned++;
            logger.info(`🚫 Left restricted: ${username}`);
            continue;
        }

        // Check quality
        const quality = getGroupQuality(username);

        if (quality && quality.qualityScore < 3) {
            await leaveChannel(client, g);
            cleaned++;
            logger.info(`🗑️ Removed low-quality: ${username}`);
        }

        await randomDelay(500, 1000);
    }

    // Final Summary
    logger.info("\n========================================");
    logger.info("📊 DAILY POST JOB COMPLETE");
    logger.info("========================================");
    logger.info(`   📥 Groups Joined: ${joinedCount}`);
    logger.info(`   📤 Posts Made: ${postedCount}`);
    logger.info(`   ⏭️ Skipped: ${skippedCount}`);
    logger.info(`   ❌ Failed: ${failedCount}`);
    logger.info(`   🧹 Cleaned: ${cleaned}`);
    logger.info("========================================\n");
}

/**
 * Post message with retry logic
 */
async function postMessage(client, group, sourceChannelId, messageId, groupUsername, maxRetries = 3) {
    // Resolve entities properly
    let targetPeer;
    let sourcePeer;

    try {
        targetPeer = await client.getEntity(groupUsername);
    } catch (err) {
        logger.error(`   ❌ Cannot resolve ${groupUsername}:`, err.message);
        return false;
    }

    try {
        sourcePeer = await client.getEntity(sourceChannelId);
    } catch (err) {
        logger.error(`   ❌ Cannot resolve source:`, err.message);
        return false;
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Try forward with resolved entities
            const result = await forwardMessage(client, targetPeer, sourcePeer, messageId);

            if (result.success) {
                return true;
            }

            if (result.errorType === 'FORBIDDEN') {
                recordRestrictedGroup(groupUsername, 'forbidden');
                return false;
            }

            // Try text message as fallback
            if (result.errorType === 'TOPIC_CLOSED' || result.errorType === 'OTHER') {
                logger.info(`   ⚠️ Forward failed, trying text message...`);

                const textResult = await sendCustomMessage(client, targetPeer, message.message || 'Check out this content!', groupUsername);

                if (textResult.success) {
                    logger.success(`   ✅ Text message sent to ${groupUsername}`);
                    return true;
                }

                if (textResult.errorType === 'FLOOD') {
                    return false;
                }

                return false;
            }

            // Retry delay
            if (attempt < maxRetries - 1) {
                const delay = Math.pow(2, attempt) * 5000;
                logger.info(`   🔄 Retrying in ${delay / 1000}s...`);
                await sleep(delay);
            }

        } catch (err) {
            logger.error(`   ❌ Error: ${err.message}`);

            // Try text message on error
            if (attempt === maxRetries - 1) {
                logger.info(`   ⚠️ Trying text message as last resort...`);

                const textResult = await sendCustomMessage(client, targetPeer, message.message || 'Check out this content!', groupUsername);

                if (textResult.success) {
                    logger.success(`   ✅ Text message sent to ${groupUsername}`);
                    return true;
                }

                return false;
            }

            await sleep(3000);
        }
    }

    return false;
}

/**
 * Legacy function for compatibility
 */
export async function runPostForwardingJob(client) {
    // For backwards compatibility
    const sourceChannelId = config.sourceChannel;

    const msg = await getLatestMessage(client, sourceChannelId);
    if (!msg) return;

    const existingGroups = await getJoinedGroups(client);

    for (const g of existingGroups) {
        const username = g.username || g.title;

        if (isRestrictedGroup(username)) continue;
        if (hasAlreadyPosted(g.id, msg.id)) continue;

        const posted = await postMessage(client, g, sourceChannelId, msg.id, username);

        if (posted) {
            recordPost(g.id, msg.id);
        }

        await randomDelay(15000, 30000);
    }
}

/**
 * Main entry point
 */
export async function runDailyJob() {
    await runDailyPostJob();
}
