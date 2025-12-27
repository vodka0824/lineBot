const axios = require('axios');
const { google } = require('googleapis');
const { Firestore } = require('@google-cloud/firestore');
const cheerio = require('cheerio');
const OpenCC = require('opencc-js');

// 簡體轉繁體轉換器
const s2tw = OpenCC.Converter({ from: 'cn', to: 'twp' });

// === 1. 設定區 (從環境變數讀取) ===
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_KEY;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID; // 管理員的 LINE User ID
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY; // Google Places API

// === Firestore 初始化 ===
const db = new Firestore();

// === 爬蟲來源網址 ===
const CRAWLER_URLS = {
  OIL_PRICE: 'https://gas.goodlife.tw/',
  NEW_MOVIE: 'https://www.atmovies.com.tw/movie/new/',
  APPLE_NEWS: 'https://tw.nextapple.com/',
  TECH_NEWS: 'https://technews.tw/',
  PTT_HOT: 'https://disp.cc/b/PttHot',
  JAV_RECOMMEND: 'https://limbopro.com/tools/jwksm/ori.json'
};

// === 2. 多組關鍵字對應資料夾設定 ===
const KEYWORD_MAP = {
  '奶子': '1LMsRVf6GVQOx2IRavpMRQFhMv6oC2fnv',
  '美尻': '1kM3evcph4-RVKFkBi0_MnaFyADexFkl8',
  '絕對領域': '1o5BLLto3eyZCQ3SypjU5tSYydWIzrsFx'
};

// === 3. 快取記憶體設定 ===
let driveCache = {
  lastUpdated: {},
  fileLists: {}
};
const CACHE_DURATION = 60 * 60 * 1000;

// === 群組授權快取 ===
let authorizedGroupsCache = new Set();
let groupCacheLastUpdated = 0;
const GROUP_CACHE_DURATION = 5 * 60 * 1000; // 5 分鐘

// === 管理員快取 ===
let adminsCache = new Set();
let adminsCacheLastUpdated = 0;
const ADMIN_CACHE_DURATION = 5 * 60 * 1000; // 5 分鐘

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

// 取得群組成員名稱
async function getGroupMemberName(groupId, userId) {
  try {
    const url = `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`;
    const res = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` }
    });
    return res.data.displayName;
  } catch (error) {
    // 如果取得失敗，回傳 User ID 的前 8 碼
    return userId.substring(0, 8) + '...';
  }
}

// === 群組待辦事項功能 ===

// 待辦授權快取
let todoAuthorizedCache = new Set();
let todoCacheLastUpdated = 0;
const TODO_CACHE_DURATION = 5 * 60 * 1000; // 5 分鐘

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

// === 爬蟲功能 ===

// 油價查詢
async function crawlOilPrice() {
  try {
    const res = await axios.get(CRAWLER_URLS.OIL_PRICE);
    const $ = cheerio.load(res.data);

    const title = $('#main').text().replace(/\n/g, '').split('(')[0].trim();
    const gasPrice = $('#gas-price').text().replace(/\n\n\n/g, '').replace(/ /g, '').trim();
    const cpc = $('#cpc').text().replace(/ /g, '').trim();

    return `⛽ ${title}\n\n${gasPrice}\n${cpc}`;
  } catch (error) {
    console.error('油價爬蟲錯誤:', error);
    return '❌ 無法取得油價資訊，請稍後再試';
  }
}

// 近期電影
async function crawlNewMovies() {
  try {
    const res = await axios.get(CRAWLER_URLS.NEW_MOVIE);
    const $ = cheerio.load(res.data);

    const movies = [];
    $('article div a').slice(0, 5).each((i, elem) => {
      const title = $(elem).text().trim();
      const link = 'https://www.atmovies.com.tw' + $(elem).attr('href');
      if (title) {
        movies.push(`🎬 ${title}\n${link}`);
      }
    });

    if (movies.length === 0) {
      return '❌ 目前無法取得電影資訊';
    }

    return `🎥 近期上映電影\n\n${movies.join('\n\n')}`;
  } catch (error) {
    console.error('電影爬蟲錯誤:', error);
    return '❌ 無法取得電影資訊，請稍後再試';
  }
}

// 蘋果新聞
async function crawlAppleNews() {
  try {
    const res = await axios.get(CRAWLER_URLS.APPLE_NEWS);
    const $ = cheerio.load(res.data);

    const news = [];
    $('#main-content > div.post-hot.stories-container > article > div > div:nth-child(1) > h3 > a').slice(0, 5).each((i, elem) => {
      const title = $(elem).text().trim();
      let link = $(elem).attr('href');
      if (link && !link.startsWith('http')) {
        link = 'https://tw.nextapple.com' + link;
      }
      if (title && link) {
        news.push(`📰 ${title}\n${link}`);
      }
    });

    if (news.length === 0) {
      return '❌ 目前無法取得蘋果新聞';
    }

    return `🍎 蘋果即時新聞\n\n${news.join('\n\n')}`;
  } catch (error) {
    console.error('蘋果新聞爬蟲錯誤:', error);
    return '❌ 無法取得蘋果新聞，請稍後再試';
  }
}

// 科技新聞
async function crawlTechNews() {
  try {
    const res = await axios.get(CRAWLER_URLS.TECH_NEWS);
    const $ = cheerio.load(res.data);

    const news = [];
    const articlePattern = /\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/?$/;

    $('a').each((i, elem) => {
      if (news.length >= 5) return false;

      const href = $(elem).attr('href') || '';
      const title = $(elem).text().trim();

      if (articlePattern.test(href) && title && title.length > 10) {
        let link = href;
        if (!link.startsWith('http')) {
          link = 'https://technews.tw' + link;
        }
        // 避免重複
        if (!news.some(n => n.includes(link))) {
          news.push(`💻 ${title}\n${link}`);
        }
      }
    });

    if (news.length === 0) {
      return '❌ 目前無法取得科技新聞';
    }

    return `📱 科技新報最新文章\n\n${news.join('\n\n')}`;
  } catch (error) {
    console.error('科技新聞爬蟲錯誤:', error);
    return '❌ 無法取得科技新聞，請稍後再試';
  }
}

// PTT 熱門廢文
async function crawlPttHot() {
  try {
    const res = await axios.get(CRAWLER_URLS.PTT_HOT);
    const $ = cheerio.load(res.data);

    const posts = [];
    $('a').each((i, elem) => {
      if (posts.length >= 5) return false;

      const href = $(elem).attr('href') || '';
      const title = $(elem).text().trim();

      if (href.includes('/b/PttHot/') && title && title.length > 5) {
        let link = href;
        if (link.startsWith('/')) {
          link = 'https://disp.cc' + link;
        }
        if (!posts.some(p => p.includes(title))) {
          posts.push(`🔥 ${title}\n${link}`);
        }
      }
    });

    if (posts.length === 0) {
      return '❌ 目前無法取得熱門廢文';
    }

    return `📋 PTT 熱門廢文\n\n${posts.join('\n\n')}`;
  } catch (error) {
    console.error('PTT 熱門爬蟲錯誤:', error);
    return '❌ 無法取得熱門廢文，請稍後再試';
  }
}

// 番號推薦（今晚看什麼）
let javCache = null;
let javCacheTime = 0;
const JAV_CACHE_DURATION = 60 * 60 * 1000; // 1 小時快取

async function getRandomJav() {
  try {
    const now = Date.now();

    // 使用快取
    if (javCache && (now - javCacheTime < JAV_CACHE_DURATION)) {
      const items = javCache['全部分类'] || [];
      if (items.length > 0) {
        const random = items[Math.floor(Math.random() * items.length)];
        return {
          番号: random['番号'] || '-',
          名称: s2tw(random['名称'] || '-'),
          演员: s2tw(random['演员'] || '-'),
          收藏人数: random['收藏人数'] || 0
        };
      }
    }

    // 重新請求
    const res = await axios.get(CRAWLER_URLS.JAV_RECOMMEND, { timeout: 10000 });
    javCache = res.data;
    javCacheTime = now;

    const items = javCache['全部分类'] || [];
    if (items.length === 0) {
      return null;
    }

    const random = items[Math.floor(Math.random() * items.length)];
    return {
      番号: random['番号'] || '-',
      名称: s2tw(random['名称'] || '-'),
      演员: s2tw(random['演员'] || '-'),
      收藏人数: random['收藏人数'] || 0
    };
  } catch (error) {
    console.error('番號推薦錯誤:', error);
    return null;
  }
}

// === 附近美食搜尋功能 ===

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
 * Cloud Functions 入口函數
 */
exports.lineBot = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('OK');

  const events = req.body.events;
  if (!events || events.length === 0) return res.status(200).send('No events');

  try {
    for (const event of events) {
      // === 處理位置訊息（附近美食搜尋）===
      if (event.type === "message" && event.message.type === "location") {
        const replyToken = event.replyToken;
        const { latitude, longitude, address } = event.message;

        // 搜尋附近餐廳
        const restaurants = await searchNearbyRestaurants(latitude, longitude, 500);

        if (!restaurants || restaurants.length === 0) {
          await replyText(replyToken, '🍽️ 附近 500 公尺內沒有找到餐廳\n\n試試看分享其他位置？');
          continue;
        }

        // 回覆 Flex Message
        const flexContent = buildRestaurantFlex(restaurants, address);
        await replyToLine(replyToken, [{
          type: 'flex',
          altText: `🍽️ 附近美食推薦（${restaurants.length} 間）`,
          contents: flexContent
        }]);
        continue;
      }

      if (event.type === "message" && event.message.type === "text") {
        const message = event.message.text.trim();
        const replyToken = event.replyToken;
        const userId = event.source.userId;
        const sourceType = event.source.type; // 'user', 'group', 'room'
        const groupId = event.source.groupId || event.source.roomId;

        // === 偵測 @ALL 並警告 ===
        if (sourceType === 'group' || sourceType === 'room') {
          const mention = event.message.mention;
          if (mention?.mentionees?.some(m => m.type === 'all')) {
            await replyText(replyToken, '⚠️ 請勿使用 @All 功能！這會打擾到所有人。');
            continue;
          }
        }

        // === 管理員指令（私訊 + 群組皆可） ===

        // 取得自己的 User ID（任何人皆可）
        if (message === '我的ID') {
          await replyText(replyToken, `你的 User ID：\n${userId}`);
          continue;
        }

        // === 超級管理員專屬指令 ===
        if (isSuperAdmin(userId)) {
          // 新增管理員（透過回覆訊息）
          if (message === '新增管理員') {
            const quotedUserId = event.message.quotedMessageId ? null : null; // LINE 不支援直接取得
            // 改用 mention 方式
            const mention = event.message.mention;
            if (mention?.mentionees?.length > 0) {
              const targetUser = mention.mentionees[0];
              if (targetUser.type === 'user' && targetUser.userId) {
                await addAdmin(targetUser.userId, userId, '由超級管理員新增');
                await replyText(replyToken, `✅ 已將用戶新增為管理員！\n\nUser ID: ${targetUser.userId}`);
              } else {
                await replyText(replyToken, '❌ 無法取得該用戶的 ID');
              }
            } else {
              await replyText(replyToken, '❌ 請使用以下方式新增管理員：\n\n1️⃣ 在訊息中 @某人 + 輸入「新增管理員」\n2️⃣ 或輸入「新增管理員 Uxxxxxxxx」');
            }
            continue;
          }

          // 新增管理員（透過 User ID）
          if (/^新增管理員\s+U[a-f0-9]{32}$/i.test(message)) {
            const targetUserId = message.match(/U[a-f0-9]{32}/i)[0];
            await addAdmin(targetUserId, userId, '由超級管理員新增');
            await replyText(replyToken, `✅ 已將用戶新增為管理員！\n\nUser ID: ${targetUserId}`);
            continue;
          }

          // 刪除管理員（透過 @）
          if (message === '刪除管理員') {
            const mention = event.message.mention;
            if (mention?.mentionees?.length > 0) {
              const targetUser = mention.mentionees[0];
              if (targetUser.type === 'user' && targetUser.userId) {
                await removeAdmin(targetUser.userId);
                await replyText(replyToken, `✅ 已移除管理員權限！\n\nUser ID: ${targetUser.userId}`);
              } else {
                await replyText(replyToken, '❌ 無法取得該用戶的 ID');
              }
            } else {
              await replyText(replyToken, '❌ 請使用以下方式刪除管理員：\n\n1️⃣ 在訊息中 @某人 + 輸入「刪除管理員」\n2️⃣ 或輸入「刪除管理員 Uxxxxxxxx」');
            }
            continue;
          }

          // 刪除管理員（透過 User ID）
          if (/^刪除管理員\s+U[a-f0-9]{32}$/i.test(message)) {
            const targetUserId = message.match(/U[a-f0-9]{32}/i)[0];
            await removeAdmin(targetUserId);
            await replyText(replyToken, `✅ 已移除管理員權限\n\nUser ID: ${targetUserId}`);
            continue;
          }

          // 管理員列表
          if (message === '管理員列表') {
            const admins = await getAdminList();
            if (admins.length === 0) {
              await replyText(replyToken, '📋 目前沒有其他管理員\n\n超級管理員：你');
            } else {
              const list = admins.map((a, i) => `${i + 1}. ${a.id}`).join('\n');
              await replyText(replyToken, `📋 管理員列表：\n\n👑 超級管理員：你\n\n👤 一般管理員：\n${list}`);
            }
            continue;
          }
        }

        // === 管理員指令（超級管理員 + 一般管理員） ===
        const isAdminUser = await isAdmin(userId);
        if (isAdminUser && sourceType === 'user') {
          if (message === '產生註冊碼') {
            const code = await createRegistrationCode(userId);
            await replyText(replyToken, `✅ 已產生新的註冊碼：\n\n🔑 ${code}\n\n請在群組中輸入：\n註冊 ${code}`);
            continue;
          }

          // 產生代辦註冊碼（超級管理員專用）
          if (message === '產生代辦註冊碼') {
            if (!isSuperAdmin(userId)) {
              await replyText(replyToken, '❌ 只有超級管理員可以產生代辦註冊碼');
              continue;
            }

            const code = await generateTodoCode();
            await replyText(replyToken, `✅ 待辦功能註冊碼已產生：\n\n🔑 ${code}\n\n請在群組中輸入「註冊代辦 ${code}」使用`);
            continue;
          }

          if (message === '查看註冊碼') {
            const codes = await getUnusedCodes();
            if (codes.length === 0) {
              await replyText(replyToken, '目前沒有未使用的註冊碼');
            } else {
              await replyText(replyToken, `📋 未使用的註冊碼：\n\n${codes.map(c => `🔑 ${c}`).join('\n')}`);
            }
            continue;
          }
        }

        // === 群組/聊天室處理 ===
        if (sourceType === 'group' || sourceType === 'room') {
          // 註冊指令（任何人都可以使用）
          if (/^註冊\s*[A-Z0-9]{8}$/i.test(message)) {
            const code = message.replace(/^註冊\s*/i, '').toUpperCase();
            const result = await registerGroup(code, groupId, userId);
            await replyText(replyToken, result.message);
            continue;
          }

          // 檢查群組是否已授權
          const authorized = await isGroupAuthorized(groupId);
          if (!authorized) {
            // 未授權群組，不回應任何訊息
            continue;
          }

          // === 抽獎系統指令 ===

          // 發起抽獎（管理員）：抽獎 獎品 10分鐘 抽3名 +1
          const lotteryMatch = message.match(/^抽獎\s+(.+?)\s+(\d+)\s*分鐘\s+抽(\d+)\s*名\s+(.+)$/);
          if (lotteryMatch) {
            const isAdminForLottery = await isAdmin(userId);
            if (!isAdminForLottery) {
              await replyText(replyToken, '❌ 只有管理員可以發起抽獎');
              continue;
            }

            // 檢查是否已有進行中的抽獎
            const existingLottery = await getLotteryStatus(groupId);
            if (existingLottery) {
              await replyText(replyToken, '❌ 已有進行中的抽獎，請先開獎或取消');
              continue;
            }

            const prize = lotteryMatch[1].trim();
            const minutes = parseInt(lotteryMatch[2]);
            const winners = parseInt(lotteryMatch[3]);
            const keyword = lotteryMatch[4].trim();

            await startLottery(groupId, minutes, winners, keyword, prize, userId);

            await replyText(replyToken,
              `🎉 抽獎活動開始！\n\n` +
              `🎁 獎品：${prize}\n` +
              `⏰ 時間：${minutes} 分鐘\n` +
              `🏆 名額：${winners} 名\n` +
              `💬 參加方式：輸入「${keyword}」\n\n` +
              `倒數計時中...`
            );
            continue;
          }

          // 抽獎狀態
          if (message === '抽獎狀態') {
            const status = await getLotteryStatus(groupId);
            if (!status) {
              await replyText(replyToken, '目前沒有進行中的抽獎');
            } else {
              const timeText = status.isExpired ? '⏰ 時間已到，等待開獎' : `⏰ 剩餘 ${status.remainingMinutes} 分鐘`;
              await replyText(replyToken,
                `📊 抽獎狀態\n\n` +
                `🎁 獎品：${status.prize}\n` +
                `💬 關鍵字：${status.keyword}\n` +
                `🏆 名額：${status.winners} 名\n` +
                `👥 已報名：${status.participants} 人\n` +
                `${timeText}`
              );
            }
            continue;
          }

          // 開獎（管理員）
          if (message === '開獎') {
            const isAdminForDraw = await isAdmin(userId);
            if (!isAdminForDraw) {
              await replyText(replyToken, '❌ 只有管理員可以開獎');
              continue;
            }

            const result = await drawLottery(groupId);
            if (!result.success) {
              await replyText(replyToken, result.message);
              continue;
            }

            // 取得得獎者名稱
            const winnerNames = await Promise.all(
              result.winners.map(async (w, i) => {
                const name = await getGroupMemberName(groupId, w);
                return `${i + 1}. ${name}`;
              })
            );
            const winnerList = winnerNames.join('\n');

            await replyText(replyToken,
              `🎊 抽獎結果出爐！\n\n` +
              `🎁 獎品：${result.prize}\n` +
              `👥 參加人數：${result.totalParticipants} 人\n` +
              `🏆 中獎名額：${result.winnerCount} 名\n\n` +
              `🏆 得獎者：\n${winnerList}\n\n` +
              `恭喜以上得獎者！🎉`
            );
            continue;
          }

          // 取消抽獎（管理員）
          if (message === '取消抽獎') {
            const isAdminForCancel = await isAdmin(userId);
            if (!isAdminForCancel) {
              await replyText(replyToken, '❌ 只有管理員可以取消抽獎');
              continue;
            }

            const status = await getLotteryStatus(groupId);
            if (!status) {
              await replyText(replyToken, '❌ 目前沒有進行中的抽獎');
              continue;
            }

            await cancelLottery(groupId);
            await replyText(replyToken, '✅ 抽獎活動已取消');
            continue;
          }

          // 檢查是否為抽獎關鍵字（報名）
          const currentLottery = await getLotteryStatus(groupId);
          if (currentLottery && message === currentLottery.keyword) {
            const joinResult = await joinLottery(groupId, userId);
            if (joinResult.success) {
              await replyText(replyToken, joinResult.message);
            }
            // 如果已報名過或其他錯誤，不回應以避免洗版
            continue;
          }

          // === 待辦事項功能 ===

          // 使用註冊碼啟用待辦功能
          if (/^註冊代辦\s+TODO-[A-Z0-9]+$/i.test(message)) {
            const code = message.match(/TODO-[A-Z0-9]+/i)[0].toUpperCase();

            const alreadyEnabled = await isTodoAuthorized(groupId);
            if (alreadyEnabled) {
              await replyText(replyToken, '✅ 此群組已啟用待辦功能');
              continue;
            }

            const result = await useTodoCode(code, groupId, userId);
            if (result.success) {
              await replyText(replyToken, '✅ 待辦功能已啟用！\n\n📝 可用指令：\n• 代辦 內容 - 新增\n• 代辦列表 - 查看\n• 完成 1 - 標記完成\n• 刪除代辦 1 - 刪除\n• 清空代辦');
            } else {
              await replyText(replyToken, result.message);
            }
            continue;
          }

          // 檢查待辦功能是否已啟用
          const todoEnabled = await isTodoAuthorized(groupId);

          // 處理優先級選擇回應
          if (/^代辦:(高|中|低):.+/.test(message)) {
            if (!todoEnabled) {
              await replyText(replyToken, '❌ 此群組尚未啟用待辦功能\n\n請管理員輸入「註冊代辦」啟用');
              continue;
            }

            const match = message.match(/^代辦:(高|中|低):(.+)$/);
            const priorityMap = { '高': 'high', '中': 'medium', '低': 'low' };
            const priority = priorityMap[match[1]];
            const todoText = match[2];

            const result = await addTodo(groupId, todoText, userId, priority);
            await replyText(replyToken, `✅ 已新增待辦事項 ${result.emoji}\n${todoText}`);
            continue;
          }

          // 新增待辦事項（顯示 Quick Reply 選擇優先級）
          if (/^代辦\s+.+/.test(message)) {
            if (!todoEnabled) {
              await replyText(replyToken, '❌ 此群組尚未啟用待辦功能\n\n請管理員輸入「註冊代辦」啟用');
              continue;
            }

            const todoText = message.replace(/^代辦\s+/, '').trim();

            // 使用 Quick Reply 讓用戶選擇優先級
            await replyToLine(replyToken, [{
              type: 'text',
              text: `📝 新增待辦事項：\n${todoText}\n\n請選擇優先級：`,
              quickReply: {
                items: [
                  {
                    type: 'action',
                    action: {
                      type: 'message',
                      label: '🔴 高',
                      text: `代辦:高:${todoText}`
                    }
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'message',
                      label: '🟡 中',
                      text: `代辦:中:${todoText}`
                    }
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'message',
                      label: '🟢 低',
                      text: `代辦:低:${todoText}`
                    }
                  }
                ]
              }
            }]);
            continue;
          }

          // 查看待辦列表
          if (message === '代辦列表' || message === '待辦列表' || message === '我的代辦') {
            if (!todoEnabled) {
              await replyText(replyToken, '❌ 此群組尚未啟用待辦功能');
              continue;
            }

            const items = await getTodoList(groupId);
            if (items.length === 0) {
              await replyText(replyToken, '📋 目前沒有待辦事項');
            } else {
              const priorityEmoji = { high: '🔴', medium: '🟡', low: '🟢' };
              const list = items.map((item, i) => {
                const status = item.done ? '✅' : '⬜';
                const pEmoji = priorityEmoji[item.priority] || '🟢';
                return `${status} ${pEmoji} ${i + 1}. ${item.text}`;
              }).join('\n');
              await replyText(replyToken, `📋 待辦事項列表：\n\n${list}`);
            }
            continue;
          }

          // 完成待辦事項
          if (/^完成\s*\d+$/.test(message)) {
            if (!todoEnabled) continue;

            const index = parseInt(message.match(/\d+/)[0]) - 1;
            const result = await completeTodo(groupId, index);
            if (result.success) {
              await replyText(replyToken, `✅ 已完成：${result.text}`);
            } else {
              await replyText(replyToken, `❌ ${result.message}`);
            }
            continue;
          }

          // 刪除待辦事項
          if (/^刪除代辦\s*\d+$/.test(message) || /^刪除待辦\s*\d+$/.test(message)) {
            if (!todoEnabled) continue;

            const index = parseInt(message.match(/\d+/)[0]) - 1;
            const result = await deleteTodo(groupId, index);
            if (result.success) {
              await replyText(replyToken, `🗑️ 已刪除：${result.text}`);
            } else {
              await replyText(replyToken, `❌ ${result.message}`);
            }
            continue;
          }

          // 清空待辦事項
          if (message === '清空代辦' || message === '清空待辦') {
            if (!todoEnabled) continue;

            await clearTodos(groupId);
            await replyText(replyToken, '🗑️ 已清空所有待辦事項');
            continue;
          }
        }

        // === 以下是原有功能（已授權群組或私訊才能使用）===

        // --- 幫我選（多選一）---
        if (/^幫我選\s+.+/.test(message)) {
          const optionsText = message.replace(/^幫我選\s+/, '');
          const options = optionsText.split(/\s+/).filter(o => o.trim());

          if (options.length < 2) {
            await replyText(replyToken, '❌ 請提供至少 2 個選項\n\n範例：幫我選 披薩 漢堡 拉麵');
            continue;
          }

          const selected = options[Math.floor(Math.random() * options.length)];
          await replyText(replyToken,
            `🎯 幫你選好了！\n\n` +
            `選項：${options.join('、')}\n\n` +
            `👉 結果：${selected}`
          );
          continue;
        }

        // --- 油價查詢 ---
        if (message === '油價') {
          const result = await crawlOilPrice();
          await replyText(replyToken, result);
          continue;
        }

        // --- 近期電影 ---
        if (message === '電影') {
          const result = await crawlNewMovies();
          await replyText(replyToken, result);
          continue;
        }

        // --- 蘋果新聞 ---
        if (message === '蘋果新聞') {
          const result = await crawlAppleNews();
          await replyText(replyToken, result);
          continue;
        }

        // --- 科技新聞 ---
        if (message === '科技新聞') {
          const result = await crawlTechNews();
          await replyText(replyToken, result);
          continue;
        }

        // --- PTT 熱門廢文 ---
        if (message === '熱門廢文' || message === 'PTT熱門') {
          const result = await crawlPttHot();
          await replyText(replyToken, result);
          continue;
        }

        // --- 番號推薦（今晚看什麼）---
        if (message === '今晚看什麼' || message === '今晚看什么' || message === '番號推薦') {
          const jav = await getRandomJav();
          if (jav) {
            await replyText(replyToken,
              `🎬 今晚看什麼\n\n` +
              `📍 番號：${jav.番号}\n` +
              `📝 名稱：${jav.名称}\n` +
              `👩 演員：${jav.演员}\n` +
              `💖 收藏：${jav.收藏人数.toLocaleString()} 人`
            );
          } else {
            await replyText(replyToken, '❌ 無法取得推薦，請稍後再試');
          }
          continue;
        }

        // --- 黑絲圖片 ---
        if (message === '黑絲') {
          const imageUrl = 'https://v2.api-m.com/api/heisi?return=302';
          await replyToLine(replyToken, [{
            type: 'image',
            originalContentUrl: imageUrl,
            previewImageUrl: imageUrl
          }]);
          continue;
        }

        // --- 腳控圖片 ---
        if (message === '腳控') {
          const imageUrl = 'https://3650000.xyz/api/?type=302&mode=7';
          await replyToLine(replyToken, [{
            type: 'image',
            originalContentUrl: imageUrl,
            previewImageUrl: imageUrl
          }]);
          continue;
        }

        // --- 指令說明（Flex Message）---
        if (message === '指令' || message === '功能' || message === 'help') {
          const isAdminUser = await isAdmin(userId);

          // 基本內容（所有人可見）
          const bodyContents = [
            // 一般功能
            {
              type: 'text',
              text: '🎮 一般功能',
              weight: 'bold',
              size: 'md',
              color: '#1DB446',
              margin: 'none'
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                { type: 'text', text: '• 幫我選 A B C - 多選一', size: 'sm', color: '#555555' },
                { type: 'text', text: '• 剪刀/石頭/布 - 猜拳遊戲', size: 'sm', color: '#555555' },
                { type: 'text', text: '• 我的ID - 查詢 User ID', size: 'sm', color: '#555555' },
                { type: 'text', text: '• 黑貓+12碼單號 - 物流查詢', size: 'sm', color: '#555555' }
              ],
              margin: 'sm',
              spacing: 'xs'
            },
            // 待辦事項
            {
              type: 'text',
              text: '📝 待辦事項',
              weight: 'bold',
              size: 'md',
              color: '#9B59B6',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                { type: 'text', text: '• 註冊代辦 TODO-XXXX', size: 'sm', color: '#555555' },
                { type: 'text', text: '• 代辦 內容 → 選擇優先級', size: 'sm', color: '#555555' },
                { type: 'text', text: '• 代辦列表 / 完成 1 / 清空', size: 'sm', color: '#555555' }
              ],
              margin: 'sm',
              spacing: 'xs'
            },
            // 資訊查詢
            {
              type: 'text',
              text: '📰 資訊查詢',
              weight: 'bold',
              size: 'md',
              color: '#1E90FF',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                { type: 'text', text: '• 油價 - 最新油價', size: 'sm', color: '#555555' },
                { type: 'text', text: '• 電影 - 近期上映', size: 'sm', color: '#555555' },
                { type: 'text', text: '• 蘋果新聞 - 即時新聞', size: 'sm', color: '#555555' },
                { type: 'text', text: '• 科技新聞 - 科技新報', size: 'sm', color: '#555555' },
                { type: 'text', text: '• 熱門廢文 - PTT 熱門', size: 'sm', color: '#555555' },
                { type: 'text', text: '• 今晚看什麼 - 番號推薦', size: 'sm', color: '#555555' },
                { type: 'text', text: '• 📍分享位置 - 附近美食', size: 'sm', color: '#555555' }
              ],
              margin: 'sm',
              spacing: 'xs'
            },
            // 抽圖功能
            {
              type: 'text',
              text: '🖼️ 隨機抽圖',
              weight: 'bold',
              size: 'md',
              color: '#FF69B4',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                { type: 'text', text: '• 黑絲 / 腳控 / 奶子 / 美尻 / 絕對領域', size: 'sm', color: '#555555' }
              ],
              margin: 'sm',
              spacing: 'xs'
            },
            // 抽獎參與（非管理員可見）
            {
              type: 'text',
              text: '🎰 抽獎參與',
              weight: 'bold',
              size: 'md',
              color: '#FF6B6B',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                { type: 'text', text: '• 抽獎狀態 - 查看進行中抽獎', size: 'sm', color: '#555555' },
                { type: 'text', text: '• 輸入關鍵字報名參加', size: 'sm', color: '#555555' }
              ],
              margin: 'sm',
              spacing: 'xs'
            }
          ];

          // 管理員額外內容
          if (isAdminUser) {
            bodyContents.push(
              // 抽獎管理
              {
                type: 'text',
                text: '🎰 抽獎管理 👑',
                weight: 'bold',
                size: 'md',
                color: '#FF6B6B',
                margin: 'lg'
              },
              {
                type: 'box',
                layout: 'vertical',
                contents: [
                  { type: 'text', text: '• 抽獎 獎品 10分鐘 抽3名 +1', size: 'sm', color: '#555555' },
                  { type: 'text', text: '• 開獎 - 公佈得獎名單', size: 'sm', color: '#555555' },
                  { type: 'text', text: '• 取消抽獎', size: 'sm', color: '#555555' }
                ],
                margin: 'sm',
                spacing: 'xs'
              },
              // 管理員功能
              {
                type: 'text',
                text: '👑 管理員專用',
                weight: 'bold',
                size: 'md',
                color: '#FFD700',
                margin: 'lg'
              },
              {
                type: 'box',
                layout: 'vertical',
                contents: [
                  { type: 'text', text: '• 產生註冊碼 / 產生代辦註冊碼', size: 'sm', color: '#555555' },
                  { type: 'text', text: '• 查看註冊碼', size: 'sm', color: '#555555' },
                  { type: 'text', text: '• 新增/刪除管理員 @提及', size: 'sm', color: '#555555' },
                  { type: 'text', text: '• 管理員列表', size: 'sm', color: '#555555' }
                ],
                margin: 'sm',
                spacing: 'xs'
              }
            );
          }

          const flexMessage = {
            type: 'flex',
            altText: '📖 Bot 指令說明',
            contents: {
              type: 'bubble',
              size: 'giga',
              header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: isAdminUser ? '� 指令說明 �👑' : '📖 指令說明',
                    weight: 'bold',
                    size: 'xl',
                    color: '#1DB446'
                  }
                ],
                paddingAll: '15px',
                backgroundColor: '#F0FFF0'
              },
              body: {
                type: 'box',
                layout: 'vertical',
                contents: bodyContents,
                paddingAll: '15px',
                spacing: 'none'
              }
            }
          };
          await replyToLine(replyToken, [flexMessage]);
          continue;
        }

        // --- 功能 A: 隨機圖片 (含快取機制) ---
        if (KEYWORD_MAP[message]) {
          const folderId = KEYWORD_MAP[message];
          const imageUrl = await getRandomDriveImageWithCache(folderId);
          if (imageUrl) {
            await replyToLine(replyToken, [{
              type: "image",
              originalContentUrl: imageUrl,
              previewImageUrl: imageUrl
            }]);
          } else {
            await replyText(replyToken, "目前無法取得圖片，請檢查雲端資料夾權限。");
          }
          continue;
        }

        // --- 功能 B: AI 指令處理 (AI 你的問題) ---
        if (/^AI\s+/.test(message)) {
          const aiQuery = message.replace(/^AI\s+/, '');
          const aiReply = await getGeminiReply(aiQuery);
          const messages = parseAIReplyToLineMessages(aiReply);
          await replyToLine(replyToken, messages);
          continue;
        }

        // --- 功能 C: 分期計算 (分唄/銀角) ---
        if (/^分唄\d+$/.test(message)) {
          await handleFinancing(replyToken, Number(message.slice(2)), 'fenbei');
        } else if (/^銀角\d+$/.test(message)) {
          await handleFinancing(replyToken, Number(message.slice(2)), 'silver');
        }
        // --- 功能 D: 刷卡查詢 ---
        else if (/^刷卡\d+$/.test(message)) {
          await handleCreditCard(replyToken, Number(message.slice(2)));
        }
        // --- 功能 E: 黑貓查詢 ---
        else if (/^黑貓\d{12}$/.test(message)) {
          const tcatNo = message.slice(2);
          const result = await getTcatStatus(tcatNo);
          if (typeof result === "string") {
            await replyText(replyToken, result);
          } else {
            await replyFlex(replyToken, `黑貓貨態${tcatNo}`, buildTcatFlex(tcatNo, result.rows, result.url));
          }
        }
        // --- 功能 F: 剪刀石頭布 ---
        else if (['剪刀', '石頭', '布'].includes(message)) {
          await handleRPS(replyToken, message);
        }
      }
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error("Main Error:", err);
    res.status(200).send('OK');
  }
};

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

// --- AI Gemini 回覆邏輯 ---
async function getGeminiReply(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    contents: [{ parts: [{ text: prompt + '\n\n規則：文字用TEXT:開頭；圖片用IMAGE:網址；貼圖用STICKER:pkgId,stkId；影片用VIDEO:網址,預覽圖。' }] }]
  };
  try {
    const res = await axios.post(url, payload);
    return res.data.candidates?.[0]?.content?.parts?.[0]?.text || "AI 忙碌中";
  } catch (e) { return "AI 串接失敗"; }
}

function parseAIReplyToLineMessages(aiReply) {
  const messages = [];
  const lines = aiReply.split('\n').map(l => l.trim()).filter(String);
  let textBuffer = [];
  const flush = () => { if (textBuffer.length) { messages.push({ type: "text", text: textBuffer.join('\n') }); textBuffer = []; } };

  lines.forEach(line => {
    if (line.startsWith('IMAGE:')) { flush(); const url = line.replace('IMAGE:', '').trim(); messages.push({ type: "image", originalContentUrl: url, previewImageUrl: url }); }
    else if (line.startsWith('STICKER:')) { flush(); const ids = line.replace('STICKER:', '').trim().split(','); if (ids.length >= 2) messages.push({ type: "sticker", packageId: ids[0], stickerId: ids[1] }); }
    else if (line.startsWith('VIDEO:')) { flush(); const v = line.replace('VIDEO:', '').trim().split(','); if (v.length >= 2) messages.push({ type: "video", originalContentUrl: v[0], previewImageUrl: v[1] }); }
    else if (line.startsWith('TEXT:')) { textBuffer.push(line.replace('TEXT:', '').trim()); }
    else { textBuffer.push(line); }
  });
  flush();
  return messages.slice(0, 5);
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

// --- 剪刀石頭布邏輯 ---
async function handleRPS(replyToken, userChoice) {
  const choices = ['剪刀', '石頭', '布'];
  const emojis = { '剪刀': '✌️', '石頭': '✊', '布': '🖐️' };
  const botChoice = choices[Math.floor(Math.random() * 3)];

  let result;
  if (userChoice === botChoice) {
    result = '🤝 平手！';
  } else if (
    (userChoice === '剪刀' && botChoice === '布') ||
    (userChoice === '石頭' && botChoice === '剪刀') ||
    (userChoice === '布' && botChoice === '石頭')
  ) {
    result = '🎉 你贏了！';
  } else {
    result = '😢 你輸了！';
  }

  const msg = `${emojis[userChoice]} vs ${emojis[botChoice]}\n你：${userChoice}\n我：${botChoice}\n\n${result}`;
  await replyText(replyToken, msg);
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

// --- LINE 回覆工具 ---
async function replyToLine(replyToken, messages) {
  try {
    await axios.post("https://api.line.me/v2/bot/message/reply",
      { replyToken, messages },
      { headers: { "Authorization": `Bearer ${CHANNEL_ACCESS_TOKEN}` } }
    );
  } catch (e) { console.error("LINE Error:", e.response?.data); }
}

async function replyText(replyToken, text) { await replyToLine(replyToken, [{ type: "text", text }]); }
async function replyFlex(replyToken, alt, flex) { await replyToLine(replyToken, [{ type: "flex", altText: alt, contents: flex }]); }
