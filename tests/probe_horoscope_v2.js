const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    const url = 'https://astro.click108.com.tw/daily_10.php?iAcDay=2025-12-30&iAstro=10';
    console.log(`Fetching ${url}...`);
    try {
        const res = await axios.get(url);
        const $ = cheerio.load(res.data);

        const todayContent = $('.TODAY_CONTENT');
        console.log('--- TODAY_CONTENT Children ---');
        todayContent.children().each((i, el) => {
            console.log(`[${i}] ${el.tagName} class="${$(el).attr('class') || ''}" text="${$(el).text().substring(0, 50)}..."`);
        });

        console.log('--- Lucky Items Search ---');
        // Look for the block containing "幸運數字"
        const luckyLabel = $('*:contains("幸運數字")').last();
        if (luckyLabel.length) {
            console.log('Found "幸運數字" in:', luckyLabel.get(0).tagName);
            // Traverse up to find the container
            let parent = luckyLabel.parent();
            console.log('Parent HTML:', parent.html() ? parent.html().substring(0, 100) : 'null');
            console.log('Grandparent HTML:', parent.parent().html() ? parent.parent().html().substring(0, 100) : 'null');
        } else {
            console.log('Not found "幸運數字"');
        }

    } catch (e) {
        console.error(e);
    }
}

probe();
