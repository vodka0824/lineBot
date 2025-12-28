/**
 * 股票查詢模組
 * 資料來源: Yahoo 股市
 */
const axios = require('axios');
const cheerio = require('cheerio');
const lineUtils = require('../utils/line');
const { handleError } = require('../utils/errorHandler');

/**
 * 搜尋股票代號
 * @param {string} query 搜尋關鍵字 (e.g. "台積電")
 */
async function searchStock(query) {
    try {
        // Yahoo Autocomplete API (需使用 ;query= 格式)
        const url = `https://tw.stock.yahoo.com/_td-stock/api/resource/AutocompleteService.suggest;query=${encodeURIComponent(query)}`;
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        if (data && data.ResultSet && data.ResultSet.Result && data.ResultSet.Result.length > 0) {
            // 優先回傳第一個結果的 symbol (e.g., "2330.TW")
            return data.ResultSet.Result[0].symbol;
        }
        return null;
    } catch (error) {
        console.error('[Stock] Search Error:', error.message);
        return null;
    }
}

/**
 * 爬取 Yahoo 股市資料
 * @param {string} symbol 股票代號或名稱 (e.g. "2330", "台積電")
 */
async function getStockInfo(symbol) {
    try {
        let code = symbol;

        // 1. 如果輸入不是純數字 (或是數字+TW)，則進行搜尋
        // Ex: "台積電" -> search -> "2330.TW"
        // Ex: "2330" -> 直接使用
        const isCode = /^\d+(\.[A-Z]+)?$/i.test(symbol);

        if (!isCode) {
            console.log(`[Stock] Searching for symbol: ${symbol}`);
            const foundCode = await searchStock(symbol);
            if (foundCode) {
                code = foundCode;
                console.log(`[Stock] Found code: ${code}`);
            } else {
                console.log(`[Stock] Symbol not found for query: ${symbol}`);
                return null;
            }
        }

        const url = `https://tw.stock.yahoo.com/quote/${encodeURIComponent(code)}`;
        console.log(`[Stock] Crawling URL: ${url}`);

        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);

        // 檢查是否為有效股票頁面
        const nameSelector = 'h1.C\\(\\$c-link-text\\)';
        const name = $(nameSelector).first().text().trim();

        if (!name) {
            console.log(`[Stock] Name not found for ${code}. Selectors might be broken or page layout changed.`);
            return null;
        }

        // 股票代號
        let id = $('.C\\(\\$c-icon\\).Fz\\(24px\\).Mend\\(20px\\)').first().text().trim();
        if (!id) id = code.split('.')[0];

        // 即時股價
        const price = $('.Fz\\(32px\\).Fw\\(b\\).Lh\\(1\\).Mend\\(16px\\)').first().text().trim();

        // 漲跌資訊區塊
        const priceInfoBlock = $('.D\\(f\\).Ai\\(fe\\).Mb\\(4px\\)');

        // 解析漲跌值
        const changeValueSpan = priceInfoBlock.find('.Fz\\(20px\\).Fw\\(b\\).Lh\\(1\\.2\\).Mend\\(4px\\)');
        const changeValue = changeValueSpan.text().trim();

        // 解析漲跌幅
        const changePercentSpan = priceInfoBlock.find('.Jc\\(fe\\).Fz\\(20px\\).Lh\\(1\\.2\\).Fw\\(b\\)');
        const changePercent = changePercentSpan.text().trim();

        // 判斷顏色
        let color = '#333333'; // 平盤/灰
        if (changeValueSpan.hasClass('C($c-trend-up)') || changePercentSpan.hasClass('C($c-trend-up)')) color = '#ff333a'; // 漲 (紅)
        if (changeValueSpan.hasClass('C($c-trend-down)') || changePercentSpan.hasClass('C($c-trend-down)')) color = '#00a84e'; // 跌 (綠)

        // 詳細資訊 (開盤/最高/最低/成交量)
        const details = {};
        $('li.price-detail-item').each((i, el) => {
            const spans = $(el).find('span');
            const label = spans.first().text().trim();
            const value = spans.last().text().trim();
            if (label === '開盤') details.open = value;
            else if (label === '最高') details.high = value;
            else if (label === '最低') details.low = value;
            else if (label === '總量' || label === '成交量') details.volume = value;
        });

        // 走勢圖 (Yahoo 現在 og:image 變成了 Logo，我們使用 legacy chart URL)
        const isOTC = code.toUpperCase().endsWith('.TWO');
        const marketPrefix = isOTC ? 'otc' : 'tse';
        const cleanId = code.split('.')[0];
        // 格式通常為 tse_2330.TW_day.png
        const chartUrl = `https://s.yimg.com/nb/tw_stock_frontend/chart/${cleanId}.TW/${marketPrefix}_${cleanId}.TW_day.png`;

        return {
            id,
            name,
            price,
            changeValue,
            changePercent,
            color,
            details,
            chartUrl,
            link: url
        };

    } catch (error) {
        console.error(`[Stock] Crawl Error for ${symbol}:`, error.message);
        return null;
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
            url: data.chartUrl,
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
                        { type: 'text', text: data.details.high || '-', size: 'xs', color: '#c0392b', align: 'end' },
                        { type: 'separator', margin: 'md' },
                        { type: 'text', text: '最低', size: 'xs', color: '#888888', margin: 'md' },
                        { type: 'text', text: data.details.low || '-', size: 'xs', color: '#27ae60', align: 'end' }
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
        console.log(`[Stock] Handling query: ${query}`);
        const data = await getStockInfo(query);

        if (!data) {
            console.log(`[Stock] No data found for query: ${query}`);
            await lineUtils.replyText(replyToken, `🔍 找不到股票 "${query}"，請確認代號或名稱是否正確。`);
            return;
        }

        const flex = buildStockFlex(data);
        await lineUtils.replyFlex(replyToken, `📈 ${data.name} 股價資訊`, flex);

    } catch (error) {
        console.error('[Stock] Handler Fatal Error:', error);
        await handleError(error, { replyText: (t) => lineUtils.replyText(replyToken, t) });
    }
}

module.exports = {
    handleStockQuery
};
