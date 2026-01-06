
const axios = require('axios');

const URL = 'https://astro.click108.com.tw/daily_0.php?iAcDay=2026-01-06&iAstro=0';
const TIMEOUT = 5000;

async function test() {
    console.log('Test 1: Request without Headers (Simulating current code)');
    try {
        const start = Date.now();
        await axios.get(URL, { timeout: TIMEOUT });
        console.log(`   OK (${Date.now() - start}ms)`);
    } catch (e) {
        console.log(`   FAIL: ${e.message}`);
    }

    console.log('\nTest 2: Request WITH User-Agent');
    try {
        const start = Date.now();
        await axios.get(URL, {
            timeout: TIMEOUT,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        console.log(`   OK (${Date.now() - start}ms)`);
    } catch (e) {
        console.log(`   FAIL: ${e.message}`);
    }
}

test();
