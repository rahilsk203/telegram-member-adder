export class Log {
    static Info(message) {
        console.log(`[INFO] ${new Date().toLocaleTimeString()} - ${message}`);
    }
    static Success(message) {
        console.log(`[SUCCESS] ${new Date().toLocaleTimeString()} - ${message}`);
    }
    static Error(message) {
        console.error(`[ERROR] ${new Date().toLocaleTimeString()} - ${message}`);
    }
}
