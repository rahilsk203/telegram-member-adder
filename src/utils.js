export function sleep(ms, jitterMs = null) {
    const jitter = jitterMs !== null ? jitterMs : Math.floor(ms * 0.2);
    const addedJitter = Math.floor(Math.random() * jitter);
    return new Promise(resolve => setTimeout(resolve, ms + addedJitter));
}

export async function randomDelay(minMs, maxMs) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1) + minMs);
    await sleep(delay, 0);
}

export const logger = {
    info: (...args) => console.log(`[INFO] ${new Date().toISOString()} -`, ...args),
    warn: (...args) => console.warn(`[WARN] ${new Date().toISOString()} -`, ...args),
    error: (...args) => console.error(`[ERROR] ${new Date().toISOString()} -`, ...args),
    success: (...args) => console.log(`[SUCCESS] ${new Date().toISOString()} -`, ...args)
};
