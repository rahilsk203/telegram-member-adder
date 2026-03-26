import { Api } from 'telegram';
import { logger, sleep, randomDelay } from './utils.js';
import { config } from './config.js';

export async function searchPublicGroups(client, query) {
    try {
        const result = await client.invoke(
            new Api.contacts.Search({
                q: query,
                limit: config.searchGroupsLimit,
            })
        );
        // Filter for public groups (Megagroups)
        return result.chats.filter(c =>
            c.className === 'Channel' &&
            c.username &&
            c.megagroup
        );
    } catch (err) {
        logger.error(`❌ Error searching groups for "${query}":`, err.message);
        return [];
    }
}

export async function sendMessage(client, toPeer, text) {
    try {
        await client.sendMessage(toPeer, { message: text });
        logger.success(`📤 Message sent to ${toPeer.username || toPeer}`);
        return true;
    } catch (err) {
        const handled = await handleTelegramError(err);
        if (handled && handled.type === 'FLOOD') {
            logger.warn(`⏰ Flood wait: ${handled.seconds}s`);
            await sleep(handled.seconds * 1000);
            return await sendMessage(client, toPeer, text);
        }
        logger.error(`❌ Error sending message:`, err.message);
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
        logger.error(`❌ Error getting participant count:`, err.message);
        return 0;
    }
}

export async function joinChannel(client, username) {
    try {
        await client.invoke(new Api.channels.JoinChannel({ channel: username }));
        logger.info(`📥 Joined channel: ${username}`);
        return true;
    } catch (err) {
        logger.error(`❌ Error joining ${username}:`, err.message);
        return false;
    }
}

export async function handleTelegramError(err) {
    const msg = (err.message || err.errorMessage || "").toUpperCase();
    if (msg.includes('FLOOD_WAIT') || msg.includes('WAIT OF') && msg.includes('SECONDS IS REQUIRED')) {
        const match = msg.match(/\d+/);
        const seconds = match ? parseInt(match[0]) : 60;
        logger.warn(`⚠️ Flood wait detected! ${seconds} seconds required.`);
        return { type: 'FLOOD', seconds: seconds };
    }
    if (msg.includes('PEER_FLOOD') || msg.includes('FLOOD_PEER')) {
        logger.error("🚫 PEER_FLOOD detected! Account blocked for 24h.");
        return { type: 'FLOOD', seconds: 86400 };
    }
    if (msg.includes('CHAT_WRITE_FORBIDDEN') || msg.includes('CHAT_SEND_WEBPAGE_FORBIDDEN') || msg.includes('CHAT_ADMIN_REQUIRED')) {
        logger.warn("⛔ Group is restricted or admin required.");
        return { type: 'FORBIDDEN' };
    }
    return null;
}

export async function getJoinedGroups(client) {
    try {
        const dialogs = await client.getDialogs();
        return dialogs
            .filter(d => d.isGroup || d.isChannel)
            .map(d => d.entity)
            .filter(e => e.className === 'Channel' && e.megagroup);
    } catch (err) {
        logger.error("❌ Error fetching joined groups:", err.message);
        return [];
    }
}

/**
 * Check if we can post in a group
 */
export async function checkGroupPermissions(client, groupUsername) {
    try {
        const entity = await client.getEntity(groupUsername);

        // Get full channel info
        const fullChannel = await client.invoke(
            new Api.channels.GetFullChannel({ channel: entity })
        );

        const fullChat = fullChannel.fullChat;

        // Check if we have admin rights
        const hasAdminRights = fullChat.defaultBannedRights === undefined ||
            !fullChat.defaultBannedRights?.send_messages;

        // Try to get our participant info
        let canPost = false;
        try {
            const participant = await client.invoke(
                new Api.channels.GetParticipant({
                    channel: entity,
                    participant: 'me'
                })
            );

            // Check if admin or not restricted
            if (participant.participant.className === 'ChannelParticipantAdmin') {
                canPost = true;
            } else if (participant.participant.className === 'ChannelParticipant') {
                // Regular member - check default rights
                canPost = !fullChat.defaultBannedRights?.send_messages;
            }
        } catch (e) {
            // If we can't get participant, assume we can post (Telegram default)
            canPost = true;
        }

        return {
            canPost: canPost || hasAdminRights,
            hasAdminRights,
            isRestricted: fullChat.defaultBannedRights?.send_messages === true,
            canLeave: true
        };

    } catch (err) {
        logger.error(`❌ Error checking permissions for ${groupUsername}:`, err.message);
        return {
            canPost: false,
            hasAdminRights: false,
            isRestricted: true,
            canLeave: true
        };
    }
}

/**
 * Get detailed group information
 */
export async function getGroupInfo(client, groupUsername) {
    try {
        const entity = await client.getEntity(groupUsername);

        const fullChannel = await client.invoke(
            new Api.channels.GetFullChannel({ channel: entity })
        );

        return {
            id: entity.id,
            username: entity.username,
            title: entity.title,
            members: fullChannel.fullChat.participantsCount || 0,
            description: fullChannel.fullChat.about || '',
            isGroup: entity.megagroup,
            hasUsername: !!entity.username
        };
    } catch (err) {
        logger.error(`❌ Error getting info for ${groupUsername}:`, err.message);
        return {
            id: 0,
            username: groupUsername,
            title: '',
            members: 0,
            description: '',
            isGroup: false,
            hasUsername: false
        };
    }
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
        logger.error(`❌ Error fetching latest message:`, err.message);
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
        logger.success(`✅ Message forwarded to ${toPeer.username || toPeer.title || toPeer.id}`);
        return { success: true };
    } catch (err) {
        const handled = await handleTelegramError(err);
        if (handled && handled.type === 'FLOOD') {
            await sleep(handled.seconds * 1000);
            return await forwardMessage(client, toPeer, fromPeer, messageId);
        }
        if (handled && handled.type === 'FORBIDDEN') {
            return { success: false, errorType: 'FORBIDDEN' };
        }
        logger.error(`❌ Error forwarding message:`, err.message);
        return { success: false, errorType: 'OTHER' };
    }
}

export async function leaveChannel(client, channel) {
    try {
        const entity = await client.getEntity(channel);
        await client.invoke(new Api.channels.LeaveChannel({ channel: entity }));
        logger.info(`👋 Left channel: ${channel.username || channel.title || channel}`);
        return true;
    } catch (err) {
        logger.error(`❌ Error leaving channel:`, err.message);
        return false;
    }
}

/**
 * Send message with custom text (fallback for when forward fails)
 */
export async function sendCustomMessage(client, toPeer, message, groupUsername) {
    try {
        // Add group-specific intro
        const intro = `📢 *Shared in ${groupUsername}*\n\n`;
        const fullMessage = intro + message;

        await client.sendMessage(toPeer, {
            message: fullMessage,
            parseMode: 'markdown'
        });

        logger.success(`✅ Custom message sent to ${groupUsername}`);
        return { success: true };
    } catch (err) {
        const handled = await handleTelegramError(err);
        if (handled && handled.type === 'FLOOD') {
            logger.warn(`⏰ Flood wait: ${handled.seconds}s`);
            return { success: false, errorType: 'FLOOD', waitSeconds: handled.seconds };
        }
        logger.error(`❌ Error sending custom message:`, err.message);
        return { success: false, errorType: 'OTHER' };
    }
}
