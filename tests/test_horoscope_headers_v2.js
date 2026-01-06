
const axios = require('axios');

const URL = 'https://astro.click108.com.tw/daily_0.php?iAcDay=2026-01-06&iAstro=0';
const TIMEOUT = 15000; // Increased to 15s

async function test() {
    console.log(`Testing URL: ${URL} with timeout ${TIMEOUT}ms`);

    console.log('\nTest 3: Request WITH Full Headers');
    try {
        const start = Date.now();
        const res = await axios.get(URL, {
            timeout: TIMEOUT,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7',
                'Referer': 'https://astro.click108.com.tw/',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        console.log(`   OK (${Date.now() - start}ms) Status: ${res.status}`);
        console.log(`   Content Length: ${res.data.length}`);
    } catch (e) {
        console.log(`   FAIL: ${e.message}`);
        if (e.response) {
            console.log(`   Status: ${e.response.status}`);
        }
    }
}

test();
