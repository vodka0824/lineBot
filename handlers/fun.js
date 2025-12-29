const axios = require('axios');
const leaderboardHandler = require('./leaderboard');

/**
 * 狂標 (Tag Blast)
 * @param {Object} context 路由上下文
 * @param {Array} match 正則匹配結果
 */
async function handleTagBlast(context, match) {
    const { messageObject, replyToken } = context;

    // 1. 檢查是否有提及對象 (Mentions)
    const mentions = messageObject.mention && messageObject.mention.mentions;
    if (!mentions || mentions.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請標記(Tag)一位要狂標的對象！');
        return;
    }

    // 取第一個被標記的人 (為了避免濫用，一次只標一人)
    const target = mentions[0];
    const targetUserId = target.userId;

    // 2. 解析次數 (限制 1~5 次)
    let count = parseInt(match[1]);
    if (isNaN(count)) count = 5; // Default 5
    if (count > 5) count = 5;    // Max 5
    if (count < 1) count = 1;    // Min 1

    // 3. 建構訊息陣列
    // 為了觸發通知，每個訊息都需要包含真正的 Mention Object
    const messages = [];
    for (let i = 0; i < count; i++) {
        messages.push({
            type: 'text',
            text: '起來嗨！ @Target', // 顯示文字
            mention: {
                mentions: [
                    {
                        index: 5,     // "起來嗨！ " length is 5
                        length: 7,    // "@Target" length is 7
                        userId: targetUserId
                    }
                ]
            }
        });
    }

    // 4. 發送 (使用 replyToLine 支援多則訊息)
    await lineUtils.replyToLine(replyToken, messages);
}

/**
 * 隨機色圖 (黑絲/腳控)
 */
async function handleRandomImage(context, type) {
    const { replyToken, groupId, userId, isGroup, isAuthorizedGroup } = context;

    const API_URLS = {
        '黑絲': 'https://v2.api-m.com/api/heisi?return=302',
        '腳控': 'https://3650000.xyz/api/?type=302&mode=7'
    };

    const targetUrl = API_URLS[type];
    if (!targetUrl) return;

    try {
        // Resolve Redirect to get final Image URL
        // Do NOT follow redirects automatically to capture the 302 location if possible,
        // BUT axios follows by default. Let's let it follow and get the final URL.
        const res = await axios.head(targetUrl, {
            timeout: 10000,
            validateStatus: (status) => status >= 200 && status < 400
        });

        // If axios followed redirects, res.request.res.responseUrl (Node) or res.request.responseURL (Browser)
        // In axios node: res.request.res.responseUrl
        let finalUrl = res.request?.res?.responseUrl || targetUrl;

        // Fallback: If status is 302 and axios didn't follow (configured not to), take location.
        // But default follows.

        // Sanitize URL (Encode spaces if any, though uncommon in valid headers)
        finalUrl = encodeURI(decodeURI(finalUrl));

        // Check if it looks like an image (extension)
        // If not, append dummy extension if it's a known image source that lacks it?
        // But usually these redirects end in .jpg
        // Let's just try sending it.

        console.log(`[Image] ${type} resolved to: ${finalUrl}`);

        await lineUtils.replyToLine(replyToken, [{
            type: 'image',
            originalContentUrl: finalUrl,
            previewImageUrl: finalUrl
        }]);

        if (isGroup && isAuthorizedGroup) {
            leaderboardHandler.recordImageUsage(groupId, userId, type).catch(() => { });
        }

    } catch (error) {
        console.error(`[Image] Fetch ${type} failed:`, error.message);
        await lineUtils.replyText(replyToken, '❌ 圖片讀取失敗，請再試一次');
    }
}

module.exports = {
    handleTagBlast,
    handleRandomImage
};
