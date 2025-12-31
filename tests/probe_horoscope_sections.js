const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    // Aries index 0 usually
    const url = 'https://astro.click108.com.tw/daily_0.php?iAcDay=2024-12-30&iAstro=0';
    try {
        const res = await axios.get(url);
        const $ = cheerio.load(res.data);

        console.log('--- HTML Structure of .TODAY_CONTENT ---');
        $('.TODAY_CONTENT').contents().each((i, el) => {
            if (el.type === 'tag') {
                console.log(`[${el.name}] class="${$(el).attr('class') || ''}": ${$(el).text().trim().substring(0, 50)}...`);
            } else if (el.type === 'text') {
                const txt = $(el).text().trim();
                if (txt) console.log(`[text]: ${txt.substring(0, 50)}...`);
            }
        });

        console.log('\n--- Paragraphs Only ---');
        $('.TODAY_CONTENT p').each((i, el) => {
            console.log(`P[${i}]: ${$(el).text().trim()}`);
        });

    } catch (e) {
        console.error(e);
    }
}

probe();
