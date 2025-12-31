const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    // Aries (0) Monthly
    // Note: Click108 might redirect if date is invalid or just return current month
    const url = 'https://astro.click108.com.tw/monthly_0.php?iAcDay=2024-12-30&iType=2&iAstro=0';

    try {
        console.log(`Fetching ${url}...`);
        const res = await axios.get(url);
        const $ = cheerio.load(res.data);

        console.log('--- .TODAY_CONTENT Text Dump ---');
        console.log($('.TODAY_CONTENT').text().trim());

        console.log('\n--- Paragraphs Dump ---');
        $('.TODAY_CONTENT p').each((i, el) => {
            console.log(`[${i}]: ${$(el).text().trim()}`);
        });

    } catch (e) {
        console.error(e);
    }
}

probe();
