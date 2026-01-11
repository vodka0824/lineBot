const axios = require('axios');
const cheerio = require('cheerio');

const HUB_URL = 'https://www.cosmopolitan.com/tw/horoscopes/today/';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

async function probeRichContent() {
    try {
        console.log('Fetching Hub for fresh link...');
        const hubRes = await axios.get(HUB_URL, { headers: HEADERS });
        const $hub = cheerio.load(hubRes.data);

        let targetUrl = null;
        // Search for Aquarius specifically (User mentioned Aquarius)
        $hub('a').each((i, el) => {
            const href = $hub(el).attr('href');
            if (href && href.includes('aquarius') && href.includes('/today/a')) {
                targetUrl = href.startsWith('http') ? href : 'https://www.cosmopolitan.com' + href;
            }
        });

        if (!targetUrl) {
            console.error('Aquarius link not found in Hub, trying generic first link...');
            const first = $hub('a[href*="/today/a"]').first().attr('href');
            if (first) targetUrl = first.startsWith('http') ? first : 'https://www.cosmopolitan.com' + first;
        }

        if (!targetUrl) { console.error('No links found.'); return; }

        console.log(`Checking URL: ${targetUrl}`);
        const res = await axios.get(targetUrl, { headers: HEADERS });
        const html = res.data;

        // 1. Check for User's specific values
        const keywords = ['香檳金', '西南', 'Star', 'Fill', '煥然一新'];
        console.log('\n--- Keyword Check ---');
        keywords.forEach(k => {
            const idx = html.indexOf(k);
            if (idx !== -1) {
                console.log(`[FOUND] "${k}" at index ${idx}`);
                console.log(`   Context: ...${html.substring(idx - 50, idx + 100).replace(/\n/g, ' ')}...`);
            } else {
                console.log(`[MISSING] "${k}"`);
            }
        });

        // 2. Check for hidden metadata or JSON
        const $ = cheerio.load(html);
        console.log('\n--- Meta/Script/JSON Check ---');
        $('script').each((i, el) => {
            const content = $(el).html();
            if (content && (content.includes('香檳金') || content.includes('lucky'))) {
                console.log(`Found keyword in SCRIPT tag: ${content.substring(0, 100)}...`);
            }
        });

    } catch (e) {
        console.error(e);
    }
}

probeRichContent();
