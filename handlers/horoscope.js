const axios = require('axios');
const cheerio = require('cheerio');
const lineUtils = require('../utils/line');
const { db } = require('../utils/firestore');
const memoryCache = require('../utils/memoryCache'); // 新增 Memory Cache

// Helper to get Taiwan Date (YYYY-MM-DD)
function getTaiwanDate() {
    const d = new Date();
    d.setUTCHours(d.getUTCHours() + 8);
    return d.toISOString().split('T')[0];
}

// Cache for dynamic index mapping
let SIGN_CACHE = null;
let CACHE_DATE = '';

// Standard Fallback Mapping (Most common structure)
const FALLBACK_MAPPING = {
    '牡羊座': 0, '金牛座': 1, '雙子座': 2, '巨蟹座': 3,
    '獅子座': 4, '處女座': 5, '天秤座': 6, '天蠍座': 7,
    '射手座': 8, '摩羯座': 9, '水瓶座': 10, '雙魚座': 11
};

const KNOWN_SIGNS = [
    '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座',
    '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'
];

// 多組 User-Agent 輪詢，降低被封鎖機率
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0'
];

function getRandomHeaders() {
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    return {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://astro.click108.com.tw/',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Upgrade-Insecure-Requests': '1'
    };
}

/**
 * Refresh the mapping from index (0-11) to Sign Name
 */
async function refreshCache() {
    const mapping = {};
    const promises = [];
    const today = getTaiwanDate();

    // Click108 usually uses 0-11. We scan 0-11.
    for (let i = 0; i < 12; i++) {
        promises.push((async () => {
            try {
                // Fetch with today's date to ensure consistency
                const url = `https://astro.click108.com.tw/daily_${i}.php?iAcDay=${today}&iAstro=${i}`;
                // Fetch with retry logic
                let res;
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        res = await axios.get(url, {
                            timeout: 15000,
                            headers: getRandomHeaders()
                        });
                        break;
                    } catch (e) {
                        if (attempt === 2) throw e;
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
                const $ = cheerio.load(res.data);

                // Parse Title for Sign Name (e.g. "牡羊座今日運勢") to be accurate
                // Use strict regex to avoid matching "運勢 | 星座"
                const title = $('title').text();
                const signRegex = new RegExp(`(${KNOWN_SIGNS.join('|')})`);
                const match = title.match(signRegex);

                let sign = '';
                if (match) {
                    sign = match[0];
                } else {
                    // Fallback to Lucky Constellation logic (less reliable) but only if title fails
                    const lucky = $('.LUCKY');
                    if (lucky.length) {
                        // WARNING: lucky constellation != current sign. 
                        // But often page content reflects the sign requested.
                        // Actually, the previous logic WAS wrong because it grabbed the Lucky sign.
                        // If title fails, we might just assume standard mapping or check H2.
                        // Let's rely on standard mapping as fallback if title fails.
                    }
                }

                if (sign && KNOWN_SIGNS.includes(sign)) {
                    mapping[sign] = i;
                    // Also map without '座'
                    const shortName = sign.replace('座', '');
                    mapping[shortName] = i;
                }
            } catch (e) {
                // Ignore errors
            }
        })());
    }

    await Promise.all(promises);

    // Merge with Fallback for any missing keys
    for (const [sign, idx] of Object.entries(FALLBACK_MAPPING)) {
        if (mapping[sign] === undefined) {
            mapping[sign] = idx;
            mapping[sign.replace('座', '')] = idx;
        }
    }

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
}

/**
 * Get Index for Sign
 */
async function getSignIndex(signName) {
    const today = getTaiwanDate();

    // Refresh if cache is empty or date changed
    if (!SIGN_CACHE || CACHE_DATE !== today) {
        await refreshCache();
    }

    // Normalize input
    let cleanName = signName.trim();
    // Handle English or other aliases if needed

    return SIGN_CACHE[cleanName];
}

// Reverse Mapping for display
const INDEX_TO_NAME = [
    '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座',
    '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'
];

/**
 * Get Horoscope Data
 * @param {string} signName - The constellation name (e.g., '牡羊')
 * @param {string} type - 'daily', 'weekly', 'monthly'
 * @returns {Promise<Object>} Horoscope data
 */
async function crawlHoroscopeData(signName, type = 'daily', options = {}) {
    const today = getTaiwanDate(); // YYYY-MM-DD (Taiwan Time)
    const index = await getSignIndex(signName);

    if (index === undefined || index === null) {
        return null;
    }

    let url = '';
    switch (type) {
        case 'weekly':
            url = `https://astro.click108.com.tw/weekly_${index}.php?iAcDay=${today}&iType=1&iAstro=${index}`;
            break;
        case 'monthly':
            url = `https://astro.click108.com.tw/monthly_${index}.php?iAcDay=${today}&iType=2&iAstro=${index}`;
            break;
        case 'daily':
        default:
            url = `https://astro.click108.com.tw/daily_${index}.php?iAcDay=${today}&iAstro=${index}`;
            break;
    }

    // Retry Logic Helper
    const fetchWithRetry = async (url, retries = 3, delay = 1000) => {
        const timeout = options.timeout || 25000; // Default 25s, allow override
        const maxAttempts = options.retries || retries; // Use option if provided

        for (let i = 0; i < maxAttempts; i++) {
            try {
                return await axios.get(url, {
                    timeout: timeout,
                    headers: getRandomHeaders()
                });
            } catch (err) {
                if (i === maxAttempts - 1) throw err;
                console.warn(`[Horoscope] Crawl failed (Attempt ${i + 1}/${maxAttempts}): ${err.message}. Retrying...`);
                await new Promise(res => setTimeout(res, delay));
            }
        }
    };

    try {
        const response = await fetchWithRetry(url);
        const $ = cheerio.load(response.data);

        // 1. Parse Short Comment (今日短評 / 本週 / 本月)
        let shortComment = '';
        const todayWord = $('.TODAY_WORD p');
        if (todayWord.length) {
            if (type === 'monthly' && todayWord.length >= 2) {
                // Monthly: Strength (index 0) and Weakness (index 1)
                const strength = $(todayWord[0]).text().trim();
                const weakness = $(todayWord[1]).text().trim();
                shortComment = `👍 本月優勢：${strength}\n👎 本月弱勢：${weakness}`;
            } else if (type === 'weekly' && todayWord.length >= 2) {
                // Weekly: Winning Tips (index 0) and Love Tips (index 1)
                const tips = $(todayWord[0]).text().trim();
                const love = $(todayWord[1]).text().trim();
                shortComment = `💡 致勝技巧：${tips}\n❤️ 愛情秘笈：${love}`;
            } else {
                // Daily: Single paragraph or multiple joined
                shortComment = todayWord.map((i, el) => $(el).text().trim()).get().join('\n');
            }
        }

        // 2. Parse Lucky Items (.LUCKY)
        const luckyItems = {
            // Standard / Weekly
            number: '',
            color: '',
            direction: '',
            time: '',
            constellation: '',
            // Monthly Specific
            leisure: '',    // 休閒解壓
            annoying: '',   // 煩人星座
            caring: '',     // 貼心星座
            wealthSign: ''  // 財神星座
        };

        const luckyContainer = $('.LUCKY');
        if (luckyContainer.length) {
            const h4s = luckyContainer.find('h4');

            if (type === 'monthly' && h4s.length >= 5) {
                // Monthly Specific Layout
                // [0] Leisure (參觀博物館)
                // [1] Direction (正西方向)
                // [2] Annoying (雙魚座)
                // [3] Caring (雙子座)
                // [4] Wealth (水瓶座)
                luckyItems.leisure = $(h4s[0]).text().trim();
                luckyItems.direction = $(h4s[1]).text().trim();
                luckyItems.annoying = $(h4s[2]).text().trim();
                luckyItems.caring = $(h4s[3]).text().trim();
                luckyItems.wealthSign = $(h4s[4]).text().trim();
            } else if (h4s.length >= 5) {
                // Daily (Standard)
                luckyItems.number = $(h4s[0]).text().trim();
                luckyItems.color = $(h4s[1]).text().trim();
                luckyItems.direction = $(h4s[2]).text().trim();
                luckyItems.time = $(h4s[3]).text().trim();
                luckyItems.constellation = $(h4s[4]).text().trim();
            } else if (h4s.length === 3) {
                // Weekly -> [0]=Day, [1]=Item, [2]=Number
                luckyItems.time = $(h4s[0]).text().trim(); // Map Day to Time slot
                luckyItems.color = $(h4s[1]).text().trim(); // Map Item to Color slot
                luckyItems.number = $(h4s[2]).text().trim(); // Number
            } else if (h4s.length > 0) {
                luckyItems.number = $(h4s[0]).text().trim();
            }
        }

        // 3. Parse Detailed Sections
        const sections = [];
        let currentSection = null;

        $('.TODAY_CONTENT p').each((i, el) => {
            const text = $(el).text().trim();
            // Skip empty or short comment matches (exact match only, strictly)
            if (!text) return;
            // Short comment usually at top, but in monthly it's separate. 
            // We should just check if text is included in shortComment to avoid duplication if it appears there?
            // Actually, TODAY_CONTENT usually doesn't contain TODAY_WORD. They are siblings.
            // Probe confirmed they are separate divs.

            // However, just in case:
            if (shortComment.includes(text) && text.length > 5) return;

            // Expanded Match for Weekly/Monthly headers
            // Matches: "整體運勢", "愛情運勢", "事業運勢", "財運運勢", "健康運勢", "工作運勢", "求職運勢", "戀愛運勢"
            const headerMatch = text.match(/^(整體|愛情|事業|財運|健康|工作|求職|戀愛)運勢/);

            if (headerMatch) {
                let type = 'other';
                if (text.includes('整體')) type = 'overall';
                else if (text.includes('愛情') || text.includes('戀愛')) type = 'love';
                else if (text.includes('事業') || text.includes('工作') || text.includes('求職')) type = 'career';
                else if (text.includes('財運')) type = 'wealth';
                else if (text.includes('健康')) type = 'health';

                currentSection = {
                    title: text,
                    content: '',
                    type: type
                };
                sections.push(currentSection);
            } else {
                if (currentSection) {
                    currentSection.content += (currentSection.content ? '\n' : '') + text;
                }
            }
        });

        // Determine Sign Name
        const title = $('title').text();
        const signRegex = new RegExp(`(${KNOWN_SIGNS.join('|')})`);
        const titleMatch = title.match(signRegex);
        const name = titleMatch ? titleMatch[0] : signName;

        return {
            name: name,
            date: today,
            type: type, // Pass back type for UI
            shortComment,
            lucky: luckyItems,
            sections: sections,
            url: url
        };
    } catch (error) {
        console.error(`[Horoscope] Error fetching ${type} for ${index}:`, error.message);
        throw new Error('無法取得運勢資料');
    }
}

/**
 * Get Horoscope (Memory Cache + Crawl)
 * 優化版: 移除 Firestore Cache 層,簡化為單層 Memory Cache
 */
async function getHoroscope(signName, type = 'daily') {
    const TODAY_KEY = getTaiwanDate();
    const cacheKey = `horoscope_${signName}_${type}_${TODAY_KEY}`;

    // === Memory Cache (唯一快取層) ===
    const memCached = memoryCache.get(cacheKey);
    if (memCached && memCached.sign && memCached.date) {
        console.log(`[Horoscope] Memory Cache HIT: ${cacheKey}`);
        return memCached;
    }

    // === 實時爬蟲 ===
    console.log(`[Horoscope] Cache MISS, crawling: ${cacheKey}`);

    try {
        const data = await crawlHoroscopeData(signName, type);

        console.log(`[Horoscope] Crawled data for ${signName}:`, JSON.stringify(data).substring(0, 200));

        // ✅ 驗證爬蟲結果有效性 (修復: 欄位是 name 不是 sign)
        if (!data || !data.name) {
            console.error(`[Horoscope] Invalid data: data=${!!data}, name=${data?.name}`);
            throw new Error('Crawled data is invalid');
        }

        // 僅寫入 Memory Cache (移除 Firestore 層以簡化架構)
        memoryCache.set(cacheKey, data, 43200); // 12 小時
        console.log(`[Horoscope] Cached to Memory: ${cacheKey}`);

        return data;
    } catch (crawlError) {
        // ✅ 爬蟲失敗的降級處理
        console.error('[Horoscope] Crawl failed:', crawlError.message);
        throw new Error(`無法取得 ${signName} 的運勢資料,請稍後再試`);
    }
}

/**
 * Prefetch All
 */
async function prefetchAll(type = 'daily') {
    const TODAY_KEY = getTaiwanDate();
    const results = { success: 0, failed: 0 };

    console.log(`[Prefetch] Starting SERIAL fetch for 12 signs (${type})...`);

    // 1. Ensure Cache is Valid
    try {
        await getSignIndex('牡羊座');
        console.log('[Prefetch] Cache refreshed/verified.');
    } catch (e) {
        console.warn('[Prefetch] Cache refresh warning:', e.message);
    }

    // Circuit Breaker
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;

    // 策略調整 V4: 極速模式 (Speed Priority)
    // 目標: 總執行時間 < 30s 以避免 Cloud Scheduler Timeout (504)
    // 設置: Batch=4 (3個批次), Timeout=8s, Retries=0 (不重試)
    const BATCH_SIZE = 4;

    for (let i = 0; i < 12; i += BATCH_SIZE) {
        // Circuit Breaker Check
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.warn(`[Prefetch] Circuit Breaker Triggered (3 consecutive fails). Aborting.`);
            break;
        }

        const batchIndices = [];
        for (let j = 0; j < BATCH_SIZE && (i + j) < 12; j++) {
            batchIndices.push(i + j);
        }

        console.log(`[Prefetch] Batch ${Math.floor(i / BATCH_SIZE) + 1}: Indices ${batchIndices.join(',')}`);

        try {
            // 微小延遲 (200ms) 讓 Event Loop 喘息
            if (i > 0) await new Promise(r => setTimeout(r, 200));

            // 執行批次並行
            const promises = batchIndices.map(async (idx) => {
                const signName = INDEX_TO_NAME[idx];
                const cacheKey = `horoscope_${signName}_${type}_${TODAY_KEY}`;
                const docRef = db.collection('horoscope_cache').doc(cacheKey);

                try {
                    console.log(`[Prefetch] Fetching ${signName}...`);
                    // Timeout 8s, Retry 0 -> 快速失敗，避免拖累整體時間
                    const data = await crawlHoroscopeData(signName, type, { timeout: 8000, retries: 0 });

                    await docRef.set(data);
                    memoryCache.set(cacheKey, data, 43200);

                    console.log(`[Prefetch] ${signName} OK`);
                    return true;
                } catch (error) {
                    console.error(`[Prefetch] Failed ${signName}:`, error.message);
                    return false;
                }
            });

            const batchResults = await Promise.all(promises);

            // 統計結果
            const batchFailures = batchResults.filter(r => !r).length;
            results.success += batchResults.filter(r => r).length;
            results.failed += batchFailures;

            if (batchFailures === batchResults.length) {
                consecutiveFailures += batchFailures;
            } else {
                consecutiveFailures = 0;
            }

        } catch (error) {
            console.error('[Prefetch] Batch Error:', error);
        }
    }

    return results;
}

/**
 * Build Horoscope Flex Message
 */
function buildHoroscopeFlex(data, type = 'daily') {
    const flexUtils = require('../utils/flex');
    const { COLORS } = flexUtils;

    let periodName = '今日';
    if (type === 'weekly') periodName = '本週';
    if (type === 'monthly') periodName = '本月';

    const getSectionColor = (secType) => {
        switch (secType) {
            case 'overall': return COLORS.PRIMARY;
            case 'love': return '#E91E63';
            case 'career': return COLORS.WARNING;
            case 'wealth': return COLORS.SUCCESS;
            case 'health': return '#00ACC1';
            default: return COLORS.DARK_GRAY;
        }
    };

    const bodyContents = [];

    // 1. Short Comment
    if (data.shortComment) {
        const shortRows = [];
        const lines = data.shortComment.split('\n');
        let parsedItems = [];

        if (lines.length >= 2 && (type === 'weekly' || type === 'monthly')) {
            const keys = type === 'weekly' ? ['致勝技巧', '愛情秘笈'] : ['本月優勢', '本月弱勢'];
            const colors = type === 'weekly' ? [COLORS.WARNING, '#E91E63'] : [COLORS.WARNING, COLORS.DANGER];
            const item1 = lines.find(l => l.includes(keys[0]));
            const item2 = lines.find(l => l.includes(keys[1]));
            if (item1 && item2) {
                parsedItems.push({ title: item1.split('：')[0], content: item1.split('：')[1]?.trim(), color: colors[0] });
                parsedItems.push({ title: item2.split('：')[0], content: item2.split('：')[1]?.trim(), color: colors[1] });
            }
        }

        if (parsedItems.length > 0) {
            parsedItems.forEach(item => {
                shortRows.push(flexUtils.createText({ text: item.title, weight: 'bold', color: item.color, size: 'sm' }));
                shortRows.push(flexUtils.createText({ text: item.content, size: 'sm', color: COLORS.DARK_GRAY, wrap: true, margin: 'xs' }));
            });
        } else {
            shortRows.push(flexUtils.createText({ text: data.shortComment, wrap: true, color: COLORS.PRIMARY, weight: 'bold', size: 'sm' }));
        }

        bodyContents.push(flexUtils.createBox('vertical', shortRows, { backgroundColor: COLORS.LIGHT_GRAY, cornerRadius: '8px', paddingAll: '10px' }));
        bodyContents.push(flexUtils.createSeparator('md'));
    }

    // 2. Lucky Items
    let luckyList = [];
    if (type === 'monthly' && data.lucky.leisure) {
        luckyList = [
            { label: '🧘 休閒:', value: data.lucky.leisure, color: COLORS.WARNING },
            { label: '🧭 貴人:', value: data.lucky.direction, color: COLORS.PRIMARY },
            { label: '😤 煩人:', value: data.lucky.annoying, color: COLORS.GRAY },
            { label: '❤️ 貼心:', value: data.lucky.caring, color: '#E91E63' },
            { label: '💰 財神:', value: data.lucky.wealthSign, color: '#FBC02D' }
        ];
    } else if (data.lucky && (data.lucky.number || data.lucky.time)) {
        const isWeekly = type === 'weekly';
        const isDaily = type === 'daily';
        luckyList.push({ label: '🔢 數字:', value: data.lucky.number || '-', color: COLORS.WARNING });
        luckyList.push({ label: '🎨 顏色:', value: data.lucky.color || '-', color: COLORS.PRIMARY });
        if (isDaily) {
            luckyList.push({ label: '🧭 方位:', value: data.lucky.direction || '-', color: COLORS.SUCCESS });
            luckyList.push({ label: '🤝 星座:', value: data.lucky.constellation || '-', color: '#7B1FA2' });
        }
        luckyList.push({ label: isWeekly ? '📅 日期:' : (isDaily ? '⏰ 吉時:' : '🎒 物品:'), value: data.lucky.time || '-', color: '#C2185B' });
    }

    if (luckyList.length > 0) {
        const rows = [];
        for (let i = 0; i < luckyList.length; i += 2) {
            const item1 = luckyList[i];
            const item2 = luckyList[i + 1];
            const cols = [];
            cols.push(flexUtils.createText({ text: `${item1.label} ${item1.value}`, size: 'xs', color: COLORS.DARK_GRAY, flex: 1 }));
            if (item2) cols.push(flexUtils.createText({ text: `${item2.label} ${item2.value}`, size: 'xs', color: COLORS.DARK_GRAY, flex: 1 }));
            rows.push(flexUtils.createBox('horizontal', cols, { margin: 'sm' }));
        }
        bodyContents.push(flexUtils.createBox('vertical', rows, { margin: 'md' }));
        bodyContents.push(flexUtils.createSeparator('md'));
    }

    // 3. Detailed Sections
    if (data.sections && data.sections.length > 0) {
        data.sections.forEach(section => {
            // Validate content is not empty to avoid 400
            if (!section.title || !section.content) return;

            bodyContents.push(flexUtils.createText({ text: section.title, weight: 'bold', size: 'sm', color: getSectionColor(section.type), margin: 'lg' }));
            bodyContents.push(flexUtils.createText({ text: section.content, size: 'sm', color: COLORS.DARK_GRAY, wrap: true, margin: 'sm', lineSpacing: '4px' }));
        });
    } else {
        bodyContents.push(flexUtils.createText({ text: '運勢內容讀取中...', color: COLORS.GRAY, margin: 'md' }));
    }

    const HOROSCOPE_COLOR = '#4527A0';
    const header = flexUtils.createHeader(`🔮 ${data.name} ${periodName}運勢`, data.date, HOROSCOPE_COLOR);
    return flexUtils.createBubble({ size: 'mega', header: header, body: flexUtils.createBox('vertical', bodyContents, { paddingAll: '15px' }) });
}

/**
 * Handle Horoscope Command (Synchronous - uses cached data with Reply API)
 * 優先使用 Cloud Scheduler 預先快取的資料，直接同步回覆
 */
async function handleHoroscope(replyToken, signName, type = 'daily', userId, groupId) {
    const lineUtils = require('../utils/line'); // Ensure lineUtils is required
    try {
        // 直接同步執行，使用快取資料
        const data = await getHoroscope(signName, type);

        if (!data) {
            await lineUtils.replyText(replyToken, '❌ 找不到此星座，請輸入正確的星座名稱');
            return;
        }

        const flex = buildHoroscopeFlex(data, type);

        let periodName = '今日';
        if (type === 'weekly') periodName = '本週';
        if (type === 'monthly') periodName = '本月';

        // 使用 Reply API（免費，不消耗 Push 配額）
        // 優化 altText 包含星座與週期資訊
        const altText = `🔮 ${data.name}${periodName}運勢`;
        await lineUtils.replyFlex(replyToken, altText, flex);

        // 記錄使用（用於排行榜等）
        if (groupId) {
            const leaderboardHandler = require('./leaderboard');
            leaderboardHandler.recordMessage(groupId, userId).catch(() => { });
        }
    } catch (error) {
        console.error('[Horoscope] Error:', error);
        try {
            await lineUtils.replyText(replyToken, '❌ 運勢查詢失敗，請稍後再試');
        } catch (replyError) {
            console.warn('[Horoscope] Failed to send error message (likely token expired):', replyError.message);
        }
    }
}

module.exports = {
    handleHoroscope,
    prefetchAll,
    // For worker
    getHoroscope,
    buildHoroscopeFlex,
    crawlHoroscopeData
};
