const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'index.js');
const indexContent = fs.readFileSync(indexPath, 'utf8');
const lines = indexContent.split(/\r?\n/);

// 1. Find the start of the OLD exports.lineBot (wrapped/messed up)
// It typically starts with /** then exports.lineBot
const startIdx = lines.findIndex(line => line.trim() === '/**' && lines[lines.indexOf(line) + 3]?.includes('exports.lineBot'));
// Or look for line 820 roughly
let cutPoint1 = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('exports.lineBot = async (req, res) => {') && lines[i - 3]?.trim() === '/**') {
        cutPoint1 = i - 3;
        break;
    }
}

if (cutPoint1 === -1) {
    console.error('Could not find start of exports.lineBot');
    process.exit(1);
}

console.log(`Found start at line ${cutPoint1 + 1}`);

// 2. Find the validation of the Helpers (indented)
// Look for "async function getRandomDriveImageWithCache" with indentation
let helperStartIdx = -1;
for (let i = cutPoint1; i < lines.length; i++) {
    if (lines[i].includes('async function getRandomDriveImageWithCache(folderId)')) {
        helperStartIdx = i;
        // Check if there is a comment block before it
        if (lines[i - 1]?.trim() === '// --- Google Drive 隨機圖片邏輯 (含快取) ---') {
            helperStartIdx = i - 1;
        }
        break;
    }
}

if (helperStartIdx === -1) {
    console.error('Could not find helper functions');
    // It might be that I already deleted the wrapper in a previous step? 
    // But grep failed so I am assuming it is messed up.
    process.exit(1);
}

console.log(`Found helpers at line ${helperStartIdx + 1}`);

// 3. Construct New Content
const beforeContent = lines.slice(0, cutPoint1).join('\n');

const newMainContent = `/**
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
          await lineUtils.replyText(replyToken, '🍽️ 附近 500 公尺內沒有找到餐廳\\n\\n試試看分享其他位置？');
          continue;
        }

        // 回覆 Flex Message
        const flexContent = buildRestaurantFlex(restaurants, address);
        await lineUtils.replyToLine(replyToken, [{
          type: 'flex',
          altText: \`🍽️ 附近美食推薦（\${restaurants.length} 間）\`,
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
        if (sourceType === 'group' && /^(開啟|關閉)\\s+(.+)$/.test(message)) {
             const match = message.match(/^(開啟|關閉)\\s+(.+)$/);
             const enable = match[1] === '開啟';
             const feature = match[2];
             await systemHandler.handleToggleFeature(groupId, userId, feature, enable, replyToken);
             continue;
        }

        // === 3. 通用指令 (含權限檢查) ===
        if (await handleCommonCommands(message, replyToken, sourceType, userId, groupId)) continue;

        // === 4. 特殊授權功能 (天氣, 餐廳, 待辦) - 需獨立檢查 ===
        
        // 天氣查詢
        if (/^天氣\\s+.+/.test(message)) {
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
                     await lineUtils.replyText(replyToken, '❌ 尚未啟用附近餐廳功能\\n\\n請輸入「註冊餐廳 FOOD-XXXX」啟用');
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
             await lineUtils.replyText(replyToken, '📍 請分享你的位置資訊\\n\\n👉 點擊「+」→「位置資訊」\\n⏰ 5 分鐘內有效');
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

    // 註冊指令
    if (/^註冊\\s*[A-Z0-9]+$/i.test(message)) {
        const code = message.replace(/^註冊\\s*/i, '').trim();
        await systemHandler.handleRegisterGroup(groupId, userId, code, replyToken);
        return true;
    }
    if (/^註冊天氣\\s*[A-Z0-9]+$/i.test(message)) {
        const code = message.replace(/^註冊天氣\\s*/i, '').trim();
        await systemHandler.handleRegisterWeather(groupId, userId, code, replyToken);
        return true;
    }

    // 新增/刪除管理員 (僅限超級管理員)
    if (authUtils.isSuperAdmin(userId) && (message.startsWith('新增管理員') || message.startsWith('刪除管理員'))) {
        if (message.startsWith('新增管理員')) {
             const match = message.match(/U[a-f0-9]{32}/i);
             if (match) {
                 await authUtils.addAdmin(match[0], userId, 'Super Admin Added');
                 await lineUtils.replyText(replyToken, \`✅ 已新增管理員 \${match[0]}\`);
                 return true;
             }
        }
    }
    
    return false;
}`;

// Helpers: Extract and Unindent
const helperLines = lines.slice(helperStartIdx);
// Find indentation of the first line
const firstLine = helperLines[0];
const indentMatch = firstLine.match(/^\s*/);
const indent = indentMatch ? indentMatch[0].length : 0;

const cleanHelpers = helperLines.map(line => {
    if (line.length >= indent && line.substring(0, indent).trim() === '') {
        return line.substring(indent); // Remove indentation
    }
    return line.trimStart(); // Fallback
}).join('\n');

// Extra check: Remove the closing }); of the OLD wrapper at the very end
// The old wrapper logic likely had `});` and maybe a `}` for try/catch?
// Inspect the end of cleanHelpers.
// From Step 2747, the file ends with `      });`.
// If we just un-indent using the 6-space rule, `      });` becomes `});`.
// But these `});` likely belong to the `exports.lineBot` wrapper which we REPLACED.
// So we should REMOVE the last few lines if they are closing braces for the wrapper.
// The helpers end with process.on(...).
// Let's verify if there is any `}` `)` logic at the end that shouldn't be there.
// Step 2747: 1186: `      });`
// This `});` probably closes `process.on('unhandledRejection', ...)`?
// Let's check lines 1176-1186:
/*
      process.on('unhandledRejection', async (reason, promise) => {
        // ...
      });
*/
// Yes, `});` at 1186 closes `process.on`.
// Is there another `}` or `};` AFTER that to close the function?
// Viewer showed up to 1187.
// 1187 was empty.
// If the file ended there, and I unindent, it's correct.
// BUT, where did the `}` for the OLD `exports.lineBot` go?
// It was at line 1578 originally.
// My edit replaced 860-1578.
// So the `}` was consumed by the replacement block?
// The replacement block ENDED with `handleAdminCommands { ... }`.
// So there is NO closing `}` for the OLD `exports.lineBot` left in the file!
// AND the code after (helpers) is indented... which implies it THINKS it's inside?
// No, indentation is just characters.
// If there is no closing bracket, and I un-indent the helpers, the file should be valid sequence of functions.
// UNLESS the helpers themselves have an extra closing bracket at the end?
// The viewer showed 1186 `});` as the last contentful line.
// This closes `process.on`.
// So it seems fine.

const finalContent = beforeContent + '\n\n' + newMainContent + '\n\n' + cleanHelpers;

fs.writeFileSync(indexPath, finalContent);
console.log('Successfully fixed index.js');
