const axios = require('axios');
const cheerio = require('cheerio');

const HUB_URL = 'https://www.cosmopolitan.com/tw/horoscopes/today/';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

const SIGN_MAP = {
    '牡羊座': '牡羊座', '白羊座': '牡羊座', 'aries': '牡羊座',
    '金牛座': '金牛座', 'taurus': '金牛座',
    '雙子座': '雙子座', 'gemini': '雙子座',
    '巨蟹座': '巨蟹座', 'cancer': '巨蟹座',
    '獅子座': '獅子座', 'leo': '獅子座',
    '處女座': '處女座', 'virgo': '處女座',
    '天秤座': '天秤座', '天平座': '天秤座', 'libra': '天秤座',
    '天蠍座': '天蠍座', 'scorpio': '天蠍座',
    '射手座': '射手座', '人馬座': '射手座', 'sagittarius': '射手座',
    '摩羯座': '摩羯座', '山羊座': '摩羯座', 'capricorn': '摩羯座',
    '水瓶座': '水瓶座', 'aquarius': '水瓶座',
    '雙魚座': '雙魚座', 'pisces': '雙魚座'
};

let LINK_CACHE = {};
let CACHE_TIMESTAMP = 0;
const CACHE_DURATION = 3600 * 1000; // 1 hour cache for hub links

async function getDailyLink(signName) {
    const now = Date.now();
    // Refresh cache if empty or expired
    if (Object.keys(LINK_CACHE).length === 0 || (now - CACHE_TIMESTAMP) > CACHE_DURATION) {
        console.log('[CosmoCrawler] Refreshing Hub Links...');
        await fetchDailyLinks();
    }

    // Normalize input sign
    let cleanSign = signName.trim();
    // Simple translation if needed (users usually send standard names via Line Bot menu)
    // But let's be safe
    for (const [key, val] of Object.entries(SIGN_MAP)) {
        if (cleanSign.includes(key) || cleanSign.toLowerCase() === key) {
            cleanSign = val;
            break;
        }
    }

    return LINK_CACHE[cleanSign];
}

async function fetchDailyLinks() {
    try {
        const res = await axios.get(HUB_URL, { headers: HEADERS });
        const $ = cheerio.load(res.data);

        const newCache = {};

        $('a').each((i, el) => {
            let href = $(el).attr('href');
            if (!href) return;
            if (!href.startsWith('http')) {
                href = 'https://www.cosmopolitan.com' + href;
            }

            // Regex for daily article: /today/a\d+/
            if (href.includes('/today/') && href.match(/\/a\d+\//)) {
                let signName = identifySign(href, $(el).text());
                if (signName) {
                    newCache[signName] = href;
                }
            }
        });

        if (Object.keys(newCache).length > 0) {
            LINK_CACHE = newCache;
            CACHE_TIMESTAMP = Date.now();
            console.log(`[CosmoCrawler] Cache updated with ${Object.keys(newCache).length} links.`);
        }
    } catch (e) {
        console.error(`[CosmoCrawler] Hub fetch error: ${e.message}`);
    }
}

function identifySign(url, text) {
    const combined = (url + ' ' + text).toLowerCase();

    if (combined.includes('aries')) return '牡羊座';
    if (combined.includes('taurus')) return '金牛座';
    if (combined.includes('gemini')) return '雙子座';
    if (combined.includes('cancer')) return '巨蟹座';
    if (combined.includes('leo')) return '獅子座';
    if (combined.includes('virgo')) return '處女座';
    if (combined.includes('libra')) return '天秤座';
    if (combined.includes('scorpio')) return '天蠍座';
    if (combined.includes('sagittarius')) return '射手座';
    if (combined.includes('capricorn')) return '摩羯座';
    if (combined.includes('aquarius')) return '水瓶座';
    if (combined.includes('pisces')) return '雙魚座';

    // Fallback manual map for chinese
    if (text.includes('牡羊')) return '牡羊座';
    if (text.includes('金牛')) return '金牛座';
    if (text.includes('雙子')) return '雙子座';
    if (text.includes('巨蟹')) return '巨蟹座';
    if (text.includes('獅子')) return '獅子座';
    if (text.includes('處女')) return '處女座';
    if (text.includes('天秤')) return '天秤座';
    if (text.includes('天蠍')) return '天蠍座';
    if (text.includes('射手')) return '射手座';
    if (text.includes('摩羯')) return '摩羯座';
    if (text.includes('水瓶')) return '水瓶座';
    if (text.includes('雙魚')) return '雙魚座';

    return null;
}

async function fetchSignData(signName) {
    const url = await getDailyLink(signName);

    if (!url) {
        console.warn(`[CosmoCrawler] No link found for ${signName}`);
        return null;
    }

    try {
        const res = await axios.get(url, { headers: HEADERS });
        const $ = cheerio.load(res.data);
        const bodyText = $('.article-body-content').text().replace(/\s+/g, ' ') || $('body').text().replace(/\s+/g, ' ');

        const luckyNumMatch = bodyText.match(/幸運數字[:：]?\s*(\d+)/);
        const luckyTimeMatch = bodyText.match(/今日吉時[:：]?\s*([0-9a-zA-Z:\-]+)/);
        const luckySignMatch = bodyText.match(/幸運星座[:：]?\s*([\u4e00-\u9fa5]+)/);

        let content = '';
        $('.article-body-content p').each((i, el) => {
            const t = $(el).text().trim();
            // Heuristic to find the main text paragraph
            if (t.length > 20 && !t.includes('延伸閱讀') && !t.includes('幸運') && !content) {
                content = t;
            }
        });

        if (!content) content = bodyText.substring(0, 150) + '...';

        return {
            name: signName,
            luckyNumber: luckyNumMatch ? luckyNumMatch[1] : 'N/A',
            luckyTime: luckyTimeMatch ? luckyTimeMatch[1] : 'N/A',
            luckySign: luckySignMatch ? luckySignMatch[1] : 'N/A',
            content: content
        };

    } catch (e) {
        console.error(`[CosmoCrawler] Detail fetch error for ${signName}: ${e.message}`);
        return null;
    }
}

module.exports = { fetchSignData };
