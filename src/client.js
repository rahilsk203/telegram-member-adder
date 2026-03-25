import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { logger } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');

export function getAvailableSessions() {
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);
    return fs.readdirSync(SESSIONS_DIR)
             .filter(f => f.endsWith('.txt'))
             .map(f => f.replace('.txt', ''));
}

export async function getClient(sessionName = 'session') {
    const sessionFile = path.join(SESSIONS_DIR, `${sessionName}.txt`);
    let sessionString = '';
    
    if (fs.existsSync(sessionFile)) {
        sessionString = fs.readFileSync(sessionFile, 'utf-8');
    }

    const stringSession = new StringSession(sessionString);
    const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => await input.text(`[${sessionName}] Enter number: `),
        password: async () => await input.text(`[${sessionName}] Enter password: `),
        phoneCode: async () => await input.text(`[${sessionName}] Enter code: `),
        onError: (err) => logger.error(`[${sessionName}] Login Error:`, err),
    });

    if (!sessionString) {
        fs.writeFileSync(sessionFile, client.session.save(), 'utf-8');
        logger.success(`Account [${sessionName}] session saved.`);
    }

    return client;
}
