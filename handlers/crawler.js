/**
 * 爬蟲功能模組
 */
const axios = require('axios');
const cheerio = require('cheerio');
const OpenCC = require('opencc-js');
const { CRAWLER_URLS, CACHE_DURATION } = require('../config/constants');

// 簡體轉繁體轉換器
const s2tw = OpenCC.Converter({ from: 'cn', to: 'twp' });

// === 油價查詢 (Flex Message 版) ===
async function crawlOilPrice() {
    try {
        const res = await axios.get(CRAWLER_URLS.OIL_PRICE);
        const $ = cheerio.load(res.data);

        // 所有價格都在 #cpc li 裡面，前4個是中油，後4個是台塑
        const allPrices = [];
        $('#cpc li').each((i, el) => {
            const text = $(el).text().trim();
            // 格式: "92: 26.4" 或 "95油價: 27.9" 或 "柴油: 24.8"
            const match = text.match(/^(\d{2}|柴油)[油價]*[:：]?\s*([\d.]+)/);
            if (match) {
                allPrices.push({
                    type: match[1],
                    price: parseFloat(match[2])
                });
            }
        });

        // 分割: 前4個 = 中油, 後4個 = 台塑
        const cpcPrices = {};
        const fpcPrices = {};

        allPrices.slice(0, 4).forEach(p => {
            cpcPrices[p.type] = p.price;
        });
        allPrices.slice(4, 8).forEach(p => {
            fpcPrices[p.type] = p.price;
        });

        // 解析調價預測
        const predictionText = $('#gas-price').text();
        const predMatch = predictionText.match(/([漲跌])\s*([\d.]+)/);
        const prediction = predMatch ? {
            direction: predMatch[1],
            amount: parseFloat(predMatch[2])
        } : null;

        return {
            cpc: cpcPrices,
            fpc: fpcPrices,
            prediction,
            timestamp: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
        };
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
    const predColor = data.prediction?.direction === '漲' ? '#FF334B' :
        data.prediction?.direction === '跌' ? '#00B900' : '#888888';

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
                // 表頭
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
                // 價格列
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
            contents: [
                { type: "text", text: `更新: ${data.timestamp}`, size: "xxs", color: "#AAAAAA", align: "center" }
            ],
            paddingAll: "10px"
        }
    };
}


// === 近期電影 ===
async function crawlNewMovies() {
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

        if (movies.length === 0) {
            return '❌ 目前無法取得電影資訊';
        }

        return `🎥 近期上映電影\n\n${movies.join('\n\n')}`;
    } catch (error) {
        console.error('電影爬蟲錯誤:', error);
        return '❌ 無法取得電影資訊，請稍後再試';
    }
}

// === 蘋果新聞 ===
async function crawlAppleNews() {
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

        if (news.length === 0) {
            return '❌ 目前無法取得蘋果新聞';
        }

        return `🍎 蘋果即時新聞\n\n${news.join('\n\n')}`;
    } catch (error) {
        console.error('蘋果新聞爬蟲錯誤:', error);
        return '❌ 無法取得蘋果新聞，請稍後再試';
    }
}

// === 科技新聞 ===
async function crawlTechNews() {
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

        if (news.length === 0) {
            return '❌ 目前無法取得科技新聞';
        }

        return `📱 科技新報最新文章\n\n${news.join('\n\n')}`;
    } catch (error) {
        console.error('科技新聞爬蟲錯誤:', error);
        return '❌ 無法取得科技新聞，請稍後再試';
    }
}

// === PTT 熱門廢文 ===
async function crawlPttHot() {
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

        if (posts.length === 0) {
            return '❌ 目前無法取得熱門廢文';
        }

        return `📋 PTT 熱門廢文\n\n${posts.join('\n\n')}`;
    } catch (error) {
        console.error('PTT 熱門爬蟲錯誤:', error);
        return '❌ 無法取得熱門廢文，請稍後再試';
    }
}

// === 番號推薦 ===
let javCache = null;
let javCacheTime = 0;
const JAV_CACHE_DURATION = CACHE_DURATION.JAV;

async function getRandomJav() {
    try {
        const now = Date.now();

        if (javCache && (now - javCacheTime < JAV_CACHE_DURATION)) {
            const items = javCache['全部分类'] || [];
            if (items.length > 0) {
                const random = items[Math.floor(Math.random() * items.length)];
                return {
                    番号: random['番号'] || '-',
                    名称: s2tw(random['名称'] || '-'),
                    演员: s2tw(random['演员'] || '-'),
                    收藏人数: random['收藏人数'] || 0
                };
            }
        }

        const res = await axios.get(CRAWLER_URLS.JAV_RECOMMEND, { timeout: 10000 });
        javCache = res.data;
        javCacheTime = now;

        const items = javCache['全部分类'] || [];
        if (items.length === 0) {
            return null;
        }

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
