const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    const indices = [0, 1, 2, 10]; // Aries, Taurus, Gemini, Aquarius
    const today = '2025-12-30';

    for (const index of indices) {
        const url = `https://astro.click108.com.tw/daily_${index}.php?iAcDay=${today}&iAstro=${index}`;
        console.log(`\nFetching ${url}...`);
        try {
            const res = await axios.get(url, { maxRedirects: 5 });
            const $ = cheerio.load(res.data);

            // Extract Lucky Constellation (should match the sign)
            const lucky = $('.LUCKY');
            const luckySign = lucky.find('h4').eq(4).text().trim();
            const number = lucky.find('h4').eq(0).text().trim();

            console.log(`Index ${index}: Correct URL? ${res.request.res.responseUrl}`);
            console.log(`Lucky Constellation (h4[4]): "${luckySign}"`);
            console.log(`Lucky Number        (h4[0]): "${number}"`);

            // Extract Title to see if it mentions the sign
            const title = $('title').text().trim();
            console.log(`Title: ${title.substring(0, 50)}...`);

        } catch (e) {
            console.error(e);
        }
    }
}

probe();
