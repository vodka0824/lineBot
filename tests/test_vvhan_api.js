const axios = require('axios');

const API_URL = "https://api.vvhan.com/api/horoscope";

async function testAPI() {
    console.log(`Fetching from ${API_URL}...`);
    try {
        const res = await axios.get(API_URL, {
            params: {
                type: 'aries',
                time: 'today'
            }
        });

        console.log('Status:', res.status);
        console.log('Data:', JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) {
            console.error('Response Status:', e.response.status);
            console.error('Response Data:', e.response.data);
        }
    }
}

testAPI();
