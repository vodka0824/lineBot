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
        funHandler
        // stockHandler (Temporarily disabled due to missing file)
    } = handlers;

    // === 1. 公開功能 (Public) ===

    // 分唄
    router.register(/^分唄(\d+)$/, async (ctx, match) => {
        await financeHandler.handleFinancing(ctx.replyToken, Number(match[1]), 'fenbei');
    });

    // 銀角
    router.register(/^銀角(\d+)$/, async (ctx, match) => {
        await financeHandler.handleFinancing(ctx.replyToken, Number(match[1]), 'yinjiao');
    });

    // 刷卡
    router.register(/^刷卡(\d+)$/, async (ctx, match) => {
        await financeHandler.handleCreditCard(ctx.replyToken, Number(match[1]));
    });

    // 即時匯率
    router.register('即時匯率', async (ctx) => {
        await currencyHandler.handleRatesQuery(ctx.replyToken);
    });

    // 匯率換算
    router.register(/^匯率\s*(\d+\.?\d*)\s*([A-Za-z]{3})$/, async (ctx, match) => {
        await currencyHandler.handleConversion(ctx.replyToken, parseFloat(match[1]), match[2].toUpperCase());
    });

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
    });

    // 買外幣 (買美金 100)
    router.register(/^買([A-Za-z\u4e00-\u9fa5]+)\s*(\d+)$/, async (ctx, match) => {
        await currencyHandler.handleBuyForeign(ctx.replyToken, match[1], Number(match[2]));
    });

    // 買外幣 (買美金 100)
    router.register(/^買([A-Za-z\u4e00-\u9fa5]+)\s*(\d+)$/, async (ctx, match) => {
        await currencyHandler.handleBuyForeign(ctx.replyToken, match[1], Number(match[2]));
    });

    // 群組設定 (Dashboard)
    // 群組設定 (Dashboard)
    // 移除 isGroupOnly/needAuth 限制，改由 Handler 內部判斷並回傳錯誤訊息，避免「無反應」
    router.register(/^群組設定(\s.*)?$/, async (ctx) => {
        await settingsHandler.handleSettingsCommand(ctx);
    });

    // 生活資訊 (油價/電影/PTT/科技)
    router.register('油價', async (ctx) => {
        const oilData = await crawlerHandler.crawlOilPrice();
        const flex = crawlerHandler.buildOilPriceFlex(oilData);
        await lineUtils.replyFlex(ctx.replyToken, '本週油價', flex);
    });
    router.register('電影', async (ctx) => {
        const movies = await crawlerHandler.crawlNewMovies();
        await lineUtils.replyText(ctx.replyToken, movies);
    });
    router.register('蘋果新聞', async (ctx) => {
        const news = await crawlerHandler.crawlAppleNews();
        await lineUtils.replyText(ctx.replyToken, news);
    });
    router.register('科技新聞', async (ctx) => {
        const news = await crawlerHandler.crawlTechNews();
        await lineUtils.replyText(ctx.replyToken, news);
    });
    router.register('PTT熱門', async (ctx) => {
        const ptt = await crawlerHandler.crawlPttHot();
        await lineUtils.replyText(ctx.replyToken, ptt);
    });

    // === 2. 管理員功能 (Admin Only) ===

    router.register('產生群組註冊碼', async (ctx) => {
        await systemHandler.handleGenerateCode(ctx.userId, ctx.replyToken);
    }, { adminOnly: true });

    router.register('產生天氣註冊碼', async (ctx) => {
        await systemHandler.handleGenerateWeatherCode(ctx.userId, ctx.replyToken);
    }, { adminOnly: true });

    router.register('產生待辦註冊碼', async (ctx) => {
        await systemHandler.handleGenerateTodoCode(ctx.userId, ctx.replyToken);
    }, { adminOnly: true });

    router.register('產生餐廳註冊碼', async (ctx) => {
        await systemHandler.handleGenerateRestaurantCode(ctx.userId, ctx.replyToken);
    }, { adminOnly: true });

    router.register(/^\[小黑屋\]/, async (ctx) => {
        // Pass context which includes message, userId etc.
        // We need to pass the FULL event or construct the context to include 'messageObject' if we want mentions?
        // Wait, 'ctx' in handler IS the context object.
        // I need to ensure context has necessary data.
        // For now, just call the handler.
        await systemHandler.handleBlacklistCommand(ctx);
    }, { adminOnly: true });

    router.register('系統手冊', async (ctx) => {
        if (!ctx.isSuper) return; // Only Super Admin can see manual
        await systemHandler.handleShowManual(ctx.replyToken);
    });

    // === 3. 群組管理功能 (Group Admin Only) ===

    // 群組註冊
    router.register(/^註冊\s+([A-Z0-9]{8})$/, async (ctx, match) => {
        await systemHandler.handleRegisterGroup(ctx.groupId, ctx.userId, match[1], ctx.replyToken);
    }, { isGroupOnly: true }); // 需要群組ID，但不需已授權

    router.register(/^註冊天氣\s+([A-Z0-9]{8})$/, async (ctx, match) => {
        await systemHandler.handleRegisterFeature(ctx.groupId, ctx.userId, 'weather', match[1], ctx.replyToken);
    }, { isGroupOnly: true });

    router.register(/^註冊待辦\s+([A-Z0-9]{8})$/, async (ctx, match) => {
        await systemHandler.handleRegisterFeature(ctx.groupId, ctx.userId, 'todo', match[1], ctx.replyToken);
    }, { isGroupOnly: true });

    router.register(/^註冊餐廳\s+([A-Z0-9]{8})$/, async (ctx, match) => {
        await systemHandler.handleRegisterFeature(ctx.groupId, ctx.userId, 'restaurant', match[1], ctx.replyToken);
    }, { isGroupOnly: true });

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
    router.register(/^抽獎\s+(\S+)\s+(\S+)\s+(\d+)(\s+(\d+))?$/, async (ctx, match) => {
        await lotteryHandler.handleStartLottery(ctx.replyToken, ctx.groupId, ctx.userId, match[1], match[2], match[3], match[5]);
    }, { isGroupOnly: true, needAuth: true, feature: 'lottery' });

    // 解決方案: 註冊一個捕獲所有訊息的 handler，檢查是否匹配抽獎關鍵字
    router.register((msg) => true, async (ctx, match) => {
        // 檢查抽獎狀態
        const status = await lotteryHandler.getLotteryStatus(ctx.groupId);
        if (status && !status.isExpired && match[0] === status.keyword) {
            const result = await lotteryHandler.joinLottery(ctx.groupId, ctx.userId);
            await lineUtils.replyText(ctx.replyToken, result.message);
        } else {
            return false; // 未匹配關鍵字，繼續路由
        }
    }, { isGroupOnly: true, needAuth: true, feature: 'lottery' });


    // === 5. 娛樂/AI (Authorized Group or SuperAdmin Private) ===

    // AI
    router.register(/^AI\s+(.+)$/, async (ctx, match) => {
        if (!ctx.isGroup && !ctx.isSuper) return lineUtils.replyText(ctx.replyToken, '❌ 權限不足');
        const text = await aiHandler.getGeminiReply(match[1]);
        await lineUtils.replyText(ctx.replyToken, text);
    }, { feature: 'ai' });

    router.register(/^幫我選\s+(.+)$/, async (ctx, match) => {
        if (!ctx.isGroup && !ctx.isSuper) return lineUtils.replyText(ctx.replyToken, '❌ 權限不足');
        const options = match[1].split(/\s+/).filter(o => o.trim());
        if (options.length < 2) {
            await lineUtils.replyText(ctx.replyToken, '❌ 請提供至少 2 個選項');
        } else {
            const selected = options[Math.floor(Math.random() * options.length)];
            await lineUtils.replyText(ctx.replyToken, `🎯 幫你選好了：${selected}`);
        }
    }, { feature: 'ai' });

    // 剪刀石頭布
    router.register(/^(剪刀|石頭|布)$/, async (ctx, match) => {
        if (!ctx.isGroup && !ctx.isSuper) return lineUtils.replyText(ctx.replyToken, '❌ 權限不足');
        await gameHandler.handleRPS(ctx.replyToken, match[0]);
    }, { feature: 'game' });

    // 狂標 (Tag Blast)
    router.register(/^狂標(\s+(\d+))?/, async (ctx, match) => {
        await funHandler.handleTagBlast(ctx, match);
    }, { isGroupOnly: true });

    // 圖片 (黑絲/腳控)
    router.register(/^(黑絲|腳控)$/, async (ctx, match) => {
        if (!ctx.isGroup && !ctx.isSuper) return lineUtils.replyText(ctx.replyToken, '❌ 權限不足');
        const url = match[0] === '黑絲' ? 'https://v2.api-m.com/api/heisi?return=302' : 'https://3650000.xyz/api/?type=302&mode=7';
        await lineUtils.replyToLine(ctx.replyToken, [{ type: 'image', originalContentUrl: url, previewImageUrl: url }]);
        if (ctx.isGroup && ctx.isAuthorizedGroup) {
            leaderboardHandler.recordImageUsage(ctx.groupId, ctx.userId, match[0]).catch(() => { });
        }
    }, { feature: 'image' });

    // 圖片 (番號)
    router.register(/^(今晚看什麼|番號推薦)$/, async (ctx) => {
        if (!ctx.isGroup && !ctx.isSuper) return lineUtils.replyText(ctx.replyToken, '❌ 權限不足');
        const jav = await crawlerHandler.getRandomJav(); // Assuming this is passed
        if (jav) await lineUtils.replyText(ctx.replyToken, `🎬 ${jav.番号} ${jav.名称}\n💖 ${jav.收藏人数}人收藏`);
        else await lineUtils.replyText(ctx.replyToken, '❌ 無結果');
    }, { feature: 'image' });

    // 圖片 (Keyword Map)
    router.register((msg) => !!KEYWORD_MAP[msg], async (ctx, match) => {
        if (!ctx.isGroup && !ctx.isSuper) return lineUtils.replyText(ctx.replyToken, '❌ 權限不足');
        const msg = match[0];
        const url = await driveHandler.getRandomDriveImage(KEYWORD_MAP[msg]);
        if (url) {
            await lineUtils.replyToLine(ctx.replyToken, [{ type: 'image', originalContentUrl: url, previewImageUrl: url }]);
            if (ctx.isGroup && ctx.isAuthorizedGroup) {
                leaderboardHandler.recordImageUsage(ctx.groupId, ctx.userId, msg).catch(() => { });
            }
        }
    }, { feature: 'image' });

    // === 6. 台語 (SuperAdmin Or Authorized Group) ===
    router.register(/^講台語\s+(.+)$/, async (ctx, match) => {
        if (!ctx.isGroup && !ctx.isSuper) return lineUtils.replyText(ctx.replyToken, '❌ 台語查詢私訊僅限超級管理員使用。');
        await taigiHandler.handleTaigi(ctx.replyToken, match[0]);
    }, { needAuth: true });

    // === 7. 排行榜 (Group Only & Authorized) ===
    router.register('排行榜', async (ctx) => {
        await leaderboardHandler.handleLeaderboard(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAuth: true });

    router.register('我的排名', async (ctx) => {
        await leaderboardHandler.handleMyRank(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAuth: true });

}

module.exports = registerRoutes;
