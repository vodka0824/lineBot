const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    const url = 'https://astro.click108.com.tw/daily_10.php?iAcDay=2025-12-30&iAstro=10'; // Aquarius
    console.log(`Fetching ${url}...`);
    try {
        const res = await axios.get(url);
        const $ = cheerio.load(res.data);

        console.log('--- Searching for "今日短評" ---');
        // Find element containing "今日短評"
        const shortCommentHeader = $('*:contains("今日短評")').last();
        console.log('Header Tag:', shortCommentHeader.get(0).tagName);
        console.log('Parent HTML:', shortCommentHeader.parent().html());

        console.log('--- Searching for "幸運數字" ---');
        const numHeader = $('*:contains("幸運數字")').last();
        console.log('Num Header Parent HTML:', numHeader.parent().parent().html()); // Go up a bit to see context

        // Try to dump all text in TODAY_CONTENT to see structure
        console.log('--- TODAY_CONTENT Text Structure ---');
        console.log($('.TODAY_CONTENT').text().replace(/\s+/g, ' '));

    } catch (e) {
        console.error(e);
    }
}

probe();
