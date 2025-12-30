const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    const url = 'https://astro.click108.com.tw/daily_10.php?iAcDay=2025-12-30&iAstro=10';
    try {
        const res = await axios.get(url);
        const $ = cheerio.load(res.data);

        console.log('--- .LUCKY Structure ---');
        const lucky = $('.LUCKY');
        if (!lucky.length) {
            console.log('.LUCKY not found');
            return;
        }

        // Dump children
        lucky.find('li').each((i, el) => {
            console.log(`Item [${i}]: ${$(el).text().trim().replace(/\s+/g, ' ')}`);
            console.log(`   HTML: ${$(el).html().trim().substring(0, 100)}...`);
        });

        // Or maybe they are divs?
        lucky.children().each((i, el) => {
            console.log(`Child [${i}] <${el.tagName}> class="${$(el).attr('class')}":`);
            // console.log($(el).html().substring(0, 100));
        });

    } catch (e) {
        console.error(e);
    }
}

probe();
