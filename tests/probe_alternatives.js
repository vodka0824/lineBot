const axios = require('axios');
const cheerio = require('cheerio');

const PCHOME_HUB = 'https://news.pchome.com.tw/living/horoscope/index.html'; // Guessed Hub
const ELLE_HUB = 'https://www.elle.com/tw/horoscopes/daily/';
const YAHOO_HUB = 'https://tw.news.yahoo.com/horoscope/'; // Yahoo often has its own section too

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

async function probeSite(name, hubUrl, signLinkSelector) {
    console.log(`\n=== Probing ${name} ===`);
    try {
        console.log(`[1] Fetching Hub: ${hubUrl}`);
        const res = await axios.get(hubUrl, { headers: HEADERS, validateStatus: false });

        if (res.status !== 200) {
            console.log(`   Failed to fetch hub: ${res.status}`);
            return;
        }

        const $ = cheerio.load(res.data);
        console.log(`   Hub Title: ${$('title').text().trim()}`);

        let signLink = null;

        // Strategy: Find a link that looks like a daily horoscope for a sign
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (signLink) return; // Found one

            if (href && (text.includes('牡羊') || text.includes('白羊') || href.includes('aries'))) {
                // Heuristic for sign link
                if (href.startsWith('http')) {
                    signLink = href;
                } else if (href.startsWith('//')) {
                    signLink = 'https:' + href;
                } else {
                    const baseUrl = new URL(hubUrl).origin;
                    signLink = baseUrl + (href.startsWith('/') ? '' : '/') + href;
                }
                console.log(`   Found Potential Link: ${text} -> ${signLink}`);
            }
        });

        if (!signLink) {
            console.log('   Could not find a sign link on hub. Dumping top 5 links:');
            $('a').slice(0, 5).each((i, el) => console.log(`   - ${$(el).text()}: ${$(el).attr('href')}`));
            return;
        }

        // 2. Fetch Sign Page
        console.log(`[2] Fetching Sign Page: ${signLink}`);
        const signRes = await axios.get(signLink, { headers: HEADERS });
        const $sign = cheerio.load(signRes.data);

        // 3. Dump Content & Check Structure
        // Try multiple content selectors
        const contentText = $sign('body').text().replace(/\s+/g, ' '); // Flatten text

        console.log(`   Content Preview: ${contentText.substring(0, 300)}...`);

        const patterns = [
            /幸運數字[:：]?\s*(\d+)/,
            /幸運顏色[:：]?\s*([\u4e00-\u9fa5]+)/,
            /財運[:：]?/,
            /整體[:：]?/
        ];

        console.log('   --- Structure Check ---');
        patterns.forEach(p => {
            const match = contentText.match(p);
            console.log(`   Pattern ${p}: ${match ? 'MATCHED (' + match[0] + ')' : 'FAIL'}`);
        });

    } catch (e) {
        console.error(`   Error probing ${name}:`, e.message);
    }
}

async function run() {
    await probeSite('PChome', 'https://news.pchome.com.tw/living/horoscope/20250110/index-17048160003056247009.html', ''); // Try news hub
    // Actually PChome horoscope URL is tricky. Let's try a direct guess based on search results often pointing to /horoscope/cat/
    // Let's try the general horoscope hub
    await probeSite('PChome Hub', 'https://news.pchome.com.tw/living/horoscope/', '');
    await probeSite('Elle', 'https://www.elle.com/tw/horoscopes/daily/', '');
}

run();
