const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    // Aries (0), 2024-12-30
    const weeklyUrl = 'https://astro.click108.com.tw/weekly_0.php?iAcDay=2024-12-30&iType=1&iAstro=0';
    const monthlyUrl = 'https://astro.click108.com.tw/monthly_0.php?iAcDay=2024-12-30&iType=2&iAstro=0';

    const urls = { 'WEEKLY': weeklyUrl, 'MONTHLY': monthlyUrl };

    for (const [type, url] of Object.entries(urls)) {
        try {
            console.log(`\n--- PROBING ${type} ---`);
            const res = await axios.get(url);
            const $ = cheerio.load(res.data);

            // 1. Title
            console.log(`Title: ${$('title').text()}`);

            // 2. Short Comment (.TODAY_WORD ?)
            const shortComment = $('.TODAY_WORD p').text().trim();
            console.log(`Short Comment: ${shortComment.substring(0, 50)}...`);

            // 3. Lucky Items (.LUCKY)
            console.log('Lucky Items:');
            $('.LUCKY h4').each((i, el) => {
                console.log(`  [${i}]: ${$(el).text().trim()}`);
            });

            // 4. Content Sections (.TODAY_CONTENT)
            console.log('Content Headers:');
            $('.TODAY_CONTENT p').each((i, el) => {
                const text = $(el).text().trim();
                const headerMatch = text.match(/^(整體|愛情|事業|財運|健康|工作|求職|戀愛)/); // Expanded guess
                if (headerMatch) {
                    console.log(`  Header Found: ${text.substring(0, 30)}...`);
                }
            });

        } catch (e) {
            console.error(`Error probing ${type}:`, e.message);
        }
    }
}

probe();
