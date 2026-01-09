/**
 * JavDB Handler - 番號查詢封面
 * 
 * ⚠️ 警告: 此功能涉及成人內容，僅供測試
 * 
 * 整合到 LINE Bot:
 * 指令: 查封面 SSIS-001
 * 
 * 刪除方式:
 * 1. 刪除此檔案 (handlers/javdb.js)
 * 2. 從 routes.js 移除相關路由
 * 3. 刪除 tests/javdb/ 資料夾
 */

const { searchByCode } = require('../tests/javdb/javdb-api');
const lineUtils = require('../utils/line');

/**
 * 處理 JavDB 查詢請求
 * @param {string} replyToken - LINE reply token
 * @param {string} code - 番號
 */
async function handleJavdbQuery(replyToken, code) {
    try {
        console.log(`[JavDB] 查詢番號: ${code}`);

        // 查詢番號
        const result = await searchByCode(code);

        if (result.success) {
            // 成功：回傳封面圖片
            const { code: resultCode, title, coverUrl, detailUrl } = result.data;

            // 使用優化的 Flex Message 呈現結果
            const flexMessage = {
                type: 'bubble',
                size: 'mega',
                hero: {
                    type: 'image',
                    url: coverUrl,
                    size: 'full',
                    aspectRatio: '2:3', // 改為 2:3 避免裁切（接近 AV 封面比例）
                    aspectMode: 'cover'
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        {
                            type: 'text',
                            text: resultCode,
                            weight: 'bold',
                            size: 'xl',
                            color: '#FF6B6B',
                            wrap: true
                        },
                        {
                            type: 'box',
                            layout: 'vertical',
                            margin: 'lg',
                            spacing: 'sm',
                            contents: [
                                {
                                    type: 'box',
                                    layout: 'baseline',
                                    spacing: 'sm',
                                    contents: [
                                        {
                                            type: 'text',
                                            text: '標題',
                                            color: '#AAAAAA',
                                            size: 'sm',
                                            flex: 0,
                                            wrap: true
                                        },
                                        {
                                            type: 'text',
                                            text: title || '無標題資訊',
                                            wrap: true,
                                            color: '#666666',
                                            size: 'sm',
                                            flex: 5
                                        }
                                    ]
                                },
                                {
                                    type: 'box',
                                    layout: 'baseline',
                                    spacing: 'sm',
                                    contents: [
                                        {
                                            type: 'text',
                                            text: '來源',
                                            color: '#AAAAAA',
                                            size: 'sm',
                                            flex: 0
                                        },
                                        {
                                            type: 'text',
                                            text: 'JavDB',
                                            wrap: true,
                                            color: '#666666',
                                            size: 'sm',
                                            flex: 5
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            };

            await lineUtils.replyFlex(replyToken, `${code} 封面資訊`, flexMessage);
            console.log(`[JavDB] 成功回傳: ${code}`);

        } else {
            // 失敗：回傳錯誤訊息
            await lineUtils.replyText(replyToken, `❌ ${result.error}`);
            console.log(`[JavDB] 查詢失敗: ${result.error}`);
        }

    } catch (error) {
        console.error('[JavDB] 錯誤:', error);
        await lineUtils.replyText(replyToken, '❌ 查詢失敗，請稍後再試');
    }
}

module.exports = {
    handleJavdbQuery
};
