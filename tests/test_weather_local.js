
// Mock 環境變數
process.env.CWA_API_KEY = 'CWA-6F609FA1-AE0E-4345-B2AA-8F82E4725E9B';

const weather = require('./handlers/weather');
const line = require('./utils/line');
const { CWA_API_KEY } = require('./config/constants');

// Mock replyText/replyFlex
line.replyText = async (token, text) => {
    console.log(`\n[ReplyText] Token: ${token}\n${text}`);
};
line.replyFlex = async (token, alt, content) => {
    console.log(`\n[ReplyFlex] Token: ${token}, Alt: ${alt}`);
    console.log(JSON.stringify(content, null, 2));
};

async function test() {
    console.log('=== 天氣功能測試 (Local Mock) ===');
    console.log('API Key:', process.env.CWA_API_KEY ? (process.env.CWA_API_KEY.substring(0, 5) + '...') : '未設定');

    // 測試 1: 正常查詢
    console.log('\n[Case 1] 查詢台北');
    await weather.handleWeather('token1', '天氣 台北');

    // 測試 2: 模糊搜尋
    console.log('\n[Case 2] 查詢台南 (模糊)');
    await weather.handleWeather('token2', '天氣 台南');

    // 測試 3: 錯誤名稱
    console.log('\n[Case 3] 查詢不存在地點');
    await weather.handleWeather('token3', '天氣 美國');
}

test();
