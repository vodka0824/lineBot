const axios = require('axios');

const TEST_URL = 'https://v2.api-m.com/api/heisi?return=302';

async function checkRandomness() {
    const urls = new Set();
    console.log('Fetching 5 times...');

    for (let i = 0; i < 5; i++) {
        try {
            const res = await axios.head(TEST_URL, {
                maxRedirects: 0,
                validateStatus: s => s >= 200 && s < 400
            });
            const location = res.headers.location;
            console.log(`[${i}] Location: ${location}`);
            if (location) urls.add(location);
        } catch (e) {
            console.log(`[${i}] Error: ${e.message}`);
        }
    }

    console.log(`Unique URLs: ${urls.size} / 5`);
}

checkRandomness();
