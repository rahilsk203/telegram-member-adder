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
    CREATE TABLE IF NOT EXISTS added_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE,
        username TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scraped_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE,
        username TEXT,
        group_source TEXT,
        scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_logs (
        date TEXT PRIMARY KEY,
        adds_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS agent_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        action TEXT,
        thought TEXT,
        result TEXT
    );
`);

export function getAddedTodayCount() {
    const today = new Date().toISOString().split('T')[0];
    const row = db.prepare('SELECT adds_count FROM daily_logs WHERE date = ?').get(today);
    return row ? row.adds_count : 0;
}

export function incrementAddedToday() {
    const today = new Date().toISOString().split('T')[0];
    db.prepare(`
        INSERT INTO daily_logs (date, adds_count)
        VALUES (?, 1)
        ON CONFLICT(date) DO UPDATE SET adds_count = adds_count + 1
    `).run(today);
}

export function recordAddedUser(userId, username) {
    db.prepare('INSERT OR IGNORE INTO added_users (user_id, username) VALUES (?, ?)').run(String(userId), username || '');
    incrementAddedToday();
}

export function isUserAlreadyAdded(userId) {
    const row = db.prepare('SELECT 1 FROM added_users WHERE user_id = ?').get(String(userId));
    return !!row;
}

export function saveScrapedUsers(users, groupSource) {
    let count = 0;
    const stmt = db.prepare('INSERT OR IGNORE INTO scraped_users (user_id, username, group_source) VALUES (?, ?, ?)');
    const insertMany = db.transaction((usersList) => {
        for (const user of usersList) {
            const result = stmt.run(String(user.id), user.username || '', groupSource);
            if (result.changes > 0) count++;
        }
    });
    insertMany(users);
    logger.info(`Saved ${count} new scraped users from ${groupSource}`);
}

export function getAllScrapedUsers() {
    return db.prepare('SELECT * FROM scraped_users').all();
}
// --- AGENT HISTORY ---

export function saveAgentActivity(action, thought, result) {
    const stmt = db.prepare('INSERT INTO agent_history (timestamp, action, thought, result) VALUES (?, ?, ?, ?)');
    stmt.run(new Date().toISOString(), action, thought, result);
}

export function getRecentAgentHistory(limit = 15) {
    const stmt = db.prepare('SELECT timestamp, action, thought, result FROM agent_history ORDER BY id DESC LIMIT ?');
    const rows = stmt.all(limit);
    return rows.reverse(); // Return in chronological order for the LLM
}
