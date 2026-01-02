/**
 * Worker Endpoint Handler
 * 處理 Cloud Tasks 發送的背景任務
 */
const lineUtils = require('../utils/line');

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
    try {
        const { handlerName, params } = req.body;

        console.log(`[Worker] Processing task: ${handlerName}`, params);

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
        console.error('[Worker] Task failed:', error);

        // 嘗試通知使用者錯誤（若有 userId）
        if (req.body.params && req.body.params.userId) {
            try {
                await lineUtils.pushMessage(req.body.params.userId, [{
                    type: 'text',
                    text: '❌ 處理失敗，請稍後再試'
                }]);
            } catch (e) {
                console.error('[Worker] Failed to send error message:', e);
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
    const { userId, signName, type } = params;

    try {
        // 執行爬蟲邏輯 (使用 getHoroscope 會自動處理快取)
        const data = await horoscopeHandler.getHoroscope(signName, type);

        if (!data) {
            await lineUtils.pushMessage(userId, [{
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
        await lineUtils.pushFlex(userId, `🔮 ${data.name} ${periodName}運勢`, flex);
    } catch (error) {
        console.error('[Worker] Horoscope error:', error);
        await lineUtils.pushMessage(userId, [{
            type: 'text',
            text: '❌ 讀取運勢失敗，請稍後再試'
        }]);
    }
}

/**
 * 爬蟲 Worker（新聞、油價、電影等）
 */
async function crawlerWorker(params) {
    const { userId, type } = params;

    let result;
    switch (type) {
        case 'oil':
            result = await crawlerHandler.fetchOilPrice();
            break;
        case 'movie':
            result = await crawlerHandler.fetchNewMovie();
            break;
        case 'apple':
            result = await crawlerHandler.fetchAppleNews();
            break;
        case 'tech':
            result = await crawlerHandler.fetchTechNews();
            break;
        case 'ptt':
            result = await crawlerHandler.fetchPTTHot();
            break;
        default:
            throw new Error(`Unknown crawler type: ${type}`);
    }

    if (!result || !result.success) {
        await lineUtils.pushMessage(userId, [{
            type: 'text',
            text: result?.message || '❌ 資料獲取失敗'
        }]);
        return;
    }

    // 發送結果（可能是文字或 Flex）
    if (result.flex) {
        await lineUtils.pushFlex(userId, result.altText, result.flex);
    } else {
        await lineUtils.pushMessage(userId, [{
            type: 'text',
            text: result.message
        }]);
    }
}

/**
 * 圖片 Worker
 */
async function funWorker(params) {
    const { userId, groupId, type } = params;

    // 取得圖片 URL
    const imageUrl = await funHandler.getRandomImage(type);

    if (!imageUrl) {
        await lineUtils.pushMessage(userId, [{
            type: 'text',
            text: '❌ 圖片獲取失敗'
        }]);
        return;
    }

    // 發送圖片
    await lineUtils.pushMessage(userId, [{
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl
    }]);

    // 記錄排行榜（若在群組中）
    if (groupId) {
        const leaderboardHandler = require('./leaderboard');
        leaderboardHandler.recordImageUsage(groupId, userId, type).catch(() => { });
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
