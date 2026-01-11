const puppeteer = require('puppeteer');

const HUB_URL = 'https://www.cosmopolitan.com/tw/horoscopes/today/';
let BROWSER_INSTANCE = null;

// Cache Hub Links
let LINK_CACHE = {};
let CACHE_TIMESTAMP = 0;
const CACHE_DURATION = 3600 * 1000; // 1 hour

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

async function getBrowser() {
    if (!BROWSER_INSTANCE || !BROWSER_INSTANCE.isConnected()) {
        console.log('[Puppeteer] Launching new browser...');
        BROWSER_INSTANCE = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Prevent shared memory issues
                '--disable-gpu' // Cloud Run has no GPU
            ]
        });
    }
    return BROWSER_INSTANCE;
}

async function closeBrowser() {
    if (BROWSER_INSTANCE) {
        await BROWSER_INSTANCE.close();
        BROWSER_INSTANCE = null;
    }
}

async function getDailyLink(signName) {
    const now = Date.now();
    // Refresh cache if empty or expired
    if (Object.keys(LINK_CACHE).length === 0 || (now - CACHE_TIMESTAMP) > CACHE_DURATION) {
        await fetchDailyLinks();
    }

    let cleanSign = signName.trim();
    for (const [key, val] of Object.entries(SIGN_MAP)) {
        if (cleanSign.includes(key) || cleanSign.toLowerCase() === key) {
            cleanSign = val;
            break;
        }
    }
    return LINK_CACHE[cleanSign];
}

async function fetchDailyLinks() {
    console.log('[Puppeteer] Fetching Hub Links...');
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        // Block images/fonts to save bandwidth
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(HUB_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Cosmo Hub looks pretty static, but let's be safe
        const links = await page.evaluate(() => {
            const map = {};
            // Helper to identify sign from URL or Text
            const identifySign = (url, text) => {
                const combined = (url + ' ' + text).toLowerCase();
                const S = [
                    'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
                    '牡羊', '金牛', '雙子', '巨蟹', '獅子', '處女', '天秤', '天蠍', '射手', '摩羯', '水瓶', '雙魚'
                ];
                const M = [
                    '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座', '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'
                ];
                for (let i = 0; i < S.length; i++) {
                    if (combined.includes(S[i])) return M[i % 12];
                }
                return null;
            };

            document.querySelectorAll('a').forEach(a => {
                let href = a.getAttribute('href');
                if (!href) return;
                if (!href.startsWith('http')) href = 'https://www.cosmopolitan.com' + href;

                // Specific pattern for daily article
                if (href.includes('/today/') && href.match(/\/a\d+\//)) {
                    const sign = identifySign(href, a.innerText);
                    if (sign) map[sign] = href;
                }
            });
            return map;
        });

        if (Object.keys(links).length > 0) {
            LINK_CACHE = links;
            CACHE_TIMESTAMP = Date.now();
            console.log(`[Puppeteer] Cache updated: ${Object.keys(links).length} links`);
        }
    } catch (e) {
        console.error(`[Puppeteer] Hub Error: ${e.message}`);
    } finally {
        await page.close();
    }
}

async function fetchSignData(signName) {
    const url = await getDailyLink(signName);
    if (!url) {
        console.warn(`[Puppeteer] No link for ${signName}`);
        return null;
    }

    console.log(`[Puppeteer] Fetching detail for ${signName}: ${url}`);
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

        // Wait for the dynamic content
        try {
            await page.waitForSelector('ul li', { timeout: 5000 });
        } catch (e) { /* ignore timeout, maybe content already there */ }

        const result = await page.evaluate(() => {
            const data = {
                content: '',
                luckyNumber: 'N/A',
                luckyColor: 'N/A', // New!
                luckyTime: 'N/A',
                luckySign: 'N/A',
                luckyDirection: 'N/A', // Possibly available now?
                stars: {} // New!
            };

            // 1. Text Content
            // Try to find the main paragraph
            // Strategy: Find "今日短評" and get the text inside or nearby
            const lis = Array.from(document.querySelectorAll('li'));

            lis.forEach(li => {
                const text = li.innerText;
                if (text.includes('今日短評')) data.content = text.split('：')[1]?.trim() || text;
                if (text.includes('幸運數字')) data.luckyNumber = text.split('：')[1]?.trim();
                if (text.includes('幸運顏色')) data.luckyColor = text.split('：')[1]?.trim();
                if (text.includes('今日吉時')) data.luckyTime = text.split('：')[1]?.trim();
                if (text.includes('幸運星座')) data.luckySign = text.split('：')[1]?.trim();
                if (text.includes('開運方位')) data.luckyDirection = text.split('：')[1]?.trim();
            });

            // Fallback for content if not in Short Comment
            if (!data.content) {
                const body = document.querySelector('.article-body-content');
                if (body) data.content = body.innerText.substring(0, 100) + '...';
            }

            // 2. Stars
            // Structure: h2(Title) -> div -> img[alt="Star Fill"]
            document.querySelectorAll('h2').forEach(h2 => {
                const title = h2.innerText.trim();
                if (title.includes('運勢')) {
                    const nextDiv = h2.nextElementSibling;
                    if (nextDiv) {
                        const stars = nextDiv.querySelectorAll('img[alt="Star Fill"]').length;
                        // Map title to key
                        let key = 'other';
                        if (title.includes('整體')) key = 'overall';
                        if (title.includes('愛情')) key = 'love';
                        if (title.includes('事業')) key = 'career';
                        if (title.includes('財運')) key = 'wealth';

                        data.stars[key] = stars;
                    }
                }
            });

            return data;
        });

        return {
            name: signName,
            ...result,
            url: url
        };

    } catch (e) {
        console.error(`[Puppeteer] Detail Error for ${signName}: ${e.message}`);
        return null;
    } finally {
        await page.close();
    }
}

module.exports = { fetchSignData, closeBrowser };
