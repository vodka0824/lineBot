/**
 * 拉霸 (Slot Machine) 功能模組
 * 移植自 mant0u0/LineBot-Mant0u 的視覺疊加方案
 */
const flexUtils = require('../utils/flex');
const { replyFlex } = require('../utils/line');

// 符號清單 (對應圖片目錄中的檔案名稱：0.png, 1.png, 2.png, 3.png, 4.png, 7.png)
const SYMBOLS = ['0', '1', '2', '3', '4', '7'];
const SYMBOL_NAMES = {
    '0': '🎰 BAR',
    '1': '💧 藍色果凍',
    '2': '🔔 鈴鐺',
    '3': '🍉 西瓜',
    '4': '🍒 櫻桃',
    '7': 'Lucky 7'
};

// 圖片資源 Base URL (您的 GCS Bucket 根目錄)
const IMG_BASE = 'https://storage.googleapis.com/my-linebot-assets';

// 中獎線路定義 (8條線的索引)
// 0 1 2
// 3 4 5
// 6 7 8
const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // 水平
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // 垂直
    [0, 4, 8], [2, 4, 6]           // 斜對角
];

/**
 * 執行拉霸
 */
async function handleSlot(replyToken) {
    const layout = [];

    // 生成 3x3 隨機佈局 (0-8 索引)
    for (let i = 0; i < 9; i++) {
        const randomSym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        layout.push(randomSym);
    }

    // 檢查中獎
    const winners = [];
    WIN_LINES.forEach(line => {
        const [a, b, c] = line;
        if (layout[a] === layout[b] && layout[b] === layout[c]) {
            winners.push({
                line,
                symbol: layout[a]
            });
        }
    });

    // 建立 Flex Message
    const flex = buildSlotFlex(layout, winners);
    // 優化 altText 包含中獎結果
    const altText = winners.length > 0
        ? `🎰 拉霸結果 - 恭喜！${winners.length} 條連線`
        : '🎰 拉霸結果 - 未中獎';
    await replyFlex(replyToken, altText, flex);
}

/**
 * 組裝拉霸 Flex Message (還原原始設計)
 */
function buildSlotFlex(layout, winners) {
    const { COLORS } = flexUtils;
    const contents = [];

    // 1. 底圖
    contents.push(flexUtils.createImage({
        url: `${IMG_BASE}/bg/1.png`,
        size: 'full',
        aspectRatio: '1:1',
        aspectMode: 'cover'
    }));

    // 2. 疊加 9 個位置的透明符號圖層
    const posMapping = ['00', '01', '02', '10', '11', '12', '20', '21', '22'];

    layout.forEach((sym, i) => {
        const posCode = posMapping[i];
        contents.push(flexUtils.createImage({
            url: `${IMG_BASE}/${posCode}/${sym}.png`,
            size: 'full',
            aspectRatio: '1:1',
            aspectMode: 'cover',
            position: 'absolute'
        }));
    });

    // 3. 底部結果文字盒（優化：更清晰的字體與背景）
    let footerText;
    let footerColor = COLORS.DARK_GRAY;

    if (winners.length > 0) {
        const winningSyms = [...new Set(winners.map(w => SYMBOL_NAMES[w.symbol] || w.symbol))];
        footerText = `🎊 恭喜！達成 ${winners.length} 條連線 (${winningSyms.join(', ')})`;
        footerColor = COLORS.DANGER;
    } else {
        // 未中獎訊息池（隨機選擇）
        const loseMessages = [
            // 嘲諷挑釁系列
            "你的運氣就跟你的技術一樣... 不存在 🤣",
            "連續失敗是一種天賦，恭喜你 👏",
            "建議改名叫『沒中過』，這樣比較符合現實 😏",
            "這運氣，去買樂透應該會讓別人中大獎 🎯",
            "你是不是得罪了財神爺？還是得罪了所有神？🙏",
            "恭喜！又一次證明了墨菲定律 📉",
            "要不要考慮去當倒楣鬼代言人？🤡",
            "這運氣拿去當肥料，連草都長不出來 🌱",

            // 反諷鼓勵系列
            "別灰心，失敗是成功之...算了你不會成功的 💔",
            "再接再厲！(反正再厲也沒用) 😂",
            "相信自己！你一定會繼續槓龜的 ✨",
            "堅持就是勝利...的反義詞 🏳️",
            "你已經解鎖成就：【永不放棄的輸家】🏆",

            // 哲學搞笑系列
            "人生就像拉霸，你永遠在輸 🎰",
            "佛曰：色即是空，你的獎金也是 🙏",
            "薛丁格的獎金：打開前就知道沒有 📦",
            "量子力學證明：觀察者會影響結果...但你不行 🔬",

            // 假專業統計系列
            "根據大數據分析，你中獎率：0.000...001% 📊",
            "AI 預測：您下次中獎時間為2099年 🤖",
            "統計顯示：你是全伺服器最非的那個 📉",
            "系統檢測到異常...你的運氣異常的差 ⚠️",

            // 直白嗆爆系列
            "就...沒中啊，不然勒？😏",
            "窮鬼預定 🦗",
            "槓龜專業戶上線了 🎯",
            "滾啦！下一位 👋",
            "你還想中獎？醒醒吧 ⏰",

            // 創意搞怪系列
            "叮咚～您的歐氣已下線 📴",
            "恭喜獲得：空氣 x1 🌬️",
            "中獎名單：[ 不是你 ] ✖️",
            "系統提示：您的幸運值已透支 💸",
            "Achievement Unlocked: 非洲酋長 👑",
            "您已被幸運女神拉黑 🚫",

            // 損友系列
            "笑死，又沒中 🤣🤣🤣",
            "我就知道你不行 😎",
            "這wave穩輸，不虧 📉",
            "建議：把運氣賣了換錢 💰",
            "你是來搞笑的吧？ 🤡",

            // 鼓勵繼續系列（陷阱）
            "差一點點就中了！(大概差100點) 😅",
            "下次一定中！(我說下輩子) ⏭️",
            "繼續轉！反正都在輸 🔄",
            "不要放棄！雖然你會繼續輸 💪"
        ];

        // 隨機選擇一個訊息
        const randomIndex = Math.floor(Math.random() * loseMessages.length);
        footerText = loseMessages[randomIndex];
    }

    if (winners.length > 0) {
        const winningSyms = [...new Set(winners.map(w => SYMBOL_NAMES[w.symbol] || w.symbol))];
        footerText = `🎊 恭喜！達成 ${winners.length} 條連線 (${winningSyms.join(', ')})`;
        footerColor = COLORS.DANGER;
    }

    contents.push(flexUtils.createBox('vertical', [
        flexUtils.createText({
            text: footerText,
            align: 'center',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'md',
            wrap: true
        })
    ], {
        position: 'absolute',
        offsetBottom: '60px',  // 從 10px 改為 60px，避免被按鈕遮擋
        offsetStart: '0px',
        offsetEnd: '0px',
        backgroundColor: winners.length > 0 ? '#FF0000DD' : '#000000DD',
        paddingAll: '8px'
    }));


    // 4. 重玩按鈕（優化版：更大、更顯眼、置中）
    contents.push(flexUtils.createBox('vertical', [
        flexUtils.createButton({
            action: {
                type: 'message',
                label: '🎰 再來一次!',
                text: '🎰 拉霸'
            },
            style: 'primary',
            height: 'sm',
            color: '#FF6B6B'  // 鮮豔的紅色
        })
    ], {
        position: 'absolute',
        offsetBottom: '50px',
        offsetStart: '20px',
        offsetEnd: '20px'  // 左右留白，按鈕會自動填滿
    }));

    const bubble = flexUtils.createBubble({
        size: 'mega',
        body: flexUtils.createBox('vertical', contents, { paddingAll: '0px' })
    });

    return bubble;
}

module.exports = {
    handleSlot
};
