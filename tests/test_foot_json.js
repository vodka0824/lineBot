const axios = require('axios');

const URL = 'https://3650000.xyz/api/?type=json&mode=7';

async function testJsonApi() {
    console.log(`Testing JSON API: ${URL}`);
    try {
        const res = await axios.get(URL, {
            timeout: 5000,
            maxRedirects: 0,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        console.log(`Status: ${res.status}`);
        console.log(`Data type: ${typeof res.data}`);
        console.log(`Data keys: ${Object.keys(res.data)}`);
        console.log(`Full Response:`, JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.log(`Error: ${e.message}`);
        if (e.response) {
            console.log(`Response Data:`, e.response.data);
        }
    }
}

testJsonApi();
