/**
 * 路由註冊模組
 */
const { KEYWORD_MAP } = require('../config/constants');

function registerRoutes(router, handlers) {
    const {
        financeHandler,
        currencyHandler,
        systemHandler,
        weatherHandler,
        todoHandler,
        restaurantHandler,
        lotteryHandler,
        taigiHandler,
        leaderboardHandler,
        driveHandler,
        crawlerHandler, // Object with specific functions
        aiHandler,      // Object with { getGeminiReply }
        gameHandler,    // Object with { handleRPS }
        lineUtils,
        settingsHandler,
        funHandler,
        tcatHandler,
        horoscopeHandler,
        welcomeHandler
        // stockHandler (Temporarily disabled due to missing file)
    } = handlers;

    // === 3. 歡迎設定 (Welcome) ===
    router.register(/^設定歡迎詞\s+(.+)$/, async (ctx, match) => {
        const { groupId, userId } = ctx;
        const text = match[1].trim();
        if (!text) {
            await lineUtils.replyText(ctx.replyToken, '❌ 請輸入歡迎詞內容\n範例：設定歡迎詞 歡迎 {user} 加入我們！');
            return;
        }
        const result = await welcomeHandler.setWelcomeText(groupId, text, userId);
        await lineUtils.replyText(ctx.replyToken, result.message);
    }, { isGroupOnly: true, needAdmin: true });

    router.register(/^設定歡迎圖\s+(.+)$/, async (ctx, match) => {
        const { groupId, userId } = ctx;
        const url = match[1].trim();
        if (!url) {
            await lineUtils.replyText(ctx.replyToken, '❌ 請輸入圖片網址或「隨機」\n範例：設定歡迎圖 https://example.com/img.jpg');
            return;
        }
        const result = await welcomeHandler.setWelcomeImage(groupId, url, userId);
        await lineUtils.replyText(ctx.replyToken, result.message);
    }, { isGroupOnly: true, needAdmin: true });

    router.register('測試歡迎', async (ctx) => {
        await welcomeHandler.sendTestWelcome(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAdmin: true });

    // === 4. 系統管理 (System) ===

    // 分唄
    // 分唄
    router.register(/^分唄(\d+)$/, async (ctx, match) => {
        await financeHandler.handleInstallmentFenbei(ctx.replyToken, parseInt(match[1]));
    }, { allowDM: true, feature: 'finance' }); // 允許私訊使用

    // 銀角
    // 銀角
    router.register(/^銀角(\d+)$/, async (ctx, match) => {
        await financeHandler.handleInstallmentYinjiao(ctx.replyToken, parseInt(match[1]));
    }, { allowDM: true, feature: 'finance' }); // 允許私訊使用

    // 刷卡
    // 刷卡
    router.register(/^刷卡(\d+)$/, async (ctx, match) => {
        await financeHandler.handleInstallmentCredit(ctx.replyToken, parseInt(match[1]));
    }, { allowDM: true, feature: 'finance' }); // 允許私訊使用

    // 即時匯率
    router.register('即時匯率', async (ctx) => {
        await currencyHandler.handleRatesQuery(ctx.replyToken);
    }, { feature: 'currency', needAuth: true });

    // 匯率換算
    router.register(/^匯率\s*(\d+\.?\d*)\s*([A-Za-z]{3})$/, async (ctx, match) => {
        await currencyHandler.handleConversion(ctx.replyToken, parseFloat(match[1]), match[2].toUpperCase());
    }, { feature: 'currency' });

    // 快捷匯率 (美金 100)
    router.register((msg) => {
        return Object.keys(currencyHandler.QUICK_COMMANDS).some(key => msg.startsWith(key));
    }, async (ctx, match) => { // match is [message]
        const msg = match[0];
        const key = Object.keys(currencyHandler.QUICK_COMMANDS).find(k => msg.startsWith(k));
        const amount = parseFloat(msg.slice(key.length).trim());
        if (!isNaN(amount) && amount > 0) {
            await currencyHandler.handleConversion(ctx.replyToken, amount, currencyHandler.QUICK_COMMANDS[key]);
        }
    }, { feature: 'currency' });

    // 買外幣 (買美金 100)
    router.register(/^買([A-Za-z\u4e00-\u9fa5]+)\s*(\d+)$/, async (ctx, match) => {
        await currencyHandler.handleBuyForeign(ctx.replyToken, match[1], Number(match[2]));
    }, { feature: 'currency' });

    // 群組設定 (Dashboard)
    // 群組設定 (Dashboard)
    // 移除 isGroupOnly/needAuth 限制，改由 Handler 內部判斷並回傳錯誤訊息，避免「無反應」
    router.register(/^群組設定(\s.*)?$/, async (ctx) => {
        await settingsHandler.handleSettingsCommand(ctx);
    });

    router.registerPostback(
        (data) => data.includes('action=toggle_feature'),
        async (ctx) => {
            await settingsHandler.handleFeatureToggle(ctx, ctx.postbackData);
        }
    );

    // 待辦事項 Postback
    router.registerPostback(
        (data) => data.includes('action=complete_todo') || data.includes('action=delete_todo'),
        async (ctx) => {
            await todoHandler.handleTodoPostback(ctx, ctx.postbackData);
        }
    );

    // 物流查詢 (Delivery)
    router.register(/^黑貓\s*(\d+)$/, async (ctx, match) => {
        await tcatHandler.handleTcatQuery(ctx.replyToken, match[1]);
    }, { isGroupOnly: true, needAuth: true, feature: 'delivery' });

    // 油價 (Async with fallback)
    router.register('油價', async (ctx) => {
        const rateLimit = require('../utils/rateLimit');
        if (!rateLimit.checkLimit(ctx.userId, 'oil')) {
            await lineUtils.replyText(ctx.replyToken, '⏱️ 油價查詢過於頻繁，請稍後再試');
            return;
        }

        const { createTask } = require('../utils/tasks');
        const taskCreated = await createTask('crawler', { userId: ctx.userId, groupId: ctx.groupId, type: 'oil' });
        if (!taskCreated) {
            const oilData = await crawlerHandler.crawlOilPrice();
            const flex = crawlerHandler.buildOilPriceFlex(oilData);
            await lineUtils.replyFlex(ctx.replyToken, '本週油價', flex);
        }
    }, { isGroupOnly: true, needAuth: true, feature: 'oil' });

    // 星座運勢 (Simplified Command: "[Sign] [Period]")
    // Valid signs and aliases
    const SIGNS = [
        '牡羊', '金牛', '雙子', '巨蟹', '獅子', '處女', '天秤', '天蠍', '射手', '摩羯', '水瓶', '雙魚',
        '白羊', '天平', '人馬', '山羊',
        '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座', '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'
    ];
    const signRegex = new RegExp(`^(${SIGNS.join('|')})(\\s+(今日|本週|本周|本月))?$`);

    router.register(signRegex, async (ctx, match) => {
        const sign = match[1];
        const period = match[3] || '今日'; // Default to daily

        let type = 'daily';
        if (['本週', '本周'].includes(period)) type = 'weekly';
        if (period === '本月') type = 'monthly';

        await horoscopeHandler.handleHoroscope(ctx.replyToken, sign, type, ctx.userId, ctx.groupId);
    }, { isGroupOnly: true, needAuth: true, feature: 'horoscope' });

    router.register('電影', async (ctx) => {
        const rateLimit = require('../utils/rateLimit');
        if (!rateLimit.checkLimit(ctx.userId, 'movie')) {
            await lineUtils.replyText(ctx.replyToken, '⏱️ 電影查詢過於頻繁，請稍後再試');
            return;
        }

        const { createTask } = require('../utils/tasks');
        const taskCreated = await createTask('crawler', { userId: ctx.userId, groupId: ctx.groupId, type: 'movie' });
        if (!taskCreated) {
            const items = await crawlerHandler.crawlNewMovies();
            if (!items) await lineUtils.replyText(ctx.replyToken, '❌ 目前無法取得電影資訊');
            else await lineUtils.replyFlex(ctx.replyToken, '近期上映電影', crawlerHandler.buildContentCarousel('近期電影', items));
        }
    }, { isGroupOnly: true, needAuth: true, feature: 'movie' });

    router.register('蘋果新聞', async (ctx) => {
        const rateLimit = require('../utils/rateLimit');
        if (!rateLimit.checkLimit(ctx.userId, 'news')) {
            await lineUtils.replyText(ctx.replyToken, '⏱️ 新聞查詢過於頻繁，請稍後再試');
            return;
        }

        const { createTask } = require('../utils/tasks');
        const taskCreated = await createTask('crawler', { userId: ctx.userId, groupId: ctx.groupId, type: 'apple' });
        if (!taskCreated) {
            const items = await crawlerHandler.crawlAppleNews();
            if (!items) await lineUtils.replyText(ctx.replyToken, '❌ 目前無法取得新聞');
            else await lineUtils.replyFlex(ctx.replyToken, '蘋果即時新聞', crawlerHandler.buildContentCarousel('蘋果新聞', items));
        }
    }, { isGroupOnly: true, needAuth: true, feature: 'news' });

    router.register('科技新聞', async (ctx) => {
        const rateLimit = require('../utils/rateLimit');
        if (!rateLimit.checkLimit(ctx.userId, 'news')) {
            await lineUtils.replyText(ctx.replyToken, '⏱️ 新聞查詢過於頻繁，請稍後再試');
            return;
        }

        const { createTask } = require('../utils/tasks');
        const taskCreated = await createTask('crawler', { userId: ctx.userId, groupId: ctx.groupId, type: 'tech' });
        if (!taskCreated) {
            const items = await crawlerHandler.crawlTechNews();
            if (!items) await lineUtils.replyText(ctx.replyToken, '❌ 目前無法取得新聞');
            else await lineUtils.replyFlex(ctx.replyToken, '科技新報', crawlerHandler.buildContentCarousel('科技新聞', items));
        }
    }, { isGroupOnly: true, needAuth: true, feature: 'news' });

    router.register('PTT', async (ctx) => {
        const rateLimit = require('../utils/rateLimit');
        if (!rateLimit.checkLimit(ctx.userId, 'news')) {
            await lineUtils.replyText(ctx.replyToken, '⏱️ PTT查詢過於頻繁，請稍後再試');
            return;
        }

        const { createTask } = require('../utils/tasks');
        const taskCreated = await createTask('crawler', { userId: ctx.userId, groupId: ctx.groupId, type: 'ptt' });
        if (!taskCreated) {
            const items = await crawlerHandler.crawlPttHot();
            if (!items) await lineUtils.replyText(ctx.replyToken, '❌ 目前無法取得PTT熱門文章');
            else await lineUtils.replyFlex(ctx.replyToken, 'PTT熱門', crawlerHandler.buildContentCarousel('PTT熱門', items));
        }
    }, { isGroupOnly: true, needAuth: true, feature: 'news' });

    // === 2. 管理員功能 (Admin Only) ===

    router.register('產生群組註冊碼', async (ctx) => {
        await systemHandler.handleGenerateCode(ctx.userId, ctx.replyToken);
    }, { adminOnly: true });

    // Weather/Todo/Restaurant code generation routes removed.

    router.register(/^\[小黑屋\]/, async (ctx) => {
        await systemHandler.handleBlacklistCommand(ctx);
    }, { adminOnly: true });

    router.register(/^\[放出來\]/, async (ctx) => {
        await systemHandler.handleUnblacklistCommand(ctx);
    }, { adminOnly: true });

    router.register('黑名單列表', async (ctx) => {
        await systemHandler.handleListBlacklist(ctx.replyToken);
    }, { adminOnly: true });

    router.register('系統手冊', async (ctx) => {
        if (!ctx.isSuper) return; // Only Super Admin can see manual
        await systemHandler.handleShowManual(ctx.replyToken);
    });

    // 抽獎 (Admin Only)
    // 抽獎 (Check Admin inside Handler)
    // 抽獎 (Join only here, Start moved to Admin)
    // 解決方案: 註冊一個捕獲所有訊息的 handler，檢查是否匹配抽獎關鍵字
    router.register((msg) => true, async (ctx, match) => {
        // 檢查是否為抽獎關鍵字
        const isLottery = await lotteryHandler.checkLotteryKeyword(ctx.groupId, match[0]);
        if (isLottery) {
            const result = await lotteryHandler.joinLottery(ctx.groupId, ctx.userId, match[0]);
            if (result) await lineUtils.replyText(ctx.replyToken, result.message);
        } else {
            return false; // 未匹配關鍵字，繼續路由
        }
    }, { isGroupOnly: true, needAuth: true, feature: 'lottery' });


    // === 2. 管理員功能 (Admin Only) ===

    // ... (Generate Code)

    // 抽獎 [獎品] [人數] [時間] [關鍵字]
    // 範例：抽獎 機械鍵盤 1 5 抽鍵盤
    // Relaxed Regex to capture all args and split manually for better error handling
    router.register(/^抽獎\s+(.+)$/, async (ctx, match) => {
        const args = match[1].trim().split(/\s+/);
        if (args.length !== 4) {
            await lineUtils.replyText(ctx.replyToken, '❌ 指令格式錯誤\n正確格式：抽獎 [獎品] [人數] [時間(分)] [關鍵字]\n範例：抽獎 機械鍵盤 1 60 抽鍵盤');
            return;
        }
        const [prize, winners, duration, keyword] = args;
        await lotteryHandler.handleStartLottery(ctx.replyToken, ctx.groupId, ctx.userId, prize, winners, duration, keyword);
    }, { isGroupOnly: true });

    // 開獎 [獎品]
    router.register(/^開獎\s+(\S+)$/, async (ctx, match) => {
        await lotteryHandler.handleManualDraw(ctx.replyToken, ctx.groupId, ctx.userId, match[1]);
    }, { isGroupOnly: true });

    // 取消抽獎 [獎品]
    router.register(/^取消抽獎\s+(\S+)$/, async (ctx, match) => {
        await lotteryHandler.handleCancelLottery(ctx.replyToken, ctx.groupId, ctx.userId, match[1]);
    }, { isGroupOnly: true });

    // 抽獎列表
    router.register(/^(抽獎狀態|抽獎列表)$/, async (ctx) => {
        await lotteryHandler.handleStatusQuery(ctx.replyToken, ctx.groupId);
    }, { isGroupOnly: true });

    // === 3. 群組管理功能 (Group Admin Only) ===

    // 群組註冊
    router.register(/^註冊\s+([A-Z0-9]{8})$/, async (ctx, match) => {
        await systemHandler.handleRegisterGroup(ctx.groupId, ctx.userId, match[1], ctx.replyToken);
    }, { isGroupOnly: true }); // 需要群組ID，但不需已授權

    // Feature registration routes removed.

    // 功能開關
    router.register(/^開啟\s+(.+)$/, async (ctx, match) => {
        await systemHandler.handleToggleFeature(ctx.groupId, ctx.userId, match[1], true, ctx.replyToken);
    }, { isGroupOnly: true, needAuth: true });

    router.register(/^關閉\s+(.+)$/, async (ctx, match) => {
        await systemHandler.handleToggleFeature(ctx.groupId, ctx.userId, match[1], false, ctx.replyToken);
    }, { isGroupOnly: true, needAuth: true });

    router.register(/^查詢功能$/, async (ctx) => {
        await systemHandler.handleCheckFeatures(ctx.groupId, ctx.replyToken);
    }, { isGroupOnly: true, needAuth: true });

    router.register(/^(指令|功能|說明|help)$/i, async (ctx) => {
        await systemHandler.handleHelpCommand(ctx.userId, ctx.groupId, ctx.replyToken, ctx.sourceType);
    });

    // === 4. 群組功能 (Group Only & Authorized) ===

    // 天氣
    router.register(/^天氣\s+(.+)$/, async (ctx, match) => {
        await weatherHandler.handleWeather(ctx.replyToken, match[1]);
    }, { isGroupOnly: true, needAuth: true, feature: 'weather' });

    router.register(/^空氣\s+(.+)$/, async (ctx, match) => {
        await weatherHandler.handleAirQuality(ctx.replyToken, match[1]);
    }, { isGroupOnly: true, needAuth: true, feature: 'weather' });

    // 待辦事項
    router.register(/^待辦(\s+.*)?$/, async (ctx, match) => {
        await todoHandler.handleTodoCommand(ctx.replyToken, ctx.groupId, ctx.userId, match[0]);
    }, { needAuth: true, feature: 'todo' }); // Remove isGroupOnly

    router.register(/^抽(\s+.*)?$/, async (ctx, match) => {
        await todoHandler.handleTodoCommand(ctx.replyToken, ctx.groupId, ctx.userId, match[0]);
    }, { needAuth: true, feature: 'todo' });

    router.register(/^完成\s+(\d+)$/, async (ctx, match) => {
        await todoHandler.handleTodoCommand(ctx.replyToken, ctx.groupId, ctx.userId, match[0]);
    }, { needAuth: true, feature: 'todo' });

    router.register(/^刪除\s+(\d+)$/, async (ctx, match) => {
        await todoHandler.handleTodoCommand(ctx.replyToken, ctx.groupId, ctx.userId, match[0]);
    }, { needAuth: true, feature: 'todo' });

    // 餐廳
    router.register(/^吃什麼(\s+(.+))?$/, async (ctx, match) => {
        await restaurantHandler.handleEatCommand(ctx.replyToken, ctx.groupId, ctx.userId, match[2]);
    }, { isGroupOnly: true, needAuth: true, feature: 'restaurant' });

    router.register(/^新增餐廳\s+(.+)$/, async (ctx, match) => {
        await restaurantHandler.handleAddRestaurant(ctx.replyToken, ctx.groupId, ctx.userId, match[1]);
    }, { isGroupOnly: true, needAuth: true, feature: 'restaurant' });

    router.register(/^刪除餐廳\s+(.+)$/, async (ctx, match) => {
        await restaurantHandler.handleRemoveRestaurant(ctx.replyToken, ctx.groupId, ctx.userId, match[1]);
    }, { isGroupOnly: true, needAuth: true, feature: 'restaurant' });

    router.register('餐廳清單', async (ctx) => {
        await restaurantHandler.handleListRestaurants(ctx.replyToken, ctx.groupId);
    }, { isGroupOnly: true, needAuth: true, feature: 'restaurant' });

    // 抽獎
    // 抽獎 (Join only here, Start moved to Admin)
    // router.register(/^抽獎... moved to Admin


    // === 5. 娛樂/AI (Authorized Group or SuperAdmin Private) ===

    // AI
    router.register(/^AI\s+(.+)$/, async (ctx, match) => {
        const text = await aiHandler.getGeminiReply(match[1]);
        await lineUtils.replyText(ctx.replyToken, text);
    }, { feature: 'ai', isGroupOnly: true });

    router.register(/^幫我選\s+(.+)$/, async (ctx, match) => {
        const options = match[1].split(/\s+/).filter(o => o.trim());
        if (options.length < 2) {
            await lineUtils.replyText(ctx.replyToken, '❌ 請提供至少 2 個選項');
        } else {
            const selected = options[Math.floor(Math.random() * options.length)];
            await lineUtils.replyText(ctx.replyToken, `🎯 幫你選好了：${selected}`);
        }
    }, { feature: 'ai', isGroupOnly: true });

    // 剪刀石頭布
    router.register(/^(剪刀|石頭|布)$/, async (ctx, match) => {
        await gameHandler.handleRPS(ctx.replyToken, match[0]);
    }, { feature: 'game', isGroupOnly: true });

    // 狂標 (Tag Blast)
    router.register(/^狂標(\s+(\d+))?/, async (ctx, match) => {
        await funHandler.handleTagBlast(ctx, match);
    }, { isGroupOnly: true, needAuth: true, feature: 'voice' });

    // 圖片 (黑絲/白絲) with fallback
    // 移除 isGroupOnly 和 needAuth 限制，允許私訊和所有群組使用
    router.register(/^(黑絲|白絲)$/, async (ctx, match) => {
        const { createTask } = require('../utils/tasks');
        const taskCreated = await createTask('fun', {
            userId: ctx.userId,
            groupId: ctx.groupId,
            type: match[0]
        });

        // Fallback to sync if Cloud Tasks unavailable
        if (!taskCreated) {
            const type = match[0];
            let imageUrl = null;

            // Try pool first
            if (funHandler.imagePool && funHandler.imagePool[type] && funHandler.imagePool[type].length > 0) {
                imageUrl = funHandler.imagePool[type].shift();
            }

            // Fallback to live fetch
            if (!imageUrl) {
                imageUrl = await funHandler.getRandomImage(type);
            }

            // Trigger refill
            if (funHandler.fillPool) {
                funHandler.fillPool(type).catch(() => { });
            }

            if (imageUrl) {
                await lineUtils.replyToLine(ctx.replyToken, [{
                    type: 'image',
                    originalContentUrl: imageUrl,
                    previewImageUrl: imageUrl
                }]);

                if (ctx.isGroup && ctx.isAuthorizedGroup) {
                    const leaderboardHandler = require('./leaderboard');
                    leaderboardHandler.recordImageUsage(ctx.groupId, ctx.userId, type).catch(() => { });
                }
            } else {
                await lineUtils.replyText(ctx.replyToken, '❌ 圖片讀取失敗');
            }
        }
    }, { isGroupOnly: true, needAuth: true, feature: 'fun' }); // 需要群組註冊

    // 圖片 (番號)
    router.register(/^(今晚看什麼|番號推薦)$/, async (ctx) => {
        const jav = await crawlerHandler.getRandomJav(); // Assuming this is passed
        if (jav) await lineUtils.replyText(ctx.replyToken, `🎬 ${jav.番号} ${jav.名称}\n💖 ${jav.收藏人数}人收藏`);
        else await lineUtils.replyText(ctx.replyToken, '❌ 無結果');
    }, { isGroupOnly: true, needAuth: true, feature: 'game' });

    // 圖片 (Keyword Map)
    router.register((msg) => !!KEYWORD_MAP[msg], async (ctx, match) => {
        const msg = match[0];
        const url = await driveHandler.getRandomDriveImage(KEYWORD_MAP[msg]);
        if (url) {
            await lineUtils.replyToLine(ctx.replyToken, [{ type: 'image', originalContentUrl: url, previewImageUrl: url }]);
            if (ctx.isGroup && ctx.isAuthorizedGroup) {
                leaderboardHandler.recordImageUsage(ctx.groupId, ctx.userId, msg).catch(() => { });
            }
        }
    }, { isGroupOnly: true, needAuth: true, feature: 'game' });

    // === 6. 台語 (SuperAdmin Or Authorized Group) ===
    router.register(/^講台語\s+(.+)$/, async (ctx, match) => {
        await taigiHandler.handleTaigi(ctx.replyToken, match[0]);
    }, { needAuth: true, isGroupOnly: true, feature: 'taigi' });

    // === 7. 排行榜 (Group Only & Authorized) ===
    router.register('排行榜', async (ctx) => {
        await leaderboardHandler.handleLeaderboard(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAuth: true, feature: 'leaderboard' });

    router.register('我的排名', async (ctx) => {
        await leaderboardHandler.handleMyRank(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAuth: true, feature: 'leaderboard' });

}

module.exports = registerRoutes;
