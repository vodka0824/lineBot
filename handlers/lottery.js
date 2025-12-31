/**
 * 抽獎系統模組 (Stateless & Flex UI)
 */
const { db, Firestore } = require('../utils/firestore');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const { COLORS } = flexUtils;

// 1. 開始抽獎 (Write to DB & Reply Flex)
async function startLottery(replyToken, groupId, userId, keyword, prize, winnersStr, durationStr) {
    const minutes = durationStr ? parseInt(durationStr, 10) : 3; // Default 3 mins
    const winners = parseInt(winnersStr) || 1;

    if (minutes < 1 || minutes > 60) {
        await lineUtils.replyText(replyToken, '❌ 時間必須在 1 到 60 分鐘之間');
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
                    label: '立即參加 🙋',
                    actionType: 'message',
                    actionData: keyword, // Sending the keyword triggers the join logic in routes
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
        await lineUtils.replyText(replyToken, '❌ 發起抽獎失敗');
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

            return {
                success: true,
                message: `✅ 報名成功！目前 ${data.participants.length + 1} 人參加`,
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

        // Build Winner Flex
        const winnerRows = [];
        // Determine layout based on number of winners
        // If many, use text wrapping. If few, use buttons/boxes?
        // Let's use simple text list.
        // NOTE: We only have UserIDs. To show names, we need to fetch profile or just notify/Tag.
        // Showing IDs is ugly. Tagging is better in text message.
        // But Flex cannot Tag.
        // Compromise: Flex for "Congratulations" visual, followed by Text for Tagging (or simplified ID list in Flex).

        // Let's assume we just show "Winner 1, Winner 2" or try to fetch profiles?
        // Fetching profiles for 100 people is slow.
        // Strategy: Show customized message "恭喜以下幸運兒..." and separate Text message for Mentioning.

        const bubble = flexUtils.createBubble({
            header: flexUtils.createHeader('🎊 抽獎圓滿結束！', '', COLORS.DANGER), // Red for celebration
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `🎁 獎品：${result.prize}`, size: 'lg', weight: 'bold', align: 'center' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `共有 ${result.total} 人參與`, size: 'sm', color: COLORS.GRAY, align: 'center', margin: 'md' }),
                flexUtils.createText({ text: `恭喜 ${result.winners.length} 位幸運兒！`, size: 'md', weight: 'bold', color: COLORS.PRIMARY, align: 'center', margin: 'md' }),
                // We don't list names here to avoid ugliness/loading. We rely on the Text Tag.
            ], { paddingAll: '20px' })
        });

        if (replyToken) {
            await lineUtils.replyFlex(replyToken, '抽獎結果', bubble);
        } else {
            await lineUtils.pushFlex(groupId, '抽獎結果', bubble);
        }

        // Follow up with Text Message for Tags (The real important part)
        // Construct Mention Text
        let mentionText = '恭喜：';
        const mentionObjects = [];
        let currentIndex = mentionText.length;

        result.winners.forEach((uid, idx) => {
            const str = `@Winner${idx} `;
            mentionText += str;
            mentionObjects.push({
                index: currentIndex,
                length: str.length - 1, // exclude space? No, usually include @. @Winner0 (len 8)
                userId: uid
            });
            currentIndex += str.length;
        });

        const textMsg = {
            type: 'text',
            text: mentionText,
            mention: { mentions: mentionObjects }
        };

        if (replyToken) {
            // Cannot reply twice easily with replyToken if lineUtils doesn't support array.
            // lineUtils.replyToLine supports array.
            // But we already sent Flex. ReplyToken consumed.
            // MUST use Push for the second message or combine?
            // If we used replyFlex above, token is gone.
            // So we must use Push for the tag message.
            await lineUtils.pushToLine(groupId, [textMsg]);
        } else {
            await lineUtils.pushToLine(groupId, [textMsg]);
        }

    } catch (e) {
        console.error('[Lottery] Draw Error:', e);
        if (replyToken) await lineUtils.replyText(replyToken, '❌ 開獎失敗');
    }
}

// 4. 手動開獎 (Admin Command)
async function handleManualDraw(replyToken, groupId) {
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
