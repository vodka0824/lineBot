const flexUtils = require('../utils/flex');
const { SYSTEM_MANUAL_TEXT, HELP_MENU_CONFIG } = require('../config/manual');

// Copy of buildHelpSection from handlers/system.js
function buildHelpSection(title, color, items, marginTop = "sm") {
    const contents = [
        flexUtils.createText({ text: title, weight: "bold", size: "sm", color, margin: marginTop })
    ];
    items.forEach(item => {
        contents.push(flexUtils.createText({ text: item, size: "xs", margin: "xs", color: "#666666" }));
    });
    return contents;
}

// Copy of buildHelpFlex from handlers/system.js
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
        size: "micro",
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
            size: "micro",
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
            size: "micro",
            header: flexUtils.createHeader(adminConfig.title, "", adminConfig.color),
            body: flexUtils.createBox("vertical", adminContents, { paddingAll: "10px" })
        }));
    }

    return flexUtils.createFlexMessage("使用說明", flexUtils.createCarousel(bubbles));
}

// Ensure createFlexMessage is used
console.log('--- Generating Flex Message JSON ---');
try {
    const json = buildHelpFlex(true, true, true, true, true, true, true, true, 'user');
    console.log(JSON.stringify(json, null, 2));
} catch (e) {
    console.error('Error generating JSON:', e);
}
