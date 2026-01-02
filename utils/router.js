/**
 * 指令路由模組
 */
const authUtils = require('./auth');
const { handleError } = require('./errorHandler');

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

            if (isGroupOnly && !isGroup && !isSuper) continue;
            if (needAuth && isGroup && !isAuthorizedGroup) continue;
            if (adminOnly && !isSuper) continue;

            // 3. 功能開關檢查
            if (feature && isGroup) {
                // 如果需要授權但群組未授權，前面已擋掉。
                // 這裡檢查功能是否被停用
                if (!authUtils.isFeatureEnabled(groupId, feature)) continue;
            }

            // 4. 管理員檢查 (Lazy Check)
            const { needAdmin } = route.options;
            if (needAdmin) {
                const isAdmin = await authUtils.isAdmin(context.userId);
                if (!isAdmin) continue;
            }

            // 4. 執行處理
            try {
                const result = await route.handler(context, match);
                if (result === false) continue;
                return true;
            } catch (error) {
                await handleError(error, context);
                return true; // 視為已處理 (錯誤已捕捉)
            }
        }

        return false;
    }
    /**
     * 註冊 Postback 處理
     * @param {Function} predicate 判斷函式 (data) => boolean
     * @param {Function} handler 處理函式 (context) => Promise<void>
     */
    registerPostback(predicate, handler) {
        if (!this.postbackRoutes) this.postbackRoutes = [];
        this.postbackRoutes.push({ predicate, handler });
    }

    /**
     * 執行 Postback
     * @param {string} data Postback data
     * @param {Object} context 上下文
     * @returns {Promise<boolean>} 是否已處理
     */
    async executePostback(data, context) {
        if (!this.postbackRoutes) return false;

        for (const route of this.postbackRoutes) {
            if (route.predicate(data)) {
                try {
                    await route.handler(context);
                    return true;
                } catch (error) {
                    await handleError(error, context);
                    return true;
                }
            }
        }
        return false;
    }
}

module.exports = new CommandRouter();
