/**
 * 最簡化的歡迎卡片測試版本
 * 用於診斷 400 錯誤
 */
const flexUtils = require('../utils/flex');
const lineUtils = require('../utils/line');

async function sendSimpleTestWelcome(replyToken) {
    try {
        // 最簡單的 Bubble，移除所有可能有問題的元素
        const bubble = {
            type: 'bubble',
            size: 'mega',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'text',
                        text: '🌟 WELCOME',
                        weight: 'bold',
                        size: 'xl',
                        color: '#1E90FF',
                        align: 'center'
                    }
                ]
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'text',
                        text: 'Hi, 測試用戶',
                        weight: 'bold',
                        size: 'lg',
                        wrap: true
                    },
                    {
                        type: 'separator',
                        margin: 'md'
                    },
                    {
                        type: 'text',
                        text: '歡迎加入我們！請先查看記事本的版規喔～',
                        wrap: true,
                        size: 'sm',
                        color: '#555555',
                        margin: 'md'
                    }
                ],
                paddingAll: '20px'
            }
        };

        console.log('[SimpleTest] Sending simple welcome bubble...');
        console.log('[SimpleTest] Bubble JSON:', JSON.stringify(bubble, null, 2));

        await lineUtils.replyFlex(replyToken, '簡易測試歡迎卡', bubble);
        console.log('[SimpleTest] Simple welcome sent successfully');
    } catch (error) {
        console.error('[SimpleTest] Error:', error.message);
        console.error('[SimpleTest] Stack:', error.stack);
        await lineUtils.replyText(replyToken, `❌ 簡易測試失敗：${error.message}`);
    }
}

module.exports = {
    sendSimpleTestWelcome
};
