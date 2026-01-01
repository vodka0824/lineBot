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

// 2. 參加抽獎 (Stateless Check)
async function joinLottery(groupId, userId) {
    const docRef = db.collection('lotteries').doc(groupId);

    try {
        return await db.runTransaction(async (t) => {
            const doc = await t.get(docRef);
            if (!doc.exists || !doc.data().active) {
                return { success: false, message: '❌ 目前沒有進行中的抽獎' }; // Silent fail usually better?
            }

            const data = doc.data();
            if (Date.now() > data.endTime) {
                return { success: false, message: '⏰ 抽獎時間已結束' };
            }

            if (data.participants.includes(userId)) {
                return { success: false, message: '你已經報名過了！' };
            }

            // Update
            t.update(docRef, {
                participants: Firestore.FieldValue.arrayUnion(userId)
            });

            // Calculate time left
            const now = Date.now();
            const timeLeft = Math.max(0, Math.ceil((data.endTime - now) / 1000 / 60));

            return {
                success: true,
                message: `✅ 報名成功！目前 ${data.participants.length + 1} 人參加\n⏱️ 還有約 ${timeLeft} 分鐘`,
            };
        });
    } catch (e) {
        console.error('[Lottery] Join Error:', e);
        return { success: false, message: '系統錯誤，請重試' };
    }
}

// 3. 執行開獎 (Draw)
async function drawLottery(groupId, replyToken = null) {
    const docRef = db.collection('lotteries').doc(groupId);

    try {
        const result = await db.runTransaction(async (t) => {
            const doc = await t.get(docRef);
            if (!doc.exists || !doc.data().active) {
                return { success: false, message: '❌ 目前沒有進行中的抽獎' };
            }

            const data = doc.data();
            const participants = data.participants;

            if (participants.length === 0) {
                t.update(docRef, { active: false });
                return { success: false, message: '❌ 沒有人參加抽獎，活動取消', noParticipants: true };
            }

            // Shuffle & Pick
            const shuffled = [...participants].sort(() => Math.random() - 0.5);
            const winnerCount = Math.min(data.winners, participants.length);
            const winners = shuffled.slice(0, winnerCount);

            t.update(docRef, {
                active: false,
                winners: winners,
                drawnAt: Firestore.FieldValue.serverTimestamp()
            });

            return {
                success: true,
                prize: data.prize,
                winners: winners,
                total: participants.length
            };
        });

        if (!result.success) {
            if (replyToken) await lineUtils.replyText(replyToken, result.message);
            // If auto-draw (no replyToken) and no participants, maybe silent or push?
            else if (result.noParticipants) await lineUtils.pushText(groupId, result.message);
            return;
        }

        // 1. Fetch display names first (used for both Flex and Tags)
        // Use allSettled to prevent entire draw from failing if any name fetch fails
        const winnerResults = await Promise.allSettled(result.winners.map(async (uid) => {
            try {
                const name = await lineUtils.getGroupMemberName(groupId, uid);
                return { uid, name: name || '幸運兒' };
            } catch (err) {
                console.error(`[Lottery] Failed to fetch name for ${uid}:`, err.message);
                return { uid, name: '幸運兒' };
            }
        }));

        const winnerInfos = winnerResults.map(result =>
            result.status === 'fulfilled' ? result.value : result.reason
        );

        // 2. Build Rich Winner Flex (Unified Design)
        const winnerListComponents = winnerInfos.map(info =>
            flexUtils.createText({ text: `👑 ${info.name}`, size: 'md', weight: 'bold', color: COLORS.PRIMARY, align: 'center' })
        );

        const bubble = flexUtils.createBubble({
            size: 'kilo', // Consitent with Start Message
            header: flexUtils.createHeader('🎉 抽獎結果公佈', '', COLORS.DANGER), // Red for celebration/end (Matched style)
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `🎁 獎品：${result.prize}`, size: 'xl', weight: 'bold', color: COLORS.DARK_GRAY, wrap: true, align: 'center' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: '🏆 幸運得主', size: 'md', color: COLORS.PRIMARY, weight: 'bold', align: 'center', margin: 'lg' }),
                flexUtils.createBox('vertical', winnerListComponents, { margin: 'sm', spacing: 'xs' }),
                flexUtils.createSeparator('lg'),
                flexUtils.createText({ text: `共 ${result.total} 人參與`, size: 'xs', color: COLORS.GRAY, align: 'center', margin: 'md' }),
                flexUtils.createText({ text: '恭喜以上幸運兒！', size: 'md', color: COLORS.DANGER, weight: 'bold', align: 'center', margin: 'xs' })
            ], { paddingAll: '20px' })
        });

        if (replyToken) {
            await lineUtils.replyFlex(replyToken, '抽獎結果', bubble);
        } else {
            await lineUtils.pushFlex(groupId, '抽獎結果', bubble);
        }

        // 3. Follow up with Text Message for Tags (Using Text Message v2)
        // Build text with placeholders {0}, {1}, {2}...
        let mentionText = '恭喜：';
        const substitution = {};

        // Build substitution object using Text Message v2 format
        winnerInfos.forEach(({ uid }, idx) => {
            if (idx > 0) mentionText += '，'; // Add delimiter for multiple winners
            mentionText += `{${idx}}`;

            substitution[String(idx)] = {
                type: 'mention',
                mentionee: {
                    type: 'user',
                    userId: uid
                }
            };
        });

        // Log for debugging
        console.log('[Lottery] Text v2 Debug:', JSON.stringify({ text: mentionText, substitution }));

        // Use Text Message v2 format
        const textMsg = {
            type: 'textV2',
            text: mentionText,
            substitution: substitution
        };

        if (replyToken) {
            // Manual Draw: Already sent Flex with replyToken, must use push for the second message
            await lineUtils.pushMessage(groupId, [textMsg]);
        } else {
            // Auto Draw
            await lineUtils.pushMessage(groupId, [textMsg]);
        }

    } catch (e) {
        console.error('[Lottery] Draw Error:', e);
        if (replyToken) {
            await lineUtils.replyText(replyToken, '❌ 開獎失敗');
        } else {
            await lineUtils.pushText(groupId, '❌ 自動開獎發生錯誤 (請檢查 Log)');
        }
    }
}

// 4. 手動開獎 (Admin Command)
async function handleManualDraw(replyToken, groupId, userId) {
    // Permission Check
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 只有超級管理員可以使用此功能');
        return;
    }
    await drawLottery(groupId, replyToken);
}

// 5. 取消抽獎 (Admin Command)
async function handleCancelLottery(replyToken, groupId, userId) {
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 只有超級管理員可以使用此功能');
        return;
    }

    const docRef = db.collection('lotteries').doc(groupId);

    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(docRef);
            if (!doc.exists || !doc.data().active) {
                // If not active, nothing to cancel, but we can notify.
                throw new Error('目前沒有進行中的抽獎');
            }

            // Set active false
            t.update(docRef, { active: false });
        });

        await lineUtils.replyText(replyToken, '🚫 抽獎活動已取消');

    } catch (e) {
        if (e.message === '目前沒有進行中的抽獎') {
            await lineUtils.replyText(replyToken, '❌ 目前沒有進行中的抽獎');
        } else {
            console.error('[Lottery] Cancel Error:', e);
            await lineUtils.replyText(replyToken, '❌ 取消失敗');
        }
    }
}

// 6. 查詢狀態 (Group Command)
async function handleStatusQuery(replyToken, groupId) {
    const status = await getLotteryStatus(groupId);
    // getLotteryStatus returns object or null.
    // However, it doesn't return participants count.
    // Let's query DB directly here for full info.

    try {
        const doc = await db.collection('lotteries').doc(groupId).get();
        if (!doc.exists || !doc.data().active) {
            await lineUtils.replyText(replyToken, '❌ 目前沒有進行中的抽獎');
            return;
        }

        const data = doc.data();
        const now = Date.now();
        const timeLeft = Math.max(0, Math.ceil((data.endTime - now) / 1000 / 60)); // Minutes
        const count = data.participants.length;

        // Build Flex Status
        const bubble = flexUtils.createBubble({
            size: 'kilo',
            header: flexUtils.createHeader('📊 抽獎活動狀態', '', COLORS.PRIMARY),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `🎁 獎品：${data.prize}`, size: 'lg', weight: 'bold', color: COLORS.DARK_GRAY }),
                flexUtils.createSeparator('md'),
                flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `🔑 關鍵字：${data.keyword}`, size: 'md', color: COLORS.PRIMARY }),
                    flexUtils.createText({ text: `👥 參加人數：${count} 人`, size: 'md', color: COLORS.DARK_GRAY }),
                    flexUtils.createText({ text: `⏱️ 剩餘時間：約 ${timeLeft} 分鐘`, size: 'md', color: (timeLeft < 1 ? COLORS.DANGER : COLORS.SUCCESS) }),
                ], { margin: 'md', spacing: 'sm' })
            ], { paddingAll: '20px' })
        });

        await lineUtils.replyFlex(replyToken, '抽獎狀態', bubble);

    } catch (e) {
        console.error('[Lottery] Status Error:', e);
        await lineUtils.replyText(replyToken, '❌ 查詢失敗');
    }
}

// Helper: 取得簡單狀態 (For Router)
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
    handleCancelLottery,
    handleStatusQuery,
    getLotteryStatus
};
