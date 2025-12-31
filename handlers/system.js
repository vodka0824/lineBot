/**
 * 系統/管理員功能模組
 */
const authUtils = require('../utils/auth');
const lineUtils = require('../utils/line');

// === Admin Only: 產生註冊碼 ===

async function handleGenerateCode(userId, replyToken) {
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 您沒有權限執行此操作');
        return;
    }
    const code = await authUtils.createRegistrationCode(userId);
    await lineUtils.replyText(replyToken, `✅ 群組註冊碼：\n${code}\n\n群組指令：\n註冊 ${code}`);
}

// Other generation handlers removed.

// === Group Admin Only: 功能開關 ===

async function handleToggleFeature(groupId, userId, feature, enable, replyToken) {
    // 檢查管理員權限 (一般管理員即可)
    const isAdmin = await authUtils.isAdmin(userId);
    if (!isAdmin) {
        await lineUtils.replyText(replyToken, '❌ 只有管理員可以開關群組功能');
        return;
    }

    const featureMap = {
        '生活': 'life',
        '娛樂': 'entertainment',
        'AI': 'ai',
        '天氣': 'weather',
        '抽圖': 'image',
        '遊戲': 'game'
    };

    const featureCode = featureMap[feature] || feature;

    if (!Object.values(featureMap).includes(featureCode)) {
        await lineUtils.replyText(replyToken, `❌ 無效的功能名稱。可用功能：\n${Object.keys(featureMap).join('、')}`);
        return;
    }

    const result = await authUtils.toggleGroupFeature(groupId, featureCode, enable);
    await lineUtils.replyText(replyToken, result.message);
}

async function handleCheckFeatures(groupId, replyToken) {
    if (!groupId) {
        await lineUtils.replyText(replyToken, '❌ 此指令只能在群組中使用');
        return;
    }
    const config = await authUtils.getGroupConfig(groupId);
    if (!config) {
        await lineUtils.replyText(replyToken, '❌ 尚無設定資料');
        return;
    }

    // Config.features is map { life: true, weather: false ... }
    const featureMapReverse = {
        'life': '生活',
        'entertainment': '娛樂',
        'ai': 'AI',
        'weather': '天氣',
        'image': '抽圖',
        'game': '遊戲'
    };

    const statusList = [];
    for (const [code, name] of Object.entries(featureMapReverse)) {
        const isEnabled = config.features && config.features[code];
        statusList.push(`${name}: ${isEnabled ? '✅ 開啟' : '🔴 關閉'}`);
    }

    await lineUtils.replyText(replyToken, `📊 群組功能狀態：\n\n${statusList.join('\n')}`);
}

// === Group Only: 註冊指令 ===

async function handleRegisterGroup(groupId, userId, code, replyToken) {
    if (!groupId) {
        await lineUtils.replyText(replyToken, '❌ 此指令只能在群組中使用');
        return;
    }
    const cleanCode = code.trim().toUpperCase();
    const result = await authUtils.registerGroup(cleanCode, groupId, userId);
    await lineUtils.replyText(replyToken, result.message);
}

// Feature registration handlers removed.

// === Help Command ===

async function handleHelpCommand(userId, groupId, replyToken, sourceType) {
    const isSuper = authUtils.isSuperAdmin(userId);
    const isAdmin = await authUtils.isAdmin(userId);
    let isAuthorizedGroup = false;
    let isWeatherAuth = false;
    let isRestaurantAuth = false;
    let isTodoAuth = false;
    // Default to true for non-group (Public behavior), or false?
    // User requested "Limited Zone", implies control.
    // If private chat, we can show them.
    let isFinanceAuth = true;
    let isDeliveryAuth = true;

    if (sourceType === 'group' || sourceType === 'room') {
        isAuthorizedGroup = await authUtils.isGroupAuthorized(groupId);
        isWeatherAuth = await authUtils.isWeatherAuthorized(groupId);
        isRestaurantAuth = await authUtils.isRestaurantAuthorized(groupId);
        isTodoAuth = await authUtils.isTodoAuthorized(groupId);

        // Check generic features
        if (isAuthorizedGroup) {
            isFinanceAuth = await authUtils.isFeatureEnabled(groupId, 'finance');
            isDeliveryAuth = await authUtils.isFeatureEnabled(groupId, 'delivery');
        } else {
            // Not authorized group -> likely basic features only? 
            // If group is not registered at all, usually only public features work.
            // But Limited Zone is separate.
            // If group is NOT registered, `isFeatureEnabled` might return true if default is true?
            // But usually we restrict features to registered groups? 
            // "Public features" (Old Finance) worked in unregistered groups.
            // "Limited Zone" might imply restriction.
            // Let's assume if Group is Authorized (Registered), we check flags.
            // If Group is NOT Authorized, we default to... True? (Keep public behavior?)
            // user: "將分期功能...移至此專區,並可獨立...設定".
            // If I disable it by default for unregistered groups, it breaks existing usage.
            // But if I enable it, they can't turn it off (no settings).
            // Let's assume default True.
            isFinanceAuth = true;
            isDeliveryAuth = true;
        }
    }

    const flex = buildHelpFlex(isSuper, isAdmin, isAuthorizedGroup, isWeatherAuth, isRestaurantAuth, isTodoAuth, isFinanceAuth, isDeliveryAuth, sourceType);
    // Flex Message is array
    await lineUtils.replyToLine(replyToken, flex);
}

function buildHelpFlex(isSuper, isAdmin, isAuthorized, isWeather, isRestaurant, isTodo, isFinance, isDelivery, sourceType) {
    const bubbles = [];

    // === Bubble 1: Life Helper (Green) ===
    const lifeBody = [
        { type: "text", text: "newspaper 新聞與資訊", weight: "bold", size: "sm", color: "#1DB446" },
        // Shortened and compacted
        {
            type: "box", layout: "horizontal", margin: "xs", contents: [
                { type: "text", text: "• 油價, 電影, PTT, 科技新聞", size: "xs", color: "#666666", flex: 1, wrap: true }
            ]
        },
        {
            type: "box", layout: "horizontal", margin: "xs", contents: [
                { type: "text", text: "• [星座] (今日/本週/本月)", size: "xs", color: "#666666", flex: 1, wrap: true }
            ]
        },

        { type: "separator", margin: "sm" },
        { type: "text", text: "💱 匯率與物流", weight: "bold", size: "sm", color: "#1DB446", margin: "md" },
        {
            type: "box", layout: "horizontal", margin: "xs", contents: [
                { type: "text", text: "• 匯率 (即時/換算/買)", size: "xs", color: "#666666", flex: 1, wrap: true }
            ]
        },
        {
            type: "box", layout: "horizontal", margin: "xs", contents: [
                { type: "text", text: "• 黑貓 [單號]", size: "xs", color: "#666666", flex: 1, wrap: true }
            ]
        }
    ];

    // Add Weather/Food if authorized (or Show as available capabilities)
    lifeBody.push(
        { type: "separator", margin: "sm" },
        { type: "text", text: "🌤️ 生活查詢 (需開通)", weight: "bold", size: "sm", color: "#1DB446", margin: "md" },
        {
            type: "box", layout: "horizontal", margin: "xs", contents: [
                { type: "text", text: "• 天氣/空氣 [地區]", size: "xs", color: "#666666", flex: 1, wrap: true }
            ]
        },
        {
            type: "box", layout: "horizontal", margin: "xs", contents: [
                { type: "text", text: "• 吃什麼, 餐廳清單, 新增餐廳", size: "xs", color: "#666666", flex: 1, wrap: true }
            ]
        }
    );

    bubbles.push({
        type: "bubble",
        header: {
            type: "box", layout: "vertical", backgroundColor: "#00B900", paddingAll: "15px",
            contents: [{ type: "text", text: "🛠️ 生活小幫手", weight: "bold", color: "#FFFFFF", size: "lg" }]
        },
        body: { type: "box", layout: "vertical", contents: lifeBody, paddingAll: "15px" }
    });

    // === Bubble 2: Entertainment (Red) ===
    if (isAuthorized || isSuper) {
        const entBody = [
            { type: "text", text: "🗣️ 互動與AI", weight: "bold", size: "sm", color: "#FF334B" },
            {
                type: "box", layout: "horizontal", margin: "xs", contents: [
                    { type: "text", text: "• 講台語 [詞], 狂標 @User [數]", size: "xs", color: "#666666", flex: 1, wrap: true }
                ]
            },
            {
                type: "box", layout: "horizontal", margin: "xs", contents: [
                    { type: "text", text: "• AI [問], 幫我選 [A] [B]", size: "xs", color: "#666666", flex: 1, wrap: true }
                ]
            },

            { type: "separator", margin: "sm" },
            { type: "text", text: "🎲 趣味遊戲", weight: "bold", size: "sm", color: "#FF334B", margin: "md" },
            {
                type: "box", layout: "horizontal", margin: "xs", contents: [
                    { type: "text", text: "• 剪刀/石頭/布", size: "xs", color: "#666666", flex: 1, wrap: true }
                ]
            },
            {
                type: "box", layout: "horizontal", margin: "xs", contents: [
                    { type: "text", text: "• 抽圖 (黑絲/白絲/番號/關鍵字)", size: "xs", color: "#666666", flex: 1, wrap: true }
                ]
            },

            { type: "separator", margin: "sm" },
            { type: "text", text: "🏆 排行榜", weight: "bold", size: "sm", color: "#FF334B", margin: "md" },
            {
                type: "box", layout: "horizontal", margin: "xs", contents: [
                    { type: "text", text: "• 排行榜, 我的排名", size: "xs", color: "#666666", flex: 1, wrap: true }
                ]
            }
        ];

        bubbles.push({
            type: "bubble",
            header: {
                type: "box", layout: "vertical", backgroundColor: "#FF334B", paddingAll: "15px",
                contents: [{ type: "text", text: "🎮 娛樂 & 互動", weight: "bold", color: "#FFFFFF", size: "lg" }]
            },
            body: { type: "box", layout: "vertical", contents: entBody, paddingAll: "15px" }
        });
    }

    // === Bubble 3: Admin Zone (Black) ===
    if (isAdmin || isSuper) {
        const adminBody = [
            { type: "text", text: "⚙️ 群組管理", weight: "bold", size: "sm", color: "#333333" },
            {
                type: "box", layout: "horizontal", margin: "xs", contents: [
                    { type: "text", text: "• 群組設定 (功能開關面板)", size: "xs", color: "#666666", flex: 1, wrap: true }
                ]
            },
            {
                type: "box", layout: "horizontal", margin: "xs", contents: [
                    { type: "text", text: "• 註冊 [代碼]", size: "xs", color: "#666666", flex: 1, wrap: true }
                ]
            },

            { type: "separator", margin: "sm" },
            { type: "text", text: "📝 待辦與記帳 (限定)", weight: "bold", size: "sm", color: "#333333", margin: "md" },
            {
                type: "box", layout: "horizontal", margin: "xs", contents: [
                    { type: "text", text: "• 待辦 (清單/新增/完成/刪除)", size: "xs", color: "#666666", flex: 1, wrap: true }
                ]
            },
            {
                type: "box", layout: "horizontal", margin: "xs", contents: [
                    { type: "text", text: "• 分唄/銀角/刷卡 [金額]", size: "xs", color: "#666666", flex: 1, wrap: true }
                ]
            }
        ];

        if (isSuper) {
            adminBody.push(
                { type: "separator", margin: "sm" },
                { type: "text", text: "🔑 超級管理員", weight: "bold", size: "sm", color: "#FF0000", margin: "md" },
                {
                    type: "box", layout: "horizontal", margin: "xs", contents: [
                        { type: "text", text: "• 抽獎, 產生註冊碼, 管理員列表", size: "xs", color: "#666666", flex: 1, wrap: true }
                    ]
                }
            );
        }

        adminBody.push(
            { type: "separator", margin: "md" },
            {
                type: "button",
                action: { type: "message", label: "📖 完整系統手冊", text: "系統手冊" },
                style: "secondary",
                height: "sm",
                color: "#000000",
                margin: "md"
            }
        );

        bubbles.push({
            type: "bubble",
            header: {
                type: "box", layout: "vertical", backgroundColor: "#333333", paddingAll: "15px",
                contents: [{ type: "text", text: "🛡️ 管理員專區", weight: "bold", color: "#FFFFFF", size: "lg" }]
            },
            body: { type: "box", layout: "vertical", contents: adminBody, paddingAll: "15px" }
        });
    }

    return [{ type: "flex", altText: "使用說明", contents: { type: "carousel", contents: bubbles } }];
}

async function handleShowManual(replyToken) {
    const text = `📖 LINE Bot 系統指令手冊

【一般指令】
• 油價, 電影, 科技新聞, 蘋果新聞, PTT熱門
• [星座] (今日/本週/本月) (例如: 獅子, 牡羊 本週)
• 匯率 100 JPY, 美金 100, 買日幣 1000
• 分唄/銀角/刷卡 [金額]

【待辦 (需開通)】
• 待辦, 待辦 [事項], 待辦 !高 [事項]
• 完成/刪除 [編號], 抽

【餐廳 (需開通)】
• 吃什麼 [縣市], 吃什麼 附近
• 餐廳清單 (分縣市), 刪除餐廳 [名]
• 新增餐廳 [縣市] [名]

【天氣 (需開通)】
• 天氣/空氣 [地區]
• 查詢黑貓 [單號] (需開通)

【娛樂 (需授權)】
• 幫我選 [A] [B]
• 剪刀/石頭/布, 抽獎 [Key] [品] [人]
• 講台語 [字] (限Super/Auth)

【管理員】
• 註冊 [碼] (群組開通)
• 開啟/關閉 [功能] (例: 開啟 天氣)
• 產生註冊碼 (Super Only)`;

    await lineUtils.replyText(replyToken, text);
}


async function handleBlacklistCommand(context) {
    const { replyToken, messageObject, userId } = context;
    // messageObject is expected to be passed from index.js context
    const mentionObj = messageObject && messageObject.mention;

    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 Tag 要關進小黑屋的對象');
        return;
    }

    const targets = mentionObj.mentionees;
    const results = [];

    for (const target of targets) {
        if (!target.userId) continue;
        const res = await authUtils.blacklistUser(target.userId, 'Admin Command', userId);
        results.push(res.message);
    }

    await lineUtils.replyText(replyToken, results.join('\n'));
}


module.exports = {
    handleGenerateCode,
    handleToggleFeature,
    handleRegisterGroup,
    handleHelpCommand,
    handleCheckFeatures,
    handleShowManual,
    handleBlacklistCommand,
    handleAdminDashboard,
    handleSimulateGeneralHelp
};

// === Test: Simulate General User Help ===
async function handleSimulateGeneralHelp(userId, groupId, replyToken, sourceType) {
    // Force Non-Admin
    const isSuper = false;
    const isAdmin = false;

    let isAuthorizedGroup = false;
    let isWeatherAuth = false;
    let isRestaurantAuth = false;
    let isTodoAuth = false;

    if (sourceType === 'group' || sourceType === 'room') {
        isAuthorizedGroup = await authUtils.isGroupAuthorized(groupId);
        isWeatherAuth = await authUtils.isWeatherAuthorized(groupId);
        isRestaurantAuth = await authUtils.isRestaurantAuthorized(groupId);
        isTodoAuth = await authUtils.isTodoAuthorized(groupId);
    }

    const flex = buildHelpFlex(isSuper, isAdmin, isAuthorizedGroup, isWeatherAuth, isRestaurantAuth, isTodoAuth, sourceType);
    await lineUtils.replyToLine(replyToken, flex);
}

// === Admin Dashboard ===

async function handleAdminDashboard(userId, replyToken) {
    if (!authUtils.isSuperAdmin(userId)) {
        // Optional: Reply no permission or just ignore
        return;
    }
    const flex = buildAdminDashboardFlex();
    await lineUtils.replyToLine(replyToken, [{ type: "flex", altText: "管理員後台", contents: flex }]);
}

function buildAdminDashboardFlex() {
    return {
        type: "bubble",
        size: "mega",
        header: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "text",
                    text: "🛡️ 超級管理員後台",
                    weight: "bold",
                    color: "#FFFFFF",
                    size: "xl"
                },
                {
                    type: "text",
                    text: "Super Admin Control Panel",
                    color: "#DDDDDD",
                    size: "xxs"
                }
            ],
            backgroundColor: "#CC0000",
            paddingAll: "20px"
        },
        body: {
            type: "box",
            layout: "vertical",
            contents: [
                // === 區域標題: 註冊碼 ===
                {
                    type: "text",
                    text: "🔑 註冊碼生成",
                    weight: "bold",
                    size: "sm",
                    color: "#888888",
                    margin: "md"
                },
                { type: "separator", margin: "sm" },
                // === 按鈕群組 ===
                {
                    type: "box",
                    layout: "horizontal",
                    margin: "md",
                    spacing: "md",
                    contents: [
                        {
                            type: "button",
                            action: { type: "message", label: "📋 群組代碼", text: "產生註冊碼" },
                            style: "secondary",
                            height: "sm",
                            color: "#666666" // 灰色按鈕
                        }
                    ]
                },

                // === 區域標題: 系統管理 ===
                {
                    type: "text",
                    text: "⚙️ 系統管理",
                    weight: "bold",
                    size: "sm",
                    color: "#888888",
                    margin: "xl"
                },
                { type: "separator", margin: "sm" },
                {
                    type: "button",
                    action: { type: "message", label: "👥 查看管理員列表", text: "管理員列表" },
                    style: "primary", // 主要按鈕
                    margin: "md",
                    color: "#333333"
                }
            ]
        }
    };
}
