const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    const url = 'https://astro.click108.com.tw/daily_0.php';
    console.log(`Fetching ${url}...`);

    try {
        const res = await axios.get(url);
        const $ = cheerio.load(res.data);

        console.log('--- Headers (h3) ---');
        $('.TODAY_CONTENT h3').each((i, el) => {
            console.log(`[${i}] "${$(el).text()}"`);
        });

        console.log('\n--- Paragraphs (p) ---');
        $('.TODAY_CONTENT p').each((i, el) => {
            console.log(`[${i}] "${$(el).text().substring(0, 50)}..."`); // Truncate for readability
        });

    } catch (e) {
        console.error(e);
    }
}

probe();
