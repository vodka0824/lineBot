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
    await replyFlex(replyToken, '🎰 拉霸結果', flex);
}

/**
 * 組裝拉霸 Flex Message (原創設計：經典復古版)
 */
function buildSlotFlex(layout, winners) {
    const { COLORS } = flexUtils;

    // 經典賭場色調
    const THEME = {
        GOLD: '#FFD700',
        ORANGE: '#FFA500',
        DARK_RED: '#8B0000',
        REEL_WHITE: '#F5F5F5',
        BORDER: '#5C3317'
    };

    // 1. 建立三個垂直滾輪 (Reels) 背景，填補視覺空白
    const reelsBackground = flexUtils.createBox('horizontal', [
        flexUtils.createBox('vertical', [], { backgroundColor: THEME.REEL_WHITE, flex: 1, margin: 'md', cornerRadius: 'md' }),
        flexUtils.createBox('vertical', [], { backgroundColor: THEME.REEL_WHITE, flex: 1, margin: 'md', cornerRadius: 'md' }),
        flexUtils.createBox('vertical', [], { backgroundColor: THEME.REEL_WHITE, flex: 1, margin: 'md', cornerRadius: 'md' })
    ], {
        position: 'absolute',
        offsetTop: '20px',
        offsetBottom: '20px',
        offsetStart: '20px',
        offsetEnd: '20px'
    });

    const slotGrid = [reelsBackground];

    // 2. 疊加 9 個位置的透明符號圖層
    // 技巧：將圖片放大至 140% 並微調位置，以填滿白色滾輪的視覺空白
    const posMapping = ['00', '01', '02', '10', '11', '12', '20', '21', '22'];
    layout.forEach((sym, i) => {
        const posCode = posMapping[i];
        slotGrid.push(flexUtils.createImage({
            url: `${IMG_BASE}/${posCode}/${sym}.png`,
            size: '140%',      // 放大圖片
            aspectRatio: '1:1',
            aspectMode: 'cover',
            position: 'absolute',
            offsetTop: '-15%',   // 向上修正因放大產生的位移
            offsetStart: '-20%'  // 向左修正
        }));
    });

    // 3. 中獎裝飾
    if (winners.length > 0) {
        slotGrid.push(flexUtils.createBox('vertical', [{ type: 'filler' }], {
            position: 'absolute',
            offsetTop: '10px',
            offsetBottom: '10px',
            offsetStart: '10px',
            offsetEnd: '10px',
            borderWidth: 'bold',
            borderColor: '#FF0000AA',
            cornerRadius: 'lg'
        }));
    }

    // --- 組裝主氣泡 ---

    const bubble = flexUtils.createBubble({
        size: 'mega',
        styles: {
            body: { backgroundColor: THEME.ORANGE },
            header: { backgroundColor: THEME.DARK_RED },
            footer: { backgroundColor: THEME.ORANGE }
        },
        header: flexUtils.createBox('vertical', [
            flexUtils.createText({
                text: '🎰 CRY-PC CASINO',
                weight: 'bold',
                color: THEME.GOLD,
                size: 'lg',
                align: 'center'
            })
        ], { paddingAll: 'md' }),
        body: flexUtils.createBox('vertical', [
            // 外層立體框體
            flexUtils.createBox('vertical', [
                // 模擬 3x3 盤面的容器，利用 padding 撐開高度
                flexUtils.createBox('vertical', slotGrid, {
                    backgroundColor: '#333333',
                    cornerRadius: 'lg',
                    height: '260px' // 回歸較穩定的高度設定
                })
            ], {
                paddingAll: '10px',
                backgroundColor: THEME.BORDER,
                cornerRadius: 'xl',
                borderWidth: 'bold',
                borderColor: '#2A1506'
            })
        ], { paddingAll: 'lg' }),
        footer: flexUtils.createBox('vertical', [
            // 結果緞帶
            flexUtils.createBox('vertical', [
                flexUtils.createText({
                    text: winners.length > 0 ? '🎊 JACKPOT! 🎊' : 'TRY AGAIN',
                    color: '#FFFFFF',
                    weight: 'bold',
                    size: 'md',
                    align: 'center'
                }),
                flexUtils.createText({
                    text: winners.length > 0
                        ? `達成連線: ${[...new Set(winners.map(w => SYMBOL_NAMES[w.symbol] || w.symbol))].join(', ')}`
                        : '再接再厲，下一場就是你的！',
                    color: '#FFD700',
                    size: 'xs',
                    align: 'center',
                    margin: 'sm'
                })
            ], {
                backgroundColor: THEME.DARK_RED,
                paddingAll: 'md',
                cornerRadius: 'md',
                borderWidth: 'light',
                borderColor: THEME.GOLD
            }),
            // 底部操作鈕
            flexUtils.createButton({
                action: {
                    type: 'message',
                    label: 'SPIN IT!',
                    text: '🎰 拉霸'
                },
                style: 'primary',
                height: 'md',
                color: THEME.DARK_RED,
                margin: 'lg'
            })
        ], { paddingAll: 'lg', paddingTop: 'none' })
    });

    return bubble;
}

module.exports = {
    handleSlot
};
