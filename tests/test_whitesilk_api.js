const URL = 'https://api.bbyun.top/api/baisi?type=json';

async function testApi() {
    console.log(`Testing White Silk API: ${URL}`);
    try {
        const res = await fetch(URL, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        console.log(`Status: ${res.status}`);
        const text = await res.text();
        console.log(`Raw Body: ${text}`);

        try {
            const json = JSON.parse(text);
            console.log(`JSON Parsed:`, json);
            if (json.url) {
                console.log(`✅ Image URL: ${json.url}`);
            } else {
                console.log(`⚠️ URL field missing in JSON`);
            }
        } catch (e) {
            console.log(`❌ Not a valid JSON response`);
        }

    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

testApi();
