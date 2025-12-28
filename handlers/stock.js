/**
 * 股票查詢模組
 * 資料來源: Yahoo 股市
 */
const axios = require('axios');
const cheerio = require('cheerio');
const lineUtils = require('../utils/line');
const { handleError } = require('../utils/errorHandler');

/**
 * 爬取 Yahoo 股市資料
 * @param {string} symbol 股票代號或名稱 (e.g. "2330", "台積電")
 */
async function getStockInfo(symbol) {
    try {
        // 1. 簡易判斷：若是中文，先搜尋代號 (這裡先簡化，假設用戶輸入代號，或是依靠 Yahoo 搜尋)
        // Yahoo 搜尋頁面: https://tw.stock.yahoo.com/quote/{symbol}
        // 如果輸入名稱，Yahoo 通常會轉址或顯示搜尋結果，這裡直接嘗試 accessing quote page

        const url = `https://tw.stock.yahoo.com/quote/${encodeURIComponent(symbol)}`;
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);

        // 檢查是否為有效股票頁面 (透過檢查名稱是否存在)
        const name = $('h1.C\\(\\$c-link-text\\)').first().text().trim();
        if (!name) return null;

        // 股票代號
        const id = $('.Fz\\(24px\\).Bd\\(0\\).Mend\\(4px\\)').first().text().trim() || symbol;

        // 即時股價
        const price = $('.Fz\\(32px\\).Fw\\(b\\).Lh\\(1\\)').first().text().trim();

        // 漲跌 (含有三角形符號) & 幅度
        // 漲跌: D(f) Ai(c) Fz(20px) Lh(1.2) Mend(4px) D(if) Mend(4px)
        // 類別比較動態，通常看顏色: C($c-trend-up) 紅, C($c-trend-down) 綠
        const changeContainer = $('.D\\(f\\).Ai\\(c\\).Fz\\(20px\\).Lh\\(1\\.2\\).Mend\\(4px\\).D\\(if\\).Mend\\(4px\\)').parent();
        const changeText = changeContainer.text().replace(price, '').trim(); // 股價和漲跌在同個區塊，需扣除

        // 使用更精確的選擇器抓取漲跌
        // 漲跌值
        const changeValue = changeContainer.find('span').first().text().trim();
        // 漲跌幅
        const changePercent = changeContainer.find('span').last().text().trim(); // 括號內的 %

        // 判斷漲跌顏色
        let color = '#333333'; // 平盤/灰
        if (changeContainer.find('.C\\(\\$c-trend-up\\)').length > 0) color = '#ff333a'; // 漲 (紅)
        if (changeContainer.find('.C\\(\\$c-trend-down\\)').length > 0) color = '#00a84e'; // 跌 (綠)

        // 開盤、最高、最低、成交量
        // 這些通常在列表項目中
        const details = {};
        $('li.price-detail-item').each((i, el) => {
            const label = $(el).find('.label').text().trim();
            const value = $(el).find('.value').text().trim();
            if (label === '開盤') details.open = value;
            if (label === '最高') details.high = value;
            if (label === '最低') details.low = value;
            if (label === '成交量') details.volume = value; // 單位: 張
        });

        // 走勢圖 (Yahoo 提供固定格式的圖片 URL)
        // 格式: https://s.yimg.com/nb/tw_stock_frontend/chart/2330.TW/tse_2330.TW_day.png?t={timestamp}
        // 需要知道是 TSE (上市) 還是 OTC (上櫃)。Yahoo 網址通常有顯示，或者試誤。
        // 但最簡單的是直接抓 meta tag 或頁面中的 img src
        // 觀察 Yahoo 頁面，走勢圖可能是 Canvas 畫的，沒有直接 img。
        // 但 Yahoo 舊版 API 圖片仍可用: https://s.yimg.com/nb/tw_stock_frontend/chart/2330.TW/tse_2330.TW_day.png
        // 為了準確，我們通常需要知道市場別 (.TW 或 .TWO)。
        // 這裡做一個簡單判定：如果代號是數值，預設嘗試 .TW (上市)，若找不到圖可能就顯示不出來。

        // 嘗試從網頁內容判斷市場
        const market = name.includes('上櫃') ? 'TWO' : 'TW';
        // 註: Yahoo 標題不會直接寫上櫃，通常要看其他標籤。這裡簡化，直接用 id 判斷?
        // 其實 Yahoo 的 chart url 比較複雜。
        // 替代方案：使用文字呈現或尋找 meta image (og:image)
        const metaImage = $('meta[property="og:image"]').attr('content');

        return {
            id,
            name,
            price,
            changeValue,
            changePercent,
            color,
            details,
            chartUrl: metaImage, // Yahoo 的 og:image 通常是當日走勢縮圖
            link: url
        };

    } catch (error) {
        console.error('[Stock] Crawl Error:', error.message);
        return null; // 查無資料或錯誤
    }
}

/**
 * 建構股票 Flex Message
 */
function buildStockFlex(data) {
    return {
        type: 'bubble',
        size: 'kilo',
        header: {
            type: 'box',
            layout: 'vertical',
            contents: [
                {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                        { type: 'text', text: data.name, weight: 'bold', size: 'xl', color: '#333333', flex: 1 },
                        { type: 'text', text: data.id, weight: 'bold', size: 'md', color: '#888888', align: 'end' }
                    ]
                },
                {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                        { type: 'text', text: data.price, size: '3xl', weight: 'bold', color: data.color },
                        {
                            type: 'box',
                            layout: 'vertical',
                            contents: [
                                { type: 'text', text: data.changeValue, size: 'sm', color: data.color, align: 'end' },
                                { type: 'text', text: data.changePercent, size: 'xs', color: data.color, align: 'end' }
                            ],
                            flex: 0,
                            margin: 'md',
                            justifyContent: 'center'
                        }
                    ],
                    margin: 'md',
                    alignItems: 'center'
                }
            ],
            paddingAll: '20px',
            backgroundColor: '#FFFFFF'
        },
        hero: data.chartUrl ? {
            type: 'image',
            url: data.chartUrl, // Yahoo og:image
            size: 'full',
            aspectRatio: '20:13',
            aspectMode: 'cover',
            action: { type: 'uri', uri: data.link }
        } : undefined,
        body: {
            type: 'box',
            layout: 'vertical',
            contents: [
                {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                        { type: 'text', text: '開盤', size: 'xs', color: '#888888' },
                        { type: 'text', text: data.details.open || '-', size: 'xs', color: '#333333', align: 'end' },
                        { type: 'separator', margin: 'md' },
                        { type: 'text', text: '成交量', size: 'xs', color: '#888888', margin: 'md' },
                        { type: 'text', text: data.details.volume || '-', size: 'xs', color: '#333333', align: 'end' }
                    ],
                    margin: 'sm'
                },
                {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                        { type: 'text', text: '最高', size: 'xs', color: '#888888' },
                        { type: 'text', text: data.details.high || '-', size: 'xs', color: '#c0392b', align: 'end' }, // 紅
                        { type: 'separator', margin: 'md' },
                        { type: 'text', text: '最低', size: 'xs', color: '#888888', margin: 'md' },
                        { type: 'text', text: data.details.low || '-', size: 'xs', color: '#27ae60', align: 'end' } // 綠
                    ],
                    margin: 'sm'
                }
            ],
            paddingAll: '15px',
            backgroundColor: '#F7F9FA'
        },
        footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
                {
                    type: 'button',
                    action: { type: 'uri', label: '查看 Yahoo 詳細', uri: data.link },
                    style: 'link',
                    height: 'sm'
                }
            ],
            paddingAll: '10px'
        }
    };
}

/**
 * 處理股票查詢指令
 */
async function handleStockQuery(replyToken, query) {
    try {
        const data = await getStockInfo(query);
        if (!data) {
            await lineUtils.replyText(replyToken, `🔍 找不到股票 "${query}"，請確認代號或名稱是否正確。`);
            return;
        }

        const flex = buildStockFlex(data);
        await lineUtils.replyFlex(replyToken, `📈 ${data.name} 股價資訊`, flex);

    } catch (error) {
        await handleError(error, { replyText: (t) => lineUtils.replyText(replyToken, t) });
    }
}

module.exports = {
    handleStockQuery
};
