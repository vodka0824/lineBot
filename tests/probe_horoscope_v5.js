const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    const url = 'https://astro.click108.com.tw/daily_10.php?iAcDay=2025-12-30&iAstro=10';
    console.log(`Fetching ${url}...`);
    try {
        const res = await axios.get(url);
        const $ = cheerio.load(res.data);

        console.log('--- TODAY_CONTENT structure ---');
        $('.TODAY_CONTENT').children().each((i, el) => {
            console.log(`[${i}] <${el.tagName}> text="${$(el).text().trim().substring(0, 30)}..."`);
            // Check if this contains "今日短評"
            if ($(el).text().includes('今日短評')) {
                console.log(`    MATCH "今日短評"! Next sibling: <${$(el).next().get(0)?.tagName}> text="${$(el).next().text().trim().substring(0, 30)}..."`);
            }
        });

        console.log('--- .LUCKY Contents ---');
        $('.LUCKY').find('h4').each((i, el) => {
            console.log(`h4[${i}] Text: "${$(el).text().trim()}" | HTML: "${$(el).html().trim()}"`);
        });

    } catch (e) {
        console.error(e);
    }
}

probe();
