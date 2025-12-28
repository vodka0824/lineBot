/**
 * 統一錯誤處理模組
 */
const { ADMIN_USER_ID } = require('../config/constants');
const lineUtils = require('./line');

/**
 * 處理錯誤
 * @param {Error} error 錯誤物件
 * @param {Object} context 上下文 (包含 replyToken, userId, etc.)
 */
async function handleError(error, context) {
    // 1. 記錄錯誤
    console.error('[System Error]', error);

    const { replyText, userId, message } = context || {};

    // 2. 回覆用戶 (若尚未回覆)
    if (replyText) {
        try {
            await replyText('⚠️ 系統發生錯誤，管理員已收到通知，請稍後再試。');
        } catch (replyError) {
            console.error('[ErrorHandler] Failed to reply to user:', replyError.message);
        }
    }

    // 3. 通知管理員
    if (ADMIN_USER_ID) {
        try {
            const errorMsg = `🚨 系統異常通報\n\n使用者: ${userId || 'Unknown'}\n訊息: ${message || 'N/A'}\n錯誤: ${error.message}\nStack: ${error.stack ? error.stack.split('\n')[1].trim() : 'N/A'}`;
            await lineUtils.pushMessage(ADMIN_USER_ID, [{ type: 'text', text: errorMsg }]);
        } catch (pushError) {
            console.error('[ErrorHandler] Failed to notify admin:', pushError.message);
        }
    }
}

module.exports = {
    handleError
};
