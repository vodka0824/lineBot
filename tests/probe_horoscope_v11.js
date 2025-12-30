const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function probe() {
    const today = '2025-12-30';
    let output = 'Index | Lucky Sign (h4[4])\n---|---\n';

    for (let i = 0; i <= 13; i++) {
        const url = `https://astro.click108.com.tw/daily_${i}.php?iAcDay=${today}&iAstro=${i}`;
        try {
            const res = await axios.get(url);
            const $ = cheerio.load(res.data);
            const sign = $('.LUCKY').find('h4').eq(4).text().trim();
            output += `${i} | ${sign}\n`;
            console.log(`${i} | ${sign}`);
            await new Promise(r => setTimeout(r, 200));
        } catch (e) {
            output += `${i} | Error\n`;
            console.log(`${i} | Error`);
        }
    }

    fs.writeFileSync('probe_result.txt', output);
    console.log('Written to probe_result.txt');
}

probe();
