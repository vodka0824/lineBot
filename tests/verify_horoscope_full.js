const axios = require('axios');
const cheerio = require('cheerio');

// Mock Data
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7',
    'Referer': 'https://astro.click108.com.tw/',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

const KNOWN_SIGNS = [
    '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座',
    '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'
];

function getTaiwanDate() {
    const d = new Date();
    d.setUTCHours(d.getUTCHours() + 8);
    return d.toISOString().split('T')[0];
}

async function getSignIndex(signName) {
    // Simplified: Just use static mapping for test
    const FALLBACK_MAPPING = {
        '牡羊座': 0, '金牛座': 1, '雙子座': 2, '巨蟹座': 3,
        '獅子座': 4, '處女座': 5, '天秤座': 6, '天蠍座': 7,
        '射手座': 8, '摩羯座': 9, '水瓶座': 10, '雙魚座': 11
    };
    return FALLBACK_MAPPING[signName];
}

async function crawlHoroscopeData(signName, type = 'daily', options = {}) {
    const today = getTaiwanDate();
    const index = await getSignIndex(signName);
    const url = `https://astro.click108.com.tw/daily_${index}.php?iAcDay=${today}&iAstro=${index}`;

    console.log(`[Test] Fetching ${signName} (${index}) from ${url}...`);
    const start = Date.now();

    try {
        const timeout = options.timeout || 10000;
        const response = await axios.get(url, { headers: HEADERS, timeout });
        const latency = Date.now() - start;
        console.log(`[Test] ${signName} Response received in ${latency}ms`);

        const $ = cheerio.load(response.data);
        const title = $('title').text();
        // Basic Validation
        if (!title.includes('運勢')) {
            throw new Error(`Invalid Title: ${title}`);
        }

        // Check content
        const content = $('.TODAY_CONTENT p').text().trim();
        if (content.length < 10) {
            throw new Error('Content too short or empty');
        }

        return { success: true, latency };
    } catch (error) {
        const latency = Date.now() - start;
        console.error(`[Test] ${signName} Failed in ${latency}ms: ${error.message}`);
        return { success: false, latency, error: error.message };
    }
}

async function runTest() {
    console.log('--- Starting Full Sequential Test ---');
    const startTotal = Date.now();

    const results = [];

    // Test all 12 signs sequentially to measure baseline latency
    for (const sign of KNOWN_SIGNS) {
        const result = await crawlHoroscopeData(sign, 'daily', { timeout: 10000 });
        results.push({ sign, ...result });
        // Tiny delay
        await new Promise(r => setTimeout(r, 500));
    }

    const endTotal = Date.now();
    console.log(`\n--- Test Complete in ${(endTotal - startTotal) / 1000}s ---`);
    console.table(results);

    const successCount = results.filter(r => r.success).length;
    console.log(`Success: ${successCount}/12`);
}

runTest();
