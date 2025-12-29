const axios = require('axios');

const URL = 'https://3650000.xyz/api/?type=302&mode=7';

async function testHeadNoRedirect() {
    console.log(`Testing HEAD with maxRedirects: 0...`);
    try {
        const res = await axios.head(URL, {
            timeout: 5000,
            validateStatus: s => s < 500, // Accept 302/400 to parse
            maxRedirects: 0,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        console.log(`Status: ${res.status}`);
        console.log(`Location: ${res.headers.location}`);
    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

async function testGetNoRedirect() {
    console.log(`Testing GET with maxRedirects: 0...`);
    try {
        const res = await axios.get(URL, {
            timeout: 5000,
            validateStatus: s => s < 500,
            maxRedirects: 0,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        console.log(`Status: ${res.status}`);
        console.log(`Location: ${res.headers.location}`);
    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

(async () => {
    await testHeadNoRedirect();
    console.log('---');
    await testGetNoRedirect();
})();
