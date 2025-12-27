/**
 * 抽獎系統模組
 */
const { db, Firestore } = require('../utils/firestore');

// 抽獎快取
let activeLotteries = {};

// 開始抽獎
async function startLottery(groupId, minutes, winners, keyword, prize, createdBy) {
    const now = Date.now();
    const endTime = now + (minutes * 60 * 1000);

    const lotteryData = {
        active: true,
        keyword: keyword,
        prize: prize,
        winners: winners,
        startTime: now,
        endTime: endTime,
        createdBy: createdBy,
        participants: []
    };

    await db.collection('lotteries').doc(groupId).set(lotteryData);
    activeLotteries[groupId] = lotteryData;

    return lotteryData;
}

// 參加抽獎
async function joinLottery(groupId, userId) {
    let lottery = activeLotteries[groupId];

    if (!lottery) {
        const doc = await db.collection('lotteries').doc(groupId).get();
        if (!doc.exists || !doc.data().active) {
            return { success: false, message: '目前沒有進行中的抽獎' };
        }
        lottery = doc.data();
        activeLotteries[groupId] = lottery;
    }

    if (Date.now() > lottery.endTime) {
        return { success: false, message: '⏰ 抽獎時間已結束，等待開獎中...' };
    }

    if (lottery.participants.includes(userId)) {
        return { success: false, message: '你已經報名過了！' };
    }

    lottery.participants.push(userId);
    activeLotteries[groupId] = lottery;

    await db.collection('lotteries').doc(groupId).update({
        participants: Firestore.FieldValue.arrayUnion(userId)
    });

    return {
        success: true,
        message: `✅ 報名成功！目前 ${lottery.participants.length} 人參加`,
        count: lottery.participants.length
    };
}

// 開獎
async function drawLottery(groupId) {
    let lottery = activeLotteries[groupId];

    if (!lottery) {
        const doc = await db.collection('lotteries').doc(groupId).get();
        if (!doc.exists || !doc.data().active) {
            return { success: false, message: '❌ 目前沒有進行中的抽獎' };
        }
        lottery = doc.data();
    }

    const participants = lottery.participants;

    if (participants.length === 0) {
        await db.collection('lotteries').doc(groupId).update({ active: false });
        delete activeLotteries[groupId];
        return { success: false, message: '❌ 沒有人參加抽獎，活動取消' };
    }

    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    const winnerCount = Math.min(lottery.winners, participants.length);
    const winners = shuffled.slice(0, winnerCount);

    await db.collection('lotteries').doc(groupId).update({
        active: false,
        winners: winners,
        drawnAt: Firestore.FieldValue.serverTimestamp()
    });
    delete activeLotteries[groupId];

    return {
        success: true,
        prize: lottery.prize,
        winners: winners,
        totalParticipants: participants.length,
        winnerCount: winnerCount
    };
}

// 取得抽獎狀態
async function getLotteryStatus(groupId) {
    let lottery = activeLotteries[groupId];

    if (!lottery) {
        const doc = await db.collection('lotteries').doc(groupId).get();
        if (!doc.exists || !doc.data().active) {
            return null;
        }
        lottery = doc.data();
    }

    const now = Date.now();
    const remaining = Math.max(0, lottery.endTime - now);
    const remainingMinutes = Math.ceil(remaining / 60000);

    return {
        keyword: lottery.keyword,
        prize: lottery.prize,
        winners: lottery.winners,
        participants: lottery.participants.length,
        remainingMinutes: remainingMinutes,
        isExpired: remaining <= 0
    };
}

// 取消抽獎
async function cancelLottery(groupId) {
    await db.collection('lotteries').doc(groupId).update({ active: false });
    delete activeLotteries[groupId];
}

module.exports = {
    startLottery,
    joinLottery,
    drawLottery,
    getLotteryStatus,
    cancelLottery
};
