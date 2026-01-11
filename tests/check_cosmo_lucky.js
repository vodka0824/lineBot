const axios = require('axios');
const cheerio = require('cheerio');

const TARGET_URL = 'https://www.cosmopolitan.com/tw/horoscopes/today/a32683235/aquarius-today/';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

async function checkUrl() {
    console.log(`Checking: ${TARGET_URL}`);
    try {
        const res = await axios.get(TARGET_URL, { headers: HEADERS });
        const $ = cheerio.load(res.data);

        // 1. Dump Title
        console.log(`Title: ${$('title').text().trim()}`);

        // 2. Search for "幸運數字" explicitly in the whole body
        const bodyText = $('body').text().replace(/\s+/g, ' ');
        const index = bodyText.indexOf('幸運數字');

        if (index !== -1) {
            console.log('>>> FOUND "幸運數字" in text! <<<');
            console.log(`Context: ...${bodyText.substring(index - 20, index + 30)}...`);
        } else {
            console.log('>>> "幸運數字" NOT FOUND in text body. <<<');
        }

        // 3. Dump all paragraphs to see structure
        console.log('\n--- Paragraph Dump ---');
        $('.article-body-content p, .article-body-content li').each((i, el) => {
            console.log(`[${i}] ${$(el).text().trim()}`);
        });

        // 4. Try legacy sidebar or meta tags
        console.log('\n--- Meta/Sidebar Check ---');
        $('meta').each((i, el) => {
            const name = $(el).attr('name') || $(el).attr('property');
            const content = $(el).attr('content');
            if (content && (content.includes('幸運') || content.includes('數字'))) {
                console.log(`Meta [${name}]: ${content}`);
            }
        });

    } catch (e) {
        console.error(`Error: ${e.message}`);
    }
}

checkUrl();
