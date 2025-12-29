/**
 * 餐廳搜尋模組
 */
const axios = require('axios');
const { GOOGLE_PLACES_API_KEY } = require('../config/constants');
const { db, Firestore } = require('../utils/firestore');

// 等待位置分享的用戶
const pendingLocationRequests = {};

// 搜尋附近餐廳
async function searchNearbyRestaurants(lat, lng, radius = 500) {
    try {
        const url = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
        const params = {
            location: `${lat},${lng}`,
            radius: radius,
            type: 'restaurant',
            language: 'zh-TW',
            key: GOOGLE_PLACES_API_KEY
        };

        const res = await axios.get(url, { params, timeout: 10000 });

        if (res.data.status !== 'OK' && res.data.status !== 'ZERO_RESULTS') {
            console.error('Places API 錯誤:', res.data.status);
            return null;
        }

        const results = res.data.results || [];

        return results
            .filter(r => r.rating)
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 5)
            .map(r => ({
                name: r.name,
                rating: r.rating || 0,
                userRatingsTotal: r.user_ratings_total || 0,
                vicinity: r.vicinity || '',
                priceLevel: r.price_level,
                isOpen: r.opening_hours?.open_now,
                types: r.types || [],
                placeId: r.place_id
            }));
    } catch (error) {
        console.error('搜尋附近餐廳錯誤:', error);
        return null;
    }
}

// 建立餐廳 Flex Message
function buildRestaurantFlex(restaurants, address) {
    const bubbles = restaurants.map((r, index) => {
        const priceText = r.priceLevel ? '💰'.repeat(r.priceLevel) : '';
        const openText = r.isOpen === true ? '🟢 營業中' : (r.isOpen === false ? '🔴 休息中' : '');

        return {
            type: 'bubble',
            size: 'kilo',
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'text',
                        text: `${index + 1}. ${r.name}`,
                        weight: 'bold',
                        size: 'md',
                        wrap: true
                    },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                            { type: 'text', text: `⭐ ${r.rating}`, size: 'sm', color: '#FF8C00' },
                            { type: 'text', text: `(${r.userRatingsTotal} 則)`, size: 'sm', color: '#888888' },
                            { type: 'text', text: priceText || '-', size: 'sm', align: 'end' }
                        ],
                        margin: 'sm'
                    },
                    {
                        type: 'text',
                        text: r.vicinity,
                        size: 'xs',
                        color: '#666666',
                        wrap: true,
                        margin: 'sm'
                    },
                    {
                        type: 'text',
                        text: openText,
                        size: 'xs',
                        color: r.isOpen ? '#00AA00' : '#CC0000',
                        margin: 'sm'
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'button',
                        action: {
                            type: 'uri',
                            label: '📍 Google 地圖',
                            uri: `https://www.google.com/maps/place/?q=place_id:${r.placeId}`
                        },
                        style: 'primary',
                        height: 'sm',
                        color: '#4285F4'
                    }
                ]
            }
        };
    });

    return {
        type: 'carousel',
        contents: bubbles
    };
}

// 設置等待位置請求
function setPendingLocation(userId, groupId) {
    pendingLocationRequests[userId] = {
        groupId: groupId,
        timestamp: Date.now()
    };
}

// 取得等待位置請求
function getPendingLocation(userId) {
    const request = pendingLocationRequests[userId];
    if (!request || (Date.now() - request.timestamp > 5 * 60 * 1000)) {
        delete pendingLocationRequests[userId];
        return null;
    }
    return request;
}

// 清除等待位置請求
function clearPendingLocation(userId) {
    delete pendingLocationRequests[userId];
}

// === DB Operations for Custom Restaurants ===

async function addRestaurant(groupId, name, userId) {
    const ref = db.collection('restaurants').doc(groupId);
    const doc = await ref.get();
    const newItem = { name, createdBy: userId, createdAt: Date.now() };

    if (doc.exists) {
        await ref.update({
            items: Firestore.FieldValue.arrayUnion(newItem)
        });
    } else {
        await ref.set({ items: [newItem] });
    }
    return newItem;
}

async function removeRestaurant(groupId, name) {
    const ref = db.collection('restaurants').doc(groupId);
    const doc = await ref.get();
    if (!doc.exists) return false;

    const items = doc.data().items || [];
    const newItems = items.filter(r => r.name !== name);

    if (items.length === newItems.length) return false;

    await ref.update({ items: newItems });
    return true;
}

async function getRestaurantList(groupId) {
    const doc = await db.collection('restaurants').doc(groupId).get();
    if (!doc.exists) return [];
    return doc.data().items || [];
}

// === Queue Handlers ===

async function handleAddRestaurant(replyToken, groupId, userId, name) {
    const lineUtils = require('../utils/line');
    if (!name) return lineUtils.replyText(replyToken, '❌ 請輸入餐廳名稱');

    await addRestaurant(groupId, name.trim(), userId);
    await lineUtils.replyText(replyToken, `✅ 已新增餐廳：${name}`);
}

async function handleRemoveRestaurant(replyToken, groupId, userId, name) {
    const lineUtils = require('../utils/line');
    if (!name) return lineUtils.replyText(replyToken, '❌ 請輸入餐廳名稱');

    const success = await removeRestaurant(groupId, name.trim());
    if (success) {
        await lineUtils.replyText(replyToken, `🗑️ 已移除餐廳：${name}`);
    } else {
        await lineUtils.replyText(replyToken, `❌ 找不到餐廳：${name}`);
    }
}

async function handleListRestaurants(replyToken, groupId) {
    const lineUtils = require('../utils/line');
    const list = await getRestaurantList(groupId);

    if (list.length === 0) {
        await lineUtils.replyText(replyToken, '📝 清單是空的');
    } else {
        const names = list.map(r => `• ${r.name}`).join('\n');
        await lineUtils.replyText(replyToken, `🍽️ 餐廳清單：\n${names}`);
    }
}

async function handleEatCommand(replyToken, groupId, userId, query) {
    const lineUtils = require('../utils/line');

    // 1. 如果有指定關鍵字，搜尋附近 (需要位置，這裡簡化為提示用戶傳送位置)
    // 但原邏輯 searchNearbyRestaurants 需要 lat/lng
    // 這裡我們實作邏輯：
    // 如果 query 存在，嘗試從自訂清單過濾，或者提示需要位置

    // 目前需求：直接隨機選一個自訂餐廳
    if (!query) {
        const list = await getRestaurantList(groupId);
        if (list.length > 0) {
            const random = list[Math.floor(Math.random() * list.length)];
            await lineUtils.replyText(replyToken, `🎰 命運的選擇：${random.name}`);
            return;
        }

        // 若清單為空，提示使用 API 或新增
        await lineUtils.replyText(replyToken, '📝 清單是空的，請先「新增餐廳」或輸入「吃什麼 [地點]」來查詢');
        return;
    }

    // 如果有 Query，通常是地點搜尋
    // 需要請求位置 (這裡省略複雜流程，直接回覆提示)
    // 或是如果 query 是 "附近"，觸發位置請求

    if (query.includes('附近')) {
        setPendingLocation(userId, groupId);
        await lineUtils.replyText(replyToken, '📍 請傳送位置訊息給我，幫你找附近的餐廳！', [
            {
                action: { type: 'location', label: '📍 傳送位置' } // Quick reply logic if supported by utils
            }
        ]);
        // Note: lineUtils.replyText usually doesn't support quick reply directly unless passing explicit object.
        // Assuming basic text for now.
    } else {
        await lineUtils.replyText(replyToken, `❓ 如果要搜尋特定地點餐廳，請使用「吃什麼 附近」並傳送位置。`);
    }
}

module.exports = {
    searchNearbyRestaurants,
    buildRestaurantFlex,
    setPendingLocation,
    getPendingLocation,
    clearPendingLocation,
    pendingLocationRequests,
    // New
    handleAddRestaurant,
    handleRemoveRestaurant,
    handleListRestaurants,
    handleEatCommand
};
