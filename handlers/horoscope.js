const axios = require('axios');
const cheerio = require('cheerio');
const lineUtils = require('../utils/line');

// Horoscope Index Mapping
const STAR_SIGNS = {
    '牡羊': 0, '白羊': 0, 'aries': 0,
    '金牛': 1, 'taurus': 1,
    '雙子': 2, 'gemini': 2,
    '巨蟹': 3, 'cancer': 3,
    '獅子': 4, 'leo': 4,
    '處女': 5, 'virgo': 5,
    '天秤': 6, '天平': 6, 'libra': 6,
    '天蠍': 7, 'scorpio': 7,
    '射手': 8, '人馬': 8, 'sagittarius': 8,
    '摩羯': 9, '山羊': 9, 'capricorn': 9,
    '水瓶': 10, 'aquarius': 10,
    '雙魚': 11, 'pisces': 11
};

// Reverse Mapping for display
const INDEX_TO_NAME = [
    '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座',
    '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'
];

/**
 * Get Daily Horoscope
 * @param {string} signName - The constellation name (e.g., '牡羊')
 * @returns {Promise<Object>} Horoscope data
 */
async function getHoroscope(signName) {
    const cleanName = signName.trim().toLowerCase().replace('座', '');
    const index = STAR_SIGNS[cleanName];

    if (index === undefined) {
        return null;
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const url = `https://astro.click108.com.tw/daily_${index}.php?iAcDay=${today}&iAstro=${index}`;

    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // Extract Data
        // The structure of click108 usually puts content in specific class or id
        // Based on common structure observation (or we rely on text search):
        // Usually <div class="TODAY_CONTENT"> contains the main text.

        // Safety check: if class names change, we try to find text blocks.
        const todayContent = $('.TODAY_CONTENT');
        let overall = '';
        let love = '';
        let career = '';
        let money = '';

        // Extract paragraphs. usually headers are like <p><span class="...">整體運勢</span>...</p>
        // Or simply text structure.

        // Let's try to parse meaningful blocks.
        // Assuming structure:
        // Section 1: Overall
        // Section 2: Love
        // Section 3: Career
        // Section 4: Money

        // Sometimes they use h3 or p with strong tags.
        // Let's grab all text from TODAY_CONTENT and try to parse/format it.

        const contentText = todayContent.text().trim();
        // If empty, structure might be different.

        // Let's return structured data if possible, or just the text summary.
        // The site usually has rating stars too.

        // Ratings: .TODAY_CONTENT p (maybe?)
        // Let's just grab the whole text for now and clean it up.
        // The detailed descriptions are usually in <div class="TODAY_CONTENT"> -> <p>

        const paragraphs = [];
        todayContent.find('p').each((i, el) => {
            const text = $(el).text().trim();
            if (text) paragraphs.push(text);
        });

        // Parse ratings? They are often images or classes like "star_x".
        // For simplicity, we provide the text content first to ensure functionality.

        return {
            name: INDEX_TO_NAME[index],
            date: today,
            content: paragraphs.join('\n\n'),
            url: url
        };

    } catch (error) {
        console.error(`[Horoscope] Error fetching for ${index}:`, error.message);
        throw new Error('無法取得運勢資料');
    }
}

/**
 * Handle Horoscope Command
 */
async function handleHoroscope(replyToken, signName) {
    try {
        const data = await getHoroscope(signName);
        if (!data) {
            await lineUtils.replyText(replyToken, '❌ 找不到此星座，請輸入正確的星座名稱 (例如：牡羊、獅子)');
            return;
        }

        // Build Reply
        let text = `🔮 ${data.name} 今日運勢 (${data.date})\n\n`;
        text += data.content;
        text += `\n\n詳情: ${data.url}`;

        await lineUtils.replyText(replyToken, text);

    } catch (error) {
        await lineUtils.replyText(replyToken, '❌ 讀取運勢失敗，請稍後再試。');
    }
}

module.exports = {
    handleHoroscope
};
