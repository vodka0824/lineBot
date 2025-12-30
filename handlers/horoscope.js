const axios = require('axios');
const cheerio = require('cheerio');
const lineUtils = require('../utils/line');

// Cache for dynamic index mapping
let SIGN_CACHE = null;
let CACHE_DATE = '';

const KNOWN_SIGNS = [
    '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座',
    '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'
];

/**
 * Refresh the mapping from index (0-11) to Sign Name
 */
async function refreshCache() {
    console.log('[Horoscope] Refreshing cache...');
    const mapping = {};
    const promises = [];
    const today = new Date().toISOString().split('T')[0];

    // Click108 usually uses 0-11, sometimes irregular. We scan 0-15 to be safe.
    for (let i = 0; i < 16; i++) {
        promises.push((async () => {
            try {
                // Fetch with today's date to ensure consistency
                const url = `https://astro.click108.com.tw/daily_${i}.php?iAcDay=${today}&iAstro=${i}`;
                const res = await axios.get(url, { timeout: 3000 });
                const $ = cheerio.load(res.data);
                // Extract lucky sign from .LUCKY section (usually 5th h4)
                const lucky = $('.LUCKY');
                if (lucky.length) {
                    const sign = lucky.find('h4').eq(4).text().trim(); // e.g., "牡羊座"
                    if (sign && sign.endsWith('座')) {
                        // Store mapping: '牡羊座' -> 0
                        // Handle duplicates? Use first found or overwrite.
                        mapping[sign] = i;

                        // Also map without '座'
                        const shortName = sign.replace('座', '');
                        mapping[shortName] = i;

                        // Normalize aliases (ARIES -> 牡羊)
                        // ... (Minimal normalization for now)
                    }
                }
            } catch (e) {
                // Ignore errors
            }
        })());
    }

    await Promise.all(promises);

    // Manual Alias Mapping
    const aliases = {
        '白羊': '牡羊',
        '天平': '天秤',
        '人馬': '射手',
        '山羊': '摩羯'
    };
    for (const [alias, target] of Object.entries(aliases)) {
        if (mapping[target] !== undefined) {
            mapping[alias] = mapping[target];
        }
    }

    SIGN_CACHE = mapping;
    CACHE_DATE = today;
    console.log('[Horoscope] Cache refreshed:', mapping);
}

/**
 * Get Index for Sign
 */
async function getSignIndex(signName) {
    const today = new Date().toISOString().split('T')[0];

    // Refresh if cache is empty or date changed
    if (!SIGN_CACHE || CACHE_DATE !== today) {
        await refreshCache();
    }

    // Normalize input
    let cleanName = signName.trim();
    if (cleanName.match(/^[a-zA-Z]+$/)) {
        // Handle English if needed (skip for now or use lookup)
        return null;
    }

    return SIGN_CACHE[cleanName];
}

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
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const index = await getSignIndex(signName);

    if (index === undefined || index === null) {
        return null;
    }

    const url = `https://astro.click108.com.tw/daily_${index}.php?iAcDay=${today}&iAstro=${index}`;

    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // 1. Parse Short Comment (今日短評)
        // Usually in .TODAY_CONTENT h3 contains "今日短評", next p is content
        let shortComment = '';
        $('.TODAY_CONTENT h3').each((i, el) => {
            if ($(el).text().includes('今日短評')) {
                shortComment = $(el).next('p').text().trim();
            }
        });

        // 2. Parse Lucky Items (.LUCKY)
        const luckyItems = {
            number: '',
            color: '',
            direction: '',
            time: '',
            constellation: ''
        };

        const luckyContainer = $('.LUCKY');
        if (luckyContainer.length) {
            const h4s = luckyContainer.find('h4');
            // Based on probe: 
            // 0: Number (class NUMERAL)
            // 1: Color
            // 2: Direction
            // 3: Time (class TIME)
            // 4: Constellation
            if (h4s.length >= 5) {
                luckyItems.number = $(h4s[0]).text().trim();
                luckyItems.color = $(h4s[1]).text().trim();
                luckyItems.direction = $(h4s[2]).text().trim();
                luckyItems.time = $(h4s[3]).text().trim();
                luckyItems.constellation = $(h4s[4]).text().trim();
            }
        }

        // 3. Parse Main Content (Only P tags that are NOT short comment)
        // Actually, the main content usually follows the ratings.
        // Let's just grab all text in .TODAY_CONTENT, excluding H3 and the short comment P if possible.
        // Simpler approach: Just grab all P tags in TODAY_CONTENT.
        // One of them is likely the short comment.

        const paragraphs = [];
        $('.TODAY_CONTENT p').each((i, el) => {
            const text = $(el).text().trim();
            // Filter out empty or duplicate short comment if exact match
            if (text && text !== shortComment) {
                paragraphs.push(text);
            }
        });

        // Determine Sign Name from cache or parsing
        // We know the index maps to signName (input) but better use what we found in page
        const name = luckyItems.constellation || signName;

        return {
            name: name,
            date: today,
            shortComment,
            lucky: luckyItems,
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
        // Build Reply
        let text = `🔮 ${data.name} 今日運勢 (${data.date})\n`;

        if (data.shortComment) {
            text += `\n📝 短評：${data.shortComment}\n`;
        }

        if (data.lucky) {
            text += `\n🔢 數字：${data.lucky.number}`;
            text += `\n🎨 顏色：${data.lucky.color}`;
            text += `\n🧭 方位：${data.lucky.direction}`;
            text += `\n⏰ 吉時：${data.lucky.time}`;
            text += `\n🤝 星座：${data.lucky.constellation}\n`;
        }

        text += `\n${data.content}`;
        text += `\n\n詳情: ${data.url}`;

        await lineUtils.replyText(replyToken, text);

    } catch (error) {
        await lineUtils.replyText(replyToken, '❌ 讀取運勢失敗，請稍後再試。');
    }
}

module.exports = {
    handleHoroscope
};
