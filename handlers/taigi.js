/**
 * iTaigi 台語查詢模組
 */
const axios = require('axios');
const lineUtils = require('../utils/line');

// iTaigi API 端點 (使用 URL 編碼路徑)
const ITAIGI_API = 'https://itaigi.tw/%E5%B9%B3%E8%87%BA%E9%A0%85%E7%9B%AE%E5%88%97%E8%A1%A8/%E6%8F%A3%E5%88%97%E8%A1%A8';
const ITAIGI_AUDIO_API = 'https://hapsing.itaigi.tw/bangtsam';

/**
 * 查詢台語發音
 */
async function searchTaigi(keyword) {
    try {
        // 使用完整編碼的 URL
        const url = `${ITAIGI_API}?%E9%97%9C%E9%8D%B5%E5%AD%97=${encodeURIComponent(keyword)}`;
        const res = await axios.get(url, { timeout: 10000 });

        const results = res.data?.列表 || [];
        if (results.length === 0) return null;

        // 解析結果
        const parsed = [];
        for (const item of results.slice(0, 5)) { // 最多取5筆
            const translations = item.新詞文本 || [];
            for (const trans of translations.slice(0, 3)) { // 每個詞最多3個翻譯
                if (trans.音標資料) {
                    parsed.push({
                        hanzi: trans.文本資料 || keyword,
                        romanization: trans.音標資料,
                        audioUrl: `${ITAIGI_AUDIO_API}?taibun=${encodeURIComponent(trans.音標資料)}`
                    });
                }
            }
        }

        return parsed.length > 0 ? parsed : null;
    } catch (error) {
        console.error('[iTaigi] API Error:', error.message);
        return null;
    }
}

/**
 * 建構台語查詢 Flex Message
 */
function buildTaigiFlex(keyword, results) {
    if (!results || results.length === 0) {
        return {
            type: "bubble",
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    { type: "text", text: "🗣️ iTaigi 台語辭典", weight: "bold", size: "lg", color: "#E65100" },
                    { type: "separator", margin: "md" },
                    { type: "text", text: `查無「${keyword}」的台語發音`, size: "sm", color: "#666666", margin: "md", wrap: true },
                    { type: "text", text: "請嘗試其他關鍵字", size: "xs", color: "#AAAAAA", margin: "sm" }
                ],
                paddingAll: "15px"
            }
        };
    }

    // 建構結果列表
    const resultRows = results.slice(0, 4).flatMap((r, i) => [
        ...(i > 0 ? [{ type: "separator", margin: "md" }] : []),
        {
            type: "box",
            layout: "vertical",
            margin: i > 0 ? "md" : "none",
            contents: [
                { type: "text", text: `📖 ${r.hanzi}`, size: "md", weight: "bold", color: "#333333" },
                { type: "text", text: `🔤 ${r.romanization}`, size: "sm", color: "#E65100", margin: "xs" }
            ]
        }
    ]);

    // 第一個結果的發音按鈕
    const firstResult = results[0];

    return {
        type: "bubble",
        size: "kilo",
        header: {
            type: "box",
            layout: "vertical",
            contents: [
                { type: "text", text: "🗣️ iTaigi 台語辭典", weight: "bold", size: "lg", color: "#FFFFFF" },
                { type: "text", text: `查詢：${keyword}`, size: "sm", color: "#FFFFFF", margin: "xs" }
            ],
            backgroundColor: "#E65100",
            paddingAll: "15px"
        },
        body: {
            type: "box",
            layout: "vertical",
            contents: resultRows,
            paddingAll: "15px"
        },
        footer: {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
                {
                    type: "button",
                    action: {
                        type: "uri",
                        label: "🔊 發音",
                        uri: firstResult.audioUrl
                    },
                    style: "primary",
                    color: "#E65100",
                    height: "sm"
                },
                {
                    type: "button",
                    action: {
                        type: "uri",
                        label: "📚 官網",
                        uri: `https://itaigi.tw/chhoe?q=${encodeURIComponent(keyword)}`
                    },
                    style: "secondary",
                    height: "sm"
                }
            ],
            paddingAll: "12px"
        }
    };
}

/**
 * 處理台語查詢指令
 */
async function handleTaigi(replyToken, message) {
    // 解析關鍵字 (格式: 講台語 XXX)
    const keyword = message.replace(/^講台語\s*/, '').trim();

    if (!keyword) {
        await lineUtils.replyText(replyToken, '❌ 請輸入要查詢的詞彙\n\n範例：講台語 你好');
        return;
    }

    const results = await searchTaigi(keyword);
    const flex = buildTaigiFlex(keyword, results);

    await lineUtils.replyFlex(replyToken, `台語查詢: ${keyword}`, flex);
}

module.exports = {
    searchTaigi,
    buildTaigiFlex,
    handleTaigi
};
