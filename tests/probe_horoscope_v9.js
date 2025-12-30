const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    const indices = [8, 9, 10, 11, 12]; // Sag, Cap, Aqu, Pis, ?

    for (const index of indices) {
        const url = `https://astro.click108.com.tw/daily_${index}.php`;
        console.log(`\nFetching ${url}...`);
        try {
            const res = await axios.get(url);
            const $ = cheerio.load(res.data);
            const sign = $('.LUCKY').find('h4').eq(4).text().trim();
            console.log(`Index ${index} Lucky Sign: "${sign}"`);
        } catch (e) {
            console.error(e);
        }
    }
}

probe();
