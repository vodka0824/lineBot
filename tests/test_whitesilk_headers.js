const URL = 'https://api.bbyun.top/api/baisi?type=json';

async function testHeaders() {
    console.log(`Checking headers for: ${URL}`);
    try {
        const res = await fetch(URL, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        console.log(`Status: ${res.status}`);
        console.log(`Content-Type: ${res.headers.get('content-type')}`);

        // Also check body just in case
        const text = await res.text();
        console.log(`Body start: ${text.substring(0, 50)}...`);

    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

testHeaders();
