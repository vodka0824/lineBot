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

            // Clear specialized caches as they are now derived
            weatherCache.clear();
            restaurantCache.clear();
            todoCache.clear();

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const features = data.features || {};

                // 1. Feature Toggles
                // In new schema, we store "enabled" state directly.
                // But to be compatible with cache check isFeatureEnabled(groupId, feature),
                // we map it back to a set of disabled features if needed, OR change cache structure.
                // Let's change featureToggleCache to store ENABLED features map or config.
                // Actually, let's keep it simple: Map<groupId, Map<feature, boolean>>

                const groupFeatureMap = new Map();
                for (const [key, config] of Object.entries(features)) {
                    // key: 'weather', config: { enabled: true, licensed: true }
                    // Overall enabled = licensed (if required) AND enabled
                    let isEnabled = config.enabled;
                    if (config.licensed === false) isEnabled = false; // logic: must be licensed to be enabled

                    groupFeatureMap.set(key, isEnabled);

                    // Update legacy specialized caches
                    if ((key === 'weather' || key === 'restaurant' || key === 'todo') && config.licensed) {
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
            weather: { licensed: false, enabled: false },
            restaurant: { licensed: false, enabled: false },
            todo: { licensed: false, enabled: false }
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
    // Special handling for licensed features: cannot enable if not licensed
    const data = doc.data();
    const currentConfig = (data.features && data.features[feature]) || { enabled: false };

    // Check licensing for special features
    if (['weather', 'restaurant', 'todo'].includes(feature)) {
        if (!currentConfig.licensed && enable) {
            return { success: false, message: '❌ 此功能尚未取得授權 (需使用註冊碼)' };
        }
    }

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

// === 天氣功能授權 (獨立) ===

async function generateWeatherCode() {
    const code = 'WX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.collection('weatherRegistrationCodes').doc(code).set({
        createdAt: Firestore.FieldValue.serverTimestamp(),
        used: false
    });
    return code;
}

async function useWeatherCode(code, groupId, userId) {
    const codeRef = db.collection('weatherRegistrationCodes').doc(code);
    const codeDoc = await codeRef.get();

    if (!codeDoc.exists) return { success: false, message: '❌ 無效的註冊碼' };
    if (codeDoc.data().used) return { success: false, message: '❌ 此註冊碼已被使用' };

    // 檢查群組是否存在
    const groupRef = db.collection('groups').doc(groupId);
    const groupDoc = await groupRef.get();
    if (!groupDoc.exists) return { success: false, message: '❌ 群組尚未註冊 (請先使用一般群組註冊碼)' };

    await codeRef.update({
        used: true,
        usedBy: groupId,
        usedByUser: userId,
        usedAt: Firestore.FieldValue.serverTimestamp()
    });

    // Update in GROUPS collection
    await groupRef.update({
        'features.weather.licensed': true,
        'features.weather.enabled': true, // Enable by default on license
        'features.weather.licenseCode': code,
        'features.weather.licensedAt': Firestore.FieldValue.serverTimestamp()
    });

    // Update Cache
    weatherCache.add(groupId);
    if (featureToggleCache.has(groupId)) {
        featureToggleCache.get(groupId).set('weather', true);
    }

    return { success: true, message: '✅ 天氣查詢功能已啟用！' };
}

async function isWeatherAuthorized(groupId) {
    // Use generic cache check which is populated by isGroupAuthorized
    // Or call isFeatureEnabled? 
    // Usually isWeatherAuthorized implies LICENSED. 
    // But since we consolidated, we can check cache.
    // However, legacy logic might separate "Authorized" (License) vs "Enabled" (Toggle).
    // Let's assume Authorized = Licensed.
    return weatherCache.has(groupId);
}

// === 待辦功能授權 ===

async function generateTodoCode() {
    const code = 'TODO-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.collection('todoRegistrationCodes').doc(code).set({
        createdAt: Firestore.FieldValue.serverTimestamp(),
        used: false
    });
    return code;
}

async function useTodoCode(code, groupId, userId) {
    const codeRef = db.collection('todoRegistrationCodes').doc(code);
    const codeDoc = await codeRef.get();

    if (!codeDoc.exists) return { success: false, message: '❌ 無效的註冊碼' };
    if (codeDoc.data().used) return { success: false, message: '❌ 此註冊碼已被使用' };

    const groupRef = db.collection('groups').doc(groupId);
    if (!(await groupRef.get()).exists) return { success: false, message: '❌ 群組尚未註冊' };

    await codeRef.update({ used: true, usedBy: groupId, usedByUser: userId, usedAt: Firestore.FieldValue.serverTimestamp() });

    await groupRef.update({
        'features.todo.licensed': true,
        'features.todo.enabled': true,
        'features.todo.licenseCode': code,
        'features.todo.licensedAt': Firestore.FieldValue.serverTimestamp()
    });

    todoCache.add(groupId);
    if (featureToggleCache.has(groupId)) featureToggleCache.get(groupId).set('todo', true);

    return { success: true, message: '✅ 待辦功能已啟用！' };
}

async function isTodoAuthorized(groupId) {
    return todoCache.has(groupId);
}

// === 餐廳功能授權 ===

async function generateRestaurantCode() {
    const code = 'FOOD-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.collection('restaurantRegistrationCodes').doc(code).set({
        createdAt: Firestore.FieldValue.serverTimestamp(),
        used: false
    });
    return code;
}

async function useRestaurantCode(code, groupId, userId) {
    const codeRef = db.collection('restaurantRegistrationCodes').doc(code);
    const codeDoc = await codeRef.get();

    if (!codeDoc.exists) return { success: false, message: '❌ 無效的註冊碼' };
    if (codeDoc.data().used) return { success: false, message: '❌ 此註冊碼已被使用' };

    const groupRef = db.collection('groups').doc(groupId);
    if (!(await groupRef.get()).exists) return { success: false, message: '❌ 群組尚未註冊' };

    await codeRef.update({ used: true, usedBy: groupId, usedByUser: userId, usedAt: Firestore.FieldValue.serverTimestamp() });

    await groupRef.update({
        'features.restaurant.licensed': true,
        'features.restaurant.enabled': true,
        'features.restaurant.licenseCode': code,
        'features.restaurant.licensedAt': Firestore.FieldValue.serverTimestamp()
    });

    restaurantCache.add(groupId);
    if (featureToggleCache.has(groupId)) featureToggleCache.get(groupId).set('restaurant', true);

    return { success: true, message: '✅ 附近餐廳功能已啟用！' };
}

async function isRestaurantAuthorized(groupId) {
    return restaurantCache.has(groupId);
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
    generateWeatherCode,
    useWeatherCode,
    isWeatherAuthorized,
    // 待辦授權
    generateTodoCode,
    useTodoCode,
    isTodoAuthorized,
    // 餐廳授權
    generateRestaurantCode,
    useRestaurantCode,
    isRestaurantAuthorized
};
