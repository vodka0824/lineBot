const { Firestore } = require('@google-cloud/firestore');

// === 1. 設定區 (從設定檔讀取) ===
const {
  ADMIN_USER_ID,
  KEYWORD_MAP
} = require('./config/constants');
const lineUtils = require('./utils/line');
const authUtils = require('./utils/auth');

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
  lineUtils
});

async function handleCommonCommands(message, replyToken, sourceType, userId, groupId) {
  const isSuper = authUtils.isSuperAdmin(userId);
  const isGroup = (sourceType === 'group' || sourceType === 'room');
  const isAuthorizedGroup = isGroup ? await authUtils.isGroupAuthorized(groupId) : false;

  // 1. 記錄群組發言 (用於排行榜) - 移至最外層，只要是授權群組的訊息都記錄
  if (isGroup && isAuthorizedGroup) {
    leaderboardHandler.recordMessage(groupId, userId).catch(() => { });
  }

  // 2. 構建路由上下文
  const context = {
    message,
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
      // 確保只處理文字訊息
      if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
      }

      const { replyToken, source, message } = event;
      const { text } = message;
      const userId = source.userId;
      const groupId = source.groupId || source.roomId;
      const sourceType = source.type;

      // 呼叫指令處理邏輯
      const handled = await handleCommonCommands(text, replyToken, sourceType, userId, groupId);

      if (!handled) {
        // 未處理的訊息 (可選擇是否要預設回覆，或直接忽略)
        // console.log(`Unhandled message: ${text}`);
      }
    }));

    res.status(200).json({
      status: 'success',
      results
    });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
}

module.exports = {
  lineBot,
  handleCommonCommands
};
