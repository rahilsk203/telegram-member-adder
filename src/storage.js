import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.join(__dirname, '..');
const dbPath = path.join(dbDir, 'data.db');

const db = new Database(dbPath);

db.exec(`
    -- Post history table
    CREATE TABLE IF NOT EXISTS post_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT,
        message_id INTEGER,
        posted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, message_id)
    );
    
    -- Agent activity history
    CREATE TABLE IF NOT EXISTS agent_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        action TEXT,
        thought TEXT,
        result TEXT
    );
    
    -- Group quality tracking
    CREATE TABLE IF NOT EXISTS group_quality (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        quality_score REAL DEFAULT 5.0,
        members INTEGER DEFAULT 0,
        success_posts INTEGER DEFAULT 0,
        failed_posts INTEGER DEFAULT 0,
        last_checked DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Restricted groups blacklist
    CREATE TABLE IF NOT EXISTS restricted_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        reason TEXT,
        restricted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// --- POST HISTORY ---

export function hasAlreadyPosted(groupId, messageId) {
    const row = db.prepare('SELECT 1 FROM post_history WHERE group_id = ? AND message_id = ?')
        .get(String(groupId), messageId);
    return !!row;
}

export function recordPost(groupId, messageId) {
    try {
        db.prepare('INSERT OR IGNORE INTO post_history (group_id, message_id) VALUES (?, ?)')
            .run(String(groupId), messageId);
    } catch (err) {
        // Ignore duplicate errors
    }
}

export function getAllPostedGroups() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    return db.prepare(`
        SELECT DISTINCT group_id 
        FROM post_history 
        WHERE posted_at >= ?
    `).all(todayStr);
}

export function getGroupPostStats(groupId) {
    const stats = db.prepare(`
        SELECT 
            COUNT(*) as total_posts,
            COUNT(DISTINCT message_id) as unique_messages
        FROM post_history 
        WHERE group_id = ?
    `).get(String(groupId));

    return stats;
}

// --- AGENT HISTORY ---

export function saveAgentActivity(action, thought, result) {
    const stmt = db.prepare('INSERT INTO agent_history (timestamp, action, thought, result) VALUES (?, ?, ?, ?)');
    stmt.run(new Date().toISOString(), action, thought || '', result || '');
}

export function getRecentAgentHistory(limit = 15) {
    const stmt = db.prepare('SELECT timestamp, action, thought, result FROM agent_history ORDER BY id DESC LIMIT ?');
    const rows = stmt.all(limit);
    return rows.reverse();
}

export function getAgentStats(days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return db.prepare(`
        SELECT 
            action,
            COUNT(*) as count,
            MAX(timestamp) as last_used
        FROM agent_history 
        WHERE timestamp >= ?
        GROUP BY action
        ORDER BY count DESC
    `).all(since.toISOString());
}

// --- GROUP QUALITY TRACKING ---

export function recordGroupQuality(username, data) {
    const { qualityScore = 5.0, members = 0 } = data;

    db.prepare(`
        INSERT INTO group_quality (username, quality_score, members, last_checked)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(username) DO UPDATE SET
            quality_score = MAX(quality_score, ?),
            members = MAX(members, ?),
            last_checked = CURRENT_TIMESTAMP
    `).run(username, qualityScore, members, qualityScore, members);
}

export function getGroupQuality(username) {
    return db.prepare('SELECT * FROM group_quality WHERE username = ?').get(username);
}

export function incrementGroupSuccess(username) {
    db.prepare(`
        UPDATE group_quality 
        SET success_posts = success_posts + 1,
            last_checked = CURRENT_TIMESTAMP
        WHERE username = ?
    `).run(username);
}

export function incrementGroupFailed(username) {
    db.prepare(`
        UPDATE group_quality 
        SET failed_posts = failed_posts + 1,
            last_checked = CURRENT_TIMESTAMP
        WHERE username = ?
    `).run(username);
}

export function getTopQualityGroups(limit = 10) {
    return db.prepare(`
        SELECT * FROM group_quality 
        ORDER BY quality_score DESC, success_posts DESC 
        LIMIT ?
    `).all(limit);
}

export function getLowQualityGroups(threshold = 3.0) {
    return db.prepare(`
        SELECT * FROM group_quality 
        WHERE quality_score < ?
        ORDER BY quality_score ASC
    `).all(threshold);
}

// --- RESTRICTED GROUPS ---

export function recordRestrictedGroup(username, reason) {
    const stmt = db.prepare('INSERT OR IGNORE INTO restricted_groups (username, reason) VALUES (?, ?)');
    stmt.run(username, reason || 'unknown');
}

export function isRestrictedGroup(username) {
    const row = db.prepare('SELECT 1 FROM restricted_groups WHERE username = ?').get(username);
    return !!row;
}

export function getRestrictedGroupReason(username) {
    const row = db.prepare('SELECT reason, restricted_at FROM restricted_groups WHERE username = ?').get(username);
    return row;
}

export function removeRestrictedGroup(username) {
    db.prepare('DELETE FROM restricted_groups WHERE username = ?').run(username);
}

export function getAllRestrictedGroups() {
    return db.prepare('SELECT * FROM restricted_groups ORDER BY restricted_at DESC').all();
}

// --- CLEANUP ---

export function cleanupOldPosts(daysToKeep = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);

    const result = db.prepare('DELETE FROM post_history WHERE posted_at < ?').run(cutoff.toISOString());
    logger.info(`🧹 Cleaned up ${result.changes} old post records`);
    return result.changes;
}

export function cleanupOldHistory(daysToKeep = 14) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);

    const result = db.prepare('DELETE FROM agent_history WHERE timestamp < ?').run(cutoff.toISOString());
    logger.info(`🧹 Cleaned up ${result.changes} old agent history records`);
    return result.changes;
}

// --- STATISTICS ---

export function getDailyStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const postsToday = db.prepare(`
        SELECT COUNT(DISTINCT group_id) as groups, 
               COUNT(*) as posts 
        FROM post_history 
        WHERE posted_at >= ?
    `).get(today.toISOString());

    const groupsJoined = db.prepare('SELECT COUNT(*) as count FROM group_quality WHERE created_at >= ?')
        .get(today.toISOString());

    const restricted = db.prepare('SELECT COUNT(*) as count FROM restricted_groups WHERE restricted_at >= ?')
        .get(today.toISOString());

    return {
        postsToday: postsToday.posts || 0,
        groupsPosted: postsToday.groups || 0,
        newGroups: groupsJoined.count || 0,
        restrictedToday: restricted.count || 0
    };
}
