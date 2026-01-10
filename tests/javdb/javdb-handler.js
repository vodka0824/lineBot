/**
 * JavDB LINE Bot Handler
 * 
 * 警告: 此功能涉及成人內容，僅供測試
 * 
 * 整合到 LINE Bot:
 * 指令: 查封面 SSIS-001
 */

const { searchByCode } = require('../../tests/javdb/javdb-api');
const lineUtils = require('../utils/line');

/**
 * 處理 JavDB 查詢請求
 * @param {string} replyToken - LINE reply token
 * @param {string} code - 番號
 * @param {object} context - 請求上下文（包含 userId）
 */
async function handleJavdbQuery(replyToken, code, context) {
    const userId = context?.source?.userId;

    // 顯示載入動畫（JavDB 爬取需要時間）
    if (userId) {
        await lineUtils.showLoadingAnimation(userId, 10);
    }

    try {
        // 顯示處理中訊息（可選）
        console.log(`[JavDB Handler] 查詢番號: ${code}`);

        // 查詢番號
        const result = await searchByCode(code);

        if (result.success) {
            // 成功：回傳封面圖片
            const { title, coverUrl, detailUrl } = result.data;

            // 使用 Flex Message 呈現結果
            const flexMessage = {
                type: 'bubble',
                hero: {
                    type: 'image',
                    url: coverUrl,
                    size: 'full',
                    aspectRatio: '3:4',
                    aspectMode: 'cover',
                    action: {
                        type: 'uri',
                        uri: detailUrl || 'https://javdb.com'
                    }
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        {
                            type: 'text',
                            text: code,
                            weight: 'bold',
                            size: 'xl',
                            color: '#FF6B6B'
                        },
                        {
                            type: 'text',
                            text: title,
                            size: 'sm',
                            color: '#666666',
                            wrap: true,
                            margin: 'md'
                        }
                    ]
                },
                footer: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        {
                            type: 'button',
                            action: {
                                type: 'uri',
                                label: '查看詳情',
                                uri: detailUrl || 'https://javdb.com'
                            },
                            style: 'primary',
                            color: '#FF6B6B'
                        }
                    ]
                }
            };

            await lineUtils.replyFlex(replyToken, `${code} 封面資訊`, flexMessage);

        } else {
            // 失敗：回傳錯誤訊息
            await lineUtils.replyText(replyToken, `❌ ${result.error}`);
        }

    } catch (error) {
        console.error('[JavDB Handler] 錯誤:', error);
        await lineUtils.replyText(replyToken, '❌ 查詢失敗，請稍後再試');
    }
}

module.exports = {
    handleJavdbQuery
};
