const axios = require('axios');
const cheerio = require('cheerio');

const TVBS_HUB = 'https://woman.tvbs.com.tw/fortune';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

async function probeTVBS() {
    console.log(`\n=== Probing TVBS ===`);
    try {
        console.log(`[1] Fetching Hub: ${TVBS_HUB}`);
        const res = await axios.get(TVBS_HUB, { headers: HEADERS });
        const $ = cheerio.load(res.data);

        let dailyLink = null;

        // Find "Daily Horoscope" link
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (text.includes('今日運勢') || text.includes('每日運勢')) {
                if (href && !dailyLink) {
                    dailyLink = href.startsWith('http') ? href : 'https://woman.tvbs.com.tw' + href;
                    console.log(`   Found Daily Hub Link: ${text} -> ${dailyLink}`);
                }
            }
        });

        if (!dailyLink) {
            console.log('   Could not find explicit Daily Horoscope hub link.');
            // Dump some links
            $('a').slice(0, 5).each((i, el) => console.log(`   - ${$(el).text()}: ${$(el).attr('href')}`));
            return;
        }

        console.log(`[2] Fetching Daily Hub: ${dailyLink}`);
        const hubRes = await axios.get(dailyLink, { headers: HEADERS });
        const $hub = cheerio.load(hubRes.data);

        // Find a sign link (e.g. Aries)
        let signLink = null;
        $hub('a').each((i, el) => {
            const href = $hub(el).attr('href');
            const text = $hub(el).text().trim();
            if (href && (text.includes('牡羊') || text.includes('白羊'))) {
                signLink = href.startsWith('http') ? href : 'https://woman.tvbs.com.tw' + href;
                console.log(`   Found Sign Link: ${text} -> ${signLink}`);
            }
        });

        if (!signLink) {
            console.log('   Could not find sign link on Daily Hub.');
            return;
        }

        console.log(`[3] Fetching Sign Page: ${signLink}`);
        const signRes = await axios.get(signLink, { headers: HEADERS });
        const $sign = cheerio.load(signRes.data);
        const text = $sign('body').text().replace(/\s+/g, ' ').substring(0, 1000);

        console.log(`   Content Preview: ${text}`);
        if (text.includes('幸運數字') || text.includes('幸運色')) {
            console.log('   >>> SUCCESS! FOUND STRUCTURED DATA <<<');
        } else {
            console.log('   >>> FAIL: No structured keywords found <<<');
        }

    } catch (e) {
        console.error(`   Error: ${e.message}`);
    }
}

probeTVBS();
