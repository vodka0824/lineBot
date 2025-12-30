const { Firestore } = require('@google-cloud/firestore');

// === 1. 設定區 (從設定檔讀取) ===
const {
  ADMIN_USER_ID,
  KEYWORD_MAP
} = require('./config/constants');
const lineUtils = require('./utils/line');
const authUtils = require('./utils/auth');
const { handleError } = require('./utils/errorHandler');

// === Handlers Imports ===
const crawlerHandler = require('./handlers/crawler');
const aiHandler = require('./handlers/ai');
const gameHandler = require('./handlers/game');
const weatherHandler = require('./handlers/weather');
const systemHandler = require('./handlers/system');
const lotteryHandler = require('./handlers/lottery');
const todoHandler = require('./handlers/todo');
const restaurantHandler = require('./handlers/restaurant');
const driveHandler = require('./handlers/drive');
const financeHandler = require('./handlers/finance');
const tcatHandler = require('./handlers/tcat');
const taigiHandler = require('./handlers/taigi');
const currencyHandler = require('./handlers/currency');
const leaderboardHandler = require('./handlers/leaderboard');
const settingsHandler = require('./handlers/settings');
const funHandler = require('./handlers/fun');
const horoscopeHandler = require('./handlers/horoscope');

// === Router Imports ===
const router = require('./utils/router');
const registerRoutes = require('./handlers/routes');

// === Firestore 初始化 ===
const db = new Firestore();

// === 路由註冊 ===
registerRoutes(router, {
  financeHandler,
  currencyHandler,
  systemHandler,
  weatherHandler,
  todoHandler,
  restaurantHandler,
  lotteryHandler,
  taigiHandler,
  leaderboardHandler,
  driveHandler,
  crawlerHandler,
  aiHandler,
  gameHandler,
  lineUtils,
  settingsHandler,
  funHandler,
  tcatHandler,
  horoscopeHandler
});

async function handleCommonCommands(message, replyToken, sourceType, userId, groupId, messageObject = null) {
  const isSuper = authUtils.isSuperAdmin(userId);
  const isGroup = (sourceType === 'group' || sourceType === 'room');
  const isAuthorizedGroup = isGroup ? await authUtils.isGroupAuthorized(groupId) : false;

  // 0. 黑名單檢查 (Global Ban)
  const isBanned = await authUtils.isBlacklisted(userId);
  if (isBanned) {
    await lineUtils.replyText(replyToken, "你已被關進小黑屋,請好好的反省!");
    return true; // Stop processing
  }

  // 1. 記錄群組發言 (用於排行榜) - 移至最外層，只要是授權群組的訊息都記錄
  if (isGroup && isAuthorizedGroup) {
    leaderboardHandler.recordMessage(groupId, userId).catch(() => { });
  }

  // 2. 構建路由上下文
  const context = {
    message,
    messageObject: typeof message === 'object' ? message : null, // Fallback if message is string? No, handleCommonCommands receives 'text' as first arg usually.
    // Wait, handleCommonCommands(text, replyToken...) calls handleCommonCommands(text...).
    // I need to change signature of handleCommonCommands to receive full 'eventMessage' or 'messageObject'?
    // See index.js call site: handleCommonCommands(text, ...). 
    // I should change the first argument to be 'messageObject' or add a new argument. 
    // But 'router.execute' expects 'message' as string for matching?
    // Let's keep 'message' as text, but add 'messageObject' to context.
    // I need to update the call site in lineBot function first/concurrently.
    replyToken,
    sourceType,
    userId,
    groupId,
    isSuper,
    isGroup,
    isAuthorizedGroup,
    // 方便 handler 使用
    replyText: (text) => lineUtils.replyText(replyToken, text),
    replyFlex: (alt, contents) => lineUtils.replyFlex(replyToken, alt, contents)
  };

  // 3. 執行路由
  const handled = await router.execute(message, context);
  if (handled) return true;

  // 4. Fallback 或其他未納入路由的邏輯 (目前應該都在路由中了)
  // 如果有其他無法透過 router 處理的邏輯 (例如非指令的自然語言處理)，可以在這裡補充

  return false;
}

// === Line Bot Webhook Handler ===
async function lineBot(req, res) {
  try {
    const events = req.body.events;
    // 處理每個事件
    const results = await Promise.all(events.map(async (event) => {
      // 確保只處理文字訊息或 Postback
      if (event.type === 'message' && event.message.type === 'text') {
        const { replyToken, source, message } = event;
        const { text } = message;
        const userId = source.userId;
        const groupId = source.groupId || source.roomId;
        const sourceType = source.type;

        const handled = await handleCommonCommands(text, replyToken, sourceType, userId, groupId, message);
        if (!handled) {
          // Unhandled text message
        }
      } else if (event.type === 'postback') {
        const { replyToken, source, postback } = event;
        const data = postback.data;
        const userId = source.userId;
        const groupId = source.groupId || source.roomId;
        const sourceType = source.type;

        // 建構 context
        const context = {
          replyToken,
          userId,
          groupId,
          sourceType,
          postbackData: data,
          // Helper flags
          isGroup: sourceType === 'group' || sourceType === 'room',
          // 注意: 這裡需要重新抓取權限資訊嗎？ router.executePostback 內好像沒有檢查權限
          // 但 handler 內部會檢查
        };

        // 執行 Postback 路由
        await router.executePostback(data, context);
      }
    }));

    res.status(200).json({
      status: 'success',
      results
    });
  } catch (error) {
    // 這裡 context 只有部分資訊，盡量提供
    await handleError(error, { message: 'Webhook Event Loop Error' });

    // 雖然發生錯誤，但仍回傳 200 給 LINE，避免無限重試
    res.status(200).json({
      status: 'error',
      message: error.message
    });
  }
}

module.exports = {
  lineBot,
  handleCommonCommands
};
