const lineUtils = require('../utils/line');
// const leaderboardHandler = require('./leaderboard'); // Moved inside function to avoid circular dependency

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
 * 隨機色圖 (黑絲/腳控) - 包含快取池機制
 */

const API_URLS = {
    '黑絲': 'https://v2.api-m.com/api/heisi?return=302',
    '白絲': 'https://api.bbyun.top/api/baisi?type=json'
};

// URL 快取池
const imagePool = {
    '黑絲': [],
    '白絲': []
};

const POOL_SIZE = 5; // 每個類別保留 5 張
let isRefilling = { '黑絲': false, '白絲': false };

async function resolveImageUrl(type) {
    const targetUrl = API_URLS[type];
    if (!targetUrl) return null;

    try {
        console.log(`[ImagePool] Fetching ${type} from ${targetUrl}`);
        // Use native fetch with manual redirect handling
        const res = await fetch(targetUrl, {
            method: 'GET',
            redirect: 'manual', // Do not follow redirects automatically
            headers: {
                // Mimic a real browser to avoid 400/403 errors
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        let finalUrl = null;

        // 1. Try Payload as JSON (Priority for White Silk/Foot)
        if (res.status === 200) {
            try {
                // Clone response to allow text reading if json fails (though we don't strictly need text fallback here yet)
                const data = await res.clone().json();
                if (data) {
                    if (data.image) finalUrl = data.image;
                    else if (data.url) finalUrl = data.url;
                }
            } catch (e) {
                // Not JSON, ignore
            }
        }

        // 2. Handle Redirects (Black Silk)
        if (!finalUrl && (res.status >= 300 && res.status < 400)) {
            const location = res.headers.get('location');
            if (location) {
                finalUrl = location;
            }
        }

        // 3. Fallback
        if (!finalUrl) {
            return null;
        }

        // Decode/Encode to ensure valid URI
        try {
            finalUrl = encodeURI(decodeURI(finalUrl));
        } catch (e) {
            // Ignore decoding errors
        }

        if (!finalUrl.startsWith('http')) return null;

        return finalUrl;
    } catch (error) {
        console.error(`[ImagePool] Resolve ${type} failed:`, error.message);
        return null;
    }
}

async function fillPool(type) {
    if (isRefilling[type]) return;
    isRefilling[type] = true;

    try {
        console.log(`[ImagePool] Refilling ${type}... Current: ${imagePool[type].length}`);
        let attempts = 0;
        // 嘗試補滿到 POOL_SIZE, 最多嘗試 POOL_SIZE * 2 次避免死循環
        while (imagePool[type].length < POOL_SIZE && attempts < POOL_SIZE * 2) {
            attempts++;
            const url = await resolveImageUrl(type);
            if (url) {
                // 避免重複
                if (!imagePool[type].includes(url)) {
                    imagePool[type].push(url);
                }
            } else {
                // 如果失敗稍微等一下? 不，直接 next
            }
        }
        console.log(`[ImagePool] ${type} refilled. Count: ${imagePool[type].length}`);
    } catch (e) {
        console.error(`[ImagePool] Refill error: ${e.message}`);
    } finally {
        isRefilling[type] = false;
    }
}

async function handleRandomImage(context, type) {
    const { replyToken, groupId, userId, isGroup, isAuthorizedGroup } = context;

    if (!API_URLS[type]) return;

    let imageUrl = null;
    let fromCache = false;

    // 1. 嘗試從池中取出
    if (imagePool[type].length > 0) {
        imageUrl = imagePool[type].shift();
        fromCache = true;
        console.log(`[Image] Served ${type} from cache. Remaining: ${imagePool[type].length}`);
    }

    // 2. 如果池是空的，現場抓取
    if (!imageUrl) {
        console.log(`[Image] Cache empty for ${type}, fetching live...`);
        imageUrl = await resolveImageUrl(type);
    }

    // 3. 觸發非同步補貨 (Fire and Forget)
    // Cloud Run 注意: 請求結束後 CPU 可能被節流，導致補貨暫停或失敗。
    // 但這是目前 Serverless 架構下最簡單的加速方案。
    // 只要流量夠，下一個請求進來就會繼續跑。
    fillPool(type).catch(err => console.error('[Background] Fill pool failed', err));

    if (imageUrl) {
        await lineUtils.replyToLine(replyToken, [{
            type: 'image',
            originalContentUrl: imageUrl,
            previewImageUrl: imageUrl
        }]);

        if (isGroup && isAuthorizedGroup) {
            const leaderboardHandler = require('./leaderboard');
            leaderboardHandler.recordImageUsage(groupId, userId, type).catch(() => { });
        }
    } else {
        await lineUtils.replyText(replyToken, '❌ 圖片讀取失敗，請再試一次');
    }
}

module.exports = {
    handleTagBlast,
    handleRandomImage
};
