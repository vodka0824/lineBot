const axios = require('axios');
const lineUtils = require('../utils/line');
const { db } = require('../utils/firestore');
const memoryCache = require('../utils/memoryCache');
const CosmoCrawler = require('../utils/cosmo_crawler'); // Import CosmoCrawler

// Helper to get Taiwan Date (YYYY-MM-DD)
function getTaiwanDate() {
    const d = new Date();
    d.setUTCHours(d.getUTCHours() + 8);
    return d.toISOString().split('T')[0];
}

// Reverse Mapping for display
const INDEX_TO_NAME = [
    '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座',
    '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'
];

/**
 * Get Horoscope (Memory Cache + Crawler)
 */
async function getHoroscope(signName, type = 'daily') {
    const TODAY_KEY = getTaiwanDate();
    const cacheKey = `horoscope_${signName}_${type}_${TODAY_KEY}`;

    // 1. Memory Cache
    const memCached = memoryCache.get(cacheKey);
    if (memCached && memCached.name) {
        console.log(`[Horoscope] Memory Cache HIT: ${cacheKey}`);
        return memCached;
    }

    // 2. Real-time Crawl (Cosmo)
    console.log(`[Horoscope] Cache MISS, crawling: ${cacheKey}`);
    try {
        const data = await CosmoCrawler.fetchSignData(signName);

        if (!data || !data.name) {
            throw new Error('Crawled data is invalid');
        }

        // Add date/type for Flex builder
        data.date = TODAY_KEY;
        data.type = type;

        // Cache 12 hours
        memoryCache.set(cacheKey, data, 43200);
        console.log(`[Horoscope] Cached to Memory: ${cacheKey}`);

        return data;
    } catch (crawlError) {
        console.error(`[Horoscope] Crawl failed for ${signName}:`, crawlError.message);
        throw new Error(`無法取得 ${signName} 的運勢資料`);
    }
}

/**
 * Prefetch All (Optimized for Cosmo)
 */
async function prefetchAll(type = 'daily') {
    // Cosmo logic is fast (1 Hub + 12 Details or 1 Hub + Cached Details)
    // We can just fetch them all.
    const results = { success: 0, failed: 0 };
    console.log(`[Prefetch] Starting Cosmo fetch for 12 signs...`);

    // Warm up Hub Link Cache first
    try {
        // Just calling fetchSignData will warm up Hub cache internally if needed,
        // but let's do one sequentially to ensure hub is ready
        await getHoroscope('牡羊座');
    } catch (e) {
        console.warn('[Prefetch] Warmup failed, continuing...');
    }

    // Parallel fetch the rest
    const promises = INDEX_TO_NAME.map(async (signName) => {
        try {
            await getHoroscope(signName); // This will cache it
            return true;
        } catch (e) {
            console.error(`[Prefetch] Failed ${signName}: ${e.message}`);
            return false;
        }
    });

    const batchResults = await Promise.all(promises);
    results.success = batchResults.filter(r => r).length;
    results.failed = batchResults.filter(r => !r).length;

    console.log(`[Prefetch] Done. Success: ${results.success}, Failed: ${results.failed}`);
    return results;
}

/**
 * Build Horoscope Flex Message (Cosmo Style)
 */
function buildHoroscopeFlex(data, type = 'daily') {
    const flexUtils = require('../utils/flex');
    const { COLORS } = flexUtils;

    // Data Structure from Cosmo:
    // { name, luckyNumber, luckyTime, luckySign, content }

    const bodyContents = [];

    // 1. Main Content (The big text)
    if (data.content) {
        bodyContents.push(flexUtils.createBox('vertical', [
            flexUtils.createText({
                text: data.content,
                size: 'sm',
                color: COLORS.DARK_GRAY,
                wrap: true,
                lineSpacing: '5px'
            })
        ], {
            backgroundColor: COLORS.LIGHT_GRAY,
            cornerRadius: '8px',
            paddingAll: '12px',
            margin: 'md'
        }));
    }

    // 2. Lucky Items Grid
    const luckyRows = [];

    // Row 1: Number & Sign
    const row1 = [
        flexUtils.createText({ text: `🔢 幸運數字: ${data.luckyNumber}`, size: 'xs', color: COLORS.WARNING, flex: 1 }),
        flexUtils.createText({ text: `✨ 幸運星座: ${data.luckySign}`, size: 'xs', color: '#7B1FA2', flex: 1 })
    ];
    luckyRows.push(flexUtils.createBox('horizontal', row1, { margin: 'sm' }));

    // Row 2: Time (Full width)
    const row2 = [
        flexUtils.createText({ text: `⏰ 今日吉時: ${data.luckyTime}`, size: 'xs', color: '#C2185B', flex: 1 })
    ];
    luckyRows.push(flexUtils.createBox('horizontal', row2, { margin: 'sm' }));

    bodyContents.push(flexUtils.createSeparator('md'));
    bodyContents.push(flexUtils.createText({ text: '運勢指標', size: 'xs', weight: 'bold', color: '#999999', margin: 'md' }));
    bodyContents.push(flexUtils.createBox('vertical', luckyRows, { margin: 'sm' }));

    // Footer Credit
    bodyContents.push(flexUtils.createSeparator('lg'));
    bodyContents.push(flexUtils.createBox('horizontal', [
        flexUtils.createText({ text: 'Source: Cosmopolitan', size: 'xxs', color: '#CCCCCC', align: 'end' })
    ], { margin: 'sm' }));

    const HOROSCOPE_COLOR = '#D81B60'; // Cosmo Pink-ish
    const header = flexUtils.createHeader(`🔮 ${data.name} 今日運勢`, data.date, HOROSCOPE_COLOR);
    return flexUtils.createBubble({ size: 'mega', header: header, body: flexUtils.createBox('vertical', bodyContents, { paddingAll: '15px' }) });
}

/**
 * Handle Horoscope Command
 */
async function handleHoroscope(replyToken, signName, type = 'daily', userId, groupId) {
    try {
        const data = await getHoroscope(signName, type);

        if (!data) {
            await lineUtils.replyText(replyToken, '❌ 找不到此星座，請輸入正確的星座名稱');
            return;
        }

        const flex = buildHoroscopeFlex(data, type);
        const altText = `🔮 ${data.name}今日運勢`; // Cosmo is mainly daily
        await lineUtils.replyFlex(replyToken, altText, flex);

        if (groupId) {
            const leaderboardHandler = require('./leaderboard');
            leaderboardHandler.recordMessage(groupId, userId).catch(() => { });
        }
    } catch (error) {
        console.error('[Horoscope] Error:', error);
        await lineUtils.replyText(replyToken, '❌ 運勢查詢失敗，請稍後再試');
    }
}

// Export remains same signature to avoid breaking index.js
// crawlHoroscopeData is kept for compatibility but points to new logic if needed, 
// or we just remove it from exports if unused. 
// For safety, we keep getHoroscope as the main entry query.

module.exports = {
    handleHoroscope,
    prefetchAll,
    getHoroscope,
    buildHoroscopeFlex
};
