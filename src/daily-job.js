import { getClient } from './client.js';
import { generateKeywords, scoreUsers } from './llm.js';
import { searchPublicGroups, joinChannel, getActiveParticipants, addContact, inviteToChannel, getLatestMessage, forwardMessage, sendMessage, getJoinedGroups } from './telegram-actions.js';
import { saveScrapedUsers, getAddedTodayCount, isUserAlreadyAdded, getAllScrapedUsers } from './storage.js';
import { config } from './config.js';
import { logger, randomDelay } from './utils.js';

export async function runPostForwardingJob(client) {
    logger.info("Starting post forwarding job...");
    const sourceChannelId = "-1003899699628"; 
    
    // 1. Get latest message
    const msg = await getLatestMessage(client, sourceChannelId);
    if (!msg) return;
    logger.info(`Found latest message (ID: ${msg.id}).`);

    const targetGroups = [];

    // 2. Add existing groups (Already joined Megagroups)
    logger.info("Checking for already joined groups...");
    const existingGroups = await getJoinedGroups(client);
    for (const g of existingGroups) {
        if (g.username && !g.username.toLowerCase().includes("dailyaitoolsfree")) {
            targetGroups.push(g);
        }
    }
    logger.info(`Found ${targetGroups.length} existing groups to post in.`);

    // 3. Search for NEW tech groups using LLM for variety
    logger.info("Using LLM to discover new tech niches...");
    const techKeywords = await generateKeywords("latest technology and useful AI tools for productivity");
    
    for (const kw of techKeywords) {
        if (targetGroups.length >= 10) break;
        const groups = await searchPublicGroups(client, kw);
        for (const g of groups) {
            if (targetGroups.length >= 10) break;
            if (g.username && !targetGroups.find(tg => tg.id.toString() === g.id.toString())) {
                targetGroups.push(g);
            }
        }
    }

    // 3. Join and post
    for (const group of targetGroups) {
        logger.info(`Forwarding to group: ${group.username}`);
        const joined = await joinChannel(client, group.username);
        if (joined) {
            await randomDelay(5000, 10000); // Wait before posting
            const forwarded = await forwardMessage(client, group, sourceChannelId, msg.id);
            
            // Fallback: If forward fails (e.g. admin required), try sending text
            if (!forwarded && msg.message) {
                logger.info("Attempting to send as text fallback...");
                await sendMessage(client, group, msg.message);
            }
            
            await randomDelay(15000, 30000); // Safety delay between groups
        }
    }
    logger.success("Post forwarding job complete.");
}

export async function runDailyJob() {
    logger.info("Starting up daily routine...");
    
    let client;
    try {
        client = await getClient();
    } catch (err) {
        logger.error("Failed to initialize Telegram client:", err.message);
        return;
    }

    // --- PART 1: MEMBER ADDER ---
    const addedToday = getAddedTodayCount();
    if (addedToday >= config.dailyAddLimit) {
        logger.info(`Already reached daily member adder limit of ${config.dailyAddLimit}. Skipping adder part.`);
    } else {
        try {
            await runMemberAdder(client, addedToday);
        } catch (err) {
            logger.error("Error in member adder part:", err.message);
        }
    }

    // --- PART 2: POST FORWARDING ---
    try {
        await runPostForwardingJob(client);
    } catch (err) {
        logger.error("Error in post forwarding job:", err.message);
    }
    
    logger.success(`Daily routine complete.`);
}

async function runMemberAdder(client, addedToday) {
    logger.info("Starting member adder portion...");

    // 1. LLM generate keywords
    logger.info(`Generating keywords for niche: ${config.niche}`);
    const keywords = await generateKeywords(config.niche);
    logger.info(`Generated keywords: ${keywords.join(', ')}`);

    let scrapedUsers = [];

    // 2. Search & join groups, scrape members
    for (const kw of keywords) {
        if (scrapedUsers.length >= 300) break;

        logger.info(`Searching groups for keyword: ${kw}`);
        const groups = await searchPublicGroups(client, kw);
        
        for (const group of groups) {
            if (scrapedUsers.length >= 300) break;

            await joinChannel(client, group.username);
            await randomDelay(10000, 20000); // 10-20s delay after joining

            logger.info(`Scraping active members from ${group.username}...`);
            const participants = await getActiveParticipants(client, group);
            
            // Filter out ones we already added
            const freshUsers = participants.filter(u => !isUserAlreadyAdded(u.id));
            
            if (freshUsers.length > 0) {
                saveScrapedUsers(freshUsers, group.username);
                scrapedUsers.push(...freshUsers);
                logger.info(`Scraped ${freshUsers.length} fresh users from ${group.username}`);
            }
        }
    }

    if (scrapedUsers.length === 0) {
        logger.info("No new users scraped. Checking DB for previously scraped users...");
        const dbUsers = getAllScrapedUsers().filter(u => !isUserAlreadyAdded(u.user_id));
        scrapedUsers = dbUsers.map(u => ({ id: u.user_id, username: u.username }));
    }

    if (scrapedUsers.length === 0) {
        logger.warn("No users available to add. Exiting daily job.");
        return;
    }

    // 3. LLM Score -> select top 20
    const needed = config.dailyAddLimit - addedToday;
    logger.info(`Scoring ${scrapedUsers.length} users to select top ${needed}...`);
    const selectedUsers = await scoreUsers(scrapedUsers, config.niche);
    
    const usersToAdd = selectedUsers.slice(0, needed);
    logger.info(`Selected ${usersToAdd.length} top users to add.`);

    if (usersToAdd.length === 0) {
        logger.warn("No users selected by LLM. Exiting.");
        return;
    }

    // 4. Add to target channel
    logger.info(`Adding users to target channel: ${config.targetChannel}`);
    
    // Save as contacts first
    for (const u of usersToAdd) {
        await addContact(client, u);
        await randomDelay(2000, 5000);
    }

    const addedCount = await inviteToChannel(client, config.targetChannel, usersToAdd);
    
    logger.success(`Daily job complete. Successfully added ${addedCount} users.`);
}
