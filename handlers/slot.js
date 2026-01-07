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
 * 組裝拉霸 Flex Message (原創設計：極致黑金版)
 */
function buildSlotFlex(layout, winners) {
    const { COLORS } = flexUtils;

    // 主色調定義
    const THEME = {
        BG: '#1a1a1a',
        BORDER: '#333333',
        NEON_GLOW: '#00f2fe', // 霓虹藍
        WIN_GLOW: '#fce38a',  // 金光
        TEXT_DIM: '#888888'
    };

    const slotGrid = [];

    // 1. 底層玻璃質感背框
    slotGrid.push(flexUtils.createBox('vertical', [], {
        backgroundColor: '#FFFFFF05',
        position: 'absolute',
        offsetTop: '0px',
        offsetBottom: '0px',
        offsetStart: '0px',
        offsetEnd: '0px',
        cornerRadius: 'lg'
    }));

    // 2. 疊加 9 個位置的透明符號圖層
    const posMapping = ['00', '01', '02', '10', '11', '12', '20', '21', '22'];
    layout.forEach((sym, i) => {
        const posCode = posMapping[i];
        slotGrid.push(flexUtils.createImage({
            url: `${IMG_BASE}/${posCode}/${sym}.png`,
            size: 'full',
            aspectRatio: '1:1',
            aspectMode: 'cover',
            position: 'absolute'
        }));
    });

    // 3. 中獎裝飾 (如有中獎，在外框加一層發光效果)
    if (winners.length > 0) {
        slotGrid.push(flexUtils.createBox('vertical', [], {
            position: 'absolute',
            offsetTop: '0px',
            offsetBottom: '0px',
            offsetStart: '0px',
            offsetEnd: '0px',
            borderWidth: 'bold',
            borderColor: '#FFD700AA', // 金色發光
            cornerRadius: 'lg'
        }));
    }

    // --- 組裝主氣泡 ---

    const bubble = flexUtils.createBubble({
        size: 'mega',
        styles: {
            body: { backgroundColor: THEME.BG },
            header: { backgroundColor: '#000000' },
            footer: { backgroundColor: THEME.BG }
        },
        header: flexUtils.createBox('vertical', [
            flexUtils.createText({
                text: '🎰 CRY-PC SPECIAL SLOT',
                weight: 'bold',
                color: THEME.NEON_GLOW,
                size: 'sm',
                align: 'center',
                decoration: 'none'
            }),
            flexUtils.createText({
                text: 'SYSTEM MODEL: GCS-ULTRA',
                size: 'xxs',
                color: THEME.TEXT_DIM,
                align: 'center',
                margin: 'xs'
            })
        ], { paddingAll: 'md' }),
        body: flexUtils.createBox('vertical', [
            // 外層邊框盒
            flexUtils.createBox('vertical', [
                // 3x3 盤面容器 (Aspect Ratio 1:1)
                flexUtils.createBox('vertical', slotGrid, {
                    aspectRatio: '1:1',
                    width: '100%',
                    backgroundColor: '#000000'
                })
            ], {
                paddingAll: '12px',
                backgroundColor: '#222222',
                cornerRadius: 'lg',
                borderWidth: 'semi-bold',
                borderColor: THEME.BORDER
            })
        ], { paddingAll: 'lg' }),
        footer: flexUtils.createBox('vertical', [
            // 結果面板
            flexUtils.createBox('vertical', [
                flexUtils.createText({
                    text: winners.length > 0 ? 'WINNER!' : 'TRY AGAIN',
                    color: winners.length > 0 ? '#FFD700' : '#FFFFFF',
                    weight: 'bold',
                    size: 'lg',
                    align: 'center'
                }),
                flexUtils.createText({
                    text: winners.length > 0
                        ? `連線: ${[...new Set(winners.map(w => SYMBOL_NAMES[w.symbol] || w.symbol))].join(', ')}`
                        : '沒有任何連線，下次會更好！',
                    color: '#AAAAAA',
                    size: 'xs',
                    align: 'center',
                    margin: 'sm',
                    wrap: true
                })
            ], {
                backgroundColor: '#ffff0005',
                paddingAll: 'md',
                cornerRadius: 'md',
                borderWidth: 'light',
                borderColor: winners.length > 0 ? '#FFD70088' : '#333333',
                margin: 'none'
            }),
            // 底部操作鈕
            flexUtils.createButton({
                action: {
                    type: 'message',
                    label: 'SPIN AGAIN',
                    text: '🎰 拉霸'
                },
                style: 'primary',
                height: 'md',
                color: winners.length > 0 ? '#FFD700' : THEME.NEON_GLOW,
                margin: 'lg'
            })
        ], { paddingAll: 'lg', paddingTop: 'none' })
    });

    return bubble;
}

module.exports = {
    handleSlot
};
