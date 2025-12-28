const { Firestore } = require('@google-cloud/firestore');

// === 1. 設定區 (從設定檔讀取) ===
const {
  ADMIN_USER_ID,
  KEYWORD_MAP
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
const { handleWeather, handleAirQuality } = require('./handlers/weather');
const systemHandler = require('./handlers/system');
const lotteryHandler = require('./handlers/lottery');
const todoHandler = require('./handlers/todo');
const restaurantHandler = require('./handlers/restaurant');
const driveHandler = require('./handlers/drive');
const financeHandler = require('./handlers/finance');
const tcatHandler = require('./handlers/tcat');

// === Firestore 初始化 ===
const db = new Firestore();

// === 群組授權與快取 ===
// 已移至 utils/auth.js，此處移除重複代碼


// === 限時抽獎系統 ===
// 已移至 handlers/lottery.js，此處移除重複代碼




// === 群組待辦事項功能 & 餐廳功能 ===
// 已移至 handlers/todo.js 與 handlers/restaurant.js，此處移除重複代碼

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
    await financeHandler.handleCreditCard(replyToken, Number(message.slice(2)));
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
      const url = await driveHandler.getRandomDriveImage(KEYWORD_MAP[message]);
      if (url) await lineUtils.replyToLine(replyToken, [{ type: 'image', originalContentUrl: url, previewImageUrl: url }]);
    }

    return true;
  }

  // === 3.5 限時抽獎 (Group Only) ===
  if (isGroup && isAuthorizedGroup) {
    // 檢查抽獎狀態 (用於關鍵字參加)
    const status = await lotteryHandler.getLotteryStatus(groupId);

    // 參加抽獎 (關鍵字匹配)
    if (status && !status.isExpired && message === status.keyword) {
      const result = await lotteryHandler.joinLottery(groupId, userId);
      await lineUtils.replyText(replyToken, result.message);
      return true;
    }

    // 發起抽獎 command: 抽獎 關鍵字 獎品 人數 [時間]
    const startMatch = message.match(/^抽獎\s+(\S+)\s+(\S+)\s+(\d+)(\s+(\d+))?$/);
    if (startMatch) {
      const keyword = startMatch[1];
      const prize = startMatch[2];
      const winners = parseInt(startMatch[3]);
      const minutes = startMatch[5] ? parseInt(startMatch[5]) : 5;

      await lotteryHandler.startLottery(groupId, minutes, winners, keyword, prize, userId);
      await lineUtils.replyText(replyToken, `🎉 抽獎活動開始！\n\n🎁 獎品：${prize}\n🔑 關鍵字：「${keyword}」\n⏰ 時間：${minutes} 分鐘\n🏆 名額：${winners} 人\n\n快輸入關鍵字參加吧！`);
      return true;
    }

    // 開獎
    if (message === '開獎') {
      if (!status) {
        await lineUtils.replyText(replyToken, '❌ 目前沒有進行中的抽獎');
        return true;
      }
      const result = await lotteryHandler.drawLottery(groupId);
      if (result.success) {
        await lineUtils.replyText(replyToken, `🎉 恭喜以下 ${result.winnerCount} 位幸運兒獲得 ${result.prize}！\n\n${result.winners.length > 0 ? '得獎者已抽出' : '無人中獎'}`);
      } else {
        await lineUtils.replyText(replyToken, result.message);
      }
      return true;
    }

    // 狀態
    if (message === '抽獎狀態') {
      if (status) {
        await lineUtils.replyText(replyToken, `📊 目前抽獎活動：\n🎁 獎品：${status.prize}\n🔑 關鍵字：${status.keyword}\n👥 參加人數：${status.participants}\n⏰ 剩餘時間：${status.remainingMinutes} 分鐘`);
      } else {
        await lineUtils.replyText(replyToken, '目前沒有進行中的抽獎');
      }
      return true;
    }

    // 取消
    if (message === '取消抽獎') {
      await lotteryHandler.cancelLottery(groupId);
      await lineUtils.replyText(replyToken, '🚫 抽獎活動已取消');
      return true;
    }
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
        const pendingRequest = restaurantHandler.getPendingLocation(userId);
        if (!pendingRequest) {
          continue;
        }

        restaurantHandler.clearPendingLocation(userId);

        // 搜尋附近餐廳
        const restaurants = await restaurantHandler.searchNearbyRestaurants(latitude, longitude, 500);

        if (!restaurants || restaurants.length === 0) {
          await lineUtils.replyText(replyToken, '🍽️ 附近 500 公尺內沒有找到餐廳\n\n試試看分享其他位置？');
          continue;
        }

        // 回覆 Flex Message
        const flexContent = restaurantHandler.buildRestaurantFlex(restaurants, address);
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

        if (message === '一般指令') {
          await systemHandler.handleSimulateGeneralHelp(userId, groupId, replyToken, sourceType);
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

        // 空氣品質 (AQI) - 詳細版
        if (/^空氣\s+.+/.test(message)) {
          if (sourceType === 'group') {
            if (!(await authUtils.isWeatherAuthorized(groupId))) {
              // 共用天氣權限
              await lineUtils.replyText(replyToken, '❌ 本群組尚未開通天氣/空氣功能 (需使用「註冊天氣」指令)。');
              continue;
            }
          } else if (sourceType === 'user' && !authUtils.isSuperAdmin(userId)) {
            await lineUtils.replyText(replyToken, '❌ 空氣功能私訊僅限超級管理員使用。');
            continue;
          }
          await handleAirQuality(replyToken, message);
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
          restaurantHandler.setPendingLocation(userId, groupId || userId);
          await lineUtils.replyText(replyToken, '📍 請分享你的位置資訊\n\n👉 點擊「+」→「位置資訊」\n⏰ 5 分鐘內有效');
          continue;
        }

        // 待辦事項
        const isTodoCmd = ['待辦', '清單', 'todo', 'list'].includes(message.toLowerCase()) ||
          /^新增\s/.test(message) ||
          /^完成\s/.test(message) ||
          /^刪除\s/.test(message) ||
          message === '清空';

        if (sourceType === 'group' && isTodoCmd) {
          if (!(await authUtils.isTodoAuthorized(groupId))) {
            if (message === '待辦' || message === 'todo') {
              await lineUtils.replyText(replyToken, '❌ 本群組尚未開通待辦功能 (需使用「註冊待辦」指令)');
            }
            continue;
          }

          // 列表
          if (message === '待辦' || message === '清單' || message === 'todo' || message === 'list') {
            const todos = await todoHandler.getTodoList(groupId);
            if (todos.length === 0) {
              await lineUtils.replyText(replyToken, '📝 目前沒有待辦事項');
            } else {
              const text = '📝 待辦事項清單：\n\n' + todos.map((t, i) => {
                const status = t.done ? '✅' : (t.priority === 'high' ? '🔴' : (t.priority === 'medium' ? '🟡' : '🟢'));
                return `${i + 1}. ${status} ${t.text}`;
              }).join('\n');
              await lineUtils.replyText(replyToken, text);
            }
            continue;
          }

          // 新增
          const addMatch = message.match(/^新增\s+(.+)/);
          if (addMatch) {
            const content = addMatch[1].trim();
            // 檢查是否指定優先級 (e.g. "新增 !急件")
            let priority = 'low';
            let text = content;
            if (content.startsWith('!')) {
              priority = 'high';
              text = content.substring(1).trim();
            } else if (content.startsWith('?')) {
              priority = 'medium';
              text = content.substring(1).trim();
            }

            const newItem = await todoHandler.addTodo(groupId, text, userId, priority);
            await lineUtils.replyText(replyToken, `✅ 已新增: ${newItem.emoji} ${newItem.text}`);
            continue;
          }

          // 完成
          const doneMatch = message.match(/^完成\s+(\d+)/);
          if (doneMatch) {
            const index = parseInt(doneMatch[1]) - 1;
            const result = await todoHandler.completeTodo(groupId, index);
            if (result.success) {
              await lineUtils.replyText(replyToken, `🎉 完成: ${result.text}`);
            } else {
              await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            }
            continue;
          }

          // 刪除
          const delMatch = message.match(/^刪除\s+(\d+)/);
          if (delMatch) {
            const index = parseInt(delMatch[1]) - 1;
            const result = await todoHandler.deleteTodo(groupId, index);
            if (result.success) {
              await lineUtils.replyText(replyToken, `🗑️ 已刪除: ${result.text}`);
            } else {
              await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            }
            continue;
          }

          // 清空
          if (message === '清空') {
            await todoHandler.clearTodos(groupId);
            await lineUtils.replyText(replyToken, '🧹 已清空所有待辦事項');
            continue;
          }
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
  const isAdminCmd = ['產生註冊碼', '產生天氣註冊碼', '產生代辦註冊碼', '產生待辦註冊碼', '產生餐廳註冊碼', '管理員列表', '管理後台', 'admin', 'dashboard'].includes(message.toLowerCase()) ||
    message.startsWith('註冊') ||
    message.startsWith('新增管理員') ||
    message.startsWith('刪除管理員');

  if (!isAdminCmd) return false;

  // 管理後台
  if (['管理後台', 'admin', 'dashboard'].includes(message.toLowerCase())) {
    await systemHandler.handleAdminDashboard(userId, replyToken);
    return true;
  }

  // 產生指令
  if (message === '產生註冊碼') {
    await systemHandler.handleGenerateCode(userId, replyToken);
    return true;
  }
  if (message === '產生天氣註冊碼') {
    await systemHandler.handleGenerateWeatherCode(userId, replyToken);
    return true;
  }
  if (message === '產生代辦註冊碼' || message === '產生待辦註冊碼') {
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

// === 以下邏輯已移至獨立 handlers ===
// handlers/drive.js - getRandomDriveImage
// handlers/finance.js - handleFinancing, handleCreditCard
// handlers/tcat.js - getTcatStatus, buildTcatFlex, handleTcatQuery


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
