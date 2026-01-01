const flexUtils = require('./utils/flex');
const { COLORS } = flexUtils;

const keyword = "抽我";
const prize = "耳機";
const minutes = 1;
const winners = 1;

const bubble = flexUtils.createBubble({
    size: 'kilo',
    header: flexUtils.createHeader('🎉 抽獎活動開始！', '', COLORS.PRIMARY),
    body: flexUtils.createBox('vertical', [
        flexUtils.createText({ text: `🎁 獎品：${prize}`, size: 'xl', weight: 'bold', color: COLORS.DARK_GRAY, wrap: true }),
        flexUtils.createSeparator('md'),
        flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `🔑 關鍵字：${keyword}`, size: 'md', color: COLORS.PRIMARY, weight: 'bold' }),
            flexUtils.createText({ text: `⏱️ 時間：${minutes} 分鐘`, size: 'sm', color: COLORS.GRAY }),
            flexUtils.createText({ text: `🏆 名額：${winners} 人`, size: 'sm', color: COLORS.GRAY })
        ], { margin: 'md', spacing: 'sm' }),
        flexUtils.createSeparator('md'),
        flexUtils.createText({ text: '點擊下方按鈕或輸入關鍵字參加！', size: 'xs', color: COLORS.GRAY, margin: 'md', align: 'center' })
    ], { paddingAll: '20px' }),
    footer: flexUtils.createBox('vertical', [
        flexUtils.createButton({
            action: {
                type: 'message',
                label: '立即參加 🙋',
                text: keyword
            },
            style: 'primary',
            color: COLORS.PRIMARY
        })
    ])
});

console.log(JSON.stringify(bubble, null, 2));
