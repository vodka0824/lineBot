const axios = require('axios');
const cheerio = require('cheerio');

async function debugMapping() {
    console.log('[Debug] Starting mapping refresh...');
    const mapping = {};
    const promises = [];
    const today = new Date().toISOString().split('T')[0];

    // Test 0-15
    for (let i = 0; i < 16; i++) {
        promises.push((async () => {
            try {
                const url = `https://astro.click108.com.tw/daily_${i}.php?iAcDay=${today}&iAstro=${i}`;
                // console.log(`Fetching ${i}...`);
                const res = await axios.get(url, { timeout: 5000 });
                const $ = cheerio.load(res.data);

                const lucky = $('.LUCKY');
                if (lucky.length) {
                    // Try to find the sign name
                    const h4 = lucky.find('h4').eq(4);
                    const sign = h4.text().trim();
                    console.log(`[Index ${i}] Found Sign: "${sign}"`);

                    if (sign && sign.endsWith('座')) {
                        mapping[sign] = i;
                        mapping[sign.replace('座', '')] = i;
                    }
                } else {
                    console.log(`[Index ${i}] No .LUCKY found`);
                }
            } catch (e) {
                console.log(`[Index ${i}] Error: ${e.message}`);
            }
        })());
    }

    await Promise.all(promises);

    console.log('\n--- Generated Mapping ---');
    console.log(JSON.stringify(mapping, null, 2));

    console.log('\n--- Missing Signs Check ---');
    const REQUIRED = ['牡羊', '金牛', '雙子', '巨蟹', '獅子', '處女', '天秤', '天蠍', '射手', '摩羯', '水瓶', '雙魚'];
    const missing = REQUIRED.filter(s => !mapping[s]);
    if (missing.length > 0) {
        console.log('MISSING:', missing);
    } else {
        console.log('All signs mapped!');
    }
}

debugMapping();
