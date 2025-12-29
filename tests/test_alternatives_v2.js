const axios = require('axios');

const APIS = [
    { name: 'V2 JK', url: 'https://v2.api-m.com/api/jk?return=302' },
    { name: 'V2 Meinv', url: 'https://v2.api-m.com/api/meinv?return=302' },
    { name: 'Suyanw JK', url: 'https://api.suyanw.cn/api/jk.php' },
    { name: 'Suyanw Foot', url: 'https://api.suyanw.cn/api/jiaokong.php' } // Guessing
];

async function testApi(api) {
    console.log(`Testing ${api.name}: ${api.url}`);
    try {
        const res = await axios.get(api.url, {
            timeout: 5000,
            maxRedirects: 0, // We want to see 302
            validateStatus: s => s < 500,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        console.log(`   Status: ${res.status}`);
        if (res.status >= 300 && res.status < 400) {
            console.log(`   Location: ${res.headers.location}`);
        } else {
            console.log(`   Type: ${res.headers['content-type']}`);
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
