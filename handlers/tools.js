/**
 * 工具函數模組（計算、AI、黑貓等）
 */
const axios = require('axios');
const { google } = require('googleapis');
const { GEMINI_API_KEY, KEYWORD_MAP, CACHE_DURATION } = require('../config/constants');
const { replyToLine, replyText, replyFlex } = require('../utils/line');

// Drive 快取
let driveCache = {
    lastUpdated: {},
    fileLists: {}
};

// === Google Drive 隨機圖片 ===
async function getRandomDriveImageWithCache(folderId) {
    const now = Date.now();

    if (driveCache.fileLists[folderId] &&
        driveCache.lastUpdated[folderId] &&
        (now - driveCache.lastUpdated[folderId] < CACHE_DURATION.DRIVE)) {
        console.log(`[Cache] 命中快取: ${folderId}`);
        const files = driveCache.fileLists[folderId];
        const randomFileId = files[Math.floor(Math.random() * files.length)];
        return `https://lh3.googleusercontent.com/u/0/d/${randomFileId}=w1000`;
    }

    try {
        console.log(`[API] 向 Google Drive 請求新清單: ${folderId}`);
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });
        const drive = google.drive({ version: 'v3', auth });

        const response = await drive.files.list({
            q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
            fields: 'files(id)',
            pageSize: 1000
        });

        const files = response.data.files;
        if (!files || files.length === 0) return null;

        const fileIds = files.map(f => f.id);
        driveCache.fileLists[folderId] = fileIds;
        driveCache.lastUpdated[folderId] = now;

        const randomFileId = fileIds[Math.floor(Math.random() * fileIds.length)];
        return `https://lh3.googleusercontent.com/u/0/d/${randomFileId}=w1000`;
    } catch (error) {
        console.error('Drive API Error:', error);
        return null;
    }
}

// === AI Gemini 回覆 ===
async function getGeminiReply(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
        contents: [{ parts: [{ text: prompt + '\n\n規則：文字用TEXT:開頭；圖片用IMAGE:網址；貼圖用STICKER:pkgId,stkId；影片用VIDEO:網址,預覽圖。' }] }]
    };
    try {
        const res = await axios.post(url, payload);
        return res.data.candidates?.[0]?.content?.parts?.[0]?.text || "AI 忙碌中";
    } catch (e) { return "AI 串接失敗"; }
}

function parseAIReplyToLineMessages(aiReply) {
    const messages = [];
    const lines = aiReply.split('\n').map(l => l.trim()).filter(String);
    let textBuffer = [];
    const flush = () => { if (textBuffer.length) { messages.push({ type: "text", text: textBuffer.join('\n') }); textBuffer = []; } };

    lines.forEach(line => {
        if (line.startsWith('IMAGE:')) { flush(); const url = line.replace('IMAGE:', '').trim(); messages.push({ type: "image", originalContentUrl: url, previewImageUrl: url }); }
        else if (line.startsWith('STICKER:')) { flush(); const ids = line.replace('STICKER:', '').trim().split(','); if (ids.length >= 2) messages.push({ type: "sticker", packageId: ids[0], stickerId: ids[1] }); }
        else if (line.startsWith('VIDEO:')) { flush(); const v = line.replace('VIDEO:', '').trim().split(','); if (v.length >= 2) messages.push({ type: "video", originalContentUrl: v[0], previewImageUrl: v[1] }); }
        else if (line.startsWith('TEXT:')) { textBuffer.push(line.replace('TEXT:', '').trim()); }
        else { textBuffer.push(line); }
    });
    flush();
    return messages.slice(0, 5);
}

// === 分期計算 ===
async function handleFinancing(replyToken, num, type) {
    let results = [];
    if (type === 'fenbei') {
        const rates = { 6: 0.1745, 9: 0.11833, 12: 0.09041, 15: 0.07366, 18: 0.06277, 21: 0.05452, 24: 0.04833, 30: 0.04 };
        results = [6, 9, 12, 15, 18, 21, 24, 30].map(t => {
            const m = Math.floor(num * rates[t]);
            return `${t}期:${m} 總:${m * t}`;
        });
    } else {
        const sRates = { 3: 1.026, 6: 1.04, 9: 1.055, 12: 1.065, 18: 1.09, 24: 1.115 };
        results = Object.keys(sRates).map(t => {
            const total = Math.round(num * sRates[t]);
            return `${t}期:${Math.round(total / t)} 總:${total}`;
        });
    }
    await replyText(replyToken, results.join('\n'));
}

// === 剪刀石頭布 ===
async function handleRPS(replyToken, userChoice) {
    const choices = ['剪刀', '石頭', '布'];
    const emojis = { '剪刀': '✌️', '石頭': '✊', '布': '🖐️' };
    const botChoice = choices[Math.floor(Math.random() * 3)];

    let result;
    if (userChoice === botChoice) {
        result = '🤝 平手！';
    } else if (
        (userChoice === '剪刀' && botChoice === '布') ||
        (userChoice === '石頭' && botChoice === '剪刀') ||
        (userChoice === '布' && botChoice === '石頭')
    ) {
        result = '🎉 你贏了！';
    } else {
        result = '😢 你輸了！';
    }

    const msg = `${emojis[userChoice]} vs ${emojis[botChoice]}\n你：${userChoice}\n我：${botChoice}\n\n${result}`;
    await replyText(replyToken, msg);
}

// === 刷卡計算 ===
async function handleCreditCard(replyToken, num) {
    const isSmall = num * 0.0249 < 498;
    const calc = (p, t) => {
        const total = Math.round(num * p + (isSmall ? 0 : 498));
        return `\n${t}期:${total} 每期:${Math.round(total / t)}`;
    };
    let msg = isSmall ? `付清:${Math.round(num * 1.0449)}` + calc(1.0549, 3) + calc(1.0599, 6) + calc(1.0849, 12) + calc(1.0849, 24)
        : `付清:${Math.round(num * 1.02) + 498}` + calc(1.03, 3) + calc(1.035, 6) + calc(1.06, 12) + calc(1.06, 24);
    await replyText(replyToken, msg);
}

// === 黑貓查詢 ===
async function getTcatStatus(billId) {
    const url = 'https://www.t-cat.com.tw/inquire/TraceDetail.aspx?BillID=' + billId;
    try {
        const res = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        const html = res.data;
        const tableMatch = html.match(/<table[^>]*id="resultTable"[^>]*>([\s\S]*?)<\/table>/i);
        if (!tableMatch) return `查無單號 ${billId}`;
        const trs = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
        const rows = trs.slice(1).map(tr => {
            const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi).map(td => td.replace(/<[^>]+>/g, '').trim());
            return { time: tds.length === 4 ? tds[2] : tds[1], status: tds.length === 4 ? tds[1] : tds[0], location: tds.length === 4 ? tds[3] : tds[2] };
        });
        return { rows, url };
    } catch (e) { return "物流查詢失敗"; }
}

function buildTcatFlex(billId, rows, url) {
    const items = rows.map((r, i) => ({
        type: "box", layout: "vertical", margin: i === 0 ? "none" : "md",
        contents: [
            { type: "text", text: `📅 ${r.time}`, size: "sm", color: "#888888" },
            { type: "text", text: `🚚 ${r.status}`, weight: "bold", color: r.status.includes('送達') ? "#22BB33" : "#333333" },
            { type: "text", text: `📍 ${r.location}`, size: "sm", color: "#555555" }
        ]
    }));
    return {
        type: "bubble",
        header: { type: "box", layout: "vertical", contents: [{ type: "text", text: `📦 單號: ${billId}`, weight: "bold", color: "#1DB446" }] },
        body: { type: "box", layout: "vertical", spacing: "sm", contents: items.slice(0, 10) },
        footer: { type: "box", layout: "vertical", contents: [{ type: "button", action: { type: "uri", label: "官網詳情", uri: url }, style: "primary", color: "#1DB446" }] }
    };
}

module.exports = {
    getRandomDriveImageWithCache,
    getGeminiReply,
    parseAIReplyToLineMessages,
    handleFinancing,
    handleRPS,
    handleCreditCard,
    getTcatStatus,
    buildTcatFlex,
    KEYWORD_MAP
};
