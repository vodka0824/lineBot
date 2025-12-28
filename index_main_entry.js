/**
 * Cloud Functions 入口函數
 */
exports.lineBot = async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send('OK');

    const events = req.body.events;
    if (!events || events.length === 0) return res.status(200).send('No events');

    try {
        for (const event of events) {
            if (event.type !== 'message') continue;

            // === 處理位置訊息（附近美食搜尋）===
            if (event.message.type === 'location') {
                const replyToken = event.replyToken;
                const userId = event.source.userId;
                const { latitude, longitude, address } = event.message;

                // 檢查是否有等待位置請求
                const pendingRequest = pendingLocationRequests[userId];
                if (!pendingRequest || (Date.now() - pendingRequest.timestamp > 5 * 60 * 1000)) {
                    // 超過 5 分鐘或沒有請求，不處理 (或可回覆提示)
                    delete pendingLocationRequests[userId];
                    continue;
                }

                // 清除等待請求
                delete pendingLocationRequests[userId];

                // 搜尋附近餐廳
                const restaurants = await searchNearbyRestaurants(latitude, longitude, 500);

                if (!restaurants || restaurants.length === 0) {
                    await lineUtils.replyText(replyToken, '🍽️ 附近 500 公尺內沒有找到餐廳\n\n試試看分享其他位置？');
                    continue;
                }

                // 回覆 Flex Message
                const flexContent = buildRestaurantFlex(restaurants, address);
                await lineUtils.replyToLine(replyToken, [{
                    type: 'flex',
                    altText: `🍽️ 附近美食推薦（${restaurants.length} 間）`,
                    contents: flexContent
                }]);
                continue;
            }

            if (event.message.type === 'text') {
                const message = event.message.text.trim();
                const replyToken = event.replyToken;
                const userId = event.source.userId;
                const sourceType = event.source.type; // 'user', 'group', 'room'
                const groupId = event.source.groupId || event.source.roomId;

                // === 偵測 @ALL 並警告 ===
                // ... (保留)
                if (sourceType === 'group' || sourceType === 'room') {
                    const mention = event.message.mention;
                    if (mention?.mentionees?.some(m => m.type === 'all')) {
                        await lineUtils.replyText(replyToken, '⚠️ 請勿使用 @All 功能！這會打擾到所有人。');
                        continue;
                    }
                }

                // === 1. 管理員指令 (最高優先級) ===
                if (await handleAdminCommands(message, userId, groupId, replyToken, sourceType)) continue;

                // === 2. 群組功能開關 (管理員) ===
                if (sourceType === 'group' && /^(開啟|關閉)\s+(.+)$/.test(message)) {
                    const match = message.match(/^(開啟|關閉)\s+(.+)$/);
                    const enable = match[1] === '開啟';
                    const feature = match[2];
                    await systemHandler.handleToggleFeature(groupId, userId, feature, enable, replyToken);
                    continue;
                }

                // === 3. 通用指令 (含權限檢查) ===
                if (await handleCommonCommands(message, replyToken, sourceType, userId, groupId)) continue;

                // === 4. 特殊授權功能 (天氣, 餐廳, 待辦) - 需獨立檢查 ===

                // 天氣查詢
                if (/^天氣\s+.+/.test(message)) {
                    // 權限: 私訊限SuperAdmin, 群組限WeatherAuthorized
                    if (sourceType === 'user') {
                        if (!authUtils.isSuperAdmin(userId)) {
                            await lineUtils.replyText(replyToken, '❌ 天氣功能私訊僅限超級管理員使用。');
                            continue;
                        }
                    } else if (sourceType === 'group') {
                        if (!(await authUtils.isWeatherAuthorized(groupId))) {
                            await lineUtils.replyText(replyToken, '❌ 本群組尚未開通天氣功能 (需使用「註冊天氣」指令)。');
                            continue;
                        }
                    }
                    await handleWeather(replyToken, message);
                    continue;
                }

                // 附近餐廳
                if (message === '附近餐廳' || message === '附近美食') {
                    if (sourceType === 'group') {
                        if (!(await authUtils.isRestaurantAuthorized(groupId))) {
                            await lineUtils.replyText(replyToken, '❌ 尚未啟用附近餐廳功能\n\n請輸入「註冊餐廳 FOOD-XXXX」啟用');
                            continue;
                        }
                    } else if (sourceType === 'user' && !authUtils.isSuperAdmin(userId)) {
                        continue; // 非管理員私訊不回應
                    }

                    // 記錄等待位置請求
                    pendingLocationRequests[userId] = {
                        groupId: groupId || userId,
                        timestamp: Date.now()
                    };
                    await lineUtils.replyText(replyToken, '📍 請分享你的位置資訊\n\n👉 點擊「+」→「位置資訊」\n⏰ 5 分鐘內有效');
                    continue;
                }

            } // end text message
        } // end loop

        res.status(200).send('OK');
    } catch (err) {
        console.error("Main Error:", err);
        res.status(200).send('OK');
    }
};

// === 輔助: 管理員指令處理 ===
async function handleAdminCommands(message, userId, groupId, replyToken, sourceType) {
    // 檢查是否為管理員指令格式
    const isAdminCmd = ['產生註冊碼', '產生天氣註冊碼', '產生代辦註冊碼', '產生餐廳註冊碼', '管理員列表'].includes(message) ||
        message.startsWith('註冊') ||
        message.startsWith('新增管理員') ||
        message.startsWith('刪除管理員');

    // 如果不是管理員指令，且不是公開註冊指令，直接返回
    // 注意: '註冊' 開頭的指令可能任何人可用，所以要小心過濾

    // 產生指令 (僅限超級管理員)
    if (message === '產生註冊碼') {
        await systemHandler.handleGenerateCode(userId, replyToken);
        return true;
    }
    if (message === '產生天氣註冊碼') {
        await systemHandler.handleGenerateWeatherCode(userId, replyToken);
        return true;
    }
    if (message === '產生代辦註冊碼') {
        await systemHandler.handleGenerateTodoCode(userId, replyToken);
        return true;
    }
    if (message === '產生餐廳註冊碼') {
        await systemHandler.handleGenerateRestaurantCode(userId, replyToken);
        return true;
    }

    // 註冊指令 (公開，但在 handler 內會處理邏輯)
    if (/^註冊\s+[A-Z0-9]+$/i.test(message)) {
        const code = message.replace(/^註冊\s+/, '').trim();
        await systemHandler.handleRegisterGroup(groupId, userId, code, replyToken);
        return true;
    }
    if (/^註冊天氣\s+[A-Z0-9]+$/i.test(message)) {
        const code = message.replace(/^註冊天氣\s+/, '').trim();
        await systemHandler.handleRegisterWeather(groupId, userId, code, replyToken);
        return true;
    }

    // 其他管理員指令 (新增/刪除管理員等) - 這裡簡化處理，保留原由 authUtils/systemHandler 處理的空間
    // 如果需要保留原本 index.js 內的新增管理員邏輯，應將其搬移至 system.js 或在此處實作。
    // 為了完整性，這裡應保留基本管理員指令的路由

    return false;
}
