/**
 * 爬蟲功能模組
 */
const axios = require('axios');
const cheerio = require('cheerio');
const OpenCC = require('opencc-js');
const CacheHelper = require('../utils/cacheHelper');

// === 快取設定 ===
// Oil: 4 hours (很少變動)
// Movie: 1 hour
// News/PTT: 10 mins
// JAV: 15 mins
const crawlerCache = new CacheHelper(10 * 60 * 1000);

// === 油價查詢 (Flex Message 版) ===
async function crawlOilPrice() {
    const cacheKey = 'crawler_oil';
    const cached = crawlerCache.get(cacheKey);
    if (cached) return cached;

    try {
        const res = await axios.get(CRAWLER_URLS.OIL_PRICE);
        const $ = cheerio.load(res.data);

        // 所有價格都在 #cpc li 裡面，前4個是中油，後4個是台塑
        const allPrices = [];
        $('#cpc li').each((i, el) => {
            const text = $(el).text().trim();
            const match = text.match(/^(\d{2}|柴油)[油價]*[:：]?\s*([\d.]+)/);
            if (match) {
                allPrices.push({
                    type: match[1],
                    price: parseFloat(match[2])
                });
            }
        });

        const cpcPrices = {};
        const fpcPrices = {};

        allPrices.slice(0, 4).forEach(p => {
            cpcPrices[p.type] = p.price;
        });
        allPrices.slice(4, 8).forEach(p => {
            fpcPrices[p.type] = p.price;
        });

        // 解析調價預測
        const predictionText = $('#gas-price').text().trim();
        const predMatch = predictionText.match(/([漲跌])\s*([\d.]+)/);
        const prediction = predMatch ? {
            direction: predMatch[1],
            amount: parseFloat(predMatch[2])
        } : null;

        const forecastRaw = $('#gas-price').text().replace(/\s+/g, ' ').trim();

        const result = {
            cpc: cpcPrices,
            fpc: fpcPrices,
            prediction,
            forecast: forecastRaw,
            timestamp: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
        };

        crawlerCache.set(cacheKey, result, 4 * 60 * 60 * 1000); // 4 Hours
        return result;
    } catch (error) {
        console.error('油價爬蟲錯誤:', error);
        return null;
    }
}

// 油價 Flex Message 建構
function buildOilPriceFlex(data) {
    if (!data) {
        return { type: 'text', text: '❌ 無法取得油價資訊，請稍後再試' };
    }

    const priceRow = (label, cpcPrice, fpcPrice) => ({
        type: "box",
        layout: "horizontal",
        contents: [
            { type: "text", text: label, size: "sm", color: "#555555", flex: 2 },
            { type: "text", text: cpcPrice ? `$${cpcPrice}` : '-', size: "sm", align: "end", flex: 2, weight: "bold" },
            { type: "text", text: fpcPrice ? `$${fpcPrice}` : '-', size: "sm", align: "end", flex: 2, color: "#888888" }
        ],
        margin: "md"
    });

    const predText = data.prediction
        ? `${data.prediction.direction}${data.prediction.amount ? ` $${data.prediction.amount}` : ''}`
        : '維持不變';

    return {
        type: "bubble",
        size: "kilo",
        header: {
            type: "box",
            layout: "horizontal",
            contents: [
                { type: "text", text: "⛽ 今日油價", weight: "bold", size: "lg", color: "#FFFFFF", flex: 4 },
                { type: "text", text: predText, size: "sm", color: "#FFFFFF", align: "end", flex: 2 }
            ],
            backgroundColor: "#27AE60",
            paddingAll: "15px"
        },
        body: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                        { type: "text", text: "油品", size: "xs", color: "#AAAAAA", flex: 2 },
                        { type: "text", text: "中油", size: "xs", color: "#AAAAAA", align: "end", flex: 2 },
                        { type: "text", text: "台塑", size: "xs", color: "#AAAAAA", align: "end", flex: 2 }
                    ]
                },
                { type: "separator", margin: "sm" },
                priceRow("92 無鉛", data.cpc['92'], data.fpc['92']),
                priceRow("95 無鉛", data.cpc['95'], data.fpc['95']),
                priceRow("98 無鉛", data.cpc['98'], data.fpc['98']),
                priceRow("超級柴油", data.cpc['柴油'], data.fpc['柴油'])
            ],
            paddingAll: "15px"
        },
        footer: {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            contents: [
                { type: "text", text: data.forecast || '暫無預測資訊', size: "xs", color: "#666666", wrap: true },
                { type: "text", text: `更新: ${data.timestamp}`, size: "xxs", color: "#AAAAAA", align: "end", margin: "sm" }
            ],
            paddingAll: "12px",
            backgroundColor: "#F5F5F5"
        }
    };
}


// === 近期電影 ===
async function crawlNewMovies() {
    const cacheKey = 'crawler_movies';
    const cached = crawlerCache.get(cacheKey);
    if (cached) return cached;

    try {
        const res = await axios.get(CRAWLER_URLS.NEW_MOVIE);
        const $ = cheerio.load(res.data);

        const movies = [];
        $('article div a').slice(0, 5).each((i, elem) => {
            const title = $(elem).text().trim();
            const link = 'https://www.atmovies.com.tw' + $(elem).attr('href');
            if (title) {
                movies.push(`🎬 ${title}\n${link}`);
            }
        });

        if (movies.length === 0) return '❌ 目前無法取得電影資訊';

        const result = `🎥 近期上映電影\n\n${movies.join('\n\n')}`;
        crawlerCache.set(cacheKey, result, 60 * 60 * 1000); // 1 Hour
        return result;
    } catch (error) {
        console.error('電影爬蟲錯誤:', error);
        return '❌ 無法取得電影資訊，請稍後再試';
    }
}

// === 蘋果新聞 ===
async function crawlAppleNews() {
    const cacheKey = 'crawler_apple';
    const cached = crawlerCache.get(cacheKey);
    if (cached) return cached;

    try {
        const res = await axios.get(CRAWLER_URLS.APPLE_NEWS);
        const $ = cheerio.load(res.data);

        const news = [];
        $('#main-content > div.post-hot.stories-container > article > div > div:nth-child(1) > h3 > a').slice(0, 5).each((i, elem) => {
            const title = $(elem).text().trim();
            let link = $(elem).attr('href');
            if (link && !link.startsWith('http')) {
                link = 'https://tw.nextapple.com' + link;
            }
            if (title && link) {
                news.push(`📰 ${title}\n${link}`);
            }
        });

        if (news.length === 0) return '❌ 目前無法取得蘋果新聞';

        const result = `🍎 蘋果即時新聞\n\n${news.join('\n\n')}`;
        crawlerCache.set(cacheKey, result, 10 * 60 * 1000); // 10 Mins
        return result;
    } catch (error) {
        console.error('蘋果新聞爬蟲錯誤:', error);
        return '❌ 無法取得蘋果新聞，請稍後再試';
    }
}

// === 科技新聞 ===
async function crawlTechNews() {
    const cacheKey = 'crawler_tech';
    const cached = crawlerCache.get(cacheKey);
    if (cached) return cached;

    try {
        const res = await axios.get(CRAWLER_URLS.TECH_NEWS);
        const $ = cheerio.load(res.data);

        const news = [];
        const articlePattern = /\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/?$/;

        $('a').each((i, elem) => {
            if (news.length >= 5) return false;

            const href = $(elem).attr('href') || '';
            const title = $(elem).text().trim();

            if (articlePattern.test(href) && title && title.length > 10) {
                let link = href;
                if (!link.startsWith('http')) {
                    link = 'https://technews.tw' + link;
                }
                if (!news.some(n => n.includes(link))) {
                    news.push(`💻 ${title}\n${link}`);
                }
            }
        });

        if (news.length === 0) return '❌ 目前無法取得科技新聞';

        const result = `📱 科技新報最新文章\n\n${news.join('\n\n')}`;
        crawlerCache.set(cacheKey, result, 10 * 60 * 1000); // 10 Mins
        return result;
    } catch (error) {
        console.error('科技新聞爬蟲錯誤:', error);
        return '❌ 無法取得科技新聞，請稍後再試';
    }
}

// === PTT 熱門廢文 ===
async function crawlPttHot() {
    const cacheKey = 'crawler_ptt';
    const cached = crawlerCache.get(cacheKey);
    if (cached) return cached;

    try {
        const res = await axios.get(CRAWLER_URLS.PTT_HOT);
        const $ = cheerio.load(res.data);

        const posts = [];
        $('a').each((i, elem) => {
            if (posts.length >= 5) return false;

            const href = $(elem).attr('href') || '';
            const title = $(elem).text().trim();

            if (href.includes('/b/PttHot/') && title && title.length > 5) {
                let link = href;
                if (link.startsWith('/')) {
                    link = 'https://disp.cc' + link;
                }
                if (!posts.some(p => p.includes(title))) {
                    posts.push(`🔥 ${title}\n${link}`);
                }
            }
        });

        if (posts.length === 0) return '❌ 目前無法取得熱門廢文';

        const result = `📋 PTT 熱門廢文\n\n${posts.join('\n\n')}`;
        crawlerCache.set(cacheKey, result, 10 * 60 * 1000); // 10 Mins
        return result;
    } catch (error) {
        console.error('PTT 熱門爬蟲錯誤:', error);
        return '❌ 無法取得熱門廢文，請稍後再試';
    }
}

// === 番號推薦 ===
async function getRandomJav() {
    const cacheKey = 'crawler_jav_all';

    // Check Cache first
    let allData = crawlerCache.get(cacheKey);

    try {
        if (!allData) {
            const res = await axios.get(CRAWLER_URLS.JAV_RECOMMEND, { timeout: 10000 });
            allData = res.data;
            crawlerCache.set(cacheKey, allData, 15 * 60 * 1000); // 15 Mins
        }

        const items = allData['全部分类'] || [];
        if (items.length === 0) return null;

        const random = items[Math.floor(Math.random() * items.length)];
        return {
            番号: random['番号'] || '-',
            名称: s2tw(random['名称'] || '-'),
            演员: s2tw(random['演员'] || '-'),
            收藏人数: random['收藏人数'] || 0
        };
    } catch (error) {
        console.error('番號推薦錯誤:', error);
        return null;
    }
}

module.exports = {
    crawlOilPrice,
    buildOilPriceFlex,
    crawlNewMovies,
    crawlAppleNews,
    crawlTechNews,
    crawlPttHot,
    getRandomJav
};
