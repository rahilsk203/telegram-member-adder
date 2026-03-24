import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { logger } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, '..', 'sessions', 'session.txt');

export async function getClient() {
    let sessionString = '';
    if (fs.existsSync(SESSION_FILE)) {
        sessionString = fs.readFileSync(SESSION_FILE, 'utf-8');
    }

    const stringSession = new StringSession(sessionString);
    const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => await input.text("Please enter your number: "),
        password: async () => await input.text("Please enter your password: "),
        phoneCode: async () => await input.text("Please enter the code you received: "),
        onError: (err) => logger.error("Telegram Login Error:", err),
    });

    logger.success("You should now be connected to Telegram.");

    if (!sessionString) {
        fs.writeFileSync(SESSION_FILE, client.session.save(), 'utf-8');
        logger.info("Session saved to sessions/session.txt");
    }

    return client;
}
