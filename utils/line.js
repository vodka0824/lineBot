/**
 * LINE API 工具函數
 */
const axios = require('axios');
const { CHANNEL_ACCESS_TOKEN } = require('../config/constants');
const logger = require('./logger');

/**
 * 發送訊息到 LINE
 */
async function replyToLine(replyToken, messages) {
    try {
        await axios.post('https://api.line.me/v2/bot/message/reply', {
            replyToken,
            messages
        }, {
            headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` }
        });
    } catch (error) {
        logger.error('[LINE] Reply failed', error);
        if (error.response && error.response.data) {
            // CRITICAL: Log detailed LINE API error message
            console.error('[LINE API Error Details]:', JSON.stringify(error.response.data, null, 2));
            logger.debug('[LINE] API error details', {
                data: error.response.data,
                payload: messages
            });
        }
        throw error;
    }
}

/**
 * 發送文字訊息
 */
async function replyText(replyToken, text) {
    await replyToLine(replyToken, [{ type: 'text', text }]);
}

/**
 * 發送 Flex 訊息
 */
async function replyFlex(replyToken, alt, flex) {
    try {
        await replyToLine(replyToken, [{ type: 'flex', altText: alt, contents: flex }]);
    } catch (error) {
        // ✅ 詳細記錄 LINE API 錯誤
        logger.error('[LINE API Error Details]:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            flexPreview: JSON.stringify(flex).substring(0, 500)
        });
        throw error;
    }
}

/**
 * 取得群組成員名稱
 */
/**
 * 取得群組/房間成員資料 (完整 Profile)
 */
async function getGroupMemberProfile(groupId, userId) {
    try {
        const type = groupId.startsWith('R') ? 'room' : 'group';
        const url = `https://api.line.me/v2/bot/${type}/${groupId}/member/${userId}`;

        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` }
        });
        return response.data; // { displayName, userId, pictureUrl, statusMessage }
    } catch (error) {
        logger.error(`[LINE] Failed to get member profile`, { groupId, userId, error: error.message });
        return { displayName: '成員', pictureUrl: null }; // Fallback
    }
}

/**
 * 取得群組/房間成員名稱
 */
async function getGroupMemberName(groupId, userId) {
    const profile = await getGroupMemberProfile(groupId, userId);
    return profile.displayName || '成員';
}

/**
 * 取得使用者個人資料 (Bot 個人頻道內的稱呼)
 * 注意：只有加機器人好友的使用者才能抓取到資料
 */
async function getProfile(userId) {
    try {
        const url = `https://api.line.me/v2/bot/profile/${userId}`;
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` }
        });
        return response.data; // { displayName, userId, pictureUrl, statusMessage }
    } catch (error) {
        logger.error(`[LINE] Failed to get user profile`, { userId, error: error.message });
        return { displayName: '冒險者' }; // Fallback
    }
}

/**
 * 主動推播訊息到 LINE
 */
async function pushMessage(to, messages) {
    try {
        await axios.post('https://api.line.me/v2/bot/message/push', {
            to,
            messages
        }, {
            headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` }
        });
    } catch (error) {
        logger.error('[LINE] Push message failed', error);
        throw error; // 讓呼叫者知道失敗
    }
}

/**
 * 主動推播 Flex 訊息
 */
async function pushFlex(to, alt, flex) {
    await pushMessage(to, [{ type: 'flex', altText: alt, contents: flex }]);
}

/**
 * 顯示載入動畫（LINE Messaging API 2024新功能）
 * 只支援一對一聊天，群組聊天會自動忽略
 * 
 * @param {string} userId - 用戶 ID
 * @param {number} seconds - 載入秒數 (5-60秒)
 */
async function showLoadingAnimation(userId, seconds = 10) {
    if (!userId) return;

    // 限制秒數範圍
    if (seconds < 5) seconds = 5;
    if (seconds > 60) seconds = 60;

    try {
        await axios.post(
            'https://api.line.me/v2/bot/chat/loading/start',
            {
                chatId: userId,
                loadingSeconds: seconds
            },
            {
                headers: {
                    'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        logger.debug(`[Loading] Animation shown for ${seconds}s`);
    } catch (error) {
        // 載入動畫失敗不影響主功能，只記錄警告
        logger.warn('[Loading] Failed to show animation', {
            error: error.message
        });
    }
}

module.exports = {
    replyToLine,
    replyText,
    replyFlex,
    getGroupMemberName,
    getGroupMemberProfile,
    pushMessage,
    pushFlex,
    showLoadingAnimation,
    getProfile // Export new function
};
