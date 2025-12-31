/**
 * LINE API 工具函數
 */
const axios = require('axios');
const { CHANNEL_ACCESS_TOKEN } = require('../config/constants');

/**
 * 發送訊息到 LINE
 */
async function replyToLine(replyToken, messages) {
    await axios.post('https://api.line.me/v2/bot/message/reply', {
        replyToken,
        messages
    }, {
        headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` }
    });
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
    await replyToLine(replyToken, [{ type: 'flex', altText: alt, contents: flex }]);
}

/**
 * 取得群組成員名稱
 */
async function getGroupMemberName(groupId, userId) {
    try {
        const response = await axios.get(
            `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`,
            { headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` } }
        );
        return response.data.displayName;
    } catch (error) {
        console.error('取得成員名稱失敗:', error.message);
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
        console.error('推播訊息失敗:', error.response?.data || error.message);
        throw error; // 讓呼叫者知道失敗
    }
    /**
     * 主動推播 Flex 訊息
     */
    async function pushFlex(to, alt, flex) {
        await pushMessage(to, [{ type: 'flex', altText: alt, contents: flex }]);
    }

    module.exports = {
        replyToLine,
        replyText,
        replyFlex,
        getGroupMemberName,
        pushMessage,
        pushFlex
    };
