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
        let finalDisplayName = displayName;

        // 若沒有傳入暱稱，嘗試從 DB 或 LINE API 取得
        if (!finalDisplayName) {
            if (doc.exists && doc.data().displayName && doc.data().displayName !== '未知用戶') {
                // DB 有資料且有效，沿用
                finalDisplayName = doc.data().displayName;
            } else {
                // DB 沒資料或無效，從 LINE API 抓取
                const name = await lineUtils.getGroupMemberName(groupId, userId);
                if (name) finalDisplayName = name;
            }
        }

        if (doc.exists) {
            await ref.update({
                messageCount: Firestore.FieldValue.increment(1),
                lastActive: new Date(),
                ...(finalDisplayName ? { displayName: finalDisplayName } : {})
            });
        } else {
            await ref.set({
                messageCount: 1,
                lastActive: new Date(),
                displayName: finalDisplayName || '未知用戶'
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
        let finalDisplayName = displayName;

        // 若沒有傳入暱稱，嘗試從 DB 或 LINE API 取得
        if (!finalDisplayName) {
            if (doc.exists && doc.data().displayName && doc.data().displayName !== '未知用戶') {
                // DB 有資料且有效，沿用
                finalDisplayName = doc.data().displayName;
            } else {
                // DB 沒資料或無效，從 LINE API 抓取
                const name = await lineUtils.getGroupMemberName(groupId, userId);
                if (name) finalDisplayName = name;
            }
        }

        if (doc.exists) {
            await ref.update({
                [field]: Firestore.FieldValue.increment(1),
                totalImageCount: Firestore.FieldValue.increment(1),
                lastActive: new Date(),
                ...(finalDisplayName ? { displayName: finalDisplayName } : {})
            });
        } else {
            await ref.set({
                messageCount: 0,
                [field]: 1,
                totalImageCount: 1,
                lastActive: new Date(),
                displayName: finalDisplayName || '未知用戶'
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
/**
 * 建構單一排行榜 Bubble
 */
function buildRankBubble(title, leaders, userRank, valueKey, unit, color, userId) {
    if (!leaders || leaders.length === 0) {
        return {
            type: 'bubble',
            size: 'kilo',
            header: {
                type: 'box',
                layout: 'horizontal',
                contents: [
                    { type: 'text', text: title, weight: 'bold', size: 'md', color: '#FFFFFF' }
                ],
                backgroundColor: color,
                paddingAll: '8px'
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: '尚無記錄', size: 'xs', color: '#888888', align: 'center' }
                ],
                paddingAll: '10px'
            }
        };
    }

    const medals = ['🥇', '🥈', '🥉'];
    const rows = leaders.slice(0, 5).map((leader, i) => ({
        type: 'box',
        layout: 'horizontal',
        margin: 'xs',
        contents: [
            { type: 'text', text: medals[i] || `${i + 1}.`, size: 'xs', flex: 1, color: i < 3 ? '#FFD700' : '#666666', gravity: 'center' },
            { type: 'text', text: leader.displayName || '未知', size: 'xs', flex: 4, weight: leader.id === userId ? 'bold' : 'regular', color: leader.id === userId ? '#1E88E5' : '#333333', gravity: 'center', wrap: true },
            { type: 'text', text: `${leader[valueKey] || 0}`, size: 'xs', flex: 2, align: 'end', color: '#E65100', gravity: 'center' }
        ]
    }));

    const footer = userRank.rank > 0 ? {
        type: 'box',
        layout: 'vertical',
        contents: [
            { type: 'text', text: `📊 你的排名: 第 ${userRank.rank} 名 (${userRank.stats?.[valueKey] || 0} ${unit})`, size: 'xxs', color: '#1E88E5', align: 'center' }
        ],
        paddingAll: '6px',
        backgroundColor: '#E3F2FD'
    } : null;

    return {
        type: 'bubble',
        size: 'kilo',
        header: {
            type: 'box',
            layout: 'horizontal',
            contents: [
                { type: 'text', text: title, weight: 'bold', size: 'md', color: '#FFFFFF', flex: 4 },
                { type: 'text', text: unit, size: 'xxs', color: '#FFFFFF', align: 'end', flex: 1, gravity: 'bottom' }
            ],
            backgroundColor: color,
            paddingAll: '8px'
        },
        body: {
            type: 'box',
            layout: 'vertical',
            contents: rows,
            paddingAll: '6px'
        },
        ...(footer ? { footer } : {})
    };
}

/**
 * 建構排行榜 Flex Message (Carousel)
 */
function buildLeaderboardFlex(leaders, userRank, userId) {
    const bubbles = [];

    // 1. 發言排行榜
    const msgLeaders = [...leaders].sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0));
    bubbles.push(buildRankBubble('🏆 發言榜 (v2.2)', msgLeaders,
        { rank: getRank(msgLeaders, userId), stats: userRank.stats },
        'messageCount', '則', '#FFD700', userId));

    // 2. 抽圖總榜
    const imgLeaders = [...leaders].sort((a, b) => (b.totalImageCount || 0) - (a.totalImageCount || 0));
    bubbles.push(buildRankBubble('📸 抽圖總榜', imgLeaders,
        { rank: getRank(imgLeaders, userId), stats: userRank.stats },
        'totalImageCount', '次', '#FF334B', userId));

    // 3. 各類別分開
    // 奶子
    const breastLeaders = [...leaders].sort((a, b) => (b.image_奶子 || 0) - (a.image_奶子 || 0));
    bubbles.push(buildRankBubble('👙 奶子榜', breastLeaders,
        { rank: getRank(breastLeaders, userId), stats: userRank.stats },
        'image_奶子', '次', '#FF69B4', userId));

    // 美尻
    const buttLeaders = [...leaders].sort((a, b) => (b.image_美尻 || 0) - (a.image_美尻 || 0));
    bubbles.push(buildRankBubble('🍑 美尻榜', buttLeaders,
        { rank: getRank(buttLeaders, userId), stats: userRank.stats },
        'image_美尻', '次', '#FF8da1', userId));

    // 絕對領域
    const zettaiLeaders = [...leaders].sort((a, b) => (b.image_絕對領域 || 0) - (a.image_絕對領域 || 0));
    bubbles.push(buildRankBubble('👗 絕對領域', zettaiLeaders,
        { rank: getRank(zettaiLeaders, userId), stats: userRank.stats },
        'image_絕對領域', '次', '#9C27B0', userId));

    // 黑絲
    const heisiLeaders = [...leaders].sort((a, b) => (b.image_黑絲 || 0) - (a.image_黑絲 || 0));
    bubbles.push(buildRankBubble('🦵 黑絲榜', heisiLeaders,
        { rank: getRank(heisiLeaders, userId), stats: userRank.stats },
        'image_黑絲', '次', '#333333', userId));

    // 白絲 (Replaced Foot)
    const baisiLeaders = [...leaders].sort((a, b) => (b.image_白絲 || 0) - (a.image_白絲 || 0));
    bubbles.push(buildRankBubble('🦶 白絲榜', baisiLeaders,
        { rank: getRank(baisiLeaders, userId), stats: userRank.stats },
        'image_白絲', '次', '#AAAAAA', userId));

    return {
        type: 'carousel',
        contents: bubbles
    };
}

function getRank(list, userId) {
    const validList = list.filter(u => (u[Object.keys(u).find(k => k.startsWith('image_') || k.endsWith('Count'))] || 0) > 0);
    const index = validList.findIndex(u => u.id === userId);
    return index >= 0 ? index + 1 : 0;
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
    recordImageUsage,
    getLeaderboard,
    getUserRank,
    handleLeaderboard,
    handleMyRank
};
