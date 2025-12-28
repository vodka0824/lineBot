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

// 功能開關快取 (Key: groupId, Value: Set of disabled features)
const featureToggleCache = new Map();
let featureToggleCacheLastUpdated = 0;

// === 群組基礎授權 ===

async function isGroupAuthorized(groupId) {
    if (groupCache.isExpired()) {
        try {
            const snapshot = await db.collection('authorizedGroups').get();
            groupCache.update(snapshot.docs.map(doc => doc.id));

            // 同步更新功能開關快取
            featureToggleCache.clear();
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.disabledFeatures && Array.isArray(data.disabledFeatures)) {
                    featureToggleCache.set(doc.id, new Set(data.disabledFeatures));
                }
            });
            console.log('[Auth] 已重新載入授權群組與功能開關');
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

    if (!codeDoc.exists) {
        return { success: false, message: '❌ 無效的註冊碼' };
    }

    const codeData = codeDoc.data();
    if (codeData.used) {
        return { success: false, message: '❌ 此註冊碼已被使用' };
    }

    await codeRef.update({
        used: true,
        usedBy: groupId,
        usedByUser: userId,
        usedAt: Firestore.FieldValue.serverTimestamp()
    });

    await db.collection('authorizedGroups').doc(groupId).set({
        authorizedAt: Firestore.FieldValue.serverTimestamp(),
        authorizedBy: userId,
        codeUsed: code,
        disabledFeatures: [] // 預設開啟所有功能
    });

    groupCache.add(groupId);

    return { success: true, message: '✅ 群組授權成功！\n注意：天氣、餐廳與待辦功能需另外開通。' };
}

// === 功能開關邏輯 ===

async function toggleGroupFeature(groupId, feature, enable) {
    const groupRef = db.collection('authorizedGroups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) return { success: false, message: '❌ 群組尚未註冊' };

    let disabledFeatures = doc.data().disabledFeatures || [];

    if (enable) {
        disabledFeatures = disabledFeatures.filter(f => f !== feature);
    } else {
        if (!disabledFeatures.includes(feature)) {
            disabledFeatures.push(feature);
        }
    }

    await groupRef.update({ disabledFeatures: disabledFeatures });

    // 更新快取
    if (featureToggleCache.has(groupId)) {
        const set = featureToggleCache.get(groupId);
        if (enable) set.delete(feature);
        else set.add(feature);
    } else if (!enable) {
        featureToggleCache.set(groupId, new Set([feature]));
    }

    return { success: true, message: `✅ 已${enable ? '開啟' : '關閉'}「${feature}」功能` };
}

// 檢查功能是否開啟
function isFeatureEnabled(groupId, feature) {
    // 預設皆開啟 (若不再快取中或 disabledFeatures 中無此功能)
    if (!featureToggleCache.has(groupId)) return true;
    return !featureToggleCache.get(groupId).has(feature);
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

    await codeRef.update({
        used: true,
        usedBy: groupId,
        usedByUser: userId,
        usedAt: Firestore.FieldValue.serverTimestamp()
    });

    await db.collection('weatherAuthorized').doc(groupId).set({
        enabledAt: Firestore.FieldValue.serverTimestamp(),
        enabledBy: userId,
        codeUsed: code
    });
    weatherCache.add(groupId);

    return { success: true, message: '✅ 天氣查詢功能已啟用！' };
}

async function isWeatherAuthorized(groupId) {
    if (weatherCache.isExpired()) {
        try {
            const snapshot = await db.collection('weatherAuthorized').get();
            weatherCache.update(snapshot.docs.map(doc => doc.id));
        } catch (error) {
            console.error('[Weather] 載入授權失敗:', error);
        }
    }
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

    await codeRef.update({
        used: true,
        usedBy: groupId,
        usedByUser: userId,
        usedAt: Firestore.FieldValue.serverTimestamp()
    });

    await db.collection('todoAuthorized').doc(groupId).set({
        enabledAt: Firestore.FieldValue.serverTimestamp(),
        enabledBy: userId,
        codeUsed: code
    });
    todoCache.add(groupId);

    return { success: true, message: '✅ 待辦功能已啟用！' };
}

async function isTodoAuthorized(groupId) {
    if (todoCache.isExpired()) {
        try {
            const snapshot = await db.collection('todoAuthorized').get();
            todoCache.update(snapshot.docs.map(doc => doc.id));
        } catch (error) {
            console.error('[Todo] 載入授權失敗:', error);
        }
    }
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

    await codeRef.update({
        used: true,
        usedBy: groupId,
        usedByUser: userId,
        usedAt: Firestore.FieldValue.serverTimestamp()
    });

    await db.collection('restaurantAuthorized').doc(groupId).set({
        enabledAt: Firestore.FieldValue.serverTimestamp(),
        enabledBy: userId,
        codeUsed: code
    });
    restaurantCache.add(groupId);

    return { success: true, message: '✅ 附近餐廳功能已啟用！' };
}

async function isRestaurantAuthorized(groupId) {
    if (restaurantCache.isExpired()) {
        try {
            const snapshot = await db.collection('restaurantAuthorized').get();
            restaurantCache.update(snapshot.docs.map(doc => doc.id));
        } catch (error) {
            console.error('[Restaurant] 載入授權失敗:', error);
        }
    }
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
