const lineUtils = require('../utils/line');
const authUtils = require('../utils/auth');

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

    // 3. 讀取功能狀態
    // Categories:
    // Tools: weather, todo, restaurant, finance, delivery, currency, oil
    // Info: news, movie
    // Entertainment: horoscope, ai, game, lottery
    // Language: taigi

    const categoryMap = {
        tools: ['weather', 'todo', 'restaurant', 'finance', 'delivery', 'currency', 'oil'],
        info: ['news', 'movie'],
        entertainment: ['horoscope', 'ai', 'game', 'lottery', 'leaderboard'],
        language: ['taigi']
    };

    const featureLabels = {
        // Tools
        weather: '氣象情報',
        todo: '待辦事項',
        restaurant: '美食雷達',
        finance: '記帳助手',
        delivery: '物流查詢',
        currency: '匯率工具',
        oil: '油價查詢',
        // Info
        news: '新聞快訊',
        movie: '電影資訊',
        // Entertainment
        horoscope: '星座運勢',
        ai: 'AI 聊天',
        game: '娛樂功能',
        lottery: '抽獎活動',
        leaderboard: '積分排行',
        // Language
        taigi: '台語翻譯'
    };

    const features = {};
    for (const category in categoryMap) {
        features[category] = {};
        for (const key of categoryMap[category]) {
            features[category][key] = {
                label: featureLabels[key] || key,
                enabled: await authUtils.isFeatureEnabled(groupId, key)
            };
        }
    }

    // 4. 建構 Flex Message
    const bubble = buildSettingsFlex(groupId, features);
    await lineUtils.replyFlex(replyToken, '⚙️ 群組功能設定', bubble);
}

/**
 * 處理 Toggle Postback
 * data format: action=toggle_feature&feature=ai&enable=true&groupId=...
 */
async function handleFeatureToggle(context, data) {
    const { replyToken, userId, groupId: currentGroupId } = context;
    const params = new URLSearchParams(data);
    const targetGroupId = params.get('groupId');
    const feature = params.get('feature');
    const enable = params.get('enable') === 'true';

    // 確保只操作當前群組
    if (context.isGroup && targetGroupId !== currentGroupId) {
        // Mismatch - likely stale or malicious
        return;
    }

    // 執行切換 logic
    // 注意：authUtils.handleToggleFeature is systemHandler logic, here we call authUtils directly
    const result = await authUtils.toggleGroupFeature(targetGroupId, feature, enable);

    if (result.success) {
        // 成功後，重新產生 Flex Message 更新介面
        const categoryMap = {
            tools: ['weather', 'todo', 'restaurant', 'finance', 'delivery', 'currency', 'oil'],
            info: ['news', 'movie'],
            entertainment: ['horoscope', 'ai', 'game', 'lottery', 'leaderboard'],
            language: ['taigi']
        };

        const featureLabels = {
            weather: '氣象情報', todo: '待辦事項', restaurant: '美食雷達', finance: '記帳助手',
            delivery: '物流查詢', currency: '匯率工具', oil: '油價查詢',
            news: '新聞快訊', movie: '電影資訊',
            horoscope: '星座運勢', ai: 'AI 聊天', game: '娛樂功能', lottery: '抽獎活動', leaderboard: '積分排行',
            taigi: '台語翻譯'
        };

        const features = {};
        for (const category in categoryMap) {
            features[category] = {};
            for (const key of categoryMap[category]) {
                features[category][key] = {
                    label: featureLabels[key] || key,
                    enabled: await authUtils.isFeatureEnabled(targetGroupId, key)
                };
            }
        }

        const bubble = buildSettingsFlex(targetGroupId, features);
        await lineUtils.replyFlex(replyToken, '設定已更新', bubble);
    } else {
        await lineUtils.replyText(replyToken, `❌ 設定失敗: ${result.message}`);
    }
}

function buildSettingsFlex(groupId, features) {
    const bodyContents = [];

    const categoryTitles = {
        tools: '🛠️ 實用工具',
        info: '📰 資訊情報',
        entertainment: '🎮 娛樂休閒',
        language: '🗣️ 語言功能'
    };

    const categoryColors = {
        tools: '#0288D1',         // Light Blue
        info: '#0097A7',          // Cyan
        entertainment: '#7B1FA2', // Purple
        language: '#E64A19'       // Deep Orange
    };

    // Iterate Categories
    for (const [catKey, catFeatures] of Object.entries(features)) {
        // Category Header
        bodyContents.push({
            type: 'box',
            layout: 'horizontal',
            contents: [
                { type: 'text', text: categoryTitles[catKey] || catKey, weight: 'bold', size: 'sm', color: categoryColors[catKey] || '#555555' },
                { type: 'filler' }
            ],
            margin: 'lg'
        });
        bodyContents.push({ type: 'separator', margin: 'sm', color: categoryColors[catKey] || '#DDDDDD' });

        // Grid Layout (2 columns)
        const entries = Object.entries(catFeatures);
        let currentRow = [];

        for (let i = 0; i < entries.length; i++) {
            const [key, info] = entries[i];
            const isEnabled = info.enabled;
            const nextState = !isEnabled;

            // Generate Button Box
            const buttonBox = {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                            { type: 'text', text: info.label, size: 'xs', color: '#555555', flex: 1, gravity: 'center' },
                            {
                                type: 'text',
                                text: isEnabled ? 'ON' : 'OFF',
                                size: 'xs',
                                color: isEnabled ? '#FFFFFF' : '#999999',
                                weight: 'bold',
                                align: 'center',
                                gravity: 'center',
                                backgroundColor: isEnabled ? '#4CAF50' : '#EEEEEE',
                                cornerRadius: '10px',
                                paddingAll: '2px', // Flex bug workaround: use padding to simulate badge? flex text doesn't support padding.
                                // Use box as background for text
                            }
                        ],
                        // Let's refine the ON/OFF switch look.
                        // Actually, simplified look: Label + Checkbox/Toggle Icon
                    }
                ],
                // Simplified Button Design
            };

            // Enhanced Button Design (Box acting as button)
            const toggleBox = {
                type: 'box',
                layout: 'horizontal',
                contents: [
                    // Status Indicator Stripe
                    {
                        type: 'box',
                        layout: 'vertical',
                        width: '4px',
                        backgroundColor: isEnabled ? '#4CAF50' : '#E0E0E0',
                        height: '100%' // Stretch
                    },
                    // Label Area
                    {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: info.label, size: 'sm', color: isEnabled ? '#333333' : '#AAAAAA', weight: isEnabled ? 'bold' : 'regular' }
                        ],
                        flex: 1,
                        paddingStart: 'md',
                        justifyContent: 'center'
                    },
                    // Toggle Icon
                    {
                        type: 'text',
                        text: isEnabled ? '✅' : '🔴',
                        size: 'xs',
                        align: 'end',
                        gravity: 'center',
                        flex: 0
                    }
                ],
                backgroundColor: '#F9F9F9',
                cornerRadius: '4px',
                height: '40px',
                margin: 'sm',
                action: {
                    type: 'postback',
                    // label: isEnabled ? '關閉' : '開啟', // Label not shown for box action
                    data: `action=toggle_feature&feature=${key}&enable=${nextState}&groupId=${groupId}`
                },
                flex: 1 // Equal width in row
            };

            currentRow.push(toggleBox);

            // Pair up or finalize row
            if (currentRow.length === 2 || i === entries.length - 1) {
                bodyContents.push({
                    type: 'box',
                    layout: 'horizontal',
                    contents: [...currentRow], // Spread copy
                    spacing: 'sm'
                });
                currentRow = [];
            }
        }
    }

    return {
        type: 'bubble',
        header: {
            type: 'box',
            layout: 'vertical',
            contents: [
                { type: 'text', text: '⚙️ 群組功能設定', weight: 'bold', size: 'lg', color: '#FFFFFF' },
                { type: 'text', text: `ID: ${groupId.substring(0, 8)}...`, size: 'xxs', color: '#EEEEEE', margin: 'xs' }
            ],
            backgroundColor: '#333333'
        },
        body: {
            type: 'box',
            layout: 'vertical',
            contents: bodyContents,
            paddingAll: '12px'
        },
        footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
                { type: 'text', text: '點擊按鈕可切換功能開關', size: 'xxs', color: '#AAAAAA', align: 'center' }
            ]
        }
    };
}

module.exports = {
    handleSettingsCommand,
    handleFeatureToggle
};
