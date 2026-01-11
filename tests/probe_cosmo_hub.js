const axios = require('axios');
const cheerio = require('cheerio');

const HUB_URL = 'https://www.cosmopolitan.com/tw/horoscopes/today/';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

async function probeHub() {
    console.log(`Fetching Hub: ${HUB_URL}`);
    try {
        const res = await axios.get(HUB_URL, { headers: HEADERS });
        const $ = cheerio.load(res.data);

        console.log(`Title: ${$('title').text().trim()}`);
        console.log('--- Collecting Links ---');

        // Strategy: Find links that look like specific daily horoscopes
        // Pattern: /tw/horoscopes/today/a<DIGITS>/<SIGN>-today/
        const links = new Set();

        $('a').each((i, el) => {
            let href = $(el).attr('href');
            if (!href) return;

            // Normalize path
            if (!href.startsWith('http')) {
                href = 'https://www.cosmopolitan.com' + href;
            }

            // Filter keywords
            if (href.includes('/today/') && href.match(/\/a\d+\//)) {
                // Also verify sign names in text
                const text = $(el).text().trim();
                links.add(`${href} [Text: ${text}]`);
            }
        });

        if (links.size === 0) {
            console.log('No direct article links found with regex /today/a\\d+/');
            console.log('Dumping first 10 links to debug:');
            $('a').slice(0, 10).each((i, el) => console.log(` - ${$(el).attr('href')}`));
        } else {
            console.log(`Found ${links.size} unique potential links:`);
            links.forEach(l => console.log(l));
        }

        // Also check JSON-LD which is often cleaner
        const jsonLd = $('script#json-ld').html();
        if (jsonLd) {
            console.log('\n--- JSON-LD Check ---');
            try {
                const data = JSON.parse(jsonLd);
                if (data.itemListElement) {
                    console.log(`JSON-LD contains ${data.itemListElement.length} items`);
                    data.itemListElement.forEach(item => {
                        console.log(` - ${item.url}`);
                    });
                }
            } catch (e) {
                console.log('Error parsing JSON-LD');
            }
        }

    } catch (e) {
        console.error(`Error: ${e.message}`);
    }
}

probeHub();
