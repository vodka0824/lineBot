/**
 * 日誌工具模組
 * 統一管理日誌輸出，支援分級和環境控制
 */

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// 日誌級別優先順序
const LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

class Logger {
    constructor() {
        this.currentLevel = LEVELS[LOG_LEVEL] || LEVELS.info;
    }

    /**
     * Debug 級別日誌（開發用）
     */
    debug(message, meta = {}) {
        if (this.currentLevel <= LEVELS.debug) {
            console.log(`[DEBUG] ${message}`, meta);
        }
    }

    /**
     * Info 級別日誌（一般資訊）
     */
    info(message, meta = {}) {
        if (this.currentLevel <= LEVELS.info) {
            console.log(`[INFO] ${message}`, meta);
        }
    }

    /**
     * Warning 級別日誌（警告）
     */
    warn(message, meta = {}) {
        if (this.currentLevel <= LEVELS.warn) {
            console.warn(`[WARN] ${message}`, meta);
        }
    }

    /**
     * Error 級別日誌（錯誤）
     */
    /**
     * Error 級別日誌（錯誤）
     */
    error(message, error = null) {
        if (this.currentLevel <= LEVELS.error) {
            if (error) {
                // Robust error handling: Check if it's a real Error object
                const isErrorObj = error instanceof Error;
                const meta = isErrorObj ? {
                    message: error.message,
                    stack: error.stack,
                    ...(error.response?.data && { apiError: error.response.data })
                } : {
                    rawError: typeof error === 'object' ? JSON.stringify(error) : String(error)
                };

                console.error(`[ERROR] ${message}`, meta);
            } else {
                console.error(`[ERROR] ${message}`);
            }
        }
    }

    /**
     * 清理敏感資訊的日誌輸出
     */
    sanitize(obj) {
        if (!obj || typeof obj !== 'object') return obj;

        const sanitized = { ...obj };
        const sensitiveKeys = ['token', 'password', 'apikey', 'secret', 'authorization'];

        for (const key of Object.keys(sanitized)) {
            if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
                sanitized[key] = '***REDACTED***';
            }
        }

        return sanitized;
    }
}

module.exports = new Logger();
