const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    const configs = [
        { url: 'https://astro.click108.com.tw/daily_1.php' }, // Taurus, no params
        { url: 'https://astro.click108.com.tw/daily_1.php?iAstro=1' }, // Taurus, params
        { url: 'https://astro.click108.com.tw/daily_10.php' }, // Aquarius, no params
        { url: 'https://astro.click108.com.tw/daily_10.php?iAstro=10' } // Aquarius, params
    ];

    for (const config of configs) {
        console.log(`\nFetching ${config.url}...`);
        try {
            const res = await axios.get(config.url);
            const $ = cheerio.load(res.data);
            const sign = $('.LUCKY').find('h4').eq(4).text().trim();
            console.log(`Lucky Constellation: "${sign}"`);
        } catch (e) {
            console.error(e);
        }
    }
}

probe();
