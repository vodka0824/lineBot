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

    // === 1. 一般功能 (General) ===
    const generalBody = [];

    // [資訊與情報]
    generalBody.push(
        { type: "text", text: "newspaper 資訊與情報", weight: "bold", size: "sm", color: "#1DB446" },
        { type: "text", text: "• 油價、電影、[星座] (今日/週/月)", size: "xs", margin: "xs", color: "#666666" },
        { type: "text", text: "• 蘋果/科技新聞、PTT熱門", size: "xs", margin: "xs", color: "#666666" },
        { type: "text", text: "• 匯率 (即時/換算/買)", size: "xs", margin: "xs", color: "#666666" }
    );

    // [生活工具] (Weather, Restaurant, Delivery)
    if (isWeather || isRestaurant || isDelivery || isSuper) {
        generalBody.push({ type: "separator", margin: "md" });
        generalBody.push({ type: "text", text: "🛠️ 生活工具", weight: "bold", size: "sm", color: "#0099FF", margin: "md" });

        if (isWeather || isSuper) {
            generalBody.push({ type: "text", text: "• 天氣/空氣 [地區]", size: "xs", margin: "xs", color: "#666666" });
        }
        if (isRestaurant || isSuper) {
            generalBody.push({ type: "text", text: "• 吃什麼 [縣市]、附近餐廳", size: "xs", margin: "xs", color: "#666666" });
            generalBody.push({ type: "text", text: "• 餐廳清單、新增/刪除餐廳", size: "xs", margin: "xs", color: "#666666" });
        }
        if (isDelivery || isSuper) {
            generalBody.push({ type: "text", text: "• 黑貓 [單號]", size: "xs", margin: "xs", color: "#666666" });
        }
    }

    // [娛樂與互動]
    if (isAuthorized || isSuper) {
        generalBody.push({ type: "separator", margin: "md" });
        generalBody.push({ type: "text", text: "🎮 娛樂與互動", weight: "bold", size: "sm", color: "#FF334B", margin: "md" });
        generalBody.push({ type: "text", text: "• 抽圖 (黑絲/白絲/福利/番號)", size: "xs", margin: "xs", color: "#666666" });
        generalBody.push({ type: "text", text: "• 講台語、狂標、幫我選", size: "xs", margin: "xs", color: "#666666" });
        generalBody.push({ type: "text", text: "• 剪刀/石頭/布、抽獎", size: "xs", margin: "xs", color: "#666666" });
        generalBody.push({ type: "text", text: "• 排行榜、我的排名", size: "xs", margin: "xs", color: "#666666" });
    }

    bubbles.push({
        type: "bubble",
        header: { type: "box", layout: "vertical", contents: [{ type: "text", text: "🌈 功能選單", weight: "bold", color: "#FFFFFF", size: "lg" }], backgroundColor: "#00B900", paddingAll: "15px" },
        body: { type: "box", layout: "vertical", contents: generalBody, paddingAll: "15px" }
    });

    // === 2. 管理員專區 (Admin Only) ===
    if (isAdmin || isSuper) {
        const adminBody = [];

        // 群組管理
        adminBody.push(
            { type: "text", text: "⚙️ 群組管理", weight: "bold", size: "sm", color: "#333333" },
            { type: "text", text: "• 註冊 [代碼]、群組設定", size: "xs", margin: "xs", color: "#666666" },
            { type: "text", text: "• 開啟/關閉 [功能]", size: "xs", margin: "xs", color: "#666666" },
            { type: "text", text: "• [小黑屋] @User (黑名單)", size: "xs", margin: "xs", color: "#666666" }
        );

        // 進階功能 (Todo/Finance moved here)
        adminBody.push({ type: "separator", margin: "md" });
        adminBody.push({ type: "text", text: "💼 進階功能 (待辦/支付)", weight: "bold", size: "sm", color: "#88AA00", margin: "md" });

        if (isTodo || isSuper) {
            adminBody.push({ type: "text", text: "• 待辦 [事項]、完成/刪除 [ID]", size: "xs", margin: "xs", color: "#666666" });
        }
        if (isFinance || isSuper) {
            adminBody.push({ type: "text", text: "• 分唄/銀角/刷卡 [金額]", size: "xs", margin: "xs", color: "#666666" });
        }

        // 超級管理員
        if (isSuper) {
            adminBody.push({ type: "separator", margin: "md" });
            adminBody.push({ type: "text", text: "🔑 Root Control", weight: "bold", size: "sm", color: "#CC0000", margin: "md" });
            adminBody.push({ type: "text", text: "• 產生註冊碼、管理員列表", size: "xs", margin: "xs", color: "#666666" });
            adminBody.push({ type: "text", text: "• 抽獎 [Key] [品] [人]", size: "xs", margin: "xs", color: "#666666" });

            adminBody.push(
                { type: "separator", margin: "md" },
                {
                    type: "button",
                    action: { type: "message", label: "完整系統手冊", text: "系統手冊" },
                    style: "secondary",
                    height: "sm",
                    margin: "md"
                }
            );
        }

        bubbles.push({
            type: "bubble",
            header: { type: "box", layout: "vertical", contents: [{ type: "text", text: "🛡️ 管理員專區", weight: "bold", color: "#FFFFFF", size: "lg" }], backgroundColor: "#333333", paddingAll: "15px" },
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
