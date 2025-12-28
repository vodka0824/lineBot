/**
 * 指令路由模組
 */
const authUtils = require('./auth');

class CommandRouter {
    constructor() {
        this.routes = [];
    }

    /**
     * 註冊指令
     * @param {string|RegExp|Function} pattern 匹配模式
     * @param {Function} handler 處理函式 (context, match) => Promise<void>
     * @param {Object} options 選項
     * @param {boolean} options.isGroupOnly 僅限群組
     * @param {boolean} options.needAuth 需要群組已註冊
     * @param {boolean} options.adminOnly 僅限超級管理員
     * @param {string} options.feature 需要開啟的功能 (例如 'weather', 'ai')
     */
    register(pattern, handler, options = {}) {
        this.routes.push({ pattern, handler, options });
    }

    /**
     * 執行指令
     * @param {string} message 訊息內容
     * @param {Object} context 上下文 (replyToken, userId, groupId, etc.)
     * @returns {Promise<boolean>} 是否已處理
     */
    async execute(message, context) {
        const { isGroup, isAuthorizedGroup, isSuper, groupId } = context;

        for (const route of this.routes) {
            // 1. 匹配檢查
            let match = null;
            if (typeof route.pattern === 'string') {
                if (message === route.pattern) match = [message];
            } else if (route.pattern instanceof RegExp) {
                match = message.match(route.pattern);
            } else if (typeof route.pattern === 'function') {
                if (route.pattern(message)) match = [message];
            }

            if (!match) continue;

            // 2. 條件檢查
            const { isGroupOnly, needAuth, adminOnly, feature } = route.options;

            if (isGroupOnly && !isGroup) continue;
            if (needAuth && isGroup && !isAuthorizedGroup) continue;
            if (adminOnly && !isSuper) continue;

            // 3. 功能開關檢查
            if (feature && isGroup) {
                // 如果需要授權但群組未授權，前面已擋掉。
                // 這裡檢查功能是否被停用
                if (!authUtils.isFeatureEnabled(groupId, feature)) continue;
            }

            // 4. 執行處理
            try {
                const result = await route.handler(context, match);
                if (result === false) continue;
                return true;
            } catch (error) {
                console.error(`[Router] Error executing command: ${message}`, error);
                // 可以選擇是否要回覆錯誤訊息給用戶
                return true; // 視為已處理 (即使出錯)
            }
        }

        return false;
    }
}

module.exports = new CommandRouter();
