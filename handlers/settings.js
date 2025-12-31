const lineUtils = require('../utils/line');
const authUtils = require('../utils/auth');

// Definition of Settings UI Structure
const SETTINGS_STRUCT = {
    life: {
        label: '🛠️ 生活小幫手',
        color: '#1DB446',
        items: {
            news: '生活資訊', // Oil, Movie, News
            finance: '匯率與金融',
            weather: '天氣與空氣',
            food: '美食搜尋',
            delivery: '物流服務'
        }
    },
    entertainment: {
        label: '🎮 娛樂與互動',
        color: '#FF334B',
        items: {
            voice: '語音與互動', // Taigi, Tag, Choose
            fun: '趣味功能',     // RPS, Draw
            leaderboard: '群組排行榜'
        }
    },
    todo: {
        label: '📝 待辦事項',
        color: '#AA33FF',
        items: {} // Standalone toggle
    }
};

/**
 * 處理「群組設定」指令
 * 顯示功能開關儀表板
 */
async function handleSettingsCommand(context) {
    const { replyToken, userId, groupId, sourceType } = context;

    // 1. 權限檢查 (僅限 Admin 可操作)
    const isAdmin = await authUtils.isAdmin(userId);
    if (!isAdmin) {
        await lineUtils.replyText(replyToken, '❌ 權限不足：僅限機器人管理員可操作設定。');
        return;
    }

    if (sourceType !== 'group' && sourceType !== 'room') {
        await lineUtils.replyText(replyToken, '❌ 請在群組內使用此指令以讀取群組設定。');
        return;
    }

    // 2. 或是群組尚未授權
    const isAuthorized = await authUtils.isGroupAuthorized(groupId);
    if (!isAuthorized) {
        await lineUtils.replyText(replyToken, '❌ 此群組尚未註冊，無法設定功能。');
        return;
    }

    const bubble = await buildSettingsFlex(groupId);
    try {
        await lineUtils.replyFlex(replyToken, '⚙️ 群組功能設定', bubble);
    } catch (error) {
        console.error('[Settings] Error sending flex settings:', JSON.stringify(error.response?.data || error.message));
        await lineUtils.replyText(replyToken, '❌ 設定面板載入失敗');
    }
}

/**
 * 處理 Toggle Postback
 */
async function handleFeatureToggle(context, data) {
    const { replyToken, userId, groupId: currentGroupId } = context;
    const params = new URLSearchParams(data);
    const targetGroupId = params.get('groupId');
    const feature = params.get('feature');
    const enable = params.get('enable') === 'true';

    // 確保只操作當前群組
    if (context.isGroup && targetGroupId !== currentGroupId) {
        return;
    }

    // 執行切換
    const result = await authUtils.toggleGroupFeature(targetGroupId, feature, enable);

    if (result.success) {
        // 重新產生 Flex Message
        const bubble = await buildSettingsFlex(targetGroupId);
        try {
            await lineUtils.replyFlex(replyToken, '設定已更新', bubble);
        } catch (error) {
            console.error('[Settings] Error sending flex toggle:', JSON.stringify(error.response?.data || error.message));
            await lineUtils.replyText(replyToken, '❌ 更新面板失敗');
        }
    } else {
        await lineUtils.replyText(replyToken, `❌ 設定失敗: ${result.message}`);
    }
}

async function buildSettingsFlex(groupId) {
    const bodyContents = [];

    // Iterate Top-Level Categories
    for (const [catKey, config] of Object.entries(SETTINGS_STRUCT)) {
        // 1. Get Master Switch Status
        const isMasterEnabled = await authUtils.isFeatureEnabled(groupId, catKey);

        // Header Row (Category Label + Master Toggle)
        const masterToggle = {
            type: 'box',
            layout: 'horizontal',
            contents: [
                { type: 'text', text: config.label, weight: 'bold', size: 'md', color: config.color, flex: 1, gravity: 'center' },
                {
                    type: 'text',
                    text: isMasterEnabled ? '✅ 全區開啟' : '🔴 全區關閉',
                    size: 'xs',
                    color: isMasterEnabled ? '#1DB446' : '#FF334B',
                    align: 'end',
                    gravity: 'center',
                    action: {
                        type: 'postback',
                        label: 'ToggleMaster',
                        data: `action=toggle_feature&feature=${catKey}&enable=${!isMasterEnabled}&groupId=${groupId}`
                    }
                }
            ],
            margin: 'lg',
            paddingAll: '5px',
            backgroundColor: '#F5F5F5',
            cornerRadius: '4px'
        };

        bodyContents.push(masterToggle);

        // 2. Sub-Items Grid
        const itemKeys = Object.keys(config.items);
        if (itemKeys.length > 0) {
            // bodyContents.push({ type: 'separator', margin: 'sm' }); // Optional separator

            let currentRow = [];
            for (let i = 0; i < itemKeys.length; i++) {
                const itemKey = itemKeys[i];
                const itemLabel = config.items[itemKey];
                const fullKey = `${catKey}.${itemKey}`; // Construct dot-notation key

                // Get Sub-Item Status
                // If Master is disabled, Sub-items are effectively disabled (false), 
                // but we might want to know their internal config state? 
                // isFeatureEnabled logic returns false if master is false.
                // This is consistent: if master is off, seeing all subs off is correct representation of effect.
                const isItemEnabled = await authUtils.isFeatureEnabled(groupId, fullKey);
                const nextState = !isItemEnabled;

                const itemBox = {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                        { type: 'text', text: itemLabel, size: 'sm', color: '#555555', flex: 1, gravity: 'center' },
                        { type: 'text', text: isItemEnabled ? 'ON' : 'OFF', size: 'xxs', weight: 'bold', color: isItemEnabled ? '#1DB446' : '#AAAAAA', align: 'end', gravity: 'center' }
                    ],
                    backgroundColor: '#FFFFFF',
                    cornerRadius: '4px',
                    paddingAll: '8px',
                    margin: 'xs',
                    borderColor: '#EFEFEF',
                    borderWidth: '1px',
                    action: {
                        type: 'postback',
                        data: `action=toggle_feature&feature=${fullKey}&enable=${nextState}&groupId=${groupId}`
                    },
                    flex: 1
                };

                currentRow.push(itemBox);

                if (currentRow.length === 2 || i === itemKeys.length - 1) {
                    bodyContents.push({
                        type: 'box',
                        layout: 'horizontal',
                        contents: [...currentRow],
                        spacing: 'xs',
                        margin: 'xs'
                    });
                    currentRow = [];
                }
            }
        }

        // Spacer between categories
        // bodyContents.push({ type: 'separator', margin: 'md' });
    }

    return {
        type: 'bubble',
        header: {
            type: 'box',
            layout: 'vertical',
            contents: [
                { type: 'text', text: '⚙️ 群組功能設定', weight: 'bold', size: 'lg', color: '#FFFFFF' },
                { type: 'text', text: '點擊標題切換全區，點擊按鈕切換細項', size: 'xxs', color: '#DDDDDD' }
            ],
            backgroundColor: '#333333'
        },
        body: {
            type: 'box',
            layout: 'vertical',
            contents: bodyContents,
            paddingAll: '12px',
            backgroundColor: '#FFFFFF'
        }
    };
}

module.exports = {
    handleSettingsCommand,
    handleFeatureToggle
};
