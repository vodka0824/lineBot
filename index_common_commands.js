/**
 * 處理通用指令 (根據權限矩陣)
 */
async function handleCommonCommands(message, replyToken, sourceType, userId, groupId) {
    const isSuper = authUtils.isSuperAdmin(userId);
    const isGroup = (sourceType === 'group' || sourceType === 'room');
    const isAuthorizedGroup = isGroup ? await authUtils.isGroupAuthorized(groupId) : false;

    // === 1. 公開功能 (Public: Admin/User/Group) ===

    // 財務計算 - 分唄
    if (/^分唄\d+$/.test(message)) {
        const amount = Number(message.slice(2));
        const result = Math.ceil(amount * 1.08 / 30); // 簡易費率 1.08
        await lineUtils.replyText(replyToken, `💰 分唄 (30期): ${result} 元/期`);
        return true;
    }
    // 財務計算 - 銀角
    if (/^銀角\d+$/.test(message)) {
        const amount = Number(message.slice(2));
        const result = Math.ceil(amount * 1.07 / 24); // 簡易費率 1.07
        await lineUtils.replyText(replyToken, `💰 銀角 (24期): ${result} 元/期`);
        return true;
    }
    // 刷卡
    if (/^刷卡\d+$/.test(message)) {
        await handleCreditCard(replyToken, Number(message.slice(2)));
        return true;
    }

    // === 2. 基礎資訊 (DM: Public / Group: Authorized) ===
    // 規則: 私訊所有人可用，群組需註冊
    const isLifeInfo = ['油價', '電影', '蘋果新聞', '科技新聞', '熱門廢文', 'PTT熱門'].includes(message);

    if (isLifeInfo) {
        if (isGroup) {
            if (!isAuthorizedGroup) return false;
            if (!authUtils.isFeatureEnabled(groupId, 'life')) return false;
        }

        let result = '';
        if (message === '油價') result = await crawlOilPrice();
        else if (message === '電影') result = await crawlNewMovies();
        else if (message === '蘋果新聞') result = await crawlAppleNews();
        else if (message === '科技新聞') result = await crawlTechNews();
        else result = await crawlPttHot();

        await lineUtils.replyText(replyToken, result);
        return true;
    }

    // === 3. 娛樂/AI (DM: SuperAdmin Only / Group: Authorized) ===
    // 規則: 私訊僅限超級管理員，群組需註冊
    const isAI = /^AI\s+/.test(message) || /^幫我選\s+/.test(message);
    const isEntertainment = ['剪刀', '石頭', '布', '今晚看什麼', '番號推薦', '黑絲', '腳控'].includes(message) || KEYWORD_MAP[message];

    if (isEntertainment || isAI) {
        // 私訊檢查
        if (!isGroup && !isSuper) {
            await lineUtils.replyText(replyToken, '❌ 此功能僅限超級管理員私訊使用，或請在已註冊群組中使用。');
            return true;
        }
        // 群組檢查
        if (isGroup) {
            if (!isAuthorizedGroup) return false;

            // 檢查功能開關
            const featureKey = isAI ? 'ai' :
                (['今晚看什麼', '番號推薦', '黑絲', '腳控'].includes(message) || KEYWORD_MAP[message]) ? 'image' : 'game';
            if (!authUtils.isFeatureEnabled(groupId, featureKey)) return false;
        }

        // 執行邏輯
        if (isAI) {
            if (/^AI\s+/.test(message)) {
                const query = message.replace(/^AI\s+/, '');
                const text = await getGeminiReply(query);
                await lineUtils.replyText(replyToken, text);
            } else { // 幫我選
                const optionsText = message.replace(/^幫我選\s+/, '');
                const options = optionsText.split(/\s+/).filter(o => o.trim());
                if (options.length < 2) {
                    await lineUtils.replyText(replyToken, '❌ 請提供至少 2 個選項');
                } else {
                    const selected = options[Math.floor(Math.random() * options.length)];
                    await lineUtils.replyText(replyToken, `🎯 幫你選好了：${selected}`);
                }
            }
        } else if (['剪刀', '石頭', '布'].includes(message)) {
            await handleRPS(replyToken, message);
        } else if (message === '今晚看什麼' || message === '番號推薦') {
            const jav = await getRandomJav();
            if (jav) await lineUtils.replyText(replyToken, `🎬 ${jav.番号} ${jav.名称}\n💖 ${jav.收藏人数}人收藏`);
            else await lineUtils.replyText(replyToken, '❌ 無結果');
        } else if (message === '黑絲' || message === '腳控') {
            const url = message === '黑絲' ? 'https://v2.api-m.com/api/heisi?return=302' : 'https://3650000.xyz/api/?type=302&mode=7';
            await lineUtils.replyToLine(replyToken, [{ type: 'image', originalContentUrl: url, previewImageUrl: url }]);
        } else if (KEYWORD_MAP[message]) {
            const url = await getRandomDriveImageWithCache(KEYWORD_MAP[message]);
            if (url) await lineUtils.replyToLine(replyToken, [{ type: 'image', originalContentUrl: url, previewImageUrl: url }]);
        }

        return true;
    }

    return false;
}
