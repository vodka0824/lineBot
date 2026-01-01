/**
 * 抽獎系統模組 (Multi-Lottery & Manual-Only & Time-Limited)
 * Optimized with Caching & Transactions
 */
const { db, Firestore } = require('../utils/firestore');
const authUtils = require('../utils/auth');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const { COLORS } = flexUtils;

// === Cache Layer ===
// Map<groupId, { keywords: Set<string>, timestamp: number }>
const KEYWORD_CACHE = new Map();
const CACHE_TTL = 60 * 1000; // 60 Seconds

async function getCachedKeywords(groupId) {
    const now = Date.now();
    const cached = KEYWORD_CACHE.get(groupId);

    if (cached && (now - cached.timestamp < CACHE_TTL)) {
        return cached.keywords;
    }

    // Fetch from DB
    try {
        const snapshot = await db.collection('lotteries')
            .where('groupId', '==', groupId)
            .where('active', '==', true)
            .get();

        const keywords = new Set();
        snapshot.forEach(doc => keywords.add(doc.data().keyword));

        KEYWORD_CACHE.set(groupId, { keywords, timestamp: now });
        return keywords;
    } catch (e) {
        console.error('[Lottery] Cache Fetch Error:', e);
        return new Set(); // Fail safe
    }
}

function invalidateCache(groupId) {
    KEYWORD_CACHE.delete(groupId);
}

// Helper: Build Result Messages (Flex + Text)
async function buildLotteryResultMessages(groupId, prize, totalParticipants, winnerUids) {
    const winnerInfos = await Promise.all(winnerUids.map(async (uid) => {
        const name = await lineUtils.getGroupMemberName(groupId, uid) || '幸運兒';
        return { uid, name };
    }));

    // Rich Winner Flex
    const winnerListComponents = winnerInfos.map(info =>
        flexUtils.createText({ text: `👑 ${info.name}`, size: 'md', weight: 'bold', color: COLORS.PRIMARY, align: 'center' })
    );

    const bubble = flexUtils.createBubble({
        size: 'kilo',
        header: flexUtils.createHeader('🎉 抽獎結果公佈', '', COLORS.DANGER),
        body: flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `🎁 獎品：${prize}`, size: 'xl', weight: 'bold', color: COLORS.DARK_GRAY, wrap: true, align: 'center' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: '🏆 幸運得主', size: 'md', color: COLORS.PRIMARY, weight: 'bold', align: 'center', margin: 'lg' }),
            flexUtils.createBox('vertical', winnerListComponents, { margin: 'sm', spacing: 'xs' }),
            flexUtils.createSeparator('lg'),
            flexUtils.createText({ text: `共 ${totalParticipants} 人參與`, size: 'xs', color: COLORS.GRAY, align: 'center', margin: 'md' }),
            flexUtils.createText({ text: '恭喜以上幸運兒！', size: 'md', color: COLORS.DANGER, weight: 'bold', align: 'center', margin: 'xs' })
        ], { paddingAll: '20px' })
    });

    // Tagging Text (Text Message v2)
    let mentionText = '恭喜：';
    const substitution = {};

    winnerInfos.forEach(({ uid }, idx) => {
        if (idx > 0) mentionText += '，';
        mentionText += `{${idx}}`;

        substitution[String(idx)] = {
            type: 'mention',
            mentionee: { type: 'user', userId: uid }
        };
    });

    const textMsg = {
        type: 'textV2',
        text: mentionText,
        substitution: substitution
    };

    return { bubble, textMsg };
}

// 1. 開始抽獎 (Start: Transaction + Validation)
async function startLottery(replyToken, groupId, userId, prize, winnersStr, durationStr, keyword) {
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 只有超級管理員可以使用此功能');
        return;
    }

    if (!groupId) {
        await lineUtils.replyText(replyToken, '❌ 抽獎功能僅限於群組內使用');
        return;
    }

    // Input Validation
    const winners = parseInt(winnersStr);
    const minutes = parseInt(durationStr);

    if (isNaN(winners) || winners < 1) {
        await lineUtils.replyText(replyToken, '❌ 人數格式錯誤，請輸入大於 0 的數字');
        return;
    }
    if (isNaN(minutes) || minutes < 1) {
        await lineUtils.replyText(replyToken, '❌ 時間格式錯誤，請輸入大於 0 的分鐘數');
        return;
    }

    const now = Date.now();
    const endTime = now + (minutes * 60 * 1000);
    const endTimeStr = new Date(endTime).toLocaleTimeString('zh-TW', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei'
    });

    try {
        await db.runTransaction(async (t) => {
            // Check for existing active lottery with same PRIZE
            const snapshot = await t.get(
                db.collection('lotteries')
                    .where('groupId', '==', groupId)
                    .where('prize', '==', prize)
                    .where('active', '==', true)
            );

            if (!snapshot.empty) {
                throw new Error(`正在進行「${prize}」的抽獎活動`);
            }

            const lotteryData = {
                active: true,
                prize: prize,
                winners: winners,
                duration: minutes,
                endTime: endTime,
                keyword: keyword,
                createdAt: now,
                createdBy: userId,
                participants: [],
                groupId: groupId
            };

            const newDocRef = db.collection('lotteries').doc();
            t.set(newDocRef, lotteryData);
        });

        // Update Cache
        invalidateCache(groupId); // Next check will re-fetch

        const bubble = flexUtils.createBubble({
            size: 'kilo',
            header: flexUtils.createHeader('🎉 抽獎活動開始！', '', COLORS.PRIMARY),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `🎁 獎品：${prize}`, size: 'xl', weight: 'bold', color: COLORS.DARK_GRAY, wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `🏆 名額：${winners} 人`, size: 'md', color: COLORS.GRAY }),
                    flexUtils.createText({ text: `⏱️ 時間：${minutes} 分鐘`, size: 'md', color: COLORS.GRAY }),
                    flexUtils.createText({ text: `⏰ 結束：${endTimeStr}`, size: 'md', color: COLORS.DANGER }),
                    flexUtils.createText({ text: `🔑 關鍵字：${keyword}`, size: 'md', color: COLORS.PRIMARY, weight: 'bold' })
                ], { margin: 'md', spacing: 'sm' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: '點擊下方按鈕或輸入關鍵字參加！', size: 'xs', color: COLORS.GRAY, margin: 'md', align: 'center' })
            ], { paddingAll: '20px' }),
            footer: flexUtils.createBox('vertical', [
                flexUtils.createButton({
                    action: { type: 'message', label: '立即參加 🙋', text: keyword },
                    style: 'primary',
                    color: COLORS.PRIMARY
                })
            ])
        });

        await lineUtils.replyFlex(replyToken, `抽獎開始：${prize}`, bubble);

    } catch (error) {
        console.error('[Lottery] Start Error:', error);
        if (error.message.includes('正在進行')) {
            await lineUtils.replyText(replyToken, `❌ ${error.message}`);
        } else {
            await lineUtils.replyText(replyToken, '❌ 發起抽獎失敗');
        }
    }
}

// 2. 參加抽獎 (Join - Uses Cache implicitly via checkLotteryKeyword, then DB for safety)
// Note: Logic here is DB-first for correctness. Cache is used in ROUTER to decide whether to call this.
async function joinLottery(groupId, userId, text) {
    // Find active lottery with matching keyword
    const snapshot = await db.collection('lotteries')
        .where('groupId', '==', groupId)
        .where('keyword', '==', text)
        .where('active', '==', true)
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const doc = snapshot.docs[0];
    const docRef = doc.ref;

    try {
        return await db.runTransaction(async (t) => {
            const freshDoc = await t.get(docRef);
            if (!freshDoc.exists || !freshDoc.data().active) {
                return { success: false, message: '❌ 活動已結束' };
            }

            const data = freshDoc.data();

            // Check Time Limit
            if (Date.now() > data.endTime) {
                return { success: false, message: '⏰ 該抽獎活動時間已到，下次請早' };
            }

            // Check Duplicate
            if (data.participants.includes(userId)) {
                return { success: false, message: '❌ 你已經報名了！' };
            }

            t.update(docRef, {
                participants: Firestore.FieldValue.arrayUnion(userId)
            });

            // Calculate time left
            const now = Date.now();
            const timeLeft = Math.max(0, Math.ceil((data.endTime - now) / 1000 / 60)); // Minutes

            return {
                success: true,
                message: `✅ 報名成功！\n目標獎品：${data.prize}\n剩餘時間：約 ${timeLeft} 分鐘\n等待開獎中...`,
            };
        });
    } catch (e) {
        console.error('[Lottery] Join Error:', e);
        return { success: false, message: '報名失敗，請重試' };
    }
}

// 3. 執行開獎 (Draw)
async function drawLottery(replyToken, groupId, userId, prize) {
    // Query active lottery by PRIZE
    const snapshot = await db.collection('lotteries')
        .where('groupId', '==', groupId)
        .where('prize', '==', prize) // Changed from keyword to prize
        .where('active', '==', true)
        .limit(1)
        .get();

    if (snapshot.empty) {
        await lineUtils.replyText(replyToken, `❌ 找不到獎品為「${prize}」的進行中活動`);
        return;
    }

    const docRef = snapshot.docs[0].ref;

    try {
        const result = await db.runTransaction(async (t) => {
            const doc = await t.get(docRef);
            if (!doc.exists || !doc.data().active) {
                return { success: false, message: '❌ 活動已結束' };
            }

            const data = doc.data();
            const participants = data.participants;

            if (participants.length === 0) {
                t.update(docRef, { active: false });
                return { success: false, message: '❌ 沒有人參加，活動取消', noParticipants: true };
            }

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

        // Invalidate Cache after state change
        invalidateCache(groupId);

        if (!result.success) {
            await lineUtils.replyText(replyToken, result.message);
            return;
        }

        const { bubble, textMsg } = await buildLotteryResultMessages(groupId, result.prize, result.total, result.winners);

        await lineUtils.replyToLine(replyToken, [
            { type: 'flex', altText: '抽獎結果', contents: bubble },
            textMsg
        ]);

    } catch (e) {
        console.error('[Lottery] Draw Error:', e);
        await lineUtils.replyText(replyToken, '❌ 開獎失敗 (請檢查 Log)');
    }
}

// 4. 手動開獎入口 (Admin)
async function handleManualDraw(replyToken, groupId, userId, prize) {
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 只有超級管理員可以使用此功能');
        return;
    }
    if (!prize) {
        await lineUtils.replyText(replyToken, '❌ 請輸入要開獎的獎品名稱\n範例：開獎 機械鍵盤');
        return;
    }
    await drawLottery(replyToken, groupId, userId, prize);
}

// 5. 取消抽獎 (Cancel - By PRIZE)
async function handleCancelLottery(replyToken, groupId, userId, prize) {
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 只有超級管理員可以使用此功能');
        return;
    }

    if (!prize) {
        await lineUtils.replyText(replyToken, '❌ 請輸入要取消的獎品名稱\n範例：取消抽獎 機械鍵盤');
        return;
    }

    const snapshot = await db.collection('lotteries')
        .where('groupId', '==', groupId)
        .where('prize', '==', prize)
        .where('active', '==', true)
        .limit(1)
        .get();

    if (snapshot.empty) {
        await lineUtils.replyText(replyToken, `❌ 找不到獎品為「${prize}」的進行中活動`);
        return;
    }

    try {
        await snapshot.docs[0].ref.update({ active: false });
        invalidateCache(groupId); // Clear cache
        await lineUtils.replyText(replyToken, `🚫 已取消「${prize}」的抽獎活動`);
    } catch (e) {
        console.error('[Lottery] Cancel Error:', e);
        await lineUtils.replyText(replyToken, '❌ 取消失敗');
    }
}

// 6. 查詢狀態 (List all active)
async function handleStatusQuery(replyToken, groupId) {
    try {
        const snapshot = await db.collection('lotteries')
            .where('groupId', '==', groupId)
            .where('active', '==', true)
            .get();

        if (snapshot.empty) {
            await lineUtils.replyText(replyToken, '❌ 目前沒有進行中的抽獎');
            return;
        }

        const bubbles = [];
        const now = Date.now();

        snapshot.forEach(doc => {
            const data = doc.data();
            const count = data.participants.length;
            const winners = data.winners;
            const winRate = count > 0 ? ((Math.min(winners, count) / count) * 100).toFixed(1) + '%' : '100%';

            // Format End Time
            const endDate = new Date(data.endTime);
            const timeStr = endDate.toLocaleTimeString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'Asia/Taipei'
            });
            const isExpired = now > data.endTime;

            bubbles.push(flexUtils.createBubble({
                size: 'kilo',
                header: flexUtils.createHeader('📊 進行中活動', '', COLORS.PRIMARY),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `🎁 ${data.prize}`, size: 'lg', weight: 'bold', color: COLORS.DARK_GRAY }),
                    // Keyword Removed as requested
                    flexUtils.createSeparator('md'),
                    flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: `🏆 抽出名額：${winners} 人`, size: 'sm', color: COLORS.GRAY }),
                        flexUtils.createText({ text: `👥 已報名：${count} 人`, size: 'sm', color: COLORS.GRAY }),
                        flexUtils.createText({ text: `🎲 中獎率：${winRate}`, size: 'sm', color: COLORS.PRIMARY }),
                        flexUtils.createText({ text: `⏰ 結束時間：${timeStr} ${isExpired ? '(已截止)' : `(剩餘 ${Math.max(0, Math.ceil((data.endTime - now) / 1000 / 60))} 分)`}`, size: 'sm', color: isExpired ? COLORS.DANGER : COLORS.SUCCESS }),
                    ], { margin: 'md', spacing: 'sm' }),

                    flexUtils.createSeparator('md'),
                    !isExpired ? flexUtils.createButton({
                        action: { type: 'message', label: '立即參加 🙋', text: data.keyword },
                        style: 'secondary', margin: 'md'
                    }) : flexUtils.createText({ text: '⛔ 報名已截止', size: 'sm', color: COLORS.DANGER, align: 'center', margin: 'md' })
                ], { paddingAll: '20px' })
            }));
        });

        const flex = bubbles.length > 1
            ? flexUtils.createCarousel(bubbles)
            : bubbles[0];

        await lineUtils.replyFlex(replyToken, '抽獎列表', flex);

    } catch (e) {
        console.error('[Lottery] Status Error:', e);
        await lineUtils.replyText(replyToken, '❌ 查詢失敗');
    }
}

// Helper for Router (Cached)
async function checkLotteryKeyword(groupId, text) {
    // 1. Check Cache first
    const keywords = await getCachedKeywords(groupId);
    return keywords.has(text);
}

module.exports = {
    handleStartLottery: startLottery,
    joinLottery,
    handleManualDraw,
    handleCancelLottery,
    handleStatusQuery,
    checkLotteryKeyword
};
