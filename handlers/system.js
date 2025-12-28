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

async function handleGenerateWeatherCode(userId, replyToken) {
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 您沒有權限執行此操作');
        return;
    }
    const code = await authUtils.generateWeatherCode();
    await lineUtils.replyText(replyToken, `✅ 天氣功能註冊碼：\n${code}\n\n群組指令：\n註冊天氣 ${code}`);
}

async function handleGenerateTodoCode(userId, replyToken) {
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 您沒有權限執行此操作');
        return;
    }
    const code = await authUtils.generateTodoCode();
    await lineUtils.replyText(replyToken, `✅ 待辦功能註冊碼：\n${code}\n\n群組指令：\n註冊代辦 ${code}`);
}

async function handleGenerateRestaurantCode(userId, replyToken) {
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 您沒有權限執行此操作');
        return;
    }
    const code = await authUtils.generateRestaurantCode();
    await lineUtils.replyText(replyToken, `✅ 餐廳功能註冊碼：\n${code}\n\n群組指令：\n註冊餐廳 ${code}`);
}

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

async function handleRegisterWeather(groupId, userId, code, replyToken) {
    if (!groupId) {
        await lineUtils.replyText(replyToken, '❌ 此指令只能在群組中使用');
        return;
    }
    const cleanCode = code.trim().toUpperCase();
    const result = await authUtils.useWeatherCode(cleanCode, groupId, userId);
    await lineUtils.replyText(replyToken, result.message);
}

// === Help Command ===

async function handleHelpCommand(userId, groupId, replyToken, sourceType) {
    const isSuper = authUtils.isSuperAdmin(userId);
    const isAdmin = await authUtils.isAdmin(userId);
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
    // Flex Message is array
    await lineUtils.replyToLine(replyToken, flex);
}

function buildHelpFlex(isSuper, isAdmin, isAuthorized, isWeather, isRestaurant, isTodo, sourceType) {
    const bubbles = [];

    // 1. 公開指令 (所有人可見)
    const publicBody = [
        { type: "text", text: "💰 財務計算", weight: "bold", size: "sm", color: "#1DB446" },
        { type: "text", text: "• 分唄[金額] (例: 分唄30000)", size: "xs", margin: "xs", color: "#666666" },
        { type: "text", text: "• 銀角[金額] (例: 銀角20000)", size: "xs", margin: "xs", color: "#666666" },
        { type: "text", text: "• 刷卡[金額] (例: 刷卡15000)", size: "xs", margin: "xs", color: "#666666" },
        { type: "separator", margin: "md" },
        { type: "text", text: "📰 生活資訊", weight: "bold", size: "sm", color: "#1DB446", margin: "md" },
        { type: "text", text: "• 油價、電影、蘋果新聞", size: "xs", margin: "xs", color: "#666666" },
        { type: "text", text: "• 科技新聞、熱門廢文、PTT熱門", size: "xs", margin: "xs", color: "#666666" },
    ];

    // 如果是DM或是已授權群組，顯示更多
    if (sourceType === 'user' || isAuthorized || isSuper) {
        // (生活資訊實際上DM可用，已包含在上面)
        // 這裡可以加黑貓?
        publicBody.push(
            { type: "text", text: "• 黑貓[單號] (查詢物流)", size: "xs", margin: "xs", color: "#666666" }
        );
    }

    bubbles.push({
        type: "bubble",
        header: { type: "box", layout: "vertical", contents: [{ type: "text", text: "📋 常用指令", weight: "bold", color: "#FFFFFF", size: "lg" }], backgroundColor: "#00B900" },
        body: { type: "box", layout: "vertical", contents: publicBody }
    });

    // 2. 娛樂/AI (授權群組 或 SuperAdmin)
    if (isAuthorized || isSuper) {
        bubbles.push({
            type: "bubble",
            header: { type: "box", layout: "vertical", contents: [{ type: "text", text: "🎮 娛樂 & AI", weight: "bold", color: "#FFFFFF", size: "lg" }], backgroundColor: "#FF334B" },
            body: {
                type: "box", layout: "vertical", contents: [
                    { type: "text", text: "🤖 AI 助理", weight: "bold", size: "sm", color: "#FF334B" },
                    { type: "text", text: "• AI [問題] (詢問 Gemini)", size: "xs", margin: "xs", color: "#666666" },
                    { type: "text", text: "• 幫我選 [選項1] [選項2]...", size: "xs", margin: "xs", color: "#666666" },
                    { type: "separator", margin: "md" },
                    { type: "text", text: "🎲 娛樂功能", weight: "bold", size: "sm", color: "#FF334B", margin: "md" },
                    { type: "text", text: "• 剪刀/石頭/布, 抽圖/美女/帥哥", size: "xs", margin: "xs", color: "#666666" },
                    { type: "text", text: "• 今晚看什麼, 番號推薦", size: "xs", margin: "xs", color: "#666666" },
                ]
            }
        });
    }

    // 3. 特殊授權功能 (天氣, 餐廳, 待辦)
    const specialBody = [];
    if (isWeather || isSuper) {
        specialBody.push(
            { type: "text", text: "🌤️ 天氣查詢", weight: "bold", size: "sm", color: "#33AAFF" },
            { type: "text", text: "• 天氣 [地區] (例: 天氣 台北)", size: "xs", margin: "xs", color: "#666666" }
        );
    }
    if (isRestaurant || isSuper) {
        if (specialBody.length > 0) specialBody.push({ type: "separator", margin: "md" });
        specialBody.push(
            { type: "text", text: "🍽️ 美食搜尋", weight: "bold", size: "sm", color: "#FF8800", margin: specialBody.length ? "md" : "none" },
            { type: "text", text: "• 附近餐廳 (或 附近美食)", size: "xs", margin: "xs", color: "#666666" }
        );
    }
    if (isTodo || isSuper) {
        if (specialBody.length > 0) specialBody.push({ type: "separator", margin: "md" });
        specialBody.push(
            { type: "text", text: "📝 待辦事項", weight: "bold", size: "sm", color: "#AA33FF", margin: specialBody.length ? "md" : "none" },
            { type: "text", text: "• todo [事項] (新增)", size: "xs", margin: "xs", color: "#666666" },
            { type: "text", text: "• list (清單), done [編號] (完成)", size: "xs", margin: "xs", color: "#666666" },
            { type: "text", text: "• del [編號], clear (清空)", size: "xs", margin: "xs", color: "#666666" }
        );
    }

    if (specialBody.length > 0) {
        bubbles.push({
            type: "bubble",
            header: { type: "box", layout: "vertical", contents: [{ type: "text", text: "✨ 進階功能", weight: "bold", color: "#FFFFFF", size: "lg" }], backgroundColor: "#33AAFF" },
            body: { type: "box", layout: "vertical", contents: specialBody }
        });
    }

    // 4. 管理員專區 (Admin Only)
    if (isAdmin || isSuper) {
        const adminBody = [
            { type: "text", text: "⚙️ 群組管理", weight: "bold", size: "sm", color: "#666666" },
            { type: "text", text: "• 註冊 [代碼] (啟用群組)", size: "xs", margin: "xs", color: "#666666" },
            { type: "text", text: "• 開啟/關閉 [功能] (例: 關閉 AI)", size: "xs", margin: "xs", color: "#666666" },
        ];

        if (isSuper) {
            adminBody.push(
                { type: "separator", margin: "md" },
                { type: "text", text: "🔑 超級管理員", weight: "bold", size: "sm", color: "#FF0000", margin: "md" },
                { type: "text", text: "• 產生註冊碼 (群組/天氣/餐廳/待辦)", size: "xs", margin: "xs", color: "#666666" },
                { type: "text", text: "• 新增/刪除管理員 [UserID]", size: "xs", margin: "xs", color: "#666666" }
            );
        }

        bubbles.push({
            type: "bubble",
            header: { type: "box", layout: "vertical", contents: [{ type: "text", text: "🛡️ 管理員專區", weight: "bold", color: "#FFFFFF", size: "lg" }], backgroundColor: "#333333" },
            body: { type: "box", layout: "vertical", contents: adminBody }
        });
    }

    return [{ type: "flex", altText: "使用說明", contents: { type: "carousel", contents: bubbles } }];
}


module.exports = {
    handleGenerateCode,
    handleGenerateWeatherCode,
    handleGenerateTodoCode,
    handleGenerateRestaurantCode,
    handleToggleFeature,
    handleRegisterGroup,
    handleRegisterWeather,
    handleHelpCommand
};
