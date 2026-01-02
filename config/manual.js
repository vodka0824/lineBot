/**
 * System Manual and Help Configuration
 * Externalized text content to keep handlers clean.
 */

// 1. Full Text Manual (replied to "系統手冊")
const SYSTEM_MANUAL_TEXT = `📖 LINE Bot 系統指令手冊

【一般指令】
• 油價, 電影, 科技新聞, 蘋果新聞, PTT熱門
• [星座] (今日/本週/本月) (例如: 獅子, 牡羊 本週)
• 匯率 100 JPY, 美金 100, 買日幣 1000
• 分唄/銀角/刷卡 [金額]

【待辦 (需開通)】
• 待辦, 待辦 [事項], 待辦 !高 [事項]
• 完成/刪除 [編號], 抽

【餐廳 (需開通)】
• 吃什麼 [縣市], 吃什麼 附近
• 餐廳清單 (分縣市), 刪除餐廳 [名]
• 新增餐廳 [縣市] [名]

【天氣 (需開通)】
• 天氣/空氣 [地區]
• 查詢黑貓 [單號] (需開通)

【娛樂 (需授權)】
• 幫我選 [A] [B]
• 剪刀/石頭/布, 抽獎 [Key] [品] [人]
• 講台語 [字] (限Super/Auth)
• 狂標 @User [次數]
• 圖片指令:
  - 抽圖 (黑絲/白絲/奶子/美尻/絕對領域)
  - 番號推薦 (或 今晚看什麼)

【管理員】
• 註冊 [碼] (群組開通)
• 開啟/關閉 [功能] (例: 開啟 天氣)
• 設定歡迎詞/圖, 測試歡迎
• [小黑屋]/[放出來] @User
• 黑名單列表
• 產生註冊碼 (Super Only)`;

// 2. Help Flex Menu Configuration
// Defines the structure of the Help Menu Bubbles
const HELP_MENU_CONFIG = {
    life: {
        title: '🛠️ 生活小幫手',
        color: '#00B900',
        sections: [
            {
                title: '生活資訊',
                color: '#1DB446',
                items: [
                    '• 油價、電影',
                    '• 蘋果新聞、科技新聞',
                    '• 熱門廢文、PTT熱門',
                    '• [星座] (今日/本週/本月)'
                ]
            },
            {
                title: '💱 匯率與金融',
                color: '#1DB446',
                items: [
                    '• 即時匯率, [幣別] [金额]',
                    '• 買 [幣別] [金額] (試算)'
                ]
            }
        ],
        extraFeatures: {
            weather: {
                title: '🌤️ 天氣與空氣',
                color: '#33AAFF',
                items: ['• 天氣 [地區] (氣象+空氣)', '• 空氣 [地區] (詳細監測)']
            },
            restaurant: {
                title: '🍽️ 美食搜尋',
                color: '#FF8800',
                items: [
                    '• 吃什麼 [縣市] (隨機推薦)',
                    '• 附近餐廳 (需分享位置)',
                    '• 餐廳清單 (依縣市分類)',
                    '• 新增/刪除餐廳'
                ]
            },
            delivery: {
                title: '🚚 物流服務',
                color: '#55AAFF',
                items: ['• 黑貓 [單號]']
            }
        }
    },
    entertainment: {
        title: '🎮 娛樂 & 互動',
        color: '#FF334B',
        sections: [
            {
                title: '🗣️ 語音與互動',
                color: '#FF334B',
                items: [
                    '• 講台語 [詞彙] (台語發音)',
                    '• 狂標 @User [次數]',
                    '• 幫我選 [A] [B]...'
                ]
            },
            {
                title: '🎲 趣味功能',
                color: '#FF334B',
                items: [
                    '• 剪刀/石頭/布',
                    '• 抽圖 (黑絲/白絲/奶子/美尻/絕對領域)',
                    '• 番號推薦 (今晚看什麼)'
                ]
            },
            {
                title: '🏆 群組排行榜',
                color: '#FFBB00',
                items: [
                    '• 排行榜 (檢視群組排名)',
                    '• 我的排名 (檢視個人數據)'
                ]
            }
        ]
    },
    admin: {
        title: '🛡️ 管理員專區',
        color: '#333333',
        sections: [
            {
                title: '⚙️ 群組管理',
                color: '#666666',
                items: [
                    '• 註冊 [代碼] (啟用群組)',
                    '• 開啟/關閉 [功能]',
                    '• 設定歡迎詞/圖, 測試歡迎'
                ]
            },
            {
                title: '📝 待辦事項',
                color: '#AA33FF',
                items: [
                    '• 待辦, 新增 [事項]',
                    '• 完成/刪除 [編號], 清空'
                ]
            },
            {
                title: '💳 分期與支付',
                color: '#FF55AA',
                items: [
                    '• 分唄/銀角/刷卡 [金額]'
                ]
            },
            {
                title: '🚫 黑名單管理',
                color: '#333333',
                items: [
                    '• [小黑屋]/[放出來] @User',
                    '• 黑名單列表'
                ]
            }
        ]
    }
};

module.exports = {
    SYSTEM_MANUAL_TEXT,
    HELP_MENU_CONFIG
};
