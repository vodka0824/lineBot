const axios = require('axios');
const cheerio = require('cheerio');

const HUB_URL = 'https://www.cosmopolitan.com/tw/horoscopes/today/';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

// Chinese Sign Names to Standardize
const SIGN_MAP = {
    '牡羊': '牡羊座', '白羊': '牡羊座',
    '金牛': '金牛座',
    '雙子': '雙子座',
    '巨蟹': '巨蟹座',
    '獅子': '獅子座',
    '處女': '處女座',
    '天秤': '天秤座', '天平': '天秤座',
    '天蠍': '天蠍座',
    '射手': '射手座', '人馬': '射手座',
    '摩羯': '摩羯座', '山羊': '摩羯座',
    '水瓶': '水瓶座',
    '雙魚': '雙魚座'
};

/**
 * Stage 1: Get all 12 daily links from Hub
 */
async function fetchDailyLinks() {
    console.log(`[Hub] Fetching ${HUB_URL}...`);
    try {
        const res = await axios.get(HUB_URL, { headers: HEADERS });
        const $ = cheerio.load(res.data);

        const links = {};

        // Strategy: Look for links with /today/a<digits>/ structure
        $('a').each((i, el) => {
            let href = $(el).attr('href');
            const text = $(el).text().trim();

            if (!href) return;
            if (!href.startsWith('http')) {
                href = 'https://www.cosmopolitan.com' + href;
            }

            // Regex for daily article: /today/a\d+/
            if (href.includes('/today/') && href.match(/\/a\d+\//)) {
                // Identify Sign from Code or Text
                let signName = identifySign(text);

                // If text validation fails, fallback to URL guessing if possible (e.g. 'aries')
                if (!signName) {
                    signName = identifySignFromUrl(href);
                }

                if (signName) {
                    links[signName] = href;
                }
            }
        });

        const count = Object.keys(links).length;
        console.log(`[Hub] Found ${count} sign links.`);
        if (count < 12) {
            console.warn(`[Hub] Warning: Only found ${count}/12 links.`);
            const missing = Object.values(SIGN_MAP).filter(s => !links[s]);
            console.warn(`[Hub] Missing: ${[...new Set(missing)].join(', ')}`);
        }

        return links;
    } catch (e) {
        console.error(`[Hub] Error: ${e.message}`);
        return {};
    }
}

function identifySign(text) {
    for (const [key, val] of Object.entries(SIGN_MAP)) {
        if (text.includes(key)) return val;
    }
    return null;
}

function identifySignFromUrl(url) {
    // URL often contains english name like 'aries-today'
    if (url.includes('aries')) return '牡羊座';
    if (url.includes('taurus')) return '金牛座';
    if (url.includes('gemini')) return '雙子座';
    if (url.includes('cancer')) return '巨蟹座';
    if (url.includes('leo')) return '獅子座';
    if (url.includes('virgo')) return '處女座';
    if (url.includes('libra')) return '天秤座';
    if (url.includes('scorpio')) return '天蠍座';
    if (url.includes('sagittarius')) return '射手座';
    if (url.includes('capricorn')) return '摩羯座';
    if (url.includes('aquarius')) return '水瓶座';
    if (url.includes('pisces')) return '雙魚座';
    return null;
}

/**
 * Stage 2: Fetch details from a specific URL
 */
async function fetchSignDetails(signName, url) {
    // console.log(`[Deep] Fetching ${signName}...`);
    try {
        const res = await axios.get(url, { headers: HEADERS });
        const $ = cheerio.load(res.data);
        const bodyText = $('.article-body-content').text().replace(/\s+/g, ' ') || $('body').text().replace(/\s+/g, ' ');

        // Regex Extraction
        const luckyNumMatch = bodyText.match(/幸運數字[:：]?\s*(\d+)/);
        const luckyTimeMatch = bodyText.match(/今日吉時[:：]?\s*([0-9a-zA-Z:\-]+)/);
        const luckySignMatch = bodyText.match(/幸運星座[:：]?\s*([\u4e00-\u9fa5]+)/);

        // Extract content (first nice paragraph or metadata)
        // Usually Cosmo puts the main forecast in the first few paragraphs
        let content = '';
        $('.article-body-content p').each((i, el) => {
            const t = $(el).text().trim();
            if (t.length > 20 && !t.includes('延伸閱讀') && !t.includes('幸運') && !content) {
                content = t;
            }
        });

        // Fallback if no specific content found
        if (!content) {
            content = bodyText.substring(0, 150) + '...';
        }

        return {
            name: signName,
            luckyNumber: luckyNumMatch ? luckyNumMatch[1] : 'N/A',
            luckyTime: luckyTimeMatch ? luckyTimeMatch[1] : 'N/A',
            luckySign: luckySignMatch ? luckySignMatch[1] : 'N/A',
            content: content
        };

    } catch (e) {
        console.error(`[Deep] Error fetching ${signName}: ${e.message}`);
        return null;
    }
}

/**
 * Main Runner
 */
async function runTest() {
    console.log('=== Cosmo Crawler Test Module ===');

    // 1. Get Links
    const links = await fetchDailyLinks();

    // 2. Fetch All (Parallel)
    const tasks = Object.entries(links).map(([name, url]) => fetchSignDetails(name, url));
    const results = await Promise.all(tasks);

    // 3. Display Results
    console.log('\n=== Crawl Results ===');
    const validResults = results.filter(r => r !== null);

    validResults.forEach(r => {
        console.log(`[${r.name}] 🔢 ${r.luckyNumber} | ⏰ ${r.luckyTime} | ✨ ${r.luckySign}`);
        // console.log(`   📝 ${r.content.substring(0, 50)}...`);
    });

    console.log(`\nSuccess Rate: ${validResults.length}/12`);
}

// Export for usage if needed, or run directly
if (require.main === module) {
    runTest();
}

module.exports = { fetchDailyLinks, fetchSignDetails };
