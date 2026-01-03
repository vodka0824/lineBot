const { Firestore } = require('@google-cloud/firestore');
const db = new Firestore();

const STATE_EXPIRY = 5 * 60 * 1000; // 5 minutes

/**
 * 設定用戶狀態
 */
async function setUserState(userId, action, data = {}) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + STATE_EXPIRY);

    await db.collection('userStates').doc(userId).set({
        action,
        ...data,
        createdAt: Firestore.FieldValue.serverTimestamp(),
        expiresAt: Firestore.Timestamp.fromDate(expiresAt)
    });
}

/**
 * 取得用戶狀態
 */
async function getUserState(userId) {
    try {
        const doc = await db.collection('userStates').doc(userId).get();
        if (!doc.exists) return null;

        const state = doc.data();
        const now = new Date();

        // 檢查是否過期
        if (state.expiresAt.toDate() < now) {
            await clearUserState(userId);
            return null;
        }

        return state;
    } catch (error) {
        console.error('[UserState] Error getting state:', error);
        return null;
    }
}

/**
 * 清除用戶狀態
 */
async function clearUserState(userId) {
    try {
        await db.collection('userStates').doc(userId).delete();
    } catch (error) {
        console.error('[UserState] Error clearing state:', error);
    }
}

module.exports = {
    setUserState,
    getUserState,
    clearUserState
};
