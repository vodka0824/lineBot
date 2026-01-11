const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const URLS = [
    // PChome Variants
    'https://news.pchome.com.tw/living/horoscope/daily/aries.html',
    'https://news.pchome.com.tw/horoscope/daily/aries.html',
    'http://news.pchome.com.tw/living/horoscope/daily/0/0.html', // legacy pattern?

    // Elle
    'https://www.elle.com/tw/horoscopes/daily/'
];

async function probe(url) {
    console.log(`\nProb: ${url}`);
    try {
        const res = await axios.get(url, { headers: HEADERS, validateStatus: false });
        if (res.status === 200) {
            console.log(`   STATUS: 200 OK`);
            const $ = cheerio.load(res.data);
            const title = $('title').text().trim();
            console.log(`   TITLE: ${title}`);

            // Text Dump
            const text = $('body').text().replace(/\s+/g, ' ').substring(0, 500);
            console.log(`   TEXT: ${text}`);

            // Check Keywords
            if (text.includes('幸運數字') || text.includes('幸運色')) {
                console.log('   >>> SUCCESS! FOUND STRUCTURED DATA <<<');
            }

            // If it's Elle Hub, find links
            if (url.includes('elle.com')) {
                const links = [];
                $('a').each((i, el) => {
                    const href = $(el).attr('href');
                    if (href && href.includes('/daily/') && href !== '/tw/horoscopes/daily/') {
                        links.push(href);
                    }
                });
                console.log(`   Elle Links found: ${links.length}`);
                if (links.length > 0) {
                    const subUrl = 'https://www.elle.com' + links[0];
                    console.log(`   -> Digging into ${subUrl}`);
                    const subRes = await axios.get(subUrl, { headers: HEADERS });
                    const $sub = cheerio.load(subRes.data);
                    const subText = $sub('body').text().replace(/\s+/g, ' ');
                    console.log(`   SUB TEXT: ${subText.substring(0, 500)}`);
                    if (subText.includes('幸運數字') || subText.includes('幸運色')) {
                        console.log('   >>> SUB PAGE HAS STRUCTURED DATA <<<');
                    }
                }
            }

        } else {
            console.log(`   STATUS: ${res.status}`);
        }
    } catch (e) {
        console.log(`   ERROR: ${e.message}`);
    }
}

async function run() {
    for (const u of URLS) {
        await probe(u);
    }
}

run();
