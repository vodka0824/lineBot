/**
 * 授權邏輯模組
 */
const { db, Firestore } = require('./firestore');
const { CachedCheck } = require('./cache');
const { ADMIN_USER_ID, CACHE_DURATION } = require('../config/constants');

// === 快取實例 ===
const groupCache = new CachedCheck(CACHE_DURATION.GROUP); // 基礎授權快取
const adminCache = new CachedCheck(CACHE_DURATION.ADMIN);
const todoCache = new CachedCheck(CACHE_DURATION.TODO);
const restaurantCache = new CachedCheck(CACHE_DURATION.RESTAURANT);
const weatherCache = new CachedCheck(CACHE_DURATION.GROUP); // 天氣功能快取
const blacklistCache = new CachedCheck(5 * 60 * 1000); // 5 minutes cache for blacklist

// 功能開關快取 (Key: groupId, Value: Set of disabled features)
const featureToggleCache = new Map();
let featureToggleCacheLastUpdated = 0;

// === 群組基礎授權 ===

// === 群組基礎授權 & 階層式權限架構 ===

const FEATURE_HIERARCHY = {
    life: {
        label: '生活小幫手',
        items: {
            news: '生活資訊',
            finance: '匯率與金融',
            weather: '天氣與空氣',
            food: '美食搜尋',
            delivery: '物流服務'
        }
    },
    entertainment: {
        label: '娛樂與互動',
        items: {
            voice: '語音與互動', // 講台語, 狂標, 幫我選
            fun: '趣味功能',     // 剪刀石頭布, 抽圖
            leaderboard: '群組排行榜'
        }
    },
    // 獨立功能 (Admin Zone or Standalone)
    todo: {
        label: '待辦事項',
        items: {} // No sub-items for now or simple on/off
    }
};

// Map Legacy keys to New Hierarchy
const LEGACY_MAP = {
    'weather': 'life.weather',
    'restaurant': 'life.food',
    'finance': 'life.finance',
    'delivery': 'life.delivery',
    'game': 'entertainment.fun', // RPS/Draw
    'ai': 'entertainment.voice', // Choose/Tag/Taigi roughly here
    'image': 'entertainment.fun'
};

async function isGroupAuthorized(groupId) {
    if (groupCache.isExpired()) {
        try {
            const snapshot = await db.collection('groups').where('status', '==', 'active').get();
            groupCache.update(snapshot.docs.map(doc => doc.id));

            // Sync update feature cache
            featureToggleCache.clear();

            // Clear legacy caches
            weatherCache.clear();
            restaurantCache.clear();
            todoCache.clear();

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const features = data.features || {};

                // Cache the entire features object for granular checks
                featureToggleCache.set(doc.id, features);

                // Update legacy caches for immediate support (Simulating the check)
                // This mimics "isFeatureEnabled" logic but pre-calculates for legacy cache
                const check = (cat, item) => {
                    const catObj = features[cat];
                    if (!catObj) return false;
                    // If category disabled, all false
                    if (catObj.enabled === false) return false;
                    // Check item
                    if (item && catObj[item] === false) return false;
                    return true;
                };

                if (check('life', 'weather')) weatherCache.add(doc.id);
                if (check('life', 'food')) restaurantCache.add(doc.id);
                if (check('todo')) todoCache.add(doc.id);
            });
            console.log('[Auth] 已重新載入授權群組 (Hierarchical)');
        } catch (error) {
            console.error('[Auth] 載入授權群組失敗:', error);
        }
    }
    return groupCache.has(groupId);
}

// Code Gen removed for brevity (keep existing import) but rewriting helper functions:

function generateRandomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function createRegistrationCode(userId) {
    const code = generateRandomCode();
    await db.collection('registrationCodes').doc(code).set({
        createdAt: Firestore.FieldValue.serverTimestamp(),
        createdBy: userId,
        used: false
    });
    return code;
}

async function getUnusedCodes() {
    const snapshot = await db.collection('registrationCodes')
        .where('used', '==', false)
        .get();
    return snapshot.docs.map(doc => doc.id);
}

async function registerGroup(code, groupId, userId) {
    const codeRef = db.collection('registrationCodes').doc(code);
    const codeDoc = await codeRef.get();

    if (!codeDoc.exists) return { success: false, message: '❌ 無效的註冊碼' };
    const codeData = codeDoc.data();
    if (codeData.used) return { success: false, message: '❌ 此註冊碼已被使用' };

    await codeRef.update({
        used: true,
        usedBy: groupId,
        usedByUser: userId,
        usedAt: Firestore.FieldValue.serverTimestamp()
    });

    // Initialize with Full Hierarchy Defaults (All ON)
    const initialFeatures = {
        life: {
            enabled: true,
            news: true, finance: true, weather: true, food: true, delivery: true
        },
        entertainment: {
            enabled: true,
            voice: true, fun: true, leaderboard: true
        },
        todo: {
            enabled: true
        }
    };

    await db.collection('groups').doc(groupId).set({
        status: 'active',
        authorizedAt: Firestore.FieldValue.serverTimestamp(),
        authorizedBy: userId,
        codeUsed: code,
        features: initialFeatures
    });

    groupCache.add(groupId);
    featureToggleCache.set(groupId, initialFeatures);

    return { success: true, message: '✅ 群組授權成功！' };
}

// === 功能開關邏輯 (Hierarchical) ===

async function toggleGroupFeature(groupId, featureKey, enable) {
    // Determine target path
    // Input could be 'life' (Category) or 'life.weather' (Item)
    // Or legacy 'weather' -> mapped to 'life.weather'

    let targetPath = featureKey;
    if (LEGACY_MAP[featureKey]) targetPath = LEGACY_MAP[featureKey];

    const parts = targetPath.split('.');
    const category = parts[0];
    const item = parts[1]; // undefined if toggling category

    // Check validity
    if (!FEATURE_HIERARCHY[category]) return { success: false, message: '❌ 無效的功能類別' };
    if (item && !FEATURE_HIERARCHY[category].items[item]) return { success: false, message: '❌ 無效的功能項目' };

    const groupRef = db.collection('groups').doc(groupId);
    const doc = await groupRef.get();
    if (!doc.exists) return { success: false, message: '❌ 群組尚未註冊' };

    // Firestore Update Path
    // if category: 'features.life.enabled'
    // if item: 'features.life.weather'
    const updateField = item ? `features.${category}.${item}` : `features.${category}.enabled`;

    await groupRef.update({ [updateField]: enable });

    // Update Cache
    // We need to fetch/update the object in cache
    let features = featureToggleCache.get(groupId);
    if (!features) {
        // Should catch from DB if cache empty? Usually reload handles it.
        // For now, partial update if exists
        features = doc.data().features || {};
    }

    if (!features[category]) features[category] = {};
    if (item) {
        features[category][item] = enable;
    } else {
        features[category].enabled = enable;
    }
    featureToggleCache.set(groupId, features);

    const name = item ? FEATURE_HIERARCHY[category].items[item] : FEATURE_HIERARCHY[category].label;
    return { success: true, message: `✅ 已${enable ? '開啟' : '關閉'}「${name}」` };
}

function isFeatureEnabled(groupId, featureKey) {
    if (!featureToggleCache.has(groupId)) return false;
    const features = featureToggleCache.get(groupId);

    // Resolve Key
    let target = featureKey;
    if (LEGACY_MAP[featureKey]) target = LEGACY_MAP[featureKey];

    const parts = target.split('.');
    const category = parts[0];
    const item = parts[1];

    if (!features || !features[category]) return false; // Category missing = disabled? or default? Safe false.

    // 1. Check Category Master Switch
    // If features[category].enabled is explicitly false, return false
    // Default to true if undefined? typically new schema has it.
    if (features[category].enabled === false) return false;

    // 2. Check Item Switch
    if (item) {
        if (features[category][item] === false) return false;
    }

    // Default True if not explicitly disabled
    return true;
}

// ... Exports and Admin logic ...

// === 管理員系統 ===

async function isAdmin(userId) {
    if (userId === ADMIN_USER_ID) return true;

    if (adminCache.isExpired()) {
        try {
            const snapshot = await db.collection('admins').get();
            adminCache.update(snapshot.docs.map(doc => doc.id));
            console.log('[Admin] 已重新載入管理員清單:', adminCache.cache.size, '個');
        } catch (error) {
            console.error('[Admin] 載入管理員清單失敗:', error);
        }
    }

    return adminCache.has(userId);
}

function isSuperAdmin(userId) {
    return userId === ADMIN_USER_ID;
}

async function addAdmin(targetUserId, addedBy, note = '') {
    await db.collection('admins').doc(targetUserId).set({
        addedAt: Firestore.FieldValue.serverTimestamp(),
        addedBy: addedBy,
        note: note
    });
    adminCache.add(targetUserId);
}

async function removeAdmin(targetUserId) {
    await db.collection('admins').doc(targetUserId).delete();
    adminCache.cache.delete(targetUserId);
}

async function getAdminList() {
    const snapshot = await db.collection('admins').get();
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}

// === 黑名單系統 ===

async function isBlacklisted(userId) {
    // Super Admin cannot be blacklisted
    if (userId === ADMIN_USER_ID) return false;

    if (blacklistCache.isExpired()) {
        try {
            const snapshot = await db.collection('blacklist').get();
            blacklistCache.update(snapshot.docs.map(doc => doc.id));
            console.log('[Auth] 已重新載入黑名單:', blacklistCache.cache.size, '人');
        } catch (error) {
            console.error('[Auth] 載入黑名單失敗:', error);
        }
    }
    return blacklistCache.has(userId);
}

async function blacklistUser(targetUserId, reason = '違反規定', executorId) {
    if (targetUserId === ADMIN_USER_ID) return { success: false, message: '❌ 無法封鎖超級管理員' };

    await db.collection('blacklist').doc(targetUserId).set({
        bannedAt: Firestore.FieldValue.serverTimestamp(),
        reason: reason,
        bannedBy: executorId
    });
    blacklistCache.add(targetUserId);
    return { success: true, message: `🚫 已將使用者 ${targetUserId} 加入黑名單。` };
}

async function unblacklistUser(targetUserId) {
    await db.collection('blacklist').doc(targetUserId).delete();
    blacklistCache.cache.delete(targetUserId);
    return { success: true, message: `⭕ 已解除使用者 ${targetUserId} 的黑名單。` };
}

// === 天氣功能 (Unified) ===

// Registration functions removed.

async function isWeatherAuthorized(groupId) {
    return isFeatureEnabled(groupId, 'weather');
}

// === 待辦功能 (Unified) ===

// Registration functions removed.

async function isTodoAuthorized(groupId) {
    return isFeatureEnabled(groupId, 'todo');
}

// === 餐廳功能 (Unified) ===

// Registration functions removed.

async function isRestaurantAuthorized(groupId) {
    return isFeatureEnabled(groupId, 'restaurant');
}

module.exports = {
    // 群組授權 & 功能開關
    isGroupAuthorized,
    toggleGroupFeature,
    isFeatureEnabled,
    generateRandomCode,
    createRegistrationCode,
    getUnusedCodes,
    registerGroup,
    // 管理員
    isAdmin,
    isSuperAdmin,
    addAdmin,
    removeAdmin,
    getAdminList,
    // 黑名單
    isBlacklisted,
    blacklistUser,
    unblacklistUser,
    // 天氣授權
    isWeatherAuthorized,
    // 待辦授權
    isTodoAuthorized,
    // 餐廳授權
    isRestaurantAuthorized
};
