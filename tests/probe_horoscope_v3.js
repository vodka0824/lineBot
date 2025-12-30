const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    const url = 'https://astro.click108.com.tw/daily_10.php?iAcDay=2025-12-30&iAstro=10';
    console.log(`Fetching ${url}...`);
    try {
        const res = await axios.get(url);
        const $ = cheerio.load(res.data);

        console.log('--- Global Search for "幸運數字" ---');
        const els = $('*:contains("幸運數字")');
        console.log(`Found ${els.length} elements containing "幸運數字"`);

        els.each((i, el) => {
            const tag = $(el).get(0).tagName;
            // Filter out parents (html, body, div wrapper) to find the most specific one
            // children().length == 0 means leaf node (or close to it)
            if ($(el).children().length === 0) {
                console.log(`[${i}] Leaf-ish Element: <${tag}> class="${$(el).attr('class')}"`);
                console.log(`Parent: <${$(el).parent().get(0).tagName}> class="${$(el).parent().attr('class')}"`);
                console.log(`Grandparent: <${$(el).parent().parent().get(0).tagName}> class="${$(el).parent().parent().attr('class')}"`);
                console.log(`Great-Grandparent: <${$(el).parent().parent().parent().get(0).tagName}> class="${$(el).parent().parent().parent().attr('class')}"`);
                console.log('--- Content ---');
                console.log($(el).parent().text().replace(/\s+/g, ' '));
            }
        });

        console.log('--- Check for .LUCKY class ---');
        if ($('.LUCKY').length) {
            console.log('.LUCKY found!');
            console.log($('.LUCKY').text().substring(0, 100));
        }

    } catch (e) {
        console.error(e);
    }
}

probe();
