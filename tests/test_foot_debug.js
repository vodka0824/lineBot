const axios = require('axios');

const URL = 'https://3650000.xyz/api/?type=302&mode=7';

async function testApi() {
    console.log(`Testing: ${URL}`);
    try {
        const res = await axios.head(URL, {
            timeout: 5000,
            validateStatus: s => s < 400,
            headers: {
                // 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        console.log(`✅ Success. Status: ${res.status}`);
        console.log(`   Final URL: ${res.request.res.responseUrl}`);
    } catch (e) {
        console.log(`❌ Failed. Error: ${e.message}`);
        if (e.response) {
            console.log(`   Status: ${e.response.status}`);
            console.log(`   Data:`, e.response.data);
        }
    }
}

// Test with User-Agent
async function testApiWithUA() {
    console.log(`Testing with User-Agent: ${URL}`);
    try {
        const res = await axios.head(URL, {
            timeout: 5000,
            validateStatus: s => s < 400,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        console.log(`✅ Success with UA. Status: ${res.status}`);
        console.log(`   Final URL: ${res.request.res.responseUrl}`);
    } catch (e) {
        console.log(`❌ Failed with UA. Error: ${e.message}`);
        if (e.response) {
            console.log(`   Status: ${e.response.status}`);
            console.log(`   Data:`, e.response.data);
        }
    }
}

(async () => {
    await testApi();
    console.log('---');
    await testApiWithUA();
})();
