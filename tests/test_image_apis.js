const axios = require('axios');

const APIS = {
    '黑絲': 'https://v2.api-m.com/api/heisi?return=302',
    '腳控': 'https://3650000.xyz/api/?type=302&mode=7',
    'JAV': 'https://limbopro.com/tools/jwksm/ori.json'
};

async function checkApi(name, url) {
    console.log(`Checking ${name}...`);
    try {
        const res = await axios.get(url, {
            maxRedirects: 0, // Don't follow redirects automatically to check the 302
            validateStatus: status => status >= 200 && status < 400
        });

        console.log(`[${name}] Status: ${res.status}`);
        console.log(`[${name}] Type: ${res.headers['content-type']}`);

        if (res.status === 302 || res.status === 301) {
            console.log(`[${name}] Redirect Location: ${res.headers.location}`);
            // Check if redirect is valid
            try {
                const imgRes = await axios.head(res.headers.location);
                console.log(`[${name}] Target Status: ${imgRes.status}`);
                console.log(`[${name}] Target Type: ${imgRes.headers['content-type']}`);
            } catch (e) {
                console.error(`[${name}] Target Error: ${e.message}`);
            }
        } else if (name === 'JAV') {
            // JAV returns JSON
            console.log(`[${name}] Data Length: ${JSON.stringify(res.data).length}`);
        }
    } catch (error) {
        console.error(`[${name}] Error: ${error.message}`);
        if (error.response) {
            console.error(`[${name}] Response Status: ${error.response.status}`);
            console.error(`[${name}] Response Data:`, error.response.data);
        }
    }
    console.log('---');
}

(async () => {
    await checkApi('黑絲', APIS['黑絲']);
    await checkApi('腳控', APIS['腳控']);
    await checkApi('JAV', APIS['JAV']);
})();
