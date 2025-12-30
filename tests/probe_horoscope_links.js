const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    // Try the daily horoscope index page
    const url = 'https://astro.click108.com.tw/daily/daily.php'; // Guessing the hub page
    // Or just root
    // Common: https://astro.click108.com.tw/

    // Let's try to fetch a known hub page. Search results usually point to daily_x.php directly.
    // Try generic constellation page.
    const urls = [
        'https://astro.click108.com.tw/',
        'https://astro.click108.com.tw/daily/daily.php' // Hypothethical
    ];

    for (const u of urls) {
        console.log(`Fetching ${u}...`);
        try {
            const res = await axios.get(u);
            const $ = cheerio.load(res.data);

            console.log(`Page Title: ${$('title').text()}`);

            // Look for links containing 'daily_'
            $('a[href*="daily_"]').each((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim();
                console.log(`Link: ${text} -> ${href}`);
            });

        } catch (e) {
            console.log(`Error fetching ${u}: ${e.message}`);
        }
    }
}

probe();
