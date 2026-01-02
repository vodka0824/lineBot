/**
 * Worker Endpoint Handler
 * 處理 Cloud Tasks 發送的背景任務
 */
const lineUtils = require('../utils/line');
const logger = require('../utils/logger');

// Handler imports (會在各 worker 函式中使用)
const horoscopeHandler = require('./horoscope');
const crawlerHandler = require('./crawler');
const funHandler = require('./fun');
const aiHandler = require('./ai');
const restaurantHandler = require('./restaurant');
const currencyHandler = require('./currency');
const weatherHandler = require('./weather');

/**
 * 主要 Worker 處理器
 */
async function handleWorkerTask(req, res) {
    logger.info('[Worker] Task received', {
        handlerName: req.body?.handlerName,
        paramsKeys: req.body?.params ? Object.keys(req.body.params) : []
    });

    try {
        const { handlerName, params } = req.body;

        logger.debug(`[Worker] Processing task`, { handlerName, params: logger.sanitize(params) });

        // 根據 handlerName 分發任務
        switch (handlerName) {
            case 'horoscope':
                await horoscopeWorker(params);
                break;
            case 'crawler':
                await crawlerWorker(params);
                break;
            case 'fun':
                await funWorker(params);
                break;
            case 'ai':
                await aiWorker(params);
                break;
            case 'restaurant':
                await restaurantWorker(params);
                break;
            case 'currency':
                await currencyWorker(params);
                break;
            case 'weather':
                await weatherWorker(params);
                break;
            default:
                throw new Error(`Unknown handler: ${handlerName}`);
        }

        res.status(200).send('OK');
    } catch (error) {
        logger.error('[Worker] Task failed', error);

        // 嘗試通知使用者錯誤（若有 userId）
        if (req.body.params && req.body.params.userId) {
            try {
                const targetId = req.body.params.groupId || req.body.params.userId;
                await lineUtils.pushMessage(targetId, [{
                    type: 'text',
                    text: '❌ 處理失敗，請稍後再試'
                }]);
            } catch (e) {
                logger.error('[Worker] Failed to send error message', e);
            }
        }

        res.status(500).send('Error');
    }
}

// ===== Worker 函式 =====

/**
 * 運勢 Worker
 */
async function horoscopeWorker(params) {
    const { userId, groupId, signName, type } = params;
    const targetId = groupId || userId;

    try {
        // 執行爬蟲邏輯 (使用 getHoroscope 會自動處理快取)
        const data = await horoscopeHandler.getHoroscope(signName, type);

        if (!data) {
            await lineUtils.pushMessage(targetId, [{
                type: 'text',
                text: '❌ 找不到此星座，請輸入正確的星座名稱'
            }]);
            return;
        }

        // 建構 Flex Message
        const flex = horoscopeHandler.buildHoroscopeFlex(data, type);

        // 定義 period 名稱
        let periodName = '今日';
        if (type === 'weekly') periodName = '本週';
        if (type === 'monthly') periodName = '本月';

        // Push 結果
        await lineUtils.pushFlex(targetId, `🔮 ${data.name} ${periodName}運勢`, flex);
    } catch (error) {
        console.error('[Worker] Horoscope error:', error);
        await lineUtils.pushMessage(targetId, [{
            type: 'text',
            text: '❌ 讀取運勢失敗，請稍後再試'
        }]);
    }
}

/**
 * 爬蟲 Worker（新聞、油價、電影等）
 */
async function crawlerWorker(params) {
    const { userId, groupId, type } = params;
    const targetId = groupId || userId;

    try {
        let result;
        let altText;
        let flex;

        switch (type) {
            case 'oil':
                const oilData = await crawlerHandler.crawlOilPrice();
                if (!oilData) throw new Error('油價資料獲取失敗');
                flex = crawlerHandler.buildOilPriceFlex(oilData);
                altText = '台灣中油油價';
                break;

            case 'movie':
                const movieItems = await crawlerHandler.crawlNewMovies();
                if (!movieItems || movieItems.length === 0) throw new Error('電影資料獲取失敗');
                flex = crawlerHandler.buildContentCarousel('近期電影', movieItems);
                altText = '近期上映電影';
                break;

            case 'apple':
                const appleItems = await crawlerHandler.crawlAppleNews();
                if (!appleItems || appleItems.length === 0) throw new Error('新聞獲取失敗');
                flex = crawlerHandler.buildContentCarousel('蘋果新聞', appleItems);
                altText = '蘋果即時新聞';
                break;

            case 'tech':
                const techItems = await crawlerHandler.crawlTechNews();
                if (!techItems || techItems.length === 0) throw new Error('新聞獲取失敗');
                flex = crawlerHandler.buildContentCarousel('科技新聞', techItems);
                altText = '科技新報';
                break;

            case 'ptt':
                const pttItems = await crawlerHandler.crawlPttHot();
                if (!pttItems || pttItems.length === 0) throw new Error('PTT資料獲取失敗');
                flex = crawlerHandler.buildContentCarousel('PTT熱門', pttItems);
                altText = 'PTT熱門';
                break;

            default:
                throw new Error(`Unknown crawler type: ${type}`);
        }

        // Push Flex Message
        await lineUtils.pushFlex(targetId, altText, flex);

    } catch (error) {
        console.error('[Worker] Crawler error:', error);
        await lineUtils.pushMessage(targetId, [{
            type: 'text',
            text: '❌ 資料獲取失敗，請稍後再試'
        }]);
    }
}

/**
 * 圖片 Worker
 */
async function funWorker(params) {
    const { userId, groupId, type } = params;
    const targetId = groupId || userId;

    try {
        // 取得圖片 URL (使用 pool 機制)
        let imageUrl = null;

        // Try to get from pool first
        if (funHandler.imagePool && funHandler.imagePool[type] && funHandler.imagePool[type].length > 0) {
            imageUrl = funHandler.imagePool[type].shift();
            console.log(`[Worker] Served ${type} from pool`);
        }

        // If pool empty, fetch live
        if (!imageUrl) {
            imageUrl = await funHandler.getRandomImage(type);
        }

        // Trigger pool refill (fire and forget)
        if (funHandler.fillPool) {
            funHandler.fillPool(type).catch(() => { });
        }

        if (!imageUrl) {
            await lineUtils.pushMessage(targetId, [{
                type: 'text',
                text: '❌ 圖片獲取失敗，請再試一次'
            }]);
            return;
        }

        // 發送圖片
        await lineUtils.pushMessage(targetId, [{
            type: 'image',
            originalContentUrl: imageUrl,
            previewImageUrl: imageUrl
        }]);

        // 記錄排行榜（若在群組中）
        if (groupId) {
            const leaderboardHandler = require('./leaderboard');
            leaderboardHandler.recordImageUsage(groupId, userId, type).catch(() => { });
        }
    } catch (error) {
        console.error('[Worker] Fun error:', error);
        await lineUtils.pushMessage(targetId, [{
            type: 'text',
            text: '❌ 圖片讀取失敗，請稍後再試'
        }]);
    }
}

/**
 * AI Worker
 */
async function aiWorker(params) {
    const { userId, query } = params;

    const response = await aiHandler.queryGemini(query);

    if (!response) {
        await lineUtils.pushMessage(userId, [{
            type: 'text',
            text: '❌ AI 查詢失敗'
        }]);
        return;
    }

    await lineUtils.pushMessage(userId, [{
        type: 'text',
        text: response
    }]);
}

/**
 * 餐廳 Worker
 */
async function restaurantWorker(params) {
    const { userId, location } = params;

    const results = await restaurantHandler.searchRestaurants(location);

    if (!results || results.length === 0) {
        await lineUtils.pushMessage(userId, [{
            type: 'text',
            text: '❌ 找不到餐廳資料'
        }]);
        return;
    }

    const flex = restaurantHandler.buildRestaurantFlex(results);
    await lineUtils.pushFlex(userId, '餐廳搜尋結果', flex);
}

/**
 * 匯率 Worker
 */
async function currencyWorker(params) {
    const { userId, fromCurrency, amount } = params;

    const rates = await currencyHandler.fetchExchangeRates();

    if (!rates) {
        await lineUtils.pushMessage(userId, [{
            type: 'text',
            text: '❌ 匯率查詢失敗'
        }]);
        return;
    }

    const flex = currencyHandler.buildCurrencyFlex(fromCurrency, amount, rates);
    await lineUtils.pushFlex(userId, '匯率查詢', flex);
}

/**
 * 天氣 Worker
 */
async function weatherWorker(params) {
    const { userId, location } = params;

    const data = await weatherHandler.fetchWeather(location);

    if (!data) {
        await lineUtils.pushMessage(userId, [{
            type: 'text',
            text: '❌ 天氣資料獲取失敗'
        }]);
        return;
    }

    const flex = weatherHandler.buildWeatherFlex(data);
    await lineUtils.pushFlex(userId, `${location} 天氣`, flex);
}

module.exports = {
    handleWorkerTask
};
