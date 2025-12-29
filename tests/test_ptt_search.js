const axios = require('axios');

async function testSearch(keyword) {
    const searchUrl = `https://www.ptt.cc/bbs/Beauty/search?q=${encodeURIComponent(keyword)}`;
    console.log(`Testing Search: ${searchUrl}`);
    try {
        const res = await axios.get(searchUrl, {
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Cookie': 'over18=1'
            }
        });
        console.log(`✅ Status: ${res.status}`);
        console.log(`   Content Length: ${res.data.length}`);
    } catch (e) {
        console.log(`❌ Error: ${e.message}`);
    }
}

(async () => {
    await testSearch('美腿');
})();
