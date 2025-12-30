const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    const today = '2025-12-30';
    console.log('Index | Lucky Sign (h4[4])');
    console.log('---|---');

    for (let i = 0; i <= 13; i++) {
        const url = `https://astro.click108.com.tw/daily_${i}.php?iAcDay=${today}&iAstro=${i}`;
        try {
            const res = await axios.get(url);
            const $ = cheerio.load(res.data);
            const sign = $('.LUCKY').find('h4').eq(4).text().trim(); // Lucky sign matches the horoscope sign usually
            console.log(`${i} | ${sign}`);
            await new Promise(r => setTimeout(r, 500)); // Delay to be nice

        } catch (e) {
            console.log(`${i} | Error`);
        }
    }
}

probe();
