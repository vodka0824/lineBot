/**
 * 天氣功能模組
 */
const axios = require('axios');
const { CWA_API_KEY, CWA_API_HOST } = require('../config/constants');
const lineUtils = require('../utils/line');

// 縣市名稱映射 (模糊比對用)
const CITY_MAP = {
    '台北': '臺北市', '臺北': '臺北市',
    '新北': '新北市',
    '桃園': '桃園市',
    '台中': '臺中市', '臺中': '臺中市',
    '台南': '臺南市', '臺南': '臺南市',
    '高雄': '高雄市',
    '基隆': '基隆市',
    '新竹市': '新竹市', '新竹縣': '新竹縣', '新竹': '新竹市', // 預設市
    '苗栗': '苗栗縣',
    '彰化': '彰化縣',
    '南投': '南投縣',
    '雲林': '雲林縣',
    '嘉義市': '嘉義市', '嘉義縣': '嘉義縣', '嘉義': '嘉義市', // 預設市
    '屏東': '屏東縣',
    '宜蘭': '宜蘭縣',
    '花蓮': '花蓮縣',
    '台東': '臺東縣', '臺東': '臺東縣',
    '澎湖': '澎湖縣',
    '金門': '金門縣',
    '連江': '連江縣', '馬祖': '連江縣'
};

// 簡單快取
let weatherCache = {
    data: null,
    lastUpdated: 0
};
const CACHE_TIME = 60 * 60 * 1000; // 1小時

// 取得 36 小時預報資料
async function getForecast36h(cityName) {
    if (!CWA_API_KEY) return '⚠️ 請先設定 CWA_API_KEY';

    // 1. 處理縣市名稱
    const targetCity = CITY_MAP[cityName] || cityName;

    try {
        // 2. 檢查快取
        const now = Date.now();
        let records = weatherCache.data;

        if (!records || (now - weatherCache.lastUpdated > CACHE_TIME)) {
            console.log('[Weather] Fetching new data from CWA API...');
            const url = `${CWA_API_HOST}/v1/rest/datastore/F-C0032-001?Authorization=${CWA_API_KEY}&format=JSON`;
            const res = await axios.get(url);
            if (res.data.success === 'true') {
                records = res.data.records.location;
                weatherCache.data = records;
                weatherCache.lastUpdated = now;
            } else {
                throw new Error('API Error');
            }
        }

        // 3. 搜尋指定縣市
        const locationData = records.find(L => L.locationName === targetCity);
        if (!locationData) return `❌ 找不到「${cityName}」的天氣資料，請輸入完整縣市名稱（如：台北市）。`;

        // 4. 解析氣象因子
        // Wx: 天氣現象, PoP: 降雨機率, MinT: 最低溫, CI: 舒適度, MaxT: 最高溫
        const weatherElements = locationData.weatherElement.reduce((acc, curr) => {
            acc[curr.elementName] = curr.time;
            return acc;
        }, {});

        return {
            city: targetCity,
            periods: weatherElements['Wx'].map((_, index) => {
                return {
                    startTime: weatherElements['Wx'][index].startTime,
                    endTime: weatherElements['Wx'][index].endTime,
                    wx: weatherElements['Wx'][index].parameter.parameterName, // 天氣現象
                    pop: weatherElements['PoP'][index].parameter.parameterName, // 降雨機率
                    minT: weatherElements['MinT'][index].parameter.parameterName, // 最低溫
                    maxT: weatherElements['MaxT'][index].parameter.parameterName, // 最高溫
                    ci: weatherElements['CI'][index].parameter.parameterName // 舒適度
                };
            })
        };

    } catch (e) {
        console.error('Weather API Error:', e.message);
        return '❌ 取得天氣資料失敗，請稍後再試。';
    }
}

// 產生 Flex Message
function buildWeatherFlex(data) {
    if (typeof data === 'string') return data; // 錯誤訊息直接回傳

    const rows = data.periods.map(p => {
        const start = new Date(p.startTime);
        const timeStr = `${start.getHours() === 12 ? '中午' : start.getHours() === 0 ? '午夜' : start.getHours() + '時'} - ${new Date(p.endTime).getHours()}時`;

        // 簡單圖示判斷
        let icon = '☁️';
        if (p.wx.includes('晴')) icon = '☀️';
        if (p.wx.includes('雨')) icon = '🌧️';

        return {
            type: "box", layout: "vertical", margin: "md",
            contents: [
                { type: "text", text: `${timeStr} (${icon})`, size: "sm", color: "#888888" },
                { type: "text", text: `${p.minT}°C - ${p.maxT}°C`, weight: "bold", size: "lg" },
                { type: "text", text: `${p.wx} (降雨 ${p.pop}%)`, size: "sm", color: "#555555" },
                { type: "text", text: `體感: ${p.ci}`, size: "xs", color: "#aaaaaa" }
            ]
        };
    });

    return {
        type: "bubble",
        header: { type: "box", layout: "vertical", contents: [{ type: "text", text: `🌦️ ${data.city}天氣預報`, weight: "bold", color: "#1E90FF", size: "xl" }] },
        body: { type: "box", layout: "vertical", contents: rows }
    };
}

// 處理文字指令
async function handleWeather(replyToken, message) {
    const cityName = message.replace(/^天氣\s*/, '').trim();
    if (!cityName) {
        await lineUtils.replyText(replyToken, '❌ 請輸入縣市名稱，例如：天氣 台北');
        return;
    }

    const result = await getForecast36h(cityName);
    if (typeof result === 'string') {
        await lineUtils.replyText(replyToken, result);
    } else {
        await lineUtils.replyFlex(replyToken, `${result.city}天氣`, buildWeatherFlex(result));
    }
}

module.exports = {
    handleWeather
};
