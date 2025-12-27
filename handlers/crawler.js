/**
 * 爬蟲功能模組
 */
const axios = require('axios');
const cheerio = require('cheerio');
const OpenCC = require('opencc-js');
const { CRAWLER_URLS } = require('../config/constants');

// 簡體轉繁體轉換器
const s2tw = OpenCC.Converter({ from: 'cn', to: 'twp' });

// === 油價查詢 ===
async function crawlOilPrice() {
    try {
        const res = await axios.get(CRAWLER_URLS.OIL_PRICE);
        const $ = cheerio.load(res.data);

        const title = $('#main').text().replace(/\n/g, '').split('(')[0].trim();
        const gasPrice = $('#gas-price').text().replace(/\n\n\n/g, '').replace(/ /g, '').trim();
        const cpc = $('#cpc').text().replace(/ /g, '').trim();

        return `⛽ ${title}\n\n${gasPrice}\n${cpc}`;
    } catch (error) {
        console.error('油價爬蟲錯誤:', error);
        return '❌ 無法取得油價資訊，請稍後再試';
    }
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
const JAV_CACHE_DURATION = 60 * 60 * 1000;

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
    crawlNewMovies,
    crawlAppleNews,
    crawlTechNews,
    crawlPttHot,
    getRandomJav
};
