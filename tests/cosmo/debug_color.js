const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const HUB_URL = 'https://www.cosmopolitan.com/tw/horoscopes/today/';

async function checkStructure() {
    try {
        console.log('Fetching Hub to get a fresh link...');
        const hubRes = await axios.get(HUB_URL, { headers: HEADERS });
        const $hub = cheerio.load(hubRes.data);

        let targetUrl = null;
        $hub('a').each((i, el) => {
            const href = $hub(el).attr('href');
            if (href && href.includes('/today/a') && !targetUrl) {
                targetUrl = href.startsWith('http') ? href : 'https://www.cosmopolitan.com' + href;
            }
        });

        if (!targetUrl) {
            console.error('No link found');
            return;
        }

        console.log(`Checking Fresh URL: ${targetUrl}`);
        const res = await axios.get(targetUrl, { headers: HEADERS });
        const $ = cheerio.load(res.data);

        const html = $.html();
        // Check for both 幸運色 and 幸運顏色
        const patterns = ['幸運色', '幸運顏色', 'Lucky Color'];

        patterns.forEach(p => {
            const index = html.indexOf(p);
            if (index !== -1) {
                console.log(`\n--- Context around "${p}" (HTML) ---`);
                console.log(html.substring(index - 50, index + 100));
            } else {
                console.log(`Patter "${p}" not found in HTML`);
            }
        });

        // Also check text content
        const text = $('body').text().replace(/\s+/g, ' ');
        patterns.forEach(p => {
            const tIndex = text.indexOf(p);
            if (tIndex !== -1) {
                console.log(`\n--- Context around "${p}" (Text) ---`);
                console.log(text.substring(tIndex - 50, tIndex + 50));
            }
        });

    } catch (e) {
        console.error(e);
    }
}
checkStructure();
