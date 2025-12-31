/**
 * 天氣功能模組
 */
const axios = require('axios');
const { CWA_API_KEY, CWA_API_HOST } = require('../config/constants');
const lineUtils = require('../utils/line');
const aqiUtils = require('../utils/aqi');
const flexUtils = require('../utils/flex');
const { COLORS } = flexUtils;

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
                records = null; // API Fail check
            }
        }

        if (!records) throw new Error('CWA API No Records');


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

// 產生 Flex Message (含 AQI)
function buildWeatherFlex(data, aqiSummary) {
    if (typeof data === 'string') return data;

    const rows = data.periods.map(p => {
        const start = new Date(p.startTime);
        const timeStr = `${start.getHours() === 12 ? '中午' : start.getHours() === 0 ? '午夜' : start.getHours() + '時'} - ${new Date(p.endTime).getHours()}時`;

        let icon = '☁️';
        if (p.wx.includes('晴')) icon = '☀️';
        if (p.wx.includes('雨')) icon = '🌧️';

        return flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `${timeStr} (${icon})`, size: 'sm', color: COLORS.GRAY }),
            flexUtils.createText({ text: `${p.minT}°C - ${p.maxT}°C`, weight: 'bold', size: 'lg', color: COLORS.DARK_GRAY }),
            flexUtils.createText({ text: `${p.wx} (降雨 ${p.pop}%)`, size: 'sm', color: COLORS.DARK_GRAY }),
            flexUtils.createText({ text: `體感: ${p.ci}`, size: 'xs', color: COLORS.GRAY })
        ], { margin: 'md' });
    });

    const bodyContents = [...rows];

    // AQI Info Block
    if (aqiSummary) {
        const aqiVal = parseInt(aqiSummary.aqi);
        let color = COLORS.SUCCESS;
        let status = '良好';

        if (aqiVal > 50) { color = COLORS.WARNING; status = '普通'; }
        if (aqiVal > 100) { color = '#FF9933'; status = '不佳'; } // Orange
        if (aqiVal > 150) { color = COLORS.DANGER; status = '不良'; }

        bodyContents.push(flexUtils.createSeparator('md'));
        bodyContents.push(flexUtils.createBox('horizontal', [
            flexUtils.createText({ text: '🏭 空氣品質', size: 'sm', color: COLORS.GRAY, flex: 3 }),
            flexUtils.createText({ text: `${status} (AQI ${aqiVal})`, size: 'sm', weight: 'bold', color: color, flex: 5, align: 'end' })
        ], { margin: 'md' }));
        bodyContents.push(flexUtils.createText({ text: `(參考測站: ${aqiSummary.sitename})`, size: 'xxs', color: COLORS.GRAY, align: 'end', margin: 'xs' }));
    }

    const header = flexUtils.createHeader(`🌦️ ${data.city}天氣預報`, '', COLORS.PRIMARY);

    return flexUtils.createBubble({
        header,
        body: flexUtils.createBox('vertical', bodyContents)
    });
}

// 處理天氣文字指令
async function handleWeather(replyToken, message) {
    const cityName = message.replace(/^天氣\s*/, '').trim();
    if (!cityName) {
        await lineUtils.replyText(replyToken, '❌ 請輸入縣市名稱，例如：天氣 台北');
        return;
    }

    const targetCity = CITY_MAP[cityName] || cityName;

    // Parallel Fetch
    const [weatherResult, aqiSummary] = await Promise.all([
        getForecast36h(cityName),
        aqiUtils.getCityAQISummary(targetCity)
    ]);

    if (typeof weatherResult === 'string') {
        await lineUtils.replyText(replyToken, weatherResult);
    } else {
        await lineUtils.replyFlex(replyToken, `${weatherResult.city}天氣`, buildWeatherFlex(weatherResult, aqiSummary));
    }
}

// 處理空氣品質指令 (詳細版)
async function handleAirQuality(replyToken, message) {
    const cityName = message.replace(/^空氣\s*/, '').trim();
    if (!cityName) {
        await lineUtils.replyText(replyToken, '❌ 請輸入縣市名稱，例如：空氣 台中');
        return;
    }

    const targetCity = CITY_MAP[cityName] || cityName;
    const aqiRecords = await aqiUtils.getCityDetails(targetCity);

    if (aqiRecords.length === 0) {
        await lineUtils.replyText(replyToken, `❌ 找不到「${targetCity}」的空氣品質資料。`);
        return;
    }

    const bubbles = [];

    // Header Color based on Avg AQI? Or simple Gray.
    // Let's create one Bubble listing all stations.
    // If too many stations (e.g. Kaohsiung has many), maybe split?
    // Flex Message limitation: Bubble size. Max 10-12 items usually safe.
    // Taiwan counties max stations ~12-15. Might need to scroll or split.
    // Let's use simple vertical box.

    const stationRows = aqiRecords.map(r => {
        const val = parseInt(r.aqi);
        let color = '#00B900'; // Green
        let status = '良好';
        if (val > 50) { color = '#CCCC00'; status = '普通'; } // Darker Yellow for text
        if (val > 100) { color = '#FF9933'; status = '對敏感族群不健康'; }
        if (val > 150) { color = '#FF334B'; status = '對所有族群不健康'; }

        return {
            type: "box", layout: "horizontal", margin: "sm",
            contents: [
                { type: "text", text: r.sitename, size: "sm", color: "#333333", flex: 3 },
                { type: "text", text: `AQI ${val}`, size: "sm", weight: "bold", color: color, flex: 3, align: "end" },
                { type: "text", text: `PM2.5: ${r["pm2.5"]}`, size: "xs", color: "#888888", flex: 3, align: "end" }
            ]
        }
    });

    const flex = {
        type: "bubble",
        size: "giga",
        header: {
            type: "box", layout: "vertical",
            contents: [{ type: "text", text: `💨 ${targetCity}空氣品質`, weight: "bold", color: "#FFFFFF", size: "xl" }],
            backgroundColor: "#666666"
        },
        body: {
            type: "box", layout: "vertical",
            contents: [
                {
                    type: "box", layout: "horizontal",
                    contents: [
                        { type: "text", text: "測站", size: "xs", color: "#AAAAAA", flex: 3 },
                        { type: "text", text: "指標", size: "xs", color: "#AAAAAA", flex: 3, align: "end" },
                        { type: "text", text: "細懸浮微粒", size: "xs", color: "#AAAAAA", flex: 3, align: "end" }
                    ],
                    margin: "md"
                },
                { type: "separator", margin: "sm" },
                ...stationRows
            ]
        },
        footer: {
            type: "box", layout: "vertical",
            contents: [{ type: "text", text: `資料來源：環境部 (更新時間: ${aqiRecords[0].publishtime})`, size: "xxs", color: "#CCCCCC", align: "center" }]
        }
    };

    await lineUtils.replyFlex(replyToken, `${targetCity}空氣品質`, flex);
}

module.exports = {
    handleWeather,
    handleAirQuality
};
