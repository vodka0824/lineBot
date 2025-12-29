const BLACK_SILK_URL = 'https://v2.api-m.com/api/heisi?return=302';

async function testRedirect() {
    console.log(`Testing fetch redirect: ${BLACK_SILK_URL}`);
    try {
        const res = await fetch(BLACK_SILK_URL, {
            method: 'GET',
            redirect: 'manual', // Prevent following
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        console.log(`Status: ${res.status}`);
        console.log(`Location: ${res.headers.get('location')}`);
    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

testRedirect();
