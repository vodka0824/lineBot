
const axios = require('axios');
const cheerio = require('cheerio');

// Mock dependencies for the handler
const mockDb = {
    collection: () => ({
        doc: () => ({
            get: async () => ({ exists: false }),
            set: async () => { }
        })
    })
};

// We need to load or copy the relevant logic from handlers/horoscope.js
// Since we can't easily require the whole file due to 'firebase-admin' dependency in global scope (via ../utils/firestore),
// we will verify the `crawlHoroscopeData` logic by copying the minimal necessary parts or by mocking the Utils.
// Let's try to verify the URL structure and availability first for all 12 indices.

const KNOWN_SIGNS = [
    '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座',
    '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'
];

async function testCrawl() {
    console.log('Starting test crawl for all 12 signs...');
    const results = [];

    // Helper to get Date
    const d = new Date();
    d.setUTCHours(d.getUTCHours() + 8);
    const today = d.toISOString().split('T')[0];

    for (let i = 0; i < 12; i++) {
        const url = `https://astro.click108.com.tw/daily_${i}.php?iAcDay=${today}&iAstro=${i}`;
        console.log(`Checking Index ${i}: ${url}`);

        try {
            const res = await axios.get(url, { timeout: 5000 });
            const $ = cheerio.load(res.data);
            const title = $('title').text();

            // Check if we can find TODAY_CONTENT which is critical
            const contentCount = $('.TODAY_CONTENT p').length;
            const luckyCount = $('.LUCKY h4').length;

            // Extract Sign Name from Title
            const match = title.match(/([^\s|]+)座/); // Simple extraction
            const extractedName = match ? match[0] : 'Unknown';

            console.log(`   Result ${i}: Title="${title}" Name="${extractedName}" ContentParams=${contentCount} LuckyParams=${luckyCount}`);

            if (contentCount === 0) {
                results.push({ index: i, status: 'FAIL', reason: 'No TODAY_CONTENT found' });
            } else if (luckyCount === 0) {
                results.push({ index: i, status: 'WARN', reason: 'No LUCKY items found' });
            } else {
                results.push({ index: i, status: 'OK', name: extractedName });
            }

        } catch (error) {
            console.error(`   Error fetching index ${i}:`, error.message);
            results.push({ index: i, status: 'ERROR', reason: error.message });
        }
    }

    console.log('\n--- Summary ---');
    results.forEach(r => console.log(`Index ${r.index}: ${r.status} ${r.reason || r.name}`));
}

testCrawl();
