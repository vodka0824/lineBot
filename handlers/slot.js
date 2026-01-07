/**
 * 拉霸 (Slot Machine) 功能模組
 * 移植自 mant0u0/LineBot-Mant0u 的視覺疊加方案
 */
const flexUtils = require('../utils/flex');
const { replyFlex } = require('../utils/line');

// 符號清單 (對應圖片目錄中的檔案名稱：0.png, 1.png, 2.png, 3.png, 4.png, 7.png)
const SYMBOLS = ['0', '1', '2', '3', '4', '7'];
const SYMBOL_NAMES = {
    '0': '🍒 櫻桃',
    '1': '🍋 檸檬',
    '2': '🍉 西瓜',
    '3': '🔔 鈴鐺',
    '4': '💎 鑽石',
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
    await replyFlex(replyToken, '🎰 拉霸結果', flex);
}

/**
 * 組裝拉霸 Flex Message
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
    // 對方檔案路徑格式: randomSlot/[位置編號]/[符號].png
    // 位置編號: 00, 01, 02, 10, 11, 12, 20, 21, 22
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

    // 3. 底部結果文字盒
    let footerText = '沒有任何連線～再接再厲！';
    let footerColor = COLORS.DARK_GRAY;

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
            size: 'sm'
        })
    ], {
        position: 'absolute',
        offsetBottom: '10px',
        offsetStart: '0px',
        offsetEnd: '0px',
        backgroundColor: winners.length > 0 ? '#FF0000AA' : '#333333AA',
        paddingAll: '4px'
    }));

    // 再加一個重玩按鈕
    contents.push(flexUtils.createBox('vertical', [
        flexUtils.createButton({
            action: {
                type: 'message',
                label: '再玩一次',
                text: '🎰 拉霸'
            },
            style: 'secondary',
            height: 'sm',
            color: '#FFFFFF'
        })
    ], {
        position: 'absolute',
        offsetBottom: '45px',
        offsetEnd: '10px',
        width: '80px'
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
