const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    // Try Aries (0) and Aquarius (10)
    const urls = [
        'https://astro.click108.com.tw/daily_0.php?iAcDay=2025-12-30&iAstro=0',
        'https://astro.click108.com.tw/daily_10.php?iAcDay=2025-12-30&iAstro=10'
    ];

    for (const url of urls) {
        console.log(`\nFetching ${url}...`);
        try {
            const res = await axios.get(url);
            const $ = cheerio.load(res.data);

            console.log('--- Searching for H3 tags ---');
            $('h3').each((i, el) => {
                console.log(`h3[${i}] Text: "${$(el).text().trim()}" | Class: "${$(el).attr('class')}"`);
                console.log(`   Next Element: <${$(el).next().get(0)?.tagName}> Text: "${$(el).next().text().trim().substring(0, 30)}..."`);
            });

            console.log('--- Searching for .LUCKY info ---');
            const lucky = $('.LUCKY');
            lucky.find('h4').each((i, el) => {
                console.log(`Lucky h4[${i}]: "${$(el).text().trim()}"`);
            });

        } catch (e) {
            console.error(e);
        }
    }
}

probe();
