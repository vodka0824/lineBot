const axios = require('axios');
const { google } = require('googleapis');
const { Firestore } = require('@google-cloud/firestore');
const cheerio = require('cheerio');
const OpenCC = require('opencc-js');

// 簡體轉繁體轉換器
const s2tw = OpenCC.Converter({ from: 'cn', to: 'twp' });

// === 1. 設定區 (從設定檔讀取) ===
const {
  CHANNEL_ACCESS_TOKEN,
  GEMINI_API_KEY,
  ADMIN_USER_ID,
  GOOGLE_PLACES_API_KEY,
  CRAWLER_URLS,
  KEYWORD_MAP,
  CACHE_DURATION: CACHE_CONFIG
} = require('./config/constants');
const lineUtils = require('./utils/line');
const authUtils = require('./utils/auth');
const {
  crawlOilPrice,
  crawlNewMovies,
  crawlAppleNews,
  crawlTechNews,
  crawlPttHot,
  getRandomJav
} = require('./handlers/crawler');
const { getGeminiReply } = require('./handlers/ai');
const { handleRPS } = require('./handlers/game');
const { handleWeather } = require('./handlers/weather');
const systemHandler = require('./handlers/system');

// === Firestore 初始化 ===
const db = new Firestore();

// === 3. 快取記憶體設定 ===
let driveCache = {
  lastUpdated: {},
  fileLists: {}
};
const CACHE_DURATION = CACHE_CONFIG.DRIVE;

// === 群組授權快取 ===
let authorizedGroupsCache = new Set();
let groupCacheLastUpdated = 0;
const GROUP_CACHE_DURATION = CACHE_CONFIG.GROUP;

// === 管理員快取 ===
let adminsCache = new Set();
let adminsCacheLastUpdated = 0;
const ADMIN_CACHE_DURATION = CACHE_CONFIG.ADMIN;

// === 群組授權功能 ===

// 檢查群組是否已授權
async function isGroupAuthorized(groupId) {
  const now = Date.now();

  // 如果快取過期，重新載入
  if (now - groupCacheLastUpdated > GROUP_CACHE_DURATION) {
    try {
      const snapshot = await db.collection('authorizedGroups').get();
      authorizedGroupsCache = new Set(snapshot.docs.map(doc => doc.id));
      groupCacheLastUpdated = now;
      console.log('[Auth] 已重新載入授權群組清單:', authorizedGroupsCache.size, '個');
    } catch (error) {
      console.error('[Auth] 載入授權群組失敗:', error);
    }
  }

  return authorizedGroupsCache.has(groupId);
}

// 產生 8 位隨機註冊碼
function generateRandomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除容易混淆的字元
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 產生註冊碼並儲存到 Firestore
async function createRegistrationCode(userId) {
  const code = generateRandomCode();
  await db.collection('registrationCodes').doc(code).set({
    createdAt: Firestore.FieldValue.serverTimestamp(),
    createdBy: userId,
    used: false
  });
  return code;
}

// 查看未使用的註冊碼
async function getUnusedCodes() {
  const snapshot = await db.collection('registrationCodes')
    .where('used', '==', false)
    .get();
  return snapshot.docs.map(doc => doc.id);
}

// === 管理員系統功能 ===

// 檢查是否為管理員（超級管理員或一般管理員）
async function isAdmin(userId) {
  // 超級管理員永遠是管理員
  if (userId === ADMIN_USER_ID) return true;

  const now = Date.now();

  // 如果快取過期，重新載入
  if (now - adminsCacheLastUpdated > ADMIN_CACHE_DURATION) {
    try {
      const snapshot = await db.collection('admins').get();
      adminsCache = new Set(snapshot.docs.map(doc => doc.id));
      adminsCacheLastUpdated = now;
      console.log('[Admin] 已重新載入管理員清單:', adminsCache.size, '個');
    } catch (error) {
      console.error('[Admin] 載入管理員清單失敗:', error);
    }
  }

  return adminsCache.has(userId);
}

// 檢查是否為超級管理員
function isSuperAdmin(userId) {
  return userId === ADMIN_USER_ID;
}

// 新增管理員
async function addAdmin(targetUserId, addedBy, note = '') {
  await db.collection('admins').doc(targetUserId).set({
    addedAt: Firestore.FieldValue.serverTimestamp(),
    addedBy: addedBy,
    note: note
  });
  adminsCache.add(targetUserId);
}

// 刪除管理員
async function removeAdmin(targetUserId) {
  await db.collection('admins').doc(targetUserId).delete();
  adminsCache.delete(targetUserId);
}

// 取得所有管理員清單
async function getAdminList() {
  const snapshot = await db.collection('admins').get();
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

// 使用註冊碼授權群組
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

  // 標記註冊碼已使用
  await codeRef.update({
    used: true,
    usedBy: groupId,
    usedByUser: userId,
    usedAt: Firestore.FieldValue.serverTimestamp()
  });

  // 新增授權群組
  await db.collection('authorizedGroups').doc(groupId).set({
    authorizedAt: Firestore.FieldValue.serverTimestamp(),
    authorizedBy: userId,
    codeUsed: code
  });

  // 更新快取
  authorizedGroupsCache.add(groupId);

  return { success: true, message: '✅ 群組授權成功！現在可以使用所有功能了 🎉' };
}

// === 限時抽獎系統 ===

// 抽獎快取（記憶體存儲活躍抽獎）
let activeLotteries = {};

// 開始抽獎
async function startLottery(groupId, minutes, winners, keyword, prize, createdBy) {
  const now = Date.now();
  const endTime = now + (minutes * 60 * 1000);

  const lotteryData = {
    active: true,
    keyword: keyword,
    prize: prize,
    winners: winners,
    startTime: now,
    endTime: endTime,
    createdBy: createdBy,
    participants: []
  };

  // 存入 Firestore
  await db.collection('lotteries').doc(groupId).set(lotteryData);

  // 存入快取
  activeLotteries[groupId] = lotteryData;

  return lotteryData;
}

// 參加抽獎
async function joinLottery(groupId, userId) {
  // 先從快取取得
  let lottery = activeLotteries[groupId];

  if (!lottery) {
    // 從 Firestore 取得
    const doc = await db.collection('lotteries').doc(groupId).get();
    if (!doc.exists || !doc.data().active) {
      return { success: false, message: '目前沒有進行中的抽獎' };
    }
    lottery = doc.data();
    activeLotteries[groupId] = lottery;
  }

  // 檢查是否已過期
  if (Date.now() > lottery.endTime) {
    return { success: false, message: '⏰ 抽獎時間已結束，等待開獎中...' };
  }

  // 檢查是否已參加
  if (lottery.participants.includes(userId)) {
    return { success: false, message: '你已經報名過了！' };
  }

  // 加入參加者
  lottery.participants.push(userId);
  activeLotteries[groupId] = lottery;

  // 更新 Firestore
  await db.collection('lotteries').doc(groupId).update({
    participants: Firestore.FieldValue.arrayUnion(userId)
  });

  return {
    success: true,
    message: `✅ 報名成功！目前 ${lottery.participants.length} 人參加`,
    count: lottery.participants.length
  };
}

// 開獎
async function drawLottery(groupId) {
  let lottery = activeLotteries[groupId];

  if (!lottery) {
    const doc = await db.collection('lotteries').doc(groupId).get();
    if (!doc.exists || !doc.data().active) {
      return { success: false, message: '❌ 目前沒有進行中的抽獎' };
    }
    lottery = doc.data();
  }

  const participants = lottery.participants;

  if (participants.length === 0) {
    // 關閉抽獎
    await db.collection('lotteries').doc(groupId).update({ active: false });
    delete activeLotteries[groupId];
    return { success: false, message: '❌ 沒有人參加抽獎，活動取消' };
  }

  // 隨機抽選得獎者
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  const winnerCount = Math.min(lottery.winners, participants.length);
  const winners = shuffled.slice(0, winnerCount);

  // 關閉抽獎並記錄結果
  await db.collection('lotteries').doc(groupId).update({
    active: false,
    winners: winners,
    drawnAt: Firestore.FieldValue.serverTimestamp()
  });
  delete activeLotteries[groupId];

  return {
    success: true,
    prize: lottery.prize,
    winners: winners,
    totalParticipants: participants.length,
    winnerCount: winnerCount
  };
}

// 取得抽獎狀態
async function getLotteryStatus(groupId) {
  let lottery = activeLotteries[groupId];

  if (!lottery) {
    const doc = await db.collection('lotteries').doc(groupId).get();
    if (!doc.exists || !doc.data().active) {
      return null;
    }
    lottery = doc.data();
  }

  const now = Date.now();
  const remaining = Math.max(0, lottery.endTime - now);
  const remainingMinutes = Math.ceil(remaining / 60000);

  return {
    keyword: lottery.keyword,
    prize: lottery.prize,
    winners: lottery.winners,
    participants: lottery.participants.length,
    remainingMinutes: remainingMinutes,
    isExpired: remaining <= 0
  };
}

// 取消抽獎
async function cancelLottery(groupId) {
  await db.collection('lotteries').doc(groupId).update({ active: false });
  delete activeLotteries[groupId];
}



// === 群組待辦事項功能 ===

// 待辦授權快取
let todoAuthorizedCache = new Set();
let todoCacheLastUpdated = 0;
const TODO_CACHE_DURATION = CACHE_CONFIG.TODO;

// 暫存待新增的待辦事項（等待選擇優先級）
const pendingTodos = {};

// 產生待辦註冊碼（超級管理員專用）
async function generateTodoCode() {
  const code = 'TODO-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  await db.collection('todoRegistrationCodes').doc(code).set({
    createdAt: Firestore.FieldValue.serverTimestamp(),
    used: false
  });
  return code;
}

// 驗證並使用待辦註冊碼
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

  // 標記為已使用
  await codeRef.update({
    used: true,
    usedBy: groupId,
    usedByUser: userId,
    usedAt: Firestore.FieldValue.serverTimestamp()
  });

  // 啟用待辦功能
  await db.collection('todoAuthorized').doc(groupId).set({
    enabledAt: Firestore.FieldValue.serverTimestamp(),
    enabledBy: userId,
    codeUsed: code
  });
  todoAuthorizedCache.add(groupId);

  return { success: true, message: '✅ 待辦功能已啟用！' };
}

// 檢查群組是否已啟用待辦功能
async function isTodoAuthorized(groupId) {
  const now = Date.now();

  if (now - todoCacheLastUpdated > TODO_CACHE_DURATION) {
    try {
      const snapshot = await db.collection('todoAuthorized').get();
      todoAuthorizedCache = new Set(snapshot.docs.map(doc => doc.id));
      todoCacheLastUpdated = now;
    } catch (error) {
      console.error('[Todo] 載入授權失敗:', error);
    }
  }

  return todoAuthorizedCache.has(groupId);
}

// === 餐廳功能授權機制 ===

// 餐廳授權快取
let restaurantAuthorizedCache = new Set();
let restaurantCacheLastUpdated = 0;
const RESTAURANT_CACHE_DURATION = 5 * 60 * 1000; // 5 分鐘

// 產生餐廳註冊碼（超級管理員專用）
async function generateRestaurantCode() {
  const code = 'FOOD-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  await db.collection('restaurantRegistrationCodes').doc(code).set({
    createdAt: Firestore.FieldValue.serverTimestamp(),
    used: false
  });
  return code;
}

// 驗證並使用餐廳註冊碼
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

  // 標記為已使用
  await codeRef.update({
    used: true,
    usedBy: groupId,
    usedByUser: userId,
    usedAt: Firestore.FieldValue.serverTimestamp()
  });

  // 啟用餐廳功能
  await db.collection('restaurantAuthorized').doc(groupId).set({
    enabledAt: Firestore.FieldValue.serverTimestamp(),
    enabledBy: userId,
    codeUsed: code
  });
  restaurantAuthorizedCache.add(groupId);

  return { success: true, message: '✅ 附近餐廳功能已啟用！' };
}

// 檢查群組是否已啟用餐廳功能
async function isRestaurantAuthorized(groupId) {
  const now = Date.now();

  if (now - restaurantCacheLastUpdated > RESTAURANT_CACHE_DURATION) {
    try {
      const snapshot = await db.collection('restaurantAuthorized').get();
      restaurantAuthorizedCache = new Set(snapshot.docs.map(doc => doc.id));
      restaurantCacheLastUpdated = now;
    } catch (error) {
      console.error('[Restaurant] 載入授權失敗:', error);
    }
  }

  return restaurantAuthorizedCache.has(groupId);
}

// 新增待辦事項（含優先級）
async function addTodo(groupId, text, userId, priority = 'low') {
  const todoRef = db.collection('todos').doc(groupId);
  const doc = await todoRef.get();

  const priorityOrder = { high: 1, medium: 2, low: 3 };
  const priorityEmoji = { high: '🔴', medium: '🟡', low: '🟢' };

  const newItem = {
    text: text,
    priority: priority,
    priorityOrder: priorityOrder[priority] || 3,
    done: false,
    createdAt: Date.now(),
    createdBy: userId
  };

  if (doc.exists) {
    await todoRef.update({
      items: Firestore.FieldValue.arrayUnion(newItem)
    });
  } else {
    await todoRef.set({
      items: [newItem]
    });
  }

  return { ...newItem, emoji: priorityEmoji[priority] };
}

// 取得待辦事項列表（依優先級排序）
async function getTodoList(groupId) {
  const doc = await db.collection('todos').doc(groupId).get();
  if (!doc.exists) {
    return [];
  }
  const items = doc.data().items || [];
  // 依優先級排序
  return items.sort((a, b) => (a.priorityOrder || 3) - (b.priorityOrder || 3));
}

// 完成待辦事項
async function completeTodo(groupId, index) {
  const todoRef = db.collection('todos').doc(groupId);
  const doc = await todoRef.get();

  if (!doc.exists) {
    return { success: false, message: '沒有待辦事項' };
  }

  const items = doc.data().items || [];
  if (index < 0 || index >= items.length) {
    return { success: false, message: '無效的編號' };
  }

  const item = items[index];
  if (item.done) {
    return { success: false, message: '此項目已完成' };
  }

  items[index].done = true;
  items[index].completedAt = Date.now();
  await todoRef.update({ items: items });

  return { success: true, text: item.text };
}

// 刪除待辦事項
async function deleteTodo(groupId, index) {
  const todoRef = db.collection('todos').doc(groupId);
  const doc = await todoRef.get();

  if (!doc.exists) {
    return { success: false, message: '沒有待辦事項' };
  }

  const items = doc.data().items || [];
  if (index < 0 || index >= items.length) {
    return { success: false, message: '無效的編號' };
  }

  const deletedItem = items.splice(index, 1)[0];
  await todoRef.update({ items: items });

  return { success: true, text: deletedItem.text };
}

// 清空待辦事項
async function clearTodos(groupId) {
  await db.collection('todos').doc(groupId).set({ items: [] });
}



// === 附近美食搜尋功能 ===

// 等待位置分享的用戶（用戶輸入「附近餐廳」後等待位置）
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

    // 按評分排序，取前 5 筆
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
              {
                type: 'text',
                text: `⭐ ${r.rating}`,
                size: 'sm',
                color: '#FF8C00'
              },
              {
                type: 'text',
                text: `(${r.userRatingsTotal} 則)`,
                size: 'sm',
                color: '#888888'
              },
              {
                type: 'text',
                text: priceText || '-',
                size: 'sm',
                align: 'end'
              }
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

/**
 * 處理通用指令（群組與超級管理員私訊共用）
 * @returns {Promise<boolean>} 是否已處理
 */
/**
 * 處理通用指令 (根據權限矩陣)
 */
async function handleCommonCommands(message, replyToken, sourceType, userId, groupId) {
  const isSuper = authUtils.isSuperAdmin(userId);
  const isGroup = (sourceType === 'group' || sourceType === 'room');
  const isAuthorizedGroup = isGroup ? await authUtils.isGroupAuthorized(groupId) : false;

  // === 1. 公開功能 (Public: Admin/User/Group) ===

  // 財務計算 - 分唄
  if (/^分唄\d+$/.test(message)) {
    const amount = Number(message.slice(2));
    const result = Math.ceil(amount * 1.08 / 30); // 簡易費率 1.08
    await lineUtils.replyText(replyToken, `💰 分唄 (30期): ${result} 元/期`);
    return true;
  }
  // 財務計算 - 銀角
  if (/^銀角\d+$/.test(message)) {
    const amount = Number(message.slice(2));
    const result = Math.ceil(amount * 1.07 / 24); // 簡易費率 1.07
    await lineUtils.replyText(replyToken, `💰 銀角 (24期): ${result} 元/期`);
    return true;
  }
  // 刷卡
  if (/^刷卡\d+$/.test(message)) {
    await handleCreditCard(replyToken, Number(message.slice(2)));
    return true;
  }

  // === 2. 基礎資訊 (DM: Public / Group: Authorized) ===
  // 規則: 私訊所有人可用，群組需註冊
  const isLifeInfo = ['油價', '電影', '蘋果新聞', '科技新聞', '熱門廢文', 'PTT熱門'].includes(message);

  if (isLifeInfo) {
    if (isGroup) {
      if (!isAuthorizedGroup) return false;
      if (!authUtils.isFeatureEnabled(groupId, 'life')) return false;
    }

    let result = '';
    if (message === '油價') result = await crawlOilPrice();
    else if (message === '電影') result = await crawlNewMovies();
    else if (message === '蘋果新聞') result = await crawlAppleNews();
    else if (message === '科技新聞') result = await crawlTechNews();
    else result = await crawlPttHot();

    await lineUtils.replyText(replyToken, result);
    return true;
  }

  // === 3. 娛樂/AI (DM: SuperAdmin Only / Group: Authorized) ===
  // 規則: 私訊僅限超級管理員，群組需註冊
  const isAI = /^AI\s+/.test(message) || /^幫我選\s+/.test(message);
  const isEntertainment = ['剪刀', '石頭', '布', '今晚看什麼', '番號推薦', '黑絲', '腳控'].includes(message) || KEYWORD_MAP[message];

  if (isEntertainment || isAI) {
    // 私訊檢查
    if (!isGroup && !isSuper) {
      await lineUtils.replyText(replyToken, '❌ 此功能僅限超級管理員私訊使用，或請在已註冊群組中使用。');
      return true;
    }
    // 群組檢查
    if (isGroup) {
      if (!isAuthorizedGroup) return false;

      // 檢查功能開關
      const featureKey = isAI ? 'ai' :
        (['今晚看什麼', '番號推薦', '黑絲', '腳控'].includes(message) || KEYWORD_MAP[message]) ? 'image' : 'game';
      if (!authUtils.isFeatureEnabled(groupId, featureKey)) return false;
    }

    // 執行邏輯
    if (isAI) {
      if (/^AI\s+/.test(message)) {
        const query = message.replace(/^AI\s+/, '');
        const text = await getGeminiReply(query);
        await lineUtils.replyText(replyToken, text);
      } else { // 幫我選
        const optionsText = message.replace(/^幫我選\s+/, '');
        const options = optionsText.split(/\s+/).filter(o => o.trim());
        if (options.length < 2) {
          await lineUtils.replyText(replyToken, '❌ 請提供至少 2 個選項');
        } else {
          const selected = options[Math.floor(Math.random() * options.length)];
          await lineUtils.replyText(replyToken, `🎯 幫你選好了：${selected}`);
        }
      }
    } else if (['剪刀', '石頭', '布'].includes(message)) {
      await handleRPS(replyToken, message);
    } else if (message === '今晚看什麼' || message === '番號推薦') {
      const jav = await getRandomJav();
      if (jav) await lineUtils.replyText(replyToken, `🎬 ${jav.番号} ${jav.名称}\n💖 ${jav.收藏人数}人收藏`);
      else await lineUtils.replyText(replyToken, '❌ 無結果');
    } else if (message === '黑絲' || message === '腳控') {
      const url = message === '黑絲' ? 'https://v2.api-m.com/api/heisi?return=302' : 'https://3650000.xyz/api/?type=302&mode=7';
      await lineUtils.replyToLine(replyToken, [{ type: 'image', originalContentUrl: url, previewImageUrl: url }]);
    } else if (KEYWORD_MAP[message]) {
      const url = await getRandomDriveImageWithCache(KEYWORD_MAP[message]);
      if (url) await lineUtils.replyToLine(replyToken, [{ type: 'image', originalContentUrl: url, previewImageUrl: url }]);
    }

    return true;
  }

  return false;
}


/**
 * Cloud Functions 入口函數
 */
exports.lineBot = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('OK');

  const events = req.body.events;
  if (!events || events.length === 0) return res.status(200).send('No events');

  try {
    for (const event of events) {
      if (event.type !== 'message') continue;

      // === 處理位置訊息（附近美食搜尋）===
      if (event.message.type === 'location') {
        const replyToken = event.replyToken;
        const userId = event.source.userId;
        const { latitude, longitude, address } = event.message;

        // 檢查是否有等待位置請求
        const pendingRequest = pendingLocationRequests[userId];
        if (!pendingRequest || (Date.now() - pendingRequest.timestamp > 5 * 60 * 1000)) {
          delete pendingLocationRequests[userId];
          continue;
        }

        delete pendingLocationRequests[userId];

        // 搜尋附近餐廳
        const restaurants = await searchNearbyRestaurants(latitude, longitude, 500);

        if (!restaurants || restaurants.length === 0) {
          await lineUtils.replyText(replyToken, '🍽️ 附近 500 公尺內沒有找到餐廳\n\n試試看分享其他位置？');
          continue;
        }

        // 回覆 Flex Message
        const flexContent = buildRestaurantFlex(restaurants, address);
        await lineUtils.replyToLine(replyToken, [{
          type: 'flex',
          altText: `🍽️ 附近美食推薦（${restaurants.length} 間）`,
          contents: flexContent
        }]);
        continue;
      }

      if (event.message.type === 'text') {
        const message = event.message.text.trim();
        const replyToken = event.replyToken;
        const userId = event.source.userId;
        const sourceType = event.source.type;
        const groupId = event.source.groupId || event.source.roomId;

        // === 偵測 @ALL 並警告 ===
        if (sourceType === 'group' || sourceType === 'room') {
          const mention = event.message.mention;
          if (mention?.mentionees?.some(m => m.type === 'all')) {
            await lineUtils.replyText(replyToken, '⚠️ 請勿使用 @All 功能！這會打擾到所有人。');
            continue;
          }
        }

        // === 1. 管理員指令 (最高優先級) ===
        if (await handleAdminCommands(message, userId, groupId, replyToken, sourceType)) continue;

        // === 2. 群組功能開關 (管理員) ===
        if (sourceType === 'group' && /^(開啟|關閉)\s+(.+)$/.test(message)) {
          const match = message.match(/^(開啟|關閉)\s+(.+)$/);
          const enable = match[1] === '開啟';
          const feature = match[2];
          await systemHandler.handleToggleFeature(groupId, userId, feature, enable, replyToken);
          continue;
        }


        // === 2.5 說明指令 (Help) ===
        if (message === '指令' || message === 'help' || message === '選單') {
          try {
            await systemHandler.handleHelpCommand(userId, groupId, replyToken, sourceType);
          } catch (e) {
            console.error('[Help Error]', e);
            await lineUtils.replyText(replyToken, '❌ 系統發生錯誤 (Help Command)');
          }
          continue;
        }

        // === 3. 通用指令 (含權限檢查) ===
        if (await handleCommonCommands(message, replyToken, sourceType, userId, groupId)) continue;

        // === 4. 特殊授權功能 (天氣, 餐廳, 待辦) - 需獨立檢查 ===

        // 天氣查詢
        if (/^天氣\s+.+/.test(message)) {
          if (sourceType === 'user') {
            if (!authUtils.isSuperAdmin(userId)) {
              await lineUtils.replyText(replyToken, '❌ 天氣功能私訊僅限超級管理員使用。');
              continue;
            }
          } else if (sourceType === 'group') {
            if (!(await authUtils.isWeatherAuthorized(groupId))) {
              await lineUtils.replyText(replyToken, '❌ 本群組尚未開通天氣功能 (需使用「註冊天氣」指令)。');
              continue;
            }
          }
          await handleWeather(replyToken, message);
          continue;
        }

        // 附近餐廳
        if (message === '附近餐廳' || message === '附近美食') {
          if (sourceType === 'group') {
            if (!(await authUtils.isRestaurantAuthorized(groupId))) {
              await lineUtils.replyText(replyToken, '❌ 尚未啟用附近餐廳功能\n\n請輸入「註冊餐廳 FOOD-XXXX」啟用');
              continue;
            }
          } else if (sourceType === 'user' && !authUtils.isSuperAdmin(userId)) {
            continue; // 非管理員私訊不回應
          }

          // 記錄等待位置請求
          pendingLocationRequests[userId] = {
            groupId: groupId || userId,
            timestamp: Date.now()
          };
          await lineUtils.replyText(replyToken, '📍 請分享你的位置資訊\n\n👉 點擊「+」→「位置資訊」\n⏰ 5 分鐘內有效');
          continue;
        }

      } // end text message
    } // end loop

    res.status(200).send('OK');
  } catch (err) {
    console.error("Main Error:", err);
    res.status(200).send('OK');
  }
};

// === 輔助: 管理員指令處理 ===
async function handleAdminCommands(message, userId, groupId, replyToken, sourceType) {
  // 檢查是否為管理員指令格式
  const isAdminCmd = ['產生註冊碼', '產生天氣註冊碼', '產生代辦註冊碼', '產生餐廳註冊碼', '管理員列表'].includes(message) ||
    message.startsWith('註冊') ||
    message.startsWith('新增管理員') ||
    message.startsWith('刪除管理員');

  if (!isAdminCmd) return false;

  // 產生指令
  if (message === '產生註冊碼') {
    await systemHandler.handleGenerateCode(userId, replyToken);
    return true;
  }
  if (message === '產生天氣註冊碼') {
    await systemHandler.handleGenerateWeatherCode(userId, replyToken);
    return true;
  }
  if (message === '產生代辦註冊碼') {
    await systemHandler.handleGenerateTodoCode(userId, replyToken);
    return true;
  }
  if (message === '產生餐廳註冊碼') {
    await systemHandler.handleGenerateRestaurantCode(userId, replyToken);
    return true;
  }

  // 註冊指令 - 先檢查特定功能註冊（天氣/餐廳/代辦），再檢查一般群組註冊
  if (/^註冊天氣\s+.+$/i.test(message)) {
    const code = message.replace(/^註冊天氣\s*/i, '').trim();
    await systemHandler.handleRegisterWeather(groupId, userId, code, replyToken);
    return true;
  }
  if (/^註冊餐廳\s+.+$/i.test(message)) {
    const code = message.replace(/^註冊餐廳\s*/i, '').trim();
    await systemHandler.handleRegisterRestaurant(groupId, userId, code, replyToken);
    return true;
  }
  if (/^註冊代辦\s+.+$/i.test(message) || /^註冊待辦\s+.+$/i.test(message)) {
    const code = message.replace(/^註冊[代待]辦\s*/i, '').trim();
    await systemHandler.handleRegisterTodo(groupId, userId, code, replyToken);
    return true;
  }
  // 一般群組註冊（放最後）
  if (/^註冊\s+[A-Z0-9]+$/i.test(message)) {
    const code = message.replace(/^註冊\s*/i, '').trim();
    await systemHandler.handleRegisterGroup(groupId, userId, code, replyToken);
    return true;
  }

  // 新增/刪除管理員 (僅限超級管理員)
  if (authUtils.isSuperAdmin(userId) && (message.startsWith('新增管理員') || message.startsWith('刪除管理員'))) {
    if (message.startsWith('新增管理員')) {
      const match = message.match(/U[a-f0-9]{32}/i);
      if (match) {
        await authUtils.addAdmin(match[0], userId, 'Super Admin Added');
        await lineUtils.replyText(replyToken, `✅ 已新增管理員 ${match[0]}`);
        return true;
      }
    }
  }

  return false;
}

// --- Google Drive 隨機圖片邏輯 (含快取) ---
async function getRandomDriveImageWithCache(folderId) {
  const now = Date.now();

  if (driveCache.fileLists[folderId] &&
    driveCache.lastUpdated[folderId] &&
    (now - driveCache.lastUpdated[folderId] < CACHE_DURATION)) {
    console.log(`[Cache] 命中快取: ${folderId}`);
    const files = driveCache.fileLists[folderId];
    const randomFileId = files[Math.floor(Math.random() * files.length)];
    return `https://lh3.googleusercontent.com/u/0/d/${randomFileId}=w1000`;
  }

  try {
    console.log(`[API] 向 Google Drive 請求新清單: ${folderId}`);
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    const drive = google.drive({ version: 'v3', auth });

    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: 'files(id)',
      pageSize: 1000
    });

    const files = response.data.files;
    if (!files || files.length === 0) return null;

    const fileIds = files.map(f => f.id);
    driveCache.fileLists[folderId] = fileIds;
    driveCache.lastUpdated[folderId] = now;

    const randomFileId = fileIds[Math.floor(Math.random() * fileIds.length)];
    return `https://lh3.googleusercontent.com/u/0/d/${randomFileId}=w1000`;
  } catch (error) {
    console.error('Drive API Error:', error);
    return null;
  }
}



// --- 分期計算邏輯 ---
async function handleFinancing(replyToken, num, type) {
  let results = [];
  if (type === 'fenbei') {
    const rates = { 6: 0.1745, 9: 0.11833, 12: 0.09041, 15: 0.07366, 18: 0.06277, 21: 0.05452, 24: 0.04833, 30: 0.04 };
    results = [6, 9, 12, 15, 18, 21, 24, 30].map(t => {
      const m = Math.floor(num * rates[t]);
      return `${t}期:${m} 總:${m * t}`;
    });
  } else {
    const sRates = { 3: 1.026, 6: 1.04, 9: 1.055, 12: 1.065, 18: 1.09, 24: 1.115 };
    results = Object.keys(sRates).map(t => {
      const total = Math.round(num * sRates[t]);
      return `${t}期:${Math.round(total / t)} 總:${total}`;
    });
  }
  await replyText(replyToken, results.join('\n'));
}



async function handleCreditCard(replyToken, num) {
  const isSmall = num * 0.0249 < 498;
  const calc = (p, t) => {
    const total = Math.round(num * p + (isSmall ? 0 : 498));
    return `\n${t}期:${total} 每期:${Math.round(total / t)}`;
  };
  let msg = isSmall ? `付清:${Math.round(num * 1.0449)}` + calc(1.0549, 3) + calc(1.0599, 6) + calc(1.0849, 12) + calc(1.0849, 24)
    : `付清:${Math.round(num * 1.02) + 498}` + calc(1.03, 3) + calc(1.035, 6) + calc(1.06, 12) + calc(1.06, 24);
  await replyText(replyToken, msg);
}

// --- 黑貓查詢邏輯 ---
async function getTcatStatus(billId) {
  const url = 'https://www.t-cat.com.tw/inquire/TraceDetail.aspx?BillID=' + billId;
  try {
    const res = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = res.data;
    const tableMatch = html.match(/<table[^>]*id="resultTable"[^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatch) return `查無單號 ${billId}`;
    const trs = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    const rows = trs.slice(1).map(tr => {
      const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi).map(td => td.replace(/<[^>]+>/g, '').trim());
      return { time: tds.length === 4 ? tds[2] : tds[1], status: tds.length === 4 ? tds[1] : tds[0], location: tds.length === 4 ? tds[3] : tds[2] };
    });
    return { rows, url };
  } catch (e) { return "物流查詢失敗"; }
}

function buildTcatFlex(billId, rows, url) {
  const items = rows.map((r, i) => ({
    type: "box", layout: "vertical", margin: i === 0 ? "none" : "md",
    contents: [
      { type: "text", text: `📅 ${r.time}`, size: "sm", color: "#888888" },
      { type: "text", text: `🚚 ${r.status}`, weight: "bold", color: r.status.includes('送達') ? "#22BB33" : "#333333" },
      { type: "text", text: `📍 ${r.location}`, size: "sm", color: "#555555" }
    ]
  }));
  return {
    type: "bubble",
    header: { type: "box", layout: "vertical", contents: [{ type: "text", text: `📦 單號: ${billId}`, weight: "bold", color: "#1DB446" }] },
    body: { type: "box", layout: "vertical", spacing: "sm", contents: items.slice(0, 10) },
    footer: { type: "box", layout: "vertical", contents: [{ type: "button", action: { type: "uri", label: "官網詳情", uri: url }, style: "primary", color: "#1DB446" }] }
  };
}



// === 全局錯誤處理 ===
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  if (ADMIN_USER_ID) {
    try {
      await pushMessage(ADMIN_USER_ID, [{ type: 'text', text: `🚨 系統發生嚴重錯誤 (Uncaught Exception):\n${error.message}` }]);
    } catch (e) {
      console.error('Failed to report error to admin:', e);
    }
  }
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (ADMIN_USER_ID) {
    try {
      const msg = reason instanceof Error ? reason.message : String(reason);
      await pushMessage(ADMIN_USER_ID, [{ type: 'text', text: `⚠️ 系統發生嚴重錯誤 (Unhandled Rejection):\n${msg}` }]);
    } catch (e) {
      console.error('Failed to report error to admin:', e);
    }
  }
});
