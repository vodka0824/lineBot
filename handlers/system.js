/**
 * 系統/管理員功能模組
 */
const authUtils = require('../utils/auth');
const lineUtils = require('../utils/line');

// === 產生註冊碼 (Admin Only) ===
async function handleGenerateCode(userId, replyToken) {
    // 雙重檢查權限 (雖然 index.js 會擋，但這裡再檢查一次更安全)
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 您沒有權限執行此操作');
        return;
    }

    try {
        const code = await authUtils.createRegistrationCode(userId);
        await lineUtils.replyText(replyToken, `🔑 新註冊碼：${code}\n\n請在群組中輸入「註冊 ${code}」來啟用功能。`);
    } catch (error) {
        console.error('[System] Generate Code Error:', error);
        await lineUtils.replyText(replyToken, '❌產生註冊碼失敗，請查看 Log');
    }
}

// === 群組註冊 (Group Only) ===
async function handleRegisterGroup(groupId, userId, code, replyToken) {
    if (!groupId) {
        await lineUtils.replyText(replyToken, '❌ 此指令只能在群組中使用');
        return;
    }

    // 清理代碼 (去除空白、轉大寫)
    const cleanCode = code.trim().toUpperCase();

    try {
        const result = await authUtils.registerGroup(cleanCode, groupId, userId);
        await lineUtils.replyText(replyToken, result.message);
    } catch (error) {
        console.error('[System] Register Group Error:', error);
        await lineUtils.replyText(replyToken, '❌ 註冊失敗，系統發生錯誤');
    }
}

module.exports = {
    handleGenerateCode,
    handleRegisterGroup
};
