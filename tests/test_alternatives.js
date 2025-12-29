const axios = require('axios');

const APIS = [
    { name: 'Current (No Type)', url: 'https://3650000.xyz/api/?mode=7' }, // Try without type=302 (maybe returns JSON?)
    { name: 'Current (JSON)', url: 'https://3650000.xyz/api/?mode=7&type=json' }, // Try explicit json
    { name: 'Yujn', url: 'https://api.yujn.cn/api/jks.php?type=json' },
    { name: 'Yujn (Redirect)', url: 'https://api.yujn.cn/api/jks.php' }
];

async function testApi(api) {
    console.log(`Testing ${api.name}: ${api.url}`);
    try {
        const res = await axios.get(api.url, {
            timeout: 5000,
            validateStatus: s => s < 500,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        console.log(`   Status: ${res.status}`);
        console.log(`   Type: ${res.headers['content-type']}`);
        if (res.headers['content-type']?.includes('json')) {
            console.log(`   Body:`, typeof res.data === 'object' ? JSON.stringify(res.data).substring(0, 100) : res.data);
        } else {
            console.log(`   Location: ${res.request.res.responseUrl}`);
        }
    } catch (e) {
        console.log(`   Error: ${e.message}`);
    }
    console.log('---');
}

(async () => {
    for (const api of APIS) {
        await testApi(api);
    }
})();
