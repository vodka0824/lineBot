const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

async function scan() {
    const mapping = {};
    const indexToSign = {};
    const today = new Date().toISOString().split('T')[0];

    let log = 'Index | Sign\n---|---\n';

    for (let i = 0; i < 12; i++) {
        const url = `https://astro.click108.com.tw/daily_${i}.php?iAcDay=${today}&iAstro=${i}`;
        try {
            const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $ = cheerio.load(res.data);

            // Try .LUCKY h4
            let sign = $('.LUCKY').find('h4').eq(4).text().trim();

            // Fallback: Try Page Title or H1/H2
            if (!sign) {
                const title = $('title').text();
                // Extract "XX座" from title
                const match = title.match(/.{2,3}座/);
                if (match) sign = match[0];
            }

            indexToSign[i] = sign || 'Unknown';
            log += `${i} | ${sign}\n`;

            if (sign) {
                mapping[sign] = i;
            }

        } catch (e) {
            log += `${i} | Error: ${e.message}\n`;
        }
    }

    fs.writeFileSync(path.join(__dirname, 'mapping_full.txt'), log);
    console.log('Mapping saved to mapping_full.txt');
}

scan();
