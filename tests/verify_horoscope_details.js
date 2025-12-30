const axios = require('axios');
const cheerio = require('cheerio');

async function test(index = 0) { // Default Aries
    const today = new Date().toISOString().split('T')[0];
    const url = `https://astro.click108.com.tw/daily_${index}.php?iAcDay=${today}&iAstro=${index}`;

    console.log(`Fetching ${url}...`);
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // 1. Parsing Logic Copy-Paste for Verification
        let shortComment = '';
        $('.TODAY_CONTENT h3').each((i, el) => {
            if ($(el).text().includes('今日短評')) {
                shortComment = $(el).next('p').text().trim();
            }
        });

        const luckyItems = {};
        const luckyContainer = $('.LUCKY');
        if (luckyContainer.length) {
            const h4s = luckyContainer.find('h4');
            luckyItems.number = $(h4s[0]).text().trim();
            luckyItems.color = $(h4s[1]).text().trim();
            luckyItems.direction = $(h4s[2]).text().trim();
            luckyItems.time = $(h4s[3]).text().trim();
            luckyItems.constellation = $(h4s[4]).text().trim();
        }

        console.log('--- Result ---');
        console.log('Short Comment:', shortComment);
        console.log('Lucky Items:', luckyItems);

        if (shortComment && luckyItems.number) {
            console.log('✅ Extraction Success');
        } else {
            console.log('❌ Extraction Failed');
        }

    } catch (e) {
        console.error(e);
    }
}

test(10); // Aquarius
