const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const { db } = require('../utils/firestore');

// --- Game Config ---
const COLLECTION_NAME = 'lineage_users';
const INITIAL_WEAPON = { name: '木劍', level: 0, safe: 6, max: 99 };
const PROBABILITY = {
    // 0-5 (safe): 100%
    6: 0.33,  // +6 -> +7
    7: 0.33,  // +7 -> +8
    8: 0.33,  // +8 -> +9
    9: 0.20,  // +9 -> +10 (Harder)
    10: 0.10  // +10 -> +11 (Very Hard)
    // Default 10% for anything higher
};

// --- Images ---
const IMG = {
    SWORD_NORMAL: 'https://cdn-icons-png.flaticon.com/512/3014/3014521.png', // Generic Pixel Sword
    SWORD_BROKEN: 'https://cdn-icons-png.flaticon.com/512/3233/3233503.png', // Broken icon
    SCROLL: 'https://cdn-icons-png.flaticon.com/512/2534/2534164.png' // Scroll icon
};

const COLORS = {
    SAFE: '#4CAF50',
    DANGER: '#D32F2F',
    GOLD: '#FFD700',
    BG_DARK: '#263238'
};

/**
 * Get User Data (or init)
 */
async function getUserData(userId) {
    const ref = db.collection(COLLECTION_NAME).doc(userId);
    const doc = await ref.get();

    if (!doc.exists) {
        const newUser = {
            weapon: { ...INITIAL_WEAPON },
            scrolls: 999, // Infinite for Phase 1
            history: { maxLevel: 0, broken: 0 }
        };
        await ref.set(newUser);
        return newUser;
    }
    return doc.data();
}

/**
 * Check Enchant Probability
 * Returns: 'success' | 'fail' | 'safe'
 */
function calculateResult(level) {
    if (level < 6) return 'safe'; // +0 to +5 -> +6 is safe

    const rate = PROBABILITY[level] || 0.10;
    return Math.random() < rate ? 'success' : 'fail';
}

/**
 * Build Dashboard Flex
 */
function buildDashboardFlex(user) {
    const { weapon } = user;
    const isSafe = weapon.level < 6;
    const rateText = isSafe ? '安定值內 (100%)' : `⚠️ 危險! 成功率 ${(PROBABILITY[weapon.level] || 0.1) * 100}%`;

    const levelDisplay = `+${weapon.level}`;
    const weaponName = `${weapon.name}`;

    return flexUtils.createBubble({
        size: 'mega',
        header: {
            type: 'box',
            layout: 'vertical',
            contents: [
                { type: 'text', text: '⚔️ 鐵匠舖', weight: 'bold', color: '#FFFFFF', size: 'lg' }
            ],
            backgroundColor: COLORS.BG_DARK
        },
        body: flexUtils.createBox('vertical', [
            // Weapon Icon
            {
                type: 'image',
                url: IMG.SWORD_NORMAL,
                size: 'xl',
                aspectRatio: '1:1',
                aspectMode: 'fit'
            },
            // Weapon Name & Level
            flexUtils.createText({ text: levelDisplay, size: '4xl', weight: 'bold', color: COLORS.GOLD, align: 'center' }),
            flexUtils.createText({ text: weaponName, size: 'xl', weight: 'bold', color: '#333333', align: 'center', margin: 'sm' }),

            // Stats
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: rateText, size: 'sm', color: isSafe ? COLORS.SAFE : COLORS.DANGER, align: 'center', margin: 'md' }),
            flexUtils.createText({ text: `📜 對武器施法的卷軸: 無限`, size: 'xs', color: '#999999', align: 'center', margin: 'sm' }),

            // Button
            flexUtils.createButton({
                label: '🔥 強化!',
                style: 'primary',
                color: isSafe ? COLORS.SAFE : COLORS.DANGER,
                action: { type: 'message', label: '強化', text: '衝裝-執行' },
                margin: 'lg'
            })
        ])
    });
}

/**
 * Build Result Flex
 */
function buildResultFlex(result, oldLevel, newLevel, weaponName) {
    const isSuccess = result !== 'fail';

    const title = isSuccess ? '🎉 強化成功!' : '💀 強化失敗...';
    const color = isSuccess ? COLORS.GOLD : '#9E9E9E';
    const icon = isSuccess ? IMG.SWORD_NORMAL : IMG.SWORD_BROKEN;

    const msg = isSuccess
        ? `你的 ${weaponName} 升級為 +${newLevel}!`
        : `你的 +${oldLevel} ${weaponName} 產生了激烈的銀色光芒後消失了...`;

    const contents = [
        { type: 'image', url: icon, size: 'xl', aspectRatio: '1:1', aspectMode: 'fit' },
        flexUtils.createText({ text: title, size: 'xxl', weight: 'bold', color: color, align: 'center' }),
        flexUtils.createText({ text: msg, size: 'md', weight: 'bold', color: isSuccess ? COLORS.SAFE : COLORS.DANGER, align: 'center', wrap: true, margin: 'md' })
    ];

    // Retry Button
    if (!isSuccess) {
        contents.push(flexUtils.createButton({
            label: '🔄 領取新武器',
            style: 'secondary',
            action: { type: 'message', label: '重來', text: '衝裝-重置' },
            margin: 'lg'
        }));
    } else {
        contents.push(flexUtils.createButton({
            label: '⚔️ 繼續強化',
            style: 'primary',
            action: { type: 'message', label: '繼續', text: '衝裝' }, // Back to dashboard
            margin: 'lg'
        }));
    }

    return flexUtils.createBubble({
        body: flexUtils.createBox('vertical', contents, { paddingAll: '20px' }),
        styles: { body: { backgroundColor: isSuccess ? '#FFF8E1' : '#ECEFF1' } }
    });
}

/**
 * Main Handler
 */
async function handleEnchant(replyToken, text, userId, groupId) {
    const userRef = db.collection(COLLECTION_NAME).doc(userId);
    let userData = await getUserData(userId);

    // 1. Dashboard / Check
    if (text === '衝裝' || text === '衝裝-查看') {
        if (!userData.weapon) {
            // User lost weapon but manually typed '衝裝', give default
            userData.weapon = { ...INITIAL_WEAPON };
            await userRef.set(userData);
        }
        await lineUtils.replyFlex(replyToken, '鐵匠舖', buildDashboardFlex(userData));
        return;
    }

    // 2. Execute Enchant
    if (text === '衝裝-執行') {
        if (!userData.weapon) {
            return lineUtils.replyText(replyToken, '你沒有武器！輸入「衝裝-重置」領取一把。');
        }

        const currentLvl = userData.weapon.level;
        const result = calculateResult(currentLvl);

        if (result === 'safe' || result === 'success') {
            // Level Up
            const newLvl = currentLvl + 1;
            userData.weapon.level = newLvl;
            // Update Max Record
            if (newLvl > (userData.history.maxLevel || 0)) {
                userData.history.maxLevel = newLvl;
            }
            await userRef.set(userData); // Save

            // Broadcast if high level
            if (newLvl >= 9 && groupId) {
                await lineUtils.pushMessage(groupId, { type: 'text', text: `📢 全服廣播: 恭喜玩家衝出了 +${newLvl} 的神兵！` });
            }

            await lineUtils.replyFlex(replyToken, '強化結果', buildResultFlex('success', currentLvl, newLvl, userData.weapon.name));

        } else {
            // Failed (Break)
            userData.weapon = null; // Gone
            userData.history.broken = (userData.history.broken || 0) + 1;
            await userRef.set(userData);

            await lineUtils.replyFlex(replyToken, '強化結果', buildResultFlex('fail', currentLvl, 0, INITIAL_WEAPON.name));
        }
    }

    // 3. Reset (Get new weapon)
    if (text === '衝裝-重置') {
        userData.weapon = { ...INITIAL_WEAPON };
        await userRef.set(userData);
        await lineUtils.replyText(replyToken, '鐵匠給了你一把新的 +0 木劍。請好好珍惜。');
    }
}

module.exports = { handleEnchant };
