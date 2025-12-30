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

// === 群組基礎授權 (New Unified Schema) ===

async function isGroupAuthorized(groupId) {
    if (groupCache.isExpired()) {
        try {
            const snapshot = await db.collection('groups').where('status', '==', 'active').get();
            groupCache.update(snapshot.docs.map(doc => doc.id));

            // 同步更新功能開關快取 & 授權快取
            featureToggleCache.clear();

            // Clear specialized caches (Legacy support or deprecated)
            weatherCache.clear();
            restaurantCache.clear();
            todoCache.clear();

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const features = data.features || {};

                const groupFeatureMap = new Map();
                for (const [key, config] of Object.entries(features)) {
                    // Simplified logic: Check only 'enabled'
                    // If config is object { enabled: true }, use it.
                    // If config is boolean (legacy?), handle it.
                    const isEnabled = (typeof config === 'object') ? config.enabled : !!config;

                    groupFeatureMap.set(key, isEnabled);

                    // Update legacy specialized caches for compatibility until getters are updated
                    if (isEnabled) {
                        if (key === 'weather') weatherCache.add(doc.id);
                        if (key === 'restaurant') restaurantCache.add(doc.id);
                        if (key === 'todo') todoCache.add(doc.id);
                    }
                }
                featureToggleCache.set(doc.id, groupFeatureMap);
            });
            console.log('[Auth] 已重新載入授權群組 (Unified)');
        } catch (error) {
            console.error('[Auth] 載入授權群組失敗:', error);
        }
    }
    return groupCache.has(groupId);
}

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

    // Write to NEW collection
    await db.collection('groups').doc(groupId).set({
        status: 'active',
        authorizedAt: Firestore.FieldValue.serverTimestamp(),
        authorizedBy: userId,
        codeUsed: code,
        features: {
            ai: { enabled: true },
            game: { enabled: true },
            weather: { enabled: true }, // Default enabled
            restaurant: { enabled: true }, // Default enabled
            todo: { enabled: true }, // Default enabled
            finance: { enabled: true }, // Default enabled (Limited feature)
            delivery: { enabled: true } // Default enabled (Limited feature)
        }
    });

    groupCache.add(groupId);
    // Init feature cache
    const fMap = new Map();
    fMap.set('ai', true);
    fMap.set('game', true);
    featureToggleCache.set(groupId, fMap);

    return { success: true, message: '✅ 群組授權成功！' };
}

// === 功能開關邏輯 (Unified) ===

async function toggleGroupFeature(groupId, feature, enable) {
    const groupRef = db.collection('groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) return { success: false, message: '❌ 群組尚未註冊' };

    // Check if feature exists in schema, if not init it
    const data = doc.data();
    // Use default { enabled: false } if not present (or should it be true?)
    // If we want simplified flow, maybe just respect what is in DB.
    // If not in DB, it implies disabled? Or enabled?
    // Based on registerGroup, we put them there.
    // So if missing, default false is safe.

    // License check removed as requested.

    const updatePath = `features.${feature}.enabled`;
    await groupRef.update({ [updatePath]: enable });

    // Update Cache
    let groupMap = featureToggleCache.get(groupId);
    if (!groupMap) {
        groupMap = new Map();
        featureToggleCache.set(groupId, groupMap);
    }
    groupMap.set(feature, enable);

    return { success: true, message: `✅ 已${enable ? '開啟' : '關閉'}「${feature}」功能` };
}

// 檢查功能是否開啟
function isFeatureEnabled(groupId, feature) {
    if (!featureToggleCache.has(groupId)) return false; // Default safe check: if not in cache (meaning not auth group), false
    const map = featureToggleCache.get(groupId);
    if (map && map.has(feature)) {
        return map.get(feature);
    }
    // Default fallback for unknown features? Or strictly false?
    // Let's assume default false if not explicitly set in our new schema
    return false;
}


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
