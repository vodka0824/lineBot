/**
 * 系統/管理員功能模組
 */
const authUtils = require('../utils/auth');
const lineUtils = require('../utils/line');
// Updated Manual Layout

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
    const config = authUtils.getFeatureToggles(groupId);
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
    await lineUtils.replyToLine(replyToken, [flex]);
}

const flexUtils = require('../utils/flex');
const { SYSTEM_MANUAL_TEXT, HELP_MENU_CONFIG } = require('../config/manual');

function buildHelpSection(title, color, items, marginTop = "sm") {
    const contents = [
        flexUtils.createText({ text: title, weight: "bold", size: "sm", color, margin: marginTop })
    ];
    items.forEach(item => {
        contents.push(flexUtils.createText({ text: item, size: "xs", margin: "xs", color: "#666666" }));
    });
    return contents;
}

function buildHelpFlex(isSuper, isAdmin, isAuthorized, isWeather, isRestaurant, isTodo, isFinance, isDelivery, sourceType) {
    const bubbles = [];

    // 1. Life Helper
    const lifeConfig = HELP_MENU_CONFIG.life;
    const lifeContents = [];

    // Base Sections
    lifeConfig.sections.forEach((sec, idx) => {
        if (idx > 0) lifeContents.push(flexUtils.createSeparator("sm"));
        lifeContents.push(...buildHelpSection(sec.title, sec.color, sec.items, idx > 0 ? "sm" : "none"));
    });

    // Extra Features
    if (isWeather || isSuper) {
        lifeContents.push(flexUtils.createSeparator("sm"));
        const sec = lifeConfig.extraFeatures.weather;
        lifeContents.push(...buildHelpSection(sec.title, sec.color, sec.items, "sm"));
    }
    if (isRestaurant || isSuper) {
        lifeContents.push(flexUtils.createSeparator("sm"));
        const sec = lifeConfig.extraFeatures.restaurant;
        lifeContents.push(...buildHelpSection(sec.title, sec.color, sec.items, "sm"));
    }
    if (isDelivery || isSuper) {
        lifeContents.push(flexUtils.createSeparator("sm"));
        const sec = lifeConfig.extraFeatures.delivery;
        lifeContents.push(...buildHelpSection(sec.title, sec.color, sec.items, "sm"));
    }

    bubbles.push(flexUtils.createBubble({
        size: "kilo",
        header: flexUtils.createHeader(lifeConfig.title, "", lifeConfig.color),
        body: flexUtils.createBox("vertical", lifeContents, { paddingAll: "10px" })
    }));

    // 2. Entertainment
    if (isAuthorized || isSuper) {
        const entConfig = HELP_MENU_CONFIG.entertainment;
        const entContents = [];
        entConfig.sections.forEach((sec, idx) => {
            if (idx > 0) entContents.push(flexUtils.createSeparator("sm"));
            entContents.push(...buildHelpSection(sec.title, sec.color, sec.items, idx > 0 ? "sm" : "none"));
        });

        bubbles.push(flexUtils.createBubble({
            size: "kilo",
            header: flexUtils.createHeader(entConfig.title, "", entConfig.color),
            body: flexUtils.createBox("vertical", entContents, { paddingAll: "10px" })
        }));
    }

    // 3. Admin Zone
    if ((isAdmin || isSuper) && sourceType === 'user') {
        const adminConfig = HELP_MENU_CONFIG.admin;
        const adminContents = [];

        // Render Group Mgmt, Todo, Payment, Blacklist
        adminConfig.sections.forEach((sec, idx) => {
            if (idx > 0) adminContents.push(flexUtils.createSeparator("sm"));
            adminContents.push(...buildHelpSection(sec.title, sec.color, sec.items, idx > 0 ? "sm" : "none"));
        });

        // Super Admin Extras
        if (isSuper) {
            adminContents.push(flexUtils.createSeparator("md"));
            adminContents.push(
                flexUtils.createText({ text: "🔑 超級管理員", weight: "bold", size: "sm", color: "#FF0000", margin: "sm" }),
                flexUtils.createText({ text: "• 抽獎 [Key] [品] [人]", size: "xs", margin: "xs", color: "#666666" }),
                flexUtils.createText({ text: "• 產生註冊碼, 管理員列表", size: "xs", margin: "xs", color: "#666666" }),
                flexUtils.createText({ text: "• 新增/刪除管理員 [UserID]", size: "xs", margin: "xs", color: "#666666" }),
                flexUtils.createSeparator("sm"),
                {
                    type: "button",
                    action: { type: "message", label: "📖 完整系統手冊", text: "系統手冊" },
                    style: "link",
                    height: "sm",
                    color: "#000000"
                }
            );
        }

        bubbles.push(flexUtils.createBubble({
            size: "kilo",
            header: flexUtils.createHeader(adminConfig.title, "", adminConfig.color),
            body: flexUtils.createBox("vertical", adminContents, { paddingAll: "10px" })
        }));
    }

    return flexUtils.createFlexMessage("使用說明", flexUtils.createCarousel(bubbles));
}

async function handleShowManual(replyToken) {
    await lineUtils.replyText(replyToken, SYSTEM_MANUAL_TEXT);
}


async function handleBlacklistCommand(context) {
    const { replyToken, messageObject, userId } = context;
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

async function handleUnblacklistCommand(context) {
    const { replyToken, messageObject } = context;
    const mentionObj = messageObject && messageObject.mention;

    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 Tag 要解除黑名單的對象');
        return;
    }

    const targets = mentionObj.mentionees;
    const results = [];

    for (const target of targets) {
        if (!target.userId) continue;
        const res = await authUtils.unblacklistUser(target.userId);
        results.push(res.message);
    }

    await lineUtils.replyText(replyToken, results.join('\n'));
}

async function handleListBlacklist(replyToken) {
    const list = await authUtils.getBlacklist();
    if (list.length === 0) {
        await lineUtils.replyText(replyToken, '🟢 目前沒有黑名單使用者');
        return;
    }

    const textList = list.map((u, i) => `${i + 1}. ${u.userId} (${u.reason || '無原因'})`).join('\n');
    await lineUtils.replyText(replyToken, `🚫 黑名單列表 (${list.length}人)：\n\n${textList}`);
}


module.exports = {
    handleGenerateCode,
    handleToggleFeature,
    handleRegisterGroup,
    handleHelpCommand,
    handleCheckFeatures,
    handleShowManual,
    handleBlacklistCommand,
    handleUnblacklistCommand,
    handleListBlacklist,
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

    const flex = buildHelpFlex(isSuper, isAdmin, isAuthorizedGroup, isWeatherAuth, isRestaurantAuth, isTodoAuth, true, true, sourceType);
    await lineUtils.replyToLine(replyToken, [flex]);
}

// === Admin Dashboard ===

async function handleAdminDashboard(userId, replyToken) {
    if (!authUtils.isSuperAdmin(userId)) {
        return;
    }
    const flex = buildAdminDashboardFlex();
    await lineUtils.replyToLine(replyToken, [flex]);
}

function buildAdminDashboardFlex() {
    return flexUtils.createFlexMessage("管理員後台",
        flexUtils.createBubble({
            size: "mega",
            header: flexUtils.createHeader("🛡️ 超級管理員後台", "Super Admin Control Panel", "#CC0000"),
            body: flexUtils.createBox("vertical", [
                // 1. Generate Code
                flexUtils.createText({ text: "🔑 註冊碼生成", weight: "bold", size: "sm", color: "#888888", margin: "md" }),
                flexUtils.createSeparator("sm"),
                flexUtils.createBox("horizontal", [
                    {
                        type: "button",
                        action: { type: "message", label: "📋 群組代碼", text: "產生註冊碼" },
                        style: "secondary", height: "sm", color: "#666666"
                    }
                ], { margin: "md", spacing: "md" }),

                // 2. System Mgmt
                flexUtils.createText({ text: "⚙️ 系統管理", weight: "bold", size: "sm", color: "#888888", margin: "xl" }),
                flexUtils.createSeparator("sm"),
                {
                    type: "button",
                    action: { type: "message", label: "👥 查看管理員列表", text: "管理員列表" },
                    style: "primary", margin: "md", color: "#333333"
                }
            ])
        })
    );
}
