import { Api } from 'telegram';
import { logger, sleep, randomDelay } from './utils.js';
import { config } from './config.js';
import { isUserAlreadyAdded, recordAddedUser } from './storage.js';

export async function searchPublicGroups(client, query) {
    try {
        const result = await client.invoke(
            new Api.contacts.Search({
                q: query,
                limit: config.searchGroupsLimit,
            })
        );
        // Filter for public groups (Megagroups) where users are more likely to be able to post
        return result.chats.filter(c => c.className === 'Channel' && c.username && c.megagroup);
    } catch (err) {
        logger.error(`Error searching groups for query "${query}":`, err.message);
        return [];
    }
}

export async function sendMessage(client, toPeer, text) {
    try {
        await client.sendMessage(toPeer, { message: text });
        logger.success(`Message sent to ${toPeer.username || toPeer}`);
        return true;
    } catch (err) {
        const handled = await handleTelegramError(err);
        if (handled && handled.type === 'FLOOD') {
            logger.warn(`Retrying send in ${handled.seconds}s...`);
            await sleep(handled.seconds * 1000);
            return await sendMessage(client, toPeer, text);
        }
        logger.error(`Error sending message to ${toPeer}:`, err.message);
        return false;
    }
}

export async function getParticipantCount(client, channelId) {
    try {
        const result = await client.invoke(
            new Api.channels.GetFullChannel({ channel: channelId })
        );
        return result.fullChat.participantsCount || 0;
    } catch (err) {
        logger.error(`Error getting participant count for ${channelId}:`, err.message);
        return 0;
    }
}

export async function joinChannel(client, username) {
    try {
        await client.invoke(new Api.channels.JoinChannel({ channel: username }));
        logger.info(`Joined channel: ${username}`);
        return true;
    } catch (err) {
        logger.error(`Error joining ${username}:`, err.message);
        return false;
    }
}

export async function getActiveParticipants(client, channelEntity) {
    try {
        const participants = await client.invoke(
            new Api.channels.GetParticipants({
                channel: channelEntity,
                filter: new Api.ChannelParticipantsRecent(),
                offset: 0,
                limit: config.scrapeUsersPerGroup,
                hash: 0,
            })
        );
        // Filter out bots, deleted accounts, and ones without username/id
        return participants.users.filter(u => !u.bot && !u.deleted && u.username);
    } catch (err) {
        logger.error(`Error fetching participants for ${channelEntity?.username || channelEntity}:`, err.message);
        return [];
    }
}

export async function addContact(client, user) {
    try {
        await client.invoke(
            new Api.contacts.AddContact({
                id: user.username,
                firstName: user.firstName || user.username,
                lastName: user.lastName || '',
                phone: '',
                addPhonePrivacyException: false,
            })
        );
        logger.info(`Added ${user.username} to contacts`);
        return { success: true, floodWait: 0 };
    } catch (err) {
        const handled = await handleTelegramError(err);
        if (handled && handled.type === 'FLOOD') {
            return { success: false, floodWait: handled.seconds };
        }
        logger.error(`Error adding contact ${user.username}:`, err.message);
        return { success: false, floodWait: 0 };
    }
}

export async function handleTelegramError(err) {
    const msg = err.message || "";
    if (msg.includes('FLOOD_WAIT') || msg.includes('wait of') && msg.includes('seconds is required')) {
        const match = msg.match(/\d+/);
        const seconds = match ? parseInt(match[0]) : 60;
        logger.warn(`Flood wait detected! ${seconds} seconds required.`);
        return { type: 'FLOOD', seconds };
    }
    return null;
}


export async function checkIfUserInChannel(client, channelId, userId) {
    try {
        const result = await client.invoke(
            new Api.channels.GetParticipant({
                channel: channelId,
                participant: userId
            })
        );
        return !!result.participant;
    } catch (err) {
        // If 400: USER_NOT_PARTICIPANT, it's a valid "false"
        return false;
    }
}

export async function getJoinedGroups(client) {
    try {
        const dialogs = await client.getDialogs();
        return dialogs
            .filter(d => d.isGroup || d.isChannel) // Megagroups are Channels in GramJS
            .map(d => d.entity)
            .filter(e => e.className === 'Channel' && e.megagroup);
    } catch (err) {
        logger.error("Error fetching joined groups:", err.message);
        return [];
    }
}

export async function inviteToChannel(client, targetChannel, users) {
    let addedCount = 0;
    
    // Resolve target channel
    let targetEntity;
    try {
        targetEntity = await client.getEntity(targetChannel);
    } catch (err) {
        logger.error("Could not resolve target channel entity:", err.message);
        return addedCount;
    }

    for (const user of users) {
        if (isUserAlreadyAdded(user.id)) {
            logger.info(`User ${user.username} already in local DB, skipping.`);
            continue;
        }

        try {
            logger.info(`Attempting to invite ${user.username} to ${targetChannel}...`);
            await client.invoke(
                new Api.channels.InviteToChannel({
                    channel: targetEntity,
                    users: [user.username]
                })
            );
            
            await sleep(5000); 
            const isIn = await checkIfUserInChannel(client, targetEntity, user.username);
            
            if (isIn) {
                logger.success(`✅ SUCCESS: ${user.username} is now a member.`);
                recordAddedUser(user.id, user.username);
                addedCount++;
            } else {
                logger.warn(`❌ FAILED: ${user.username} invitation sent but not in channel (restricted).`);
            }

            await randomDelay(config.delayBetweenAddsMinMs, config.delayBetweenAddsMaxMs);

        } catch (err) {
            const msg = err.message || "";
            const handled = await handleTelegramError(err);
            if (handled && handled.type === 'FLOOD') {
                logger.error(`CRITICAL: Flood wait of ${handled.seconds}s required. Stopping batch.`);
                return { addedCount, floodWait: handled.seconds };
            }

            if (msg.includes('USER_PRIVACY_RESTRICTED')) {
                logger.warn(`Privacy Restricted: ${user.username}`);
                recordAddedUser(user.id, user.username); 
            } else if (msg.includes('USER_ALREADY_PARTICIPANT')) {
                logger.info(`${user.username} already in.`);
                recordAddedUser(user.id, user.username);
            } else if (msg.includes('USER_NOT_MUTUAL_CONTACT')) {
                logger.warn(`Mutual Req: ${user.username}`);
                recordAddedUser(user.id, user.username); 
            } else {
                logger.error(`Error adding ${user.username}:`, msg);
            }
        }
    }

    return { addedCount, floodWait: 0 };
}
export async function getLatestMessage(client, channelId) {
    try {
        const history = await client.invoke(
            new Api.messages.GetHistory({
                peer: channelId,
                offsetId: 0,
                offsetDate: 0,
                addOffset: 0,
                limit: 1,
                maxId: 0,
                minId: 0,
                hash: 0,
            })
        );
        if (history.messages && history.messages.length > 0) {
            return history.messages[0];
        }
        return null;
    } catch (err) {
        logger.error(`Error fetching latest message from ${channelId}:`, err.message);
        return null;
    }
}

export async function forwardMessage(client, toPeer, fromPeer, messageId) {
    try {
        await client.invoke(
            new Api.messages.ForwardMessages({
                fromPeer: fromPeer,
                id: [messageId],
                randomId: [BigInt(Math.floor(Math.random() * 1000000000))],
                toPeer: toPeer,
            })
        );
        logger.success(`Message forwarded to ${toPeer.username || toPeer}`);
        return true;
    } catch (err) {
        const handled = await handleTelegramError(err);
        if (handled && handled.type === 'FLOOD') {
            await sleep(handled.seconds * 1000);
            return await forwardMessage(client, toPeer, fromPeer, messageId);
        }
        logger.error(`Error forwarding message to ${toPeer}:`, err.message);
        return false;
    }
}
