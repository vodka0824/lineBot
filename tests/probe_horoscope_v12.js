const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    const today = '2025-12-30';
    console.log('--- Mapping Start ---');
    for (let i = 0; i < 12; i++) { // 12 signs usually
        const url = `https://astro.click108.com.tw/daily_${i}.php?iAcDay=${today}&iAstro=${i}`;
        try {
            const res = await axios.get(url);
            const $ = cheerio.load(res.data);
            const sign = $('.LUCKY').find('h4').eq(4).text().trim();
            console.log(`Index ${i}: ${sign}`);
            await new Promise(r => setTimeout(r, 100));
        } catch (e) {
            console.log(`Index ${i}: Error`);
        }
    }
    console.log('--- Mapping End ---');
}

probe();
