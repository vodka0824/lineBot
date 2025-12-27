/**
 * 授權邏輯模組
 */
const { db, Firestore } = require('./firestore');
const { CachedCheck } = require('./cache');
const { ADMIN_USER_ID, CACHE_DURATION } = require('../config/constants');

// === 快取實例 ===
const groupCache = new CachedCheck(CACHE_DURATION.GROUP);
const adminCache = new CachedCheck(CACHE_DURATION.ADMIN);
const todoCache = new CachedCheck(CACHE_DURATION.TODO);
const restaurantCache = new CachedCheck(CACHE_DURATION.RESTAURANT);

// === 群組授權 ===

async function isGroupAuthorized(groupId) {
    if (groupCache.isExpired()) {
        try {
            const snapshot = await db.collection('authorizedGroups').get();
            groupCache.update(snapshot.docs.map(doc => doc.id));
            console.log('[Auth] 已重新載入授權群組清單:', groupCache.cache.size, '個');
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
        codeUsed: code
    });

    groupCache.add(groupId);

    return { success: true, message: '✅ 群組授權成功！現在可以使用所有功能了 🎉' };
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
    // 群組授權
    isGroupAuthorized,
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
    // 待辦授權
    generateTodoCode,
    useTodoCode,
    isTodoAuthorized,
    // 餐廳授權
    generateRestaurantCode,
    useRestaurantCode,
    isRestaurantAuthorized
};
