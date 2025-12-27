/**
 * LINE Bot 主入口
 * 使用模組化結構
 */

// === 載入模組 ===
const { KEYWORD_MAP } = require('./config/constants');
const { replyToLine, replyText, replyFlex, getGroupMemberName } = require('./utils/line');
const {
  isGroupAuthorized,
  createRegistrationCode,
  getUnusedCodes,
  registerGroup,
  isAdmin,
  isSuperAdmin,
  addAdmin,
  removeAdmin,
  getAdminList,
  generateTodoCode,
  useTodoCode,
  isTodoAuthorized,
  generateRestaurantCode,
  useRestaurantCode,
  isRestaurantAuthorized
} = require('./utils/auth');
const {
  crawlOilPrice,
  crawlNewMovies,
  crawlAppleNews,
  crawlTechNews,
  crawlPttHot,
  getRandomJav
} = require('./handlers/crawler');
const {
  startLottery,
  joinLottery,
  drawLottery,
  getLotteryStatus,
  cancelLottery
} = require('./handlers/lottery');
const {
  addTodo,
  getTodoList,
  completeTodo,
  deleteTodo,
  clearTodos
} = require('./handlers/todo');
const {
  searchNearbyRestaurants,
  buildRestaurantFlex,
  pendingLocationRequests
} = require('./handlers/restaurant');
const {
  getRandomDriveImageWithCache,
  getGeminiReply,
  parseAIReplyToLineMessages,
  handleFinancing,
  handleRPS,
  handleCreditCard,
  getTcatStatus,
  buildTcatFlex
} = require('./handlers/tools');

// === 暫存資料 ===
const pendingTodos = {};

/**
 * Cloud Functions 入口函數
 */
exports.lineBot = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('OK');

  const events = req.body.events;
  if (!events || events.length === 0) return res.status(200).send('No events');

  try {
    for (const event of events) {
      // === 處理位置訊息 ===
      if (event.type === "message" && event.message.type === "location") {
        const userId = event.source.userId;
        const replyToken = event.replyToken;
        const lat = event.message.latitude;
        const lng = event.message.longitude;
        const address = event.message.address || '';

        // 檢查是否有等待中的位置請求
        const pending = pendingLocationRequests[userId];
        if (pending && (Date.now() - pending.timestamp < 5 * 60 * 1000)) {
          delete pendingLocationRequests[userId];

          const restaurants = await searchNearbyRestaurants(lat, lng, 500);

          if (!restaurants || restaurants.length === 0) {
            await replyText(replyToken, '😢 附近 500 公尺內沒有找到餐廳\n\n請嘗試到人潮較多的地方再試一次');
          } else {
            const flex = buildRestaurantFlex(restaurants, address);
            await replyFlex(replyToken, `📍 附近餐廳推薦（${restaurants.length} 間）`, flex);
          }
        }
        continue;
      }

      // === 處理文字訊息 ===
      if (event.type === "message" && event.message.type === "text") {
        const message = event.message.text.trim();
        const replyToken = event.replyToken;
        const userId = event.source.userId;
        const sourceType = event.source.type;
        const groupId = event.source.groupId || event.source.roomId;

        // === 偵測 @ALL 並警告 ===
        if (sourceType === 'group' || sourceType === 'room') {
          const mention = event.message.mention;
          if (mention?.mentionees?.some(m => m.type === 'all')) {
            await replyText(replyToken, '⚠️ 請勿使用 @All 功能！這會打擾到所有人。');
            continue;
          }
        }

        // === 通用指令（私訊 + 群組皆可）===

        // 取得自己的 User ID
        if (message === '我的ID') {
          await replyText(replyToken, `你的 User ID：\n${userId}`);
          continue;
        }

        // === 計算功能（所有人皆可使用）===
        if (/^分唄\d+$/.test(message)) {
          await handleFinancing(replyToken, Number(message.slice(2)), 'fenbei');
          continue;
        }
        if (/^銀角\d+$/.test(message)) {
          await handleFinancing(replyToken, Number(message.slice(2)), 'silver');
          continue;
        }
        if (/^刷卡\d+$/.test(message)) {
          await handleCreditCard(replyToken, Number(message.slice(2)));
          continue;
        }

        // === 私訊附近餐廳功能（超級管理員專用）===
        if (sourceType === 'user' && isSuperAdmin(userId) && (message === '附近餐廳' || message === '附近美食')) {
          pendingLocationRequests[userId] = {
            groupId: userId,
            timestamp: Date.now()
          };
          await replyText(replyToken, '📍 請分享你的位置資訊\n\n👉 點擊「+」→「位置資訊」\n⏰ 5 分鐘內有效');
          continue;
        }

        // === 超級管理員專屬指令 ===
        if (isSuperAdmin(userId)) {
          // 新增管理員
          if (message.startsWith('新增管理員 U') && message.length > 14) {
            const targetUserId = message.replace('新增管理員 ', '').trim();
            if (targetUserId.startsWith('U') && targetUserId.length > 10) {
              await addAdmin(targetUserId, userId, '由超級管理員新增');
              await replyText(replyToken, `✅ 已將用戶新增為管理員！\n\nUser ID: ${targetUserId}`);
            } else {
              await replyText(replyToken, '❌ 無效的 User ID 格式');
            }
            continue;
          }

          // 刪除管理員
          if (message.startsWith('刪除管理員 U') && message.length > 14) {
            const targetUserId = message.replace('刪除管理員 ', '').trim();
            await removeAdmin(targetUserId);
            await replyText(replyToken, `✅ 已將用戶從管理員移除！\n\nUser ID: ${targetUserId}`);
            continue;
          }

          // 管理員列表
          if (message === '管理員列表') {
            const admins = await getAdminList();
            if (admins.length === 0) {
              await replyText(replyToken, '目前沒有其他管理員');
            } else {
              const list = admins.map((a, i) => `${i + 1}. ${a.id.substring(0, 10)}... (${a.note || '無備註'})`).join('\n');
              await replyText(replyToken, `👑 管理員列表：\n\n${list}`);
            }
            continue;
          }

          // 產生註冊碼
          if (message === '產生註冊碼') {
            const code = await createRegistrationCode(userId);
            await replyText(replyToken, `✅ 已產生新的註冊碼：\n\n🔑 ${code}\n\n使用方式：在群組中輸入「註冊 ${code}」`);
            continue;
          }

          // 產生代辦註冊碼
          if (message === '產生代辦註冊碼') {
            const code = await generateTodoCode();
            await replyText(replyToken, `✅ 已產生待辦功能註冊碼：\n\n🔑 ${code}\n\n使用方式：在群組中輸入「註冊代辦 ${code}」`);
            continue;
          }

          // 產生餐廳註冊碼
          if (message === '產生餐廳註冊碼') {
            const code = await generateRestaurantCode();
            await replyText(replyToken, `✅ 已產生餐廳功能註冊碼：\n\n🔑 ${code}\n\n使用方式：在群組中輸入「註冊餐廳 ${code}」`);
            continue;
          }

          // 查看註冊碼
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
          // 註冊指令
          if (/^註冊\s*[A-Z0-9]{8}$/i.test(message)) {
            const code = message.replace(/^註冊\s*/i, '').toUpperCase();
            const result = await registerGroup(code, groupId, userId);
            await replyText(replyToken, result.message);
            continue;
          }

          // 檢查群組是否已授權
          const authorized = await isGroupAuthorized(groupId);
          if (!authorized) {
            continue;
          }

          // === 附近餐廳功能 ===
          if (/^註冊餐廳\s+FOOD-[A-Z0-9]+$/i.test(message)) {
            const code = message.match(/FOOD-[A-Z0-9]+/i)[0].toUpperCase();
            const alreadyEnabled = await isRestaurantAuthorized(groupId);
            if (alreadyEnabled) {
              await replyText(replyToken, '✅ 此群組已啟用附近餐廳功能');
              continue;
            }
            const result = await useRestaurantCode(code, groupId, userId);
            await replyText(replyToken, result.message);
            continue;
          }

          if (message === '附近餐廳' || message === '附近美食') {
            const restaurantEnabled = await isRestaurantAuthorized(groupId);
            if (!restaurantEnabled) {
              await replyText(replyToken, '❌ 此群組尚未啟用附近餐廳功能\n\n請聯繫管理員取得註冊碼');
              continue;
            }
            pendingLocationRequests[userId] = {
              groupId: groupId,
              timestamp: Date.now()
            };
            await replyText(replyToken, '📍 請分享你的位置資訊\n\n👉 點擊「+」→「位置資訊」\n⏰ 5 分鐘內有效');
            continue;
          }

          // === 抽獎系統 ===
          const lotteryMatch = message.match(/^抽獎\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
          if (lotteryMatch) {
            const isAdminUser = await isAdmin(userId);
            if (!isAdminUser) {
              await replyText(replyToken, '❌ 只有管理員才能發起抽獎');
              continue;
            }
            const [, minutes, winners, keyword, prize] = lotteryMatch;
            await startLottery(groupId, parseInt(minutes), parseInt(winners), keyword, prize, userId);
            await replyText(replyToken,
              `🎰 抽獎開始！\n\n` +
              `🎁 獎品：${prize}\n` +
              `👥 名額：${winners} 位\n` +
              `⏰ 時間：${minutes} 分鐘\n` +
              `📝 參加方式：輸入「${keyword}」`
            );
            continue;
          }

          // 參加抽獎
          const lotteryStatus = await getLotteryStatus(groupId);
          if (lotteryStatus && message === lotteryStatus.keyword) {
            const result = await joinLottery(groupId, userId);
            await replyText(replyToken, result.message);
            continue;
          }

          // 抽獎結果
          if (message === '抽獎結果' || message === '開獎') {
            const isAdminUser = await isAdmin(userId);
            if (!isAdminUser) {
              await replyText(replyToken, '❌ 只有管理員才能開獎');
              continue;
            }
            const result = await drawLottery(groupId);
            if (!result.success) {
              await replyText(replyToken, result.message);
            } else {
              const winnerNames = await Promise.all(
                result.winners.map(async (id) => await getGroupMemberName(groupId, id))
              );
              await replyText(replyToken,
                `🎉 開獎結果！\n\n` +
                `🎁 ${result.prize}\n` +
                `👥 ${result.totalParticipants} 人參加\n\n` +
                `🏆 得獎者：\n${winnerNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}`
              );
            }
            continue;
          }

          // 取消抽獎
          if (message === '取消抽獎') {
            const isAdminUser = await isAdmin(userId);
            if (!isAdminUser) {
              await replyText(replyToken, '❌ 只有管理員才能取消抽獎');
              continue;
            }
            await cancelLottery(groupId);
            await replyText(replyToken, '❌ 抽獎已取消');
            continue;
          }

          // === 待辦功能 ===
          if (/^註冊代辦\s+TODO-[A-Z0-9]+$/i.test(message) || /^註冊待辦\s+TODO-[A-Z0-9]+$/i.test(message)) {
            const code = message.match(/TODO-[A-Z0-9]+/i)[0].toUpperCase();
            const result = await useTodoCode(code, groupId, userId);
            await replyText(replyToken, result.message);
            continue;
          }

          const todoEnabled = await isTodoAuthorized(groupId);

          // 新增待辦
          if (/^新增代辦\s+.+/.test(message) || /^新增待辦\s+.+/.test(message)) {
            if (!todoEnabled) continue;
            const text = message.replace(/^新增(代辦|待辦)\s+/, '');
            pendingTodos[userId] = { text, groupId, timestamp: Date.now() };
            await replyText(replyToken, `📝 ${text}\n\n請選擇優先級：\n🔴 高（輸入 1）\n🟡 中（輸入 2）\n🟢 低（輸入 3）`);
            continue;
          }

          // 選擇優先級
          if (pendingTodos[userId] && ['1', '2', '3'].includes(message)) {
            const pending = pendingTodos[userId];
            if (Date.now() - pending.timestamp > 60000) {
              delete pendingTodos[userId];
              continue;
            }
            const priorities = { '1': 'high', '2': 'medium', '3': 'low' };
            const result = await addTodo(pending.groupId, pending.text, userId, priorities[message]);
            delete pendingTodos[userId];
            await replyText(replyToken, `${result.emoji} 已新增：${result.text}`);
            continue;
          }

          // 待辦列表
          if (message === '代辦列表' || message === '待辦列表') {
            if (!todoEnabled) continue;
            const items = await getTodoList(groupId);
            if (items.length === 0) {
              await replyText(replyToken, '📋 目前沒有待辦事項');
            } else {
              const priorityEmoji = { high: '🔴', medium: '🟡', low: '🟢' };
              const list = items.map((item, i) => {
                const emoji = priorityEmoji[item.priority] || '🟢';
                const status = item.done ? '✅' : '⬜';
                return `${i + 1}. ${status}${emoji} ${item.text}`;
              }).join('\n');
              await replyText(replyToken, `📋 待辦事項：\n\n${list}`);
            }
            continue;
          }

          // 完成待辦
          if (/^完成代辦\s*\d+$/.test(message) || /^完成待辦\s*\d+$/.test(message)) {
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

          // 刪除待辦
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

          // 清空待辦
          if (message === '清空代辦' || message === '清空待辦') {
            if (!todoEnabled) continue;
            await clearTodos(groupId);
            await replyText(replyToken, '🗑️ 已清空所有待辦事項');
            continue;
          }

          // === 以下功能僅限已授權群組使用 ===

          // 幫我選
          if (/^幫我選\s+.+/.test(message)) {
            const optionsText = message.replace(/^幫我選\s+/, '');
            const options = optionsText.split(/\s+/).filter(o => o.trim());
            if (options.length < 2) {
              await replyText(replyToken, '❌ 請提供至少 2 個選項\n\n範例：幫我選 披薩 漢堡 拉麵');
              continue;
            }
            const selected = options[Math.floor(Math.random() * options.length)];
            await replyText(replyToken, `🎯 幫你選好了！\n\n選項：${options.join('、')}\n\n👉 結果：${selected}`);
            continue;
          }

          // 油價
          if (message === '油價') {
            const result = await crawlOilPrice();
            await replyText(replyToken, result);
            continue;
          }

          // 電影
          if (message === '電影') {
            const result = await crawlNewMovies();
            await replyText(replyToken, result);
            continue;
          }

          // 蘋果新聞
          if (message === '蘋果新聞') {
            const result = await crawlAppleNews();
            await replyText(replyToken, result);
            continue;
          }

          // 科技新聞
          if (message === '科技新聞') {
            const result = await crawlTechNews();
            await replyText(replyToken, result);
            continue;
          }

          // PTT 熱門
          if (message === '熱門廢文' || message === 'PTT熱門') {
            const result = await crawlPttHot();
            await replyText(replyToken, result);
            continue;
          }

          // 番號推薦
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

          // 黑絲圖片
          if (message === '黑絲') {
            if (sourceType === 'user' && !await isAdmin(userId)) {
              continue;
            }
            const imageUrl = 'https://v2.api-m.com/api/heisi?return=302';
            await replyToLine(replyToken, [{
              type: 'image',
              originalContentUrl: imageUrl,
              previewImageUrl: imageUrl
            }]);
            continue;
          }

          // 腳控圖片
          if (message === '腳控') {
            if (sourceType === 'user' && !await isAdmin(userId)) {
              continue;
            }
            const imageUrl = 'https://3650000.xyz/api/?type=302&mode=7';
            await replyToLine(replyToken, [{
              type: 'image',
              originalContentUrl: imageUrl,
              previewImageUrl: imageUrl
            }]);
            continue;
          }

          // 指令說明
          if (message === '指令' || message === '功能' || message === 'help') {
            await replyText(replyToken,
              `📋 LINE Bot 指令說明\n\n` +
              `📌 一般功能\n` +
              `• 我的ID - 查詢 User ID\n` +
              `• 幫我選 A B C - 多選一\n\n` +
              `📰 資訊查詢\n` +
              `• 油價 / 電影 / 蘋果新聞 / 科技新聞 / 熱門廢文\n\n` +
              `🖼️ 隨機抽圖\n` +
              `• 黑絲 / 腳控 / 奶子 / 美尻 / 絕對領域\n\n` +
              `💰 計算工具\n` +
              `• 分唄10000 / 銀角10000 / 刷卡10000\n\n` +
              `🎰 抽獎功能\n` +
              `• 抽獎 時間 人數 關鍵字 獎品\n\n` +
              `📝 待辦事項（需註冊）\n` +
              `• 新增待辦 / 待辦列表 / 完成待辦N`
            );
            continue;
          }

          // KEYWORD_MAP 隨機圖片
          if (KEYWORD_MAP[message]) {
            if (sourceType === 'user' && !await isAdmin(userId)) {
              continue;
            }
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

          // AI 問答
          if (/^AI\s+/.test(message)) {
            const aiQuery = message.replace(/^AI\s+/, '');
            const aiReply = await getGeminiReply(aiQuery);
            const messages = parseAIReplyToLineMessages(aiReply);
            await replyToLine(replyToken, messages);
            continue;
          }

          // 黑貓查詢
          if (/^黑貓\d{12}$/.test(message)) {
            const tcatNo = message.slice(2);
            const result = await getTcatStatus(tcatNo);
            if (typeof result === "string") {
              await replyText(replyToken, result);
            } else {
              await replyFlex(replyToken, `黑貓貨態${tcatNo}`, buildTcatFlex(tcatNo, result.rows, result.url));
            }
            continue;
          }

          // 剪刀石頭布
          if (['剪刀', '石頭', '布'].includes(message)) {
            await handleRPS(replyToken, message);
            continue;
          }
        } // === 結束群組/聊天室處理區塊 ===
      }
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error("Main Error:", err);
    res.status(200).send('OK');
  }
};
