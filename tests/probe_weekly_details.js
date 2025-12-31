const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    // Aries (0), Weekly
    // Use a recent date? The user mentioned 2025-12-30 in request, but let's use current.
    // Or just valid parameters.
    const url = 'https://astro.click108.com.tw/weekly_0.php?iAcDay=2024-12-30&iType=1&iAstro=0';

    try {
        console.log(`Fetching ${url}...`);
        const res = await axios.get(url);
        const $ = cheerio.load(res.data);

        console.log('\n--- .TODAY_WORD (Weekly) ---');
        console.log($('.TODAY_WORD').html()); // Dump HTML to see structure

        console.log('\n--- TEXT DUMP ---');
        $('.TODAY_WORD p').each((i, el) => {
            console.log(`[${i}]: ${$(el).text().trim()}`);
        });

        console.log('\n--- .LUCKY (Weekly) ---');
        $('.LUCKY h4').each((i, el) => {
            console.log(`[${i}]: ${$(el).text().trim()}`);
        });

    } catch (e) {
        console.error(e);
    }
}

probe();
