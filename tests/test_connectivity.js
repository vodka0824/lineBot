const axios = require('axios');

async function testUrl(url) {
    console.log(`Testing ${url}...`);
    try {
        const res = await axios.get(url, {
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Cookie': 'over18=1'
            }
        });
        console.log(`✅ Status: ${res.status}`);
    } catch (e) {
        console.log(`❌ Error: ${e.message}`);
    }
}

(async () => {
    await testUrl('https://www.ptt.cc/bbs/Beauty/index.html');
    await testUrl('https://disp.cc/b/Beauty');
})();
