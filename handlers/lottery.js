/**
 * 抽獎系統模組 (Stateless & Flex UI)
 */
const { db, Firestore } = require('../utils/firestore');
const authUtils = require('../utils/auth');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const { COLORS } = flexUtils;

// 1. 開始抽獎 (Write to DB & Reply Flex)
async function startLottery(replyToken, groupId, userId, keyword, prize, winnersStr, durationStr) {
    // Permission Check
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 只有超級管理員可以使用此功能');
        return;
    }

    const minutes = durationStr ? parseInt(durationStr, 10) : 3; // Default 3 mins
    const winners = parseInt(winnersStr) || 1;

    if (minutes < 1 || minutes > 60) {
        await lineUtils.replyText(replyToken, '❌ 時間必須在 1 到 60 分鐘之間');
        return;
    }

    if (!groupId) {
        await lineUtils.replyText(replyToken, '❌ 抽獎功能僅限於群組內使用');
        return;
    }

    const now = Date.now();
    const endTime = now + (minutes * 60 * 1000);

    const lotteryData = {
        active: true,
        keyword: keyword,
        prize: prize,
        winners: winners,
        startTime: now,
        endTime: endTime,
        createdBy: userId,
        participants: [],
        groupId: groupId // Store groupId for ref
    };

    try {
        // Atomic Set
        await db.collection('lotteries').doc(groupId).set(lotteryData);

        // Build Flex Message
        const bubble = flexUtils.createBubble({
            size: 'kilo',
            header: flexUtils.createHeader('🎉 抽獎活動開始！', '', COLORS.PRIMARY),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `🎁 獎品：${prize}`, size: 'xl', weight: 'bold', color: COLORS.DARK_GRAY, wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `🔑 關鍵字：${keyword}`, size: 'md', color: COLORS.PRIMARY, weight: 'bold' }),
                    flexUtils.createText({ text: `⏱️ 時間：${minutes} 分鐘`, size: 'sm', color: COLORS.GRAY }),
                    flexUtils.createText({ text: `🏆 名額：${winners} 人`, size: 'sm', color: COLORS.GRAY })
                ], { margin: 'md', spacing: 'sm' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: '點擊下方按鈕或輸入關鍵字參加！', size: 'xs', color: COLORS.GRAY, margin: 'md', align: 'center' })
            ], { paddingAll: '20px' }),
            footer: flexUtils.createBox('vertical', [
                flexUtils.createButton({
                    action: {
                        type: 'message',
                        label: '立即參加 🙋',
                        text: keyword
                    },
                    style: 'primary',
                    color: COLORS.PRIMARY
                })
            ])
        });

        await lineUtils.replyFlex(replyToken, `抽獎開始：${prize}`, bubble);

        // Auto-End Timer (Best Effort)
        setTimeout(async () => {
            await drawLottery(groupId, null); // Null replyToken means push message
        }, minutes * 60 * 1000);

    } catch (error) {
        console.error('[Lottery] Start Error:', error);
        if (error.response && error.response.data) {
            console.error('[Lottery] LINE API Error Details:', JSON.stringify(error.response.data, null, 2));
        }
        await lineUtils.replyText(replyToken, '❌ 發起抽獎失敗 (請檢查後台 Log)');
    }
}

// ... joinLottery ...

// ... drawLottery ... (No change logic, just exposed via handleManualDraw)

// 4. 手動開獎 (Admin Command)
async function handleManualDraw(replyToken, groupId, userId) {
    // Permission Check
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 只有超級管理員可以使用此功能');
        return;
    }
    await drawLottery(groupId, replyToken);
}

// 5. 取得狀態 (Helper)
async function getLotteryStatus(groupId) {
    try {
        const doc = await db.collection('lotteries').doc(groupId).get();
        if (!doc.exists || !doc.data().active) return null;

        const data = doc.data();
        const now = Date.now();
        const isExpired = now > data.endTime;

        return {
            keyword: data.keyword,
            isExpired: isExpired,
            active: data.active
        };
    } catch (e) {
        return null;
    }
}

module.exports = {
    handleStartLottery: startLottery,
    joinLottery,
    handleManualDraw,
    getLotteryStatus
};
