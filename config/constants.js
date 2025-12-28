/**
 * LINE Bot 常數設定
 */

// === 環境變數 ===
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_KEY;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
// CWA 中央氣象署 API (需申請: https://opendata.cwa.gov.tw/user/authkey)
const CWA_API_KEY = process.env.CWA_API_KEY || '';
const CWA_API_HOST = 'https://opendata.cwa.gov.tw/api';

// === 爬蟲來源網址 ===
const CRAWLER_URLS = {
    OIL_PRICE: 'https://gas.goodlife.tw/',
    NEW_MOVIE: 'https://www.atmovies.com.tw/movie/new/',
    APPLE_NEWS: 'https://tw.nextapple.com/',
    TECH_NEWS: 'https://technews.tw/',
    PTT_HOT: 'https://disp.cc/b/PttHot',
    JAV_RECOMMEND: 'https://limbopro.com/tools/jwksm/ori.json'
};

// === 圖片資料夾對應 ===
const KEYWORD_MAP = {
    '奶子': '1LMsRVf6GVQOx2IRavpMRQFhMv6oC2fnv',
    '美尻': '1kM3evcph4-RVKFkBi0_MnaFyADexFkl8',
    '絕對領域': '1o5BLLto3eyZCQ3SypjU5tSYydWIzrsFx'
};

// === 快取時間設定 ===
const CACHE_DURATION = {
    DRIVE: 60 * 60 * 1000,        // 1 小時
    GROUP: 5 * 60 * 1000,         // 5 分鐘
    ADMIN: 5 * 60 * 1000,         // 5 分鐘
    TODO: 5 * 60 * 1000,          // 5 分鐘
    RESTAURANT: 5 * 60 * 1000,    // 5 分鐘
    JAV: 60 * 60 * 1000           // 1 小時
};

module.exports = {
    CHANNEL_ACCESS_TOKEN,
    GEMINI_API_KEY,
    ADMIN_USER_ID,
    GOOGLE_PLACES_API_KEY,
    CWA_API_KEY,
    CWA_API_HOST,
    CRAWLER_URLS,
    KEYWORD_MAP,
    CACHE_DURATION
};
