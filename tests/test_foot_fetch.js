const URL = 'https://3650000.xyz/api/?type=json&mode=7';

async function testFetch() {
    console.log(`Testing with native fetch: ${URL}`);
    try {
        const res = await fetch(URL, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        console.log(`Status: ${res.status}`);
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        console.log(`Full Response:`, JSON.stringify(data, null, 2));

        if (data.url) {
            console.log(`✅ Extracted URL: ${data.url}`);
        } else {
            console.log(`❌ URL not found in response`);
        }

    } catch (e) {
        console.log(`❌ Error: ${e.message}`);
    }
}

testFetch();
