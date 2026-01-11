const axios = require('axios');
const cheerio = require('cheerio');

const WEEKLY_HUB = 'https://www.cosmopolitan.com/tw/horoscopes/weekly/';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

async function probeDeep() {
    console.log('=== Deep Probing Cosmo Content ===');
    try {
        // 1. Get Weekly Hub to find a real article URL via JSON-LD (like the other repo does)
        console.log(`[1] Fetching Hub: ${WEEKLY_HUB}`);
        const res = await axios.get(WEEKLY_HUB, { headers: HEADERS });
        const $ = cheerio.load(res.data);

        // Find JSON-LD
        let articleUrl = null;
        const jsonLd = $('script#json-ld').html();
        if (jsonLd) {
            try {
                const data = JSON.parse(jsonLd);
                if (data.itemListElement && data.itemListElement.length > 0) {
                    console.log(`   Found ${data.itemListElement.length} items in JSON-LD`);
                    articleUrl = data.itemListElement[0].url; // Get the first sign's URL
                    console.log(`   Target URL: ${articleUrl}`);
                }
            } catch (e) {
                console.error('   Failed to parse JSON-LD:', e.message);
            }
        }

        if (!articleUrl) {
            console.error('   Could not find article URL from JSON-LD.');
            return;
        }

        // 2. Fetch the article and dump content
        console.log(`\n[2] Fetching Article: ${articleUrl}`);
        const artRes = await axios.get(articleUrl, { headers: HEADERS });
        const $art = cheerio.load(artRes.data);

        // Get all text from paragraphs and lists
        const text = $art('.article-body-content').text() || $art('p').text();

        console.log('\n=== CONTENT DUMP (First 1000 chars) ===');
        console.log(text.substring(0, 1000));
        console.log('=====================================\n');

        // 3. Regex Check
        console.log('=== Regex Pattern Check ===');
        const patterns = [
            /幸運數字[:：]\s*(\d+)/,
            /幸運顏色[:：]\s*([\u4e00-\u9fa5]+)/,
            /愛情運[:：]([^。]+)/,
            /事業運[:：]([^。]+)/
        ];

        patterns.forEach(p => {
            const match = text.match(p);
            console.log(`   Pattern ${p}: ${match ? 'MATCHED => ' + match[1] : 'FAIL'}`);
        });

    } catch (e) {
        console.error('Error:', e.message);
    }
}

probeDeep();
