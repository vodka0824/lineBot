
const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7',
    'Referer': 'https://astro.click108.com.tw/',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

async function testCrawl() {
    console.log('Starting test crawl for all 12 signs with HEADERS...');
    const results = [];

    // Helper to get Date
    const d = new Date();
    d.setUTCHours(d.getUTCHours() + 8);
    const today = d.toISOString().split('T')[0];

    for (let i = 0; i < 12; i++) {
        const url = `https://astro.click108.com.tw/daily_${i}.php?iAcDay=${today}&iAstro=${i}`;

        try {
            const res = await axios.get(url, { timeout: 10000, headers: HEADERS });
            const $ = cheerio.load(res.data);
            const title = $('title').text();
            const contentCount = $('.TODAY_CONTENT p').length;

            // Extract Sign Name from Title
            const match = title.match(/([^\s|]+)座/);
            const extractedName = match ? match[0] : 'Unknown';

            if (contentCount === 0) {
                console.log(`Index ${i}: FAIL (No Content)`);
                results.push('F');
            } else {
                console.log(`Index ${i}: OK (${extractedName})`);
                results.push('O');
            }

        } catch (error) {
            console.error(`Index ${i}: ERROR (${error.message})`);
            results.push('E');
        }
    }

    console.log('\nSummary:', results.join(''));
}

testCrawl();
