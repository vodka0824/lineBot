/**
 * 群組排行榜模組
 */
const { Firestore } = require('@google-cloud/firestore');
const lineUtils = require('../utils/line');

const db = new Firestore();

// 抽圖類型列表
const IMAGE_TYPES = ['奶子', '美尻', '絕對領域', '黑絲', '腳控'];

/**
 * 記錄用戶發言 (每次發言時調用)
 */
async function recordMessage(groupId, userId, displayName = null) {
    if (!groupId || !userId) return;

    try {
        const ref = db.collection('groups').doc(groupId)
            .collection('leaderboard').doc(userId);

        const doc = await ref.get();

        if (doc.exists) {
            await ref.update({
                messageCount: Firestore.FieldValue.increment(1),
                lastActive: new Date(),
                ...(displayName ? { displayName } : {})
            });
        } else {
            await ref.set({
                messageCount: 1,
                lastActive: new Date(),
                displayName: displayName || '未知用戶'
            });
        }
    } catch (error) {
        console.error('[Leaderboard] 記錄發言失敗:', error.message);
    }
}

/**
 * 記錄用戶抽圖 (每次抽圖時調用)
 */
async function recordImageUsage(groupId, userId, imageType, displayName = null) {
    if (!groupId || !userId || !imageType) return;

    try {
        const ref = db.collection('groups').doc(groupId)
            .collection('leaderboard').doc(userId);

        const doc = await ref.get();
        const field = `image_${imageType}`;

        if (doc.exists) {
            await ref.update({
                [field]: Firestore.FieldValue.increment(1),
                totalImageCount: Firestore.FieldValue.increment(1),
                lastActive: new Date(),
                ...(displayName ? { displayName } : {})
            });
        } else {
            await ref.set({
                messageCount: 0,
                [field]: 1,
                totalImageCount: 1,
                lastActive: new Date(),
                displayName: displayName || '未知用戶'
            });
        }
    } catch (error) {
        console.error('[Leaderboard] 記錄抽圖失敗:', error.message);
    }
}

/**
 * 取得群組排行榜 (Top 10)
 */
async function getLeaderboard(groupId) {
    try {
        const snapshot = await db.collection('groups').doc(groupId)
            .collection('leaderboard')
            .orderBy('messageCount', 'desc')
            .limit(10)
            .get();

        const leaders = [];
        snapshot.forEach(doc => {
            leaders.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return leaders;
    } catch (error) {
        console.error('[Leaderboard] 取得排行榜失敗:', error.message);
        return [];
    }
}

/**
 * 取得用戶排名
 */
async function getUserRank(groupId, userId) {
    try {
        // 取得所有用戶並排序
        const snapshot = await db.collection('groups').doc(groupId)
            .collection('leaderboard')
            .orderBy('messageCount', 'desc')
            .get();

        let rank = 0;
        let userStats = null;

        snapshot.forEach((doc, index) => {
            if (doc.id === userId) {
                rank = index + 1;
                userStats = doc.data();
            }
        });

        // 修正: forEach 內的 index 不正確，重新計算
        let correctRank = 0;
        snapshot.docs.forEach((doc, i) => {
            if (doc.id === userId) {
                correctRank = i + 1;
                userStats = doc.data();
            }
        });

        return { rank: correctRank, stats: userStats };
    } catch (error) {
        console.error('[Leaderboard] 取得用戶排名失敗:', error.message);
        return { rank: 0, stats: null };
    }
}

/**
 * 建構排行榜 Flex Message
 */
function buildLeaderboardFlex(leaders, userRank, userId) {
    if (!leaders || leaders.length === 0) {
        return {
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: '🏆 群組排行榜', weight: 'bold', size: 'lg', color: '#FFD700' },
                    { type: 'separator', margin: 'md' },
                    { type: 'text', text: '目前尚無互動記錄', size: 'sm', color: '#888888', margin: 'md' }
                ],
                paddingAll: '15px'
            }
        };
    }

    const medals = ['🥇', '🥈', '🥉'];

    const rows = leaders.map((leader, i) => ({
        type: 'box',
        layout: 'horizontal',
        margin: 'md',
        contents: [
            { type: 'text', text: medals[i] || `${i + 1}.`, size: 'sm', flex: 1, color: i < 3 ? '#FFD700' : '#666666' },
            { type: 'text', text: leader.displayName || '未知', size: 'sm', flex: 4, weight: leader.id === userId ? 'bold' : 'regular', color: leader.id === userId ? '#1E88E5' : '#333333' },
            { type: 'text', text: `${leader.messageCount || 0}`, size: 'sm', flex: 2, align: 'end', color: '#E65100' }
        ]
    }));

    const footer = userRank.rank > 0 ? {
        type: 'box',
        layout: 'vertical',
        contents: [
            { type: 'text', text: `📊 你的排名: 第 ${userRank.rank} 名 (${userRank.stats?.messageCount || 0} 則)`, size: 'xs', color: '#1E88E5', align: 'center' }
        ],
        paddingAll: '10px',
        backgroundColor: '#E3F2FD'
    } : null;

    return {
        type: 'bubble',
        size: 'kilo',
        header: {
            type: 'box',
            layout: 'horizontal',
            contents: [
                { type: 'text', text: '🏆 群組發言排行榜', weight: 'bold', size: 'lg', color: '#FFFFFF', flex: 4 },
                { type: 'text', text: '次數', size: 'xs', color: '#FFFFFF', align: 'end', flex: 1 }
            ],
            backgroundColor: '#FFD700',
            paddingAll: '12px'
        },
        body: {
            type: 'box',
            layout: 'vertical',
            contents: rows,
            paddingAll: '12px'
        },
        ...(footer ? { footer } : {})
    };
}

/**
 * 處理排行榜查詢
 */
async function handleLeaderboard(replyToken, groupId, userId) {
    const leaders = await getLeaderboard(groupId);
    const userRank = await getUserRank(groupId, userId);
    const flex = buildLeaderboardFlex(leaders, userRank, userId);

    await lineUtils.replyFlex(replyToken, '群組排行榜', flex);
}

/**
 * 處理我的排名查詢
 */
async function handleMyRank(replyToken, groupId, userId) {
    const { rank, stats } = await getUserRank(groupId, userId);

    if (rank === 0 || !stats) {
        await lineUtils.replyText(replyToken, '❌ 你尚未有互動記錄');
        return;
    }

    await lineUtils.replyFlex(replyToken, '我的排名', {
        type: 'bubble',
        size: 'kilo',
        body: {
            type: 'box',
            layout: 'vertical',
            contents: [
                { type: 'text', text: '📊 我的發言統計', weight: 'bold', size: 'lg', color: '#1E88E5' },
                { type: 'separator', margin: 'md' },
                {
                    type: 'box',
                    layout: 'horizontal',
                    margin: 'lg',
                    contents: [
                        { type: 'text', text: '排名', size: 'md', color: '#666666' },
                        { type: 'text', text: `第 ${rank} 名`, size: 'md', weight: 'bold', align: 'end', color: '#FFD700' }
                    ]
                },
                {
                    type: 'box',
                    layout: 'horizontal',
                    margin: 'md',
                    contents: [
                        { type: 'text', text: '發言次數', size: 'md', color: '#666666' },
                        { type: 'text', text: `${stats.messageCount || 0} 則`, size: 'md', weight: 'bold', align: 'end', color: '#E65100' }
                    ]
                }
            ],
            paddingAll: '15px'
        }
    });
}

module.exports = {
    recordMessage,
    getLeaderboard,
    getUserRank,
    handleLeaderboard,
    handleMyRank
};
