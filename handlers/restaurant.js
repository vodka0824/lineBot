/**
 * 餐廳搜尋模組
 */
const axios = require('axios');
const { GOOGLE_PLACES_API_KEY } = require('../config/constants');

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

module.exports = {
    searchNearbyRestaurants,
    buildRestaurantFlex,
    setPendingLocation,
    getPendingLocation,
    clearPendingLocation,
    pendingLocationRequests
};
