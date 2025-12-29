const axios = require('axios');

const URLS = [
    'https://v2.api-m.com/api/heisi?return=302',
    'https://3650000.xyz/api/?type=302&mode=7'
];

async function measureLatency(url) {
    console.log(`Testing: ${url}`);
    const start = Date.now();
    try {
        const res = await axios.head(url, {
            timeout: 5000,
            validateStatus: s => s < 400
        });
        const duration = Date.now() - start;
        console.log(`✅ Success. Duration: ${duration}ms`);
        console.log(`   Final URL: ${res.request.res.responseUrl}`);
    } catch (e) {
        console.log(`❌ Failed. Duration: ${Date.now() - start}ms. Error: ${e.message}`);
    }
    console.log('---');
}

(async () => {
    for (const url of URLS) {
        await measureLatency(url);
    }
})();
