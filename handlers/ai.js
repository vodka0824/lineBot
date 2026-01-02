/**
 * AI 功能模組
 */
const axios = require('axios');
const { GEMINI_API_KEY } = require('../config/constants');
const rateLimit = require('../utils/rateLimit');

// === Gemini AI 問答 ===
async function getGeminiReply(query, userId = null) {
    // Rate limiting check
    if (userId && !rateLimit.checkLimit(userId, 'ai')) {
        return '⏱️ AI 查詢過於頻繁，請稍後再試';
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;
        const response = await axios.post(url, { contents: [{ parts: [{ text: query }] }] });
        let text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (text) {
            // 簡單 markdown 移除，避免 LINE 解析錯誤
            text = text.replace(/\*\*/g, '').replace(/`/g, '');
            return text;
        }
        return '❓ AI 沒有回應，請換個方式問問看';
    } catch (e) {
        console.error('Gemini Error:', e.response?.data || e.message);
        return '❌ AI 發生錯誤，請稍後再試';
    }
}

module.exports = {
    getGeminiReply
};
