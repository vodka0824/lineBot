/**
 * 股票查詢模組
 * 資料來源: Yahoo 股市
 */
const axios = require('axios');
const cheerio = require('cheerio');
const lineUtils = require('../utils/line');
const { handleError } = require('../utils/errorHandler');
const { execFile } = require('child_process');
const path = require('path');

// Python command - detection logic or default
const PYTHON_CMD = process.platform === 'win32' ? 'py' : 'python3';

/**
 * 呼叫 Python 腳本進行股票分析
 */
function analyzeStock(code) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, 'stock_analysis.py');
        execFile(PYTHON_CMD, [scriptPath, code], (error, stdout, stderr) => {
            if (error) {
                console.error(`[Stock Analysis] Error: ${error.message}`);
                reject(error);
                return;
            }
            if (stderr) {
                console.warn(`[Stock Analysis] Stderr: ${stderr}`);
            }
            try {
                // Stdout might contain extra lines if deps warn, find last line
                const lines = stdout.trim().split('\n');
                const lastLine = lines[lines.length - 1];
                const result = JSON.parse(lastLine);
                resolve(result);
            } catch (e) {
                console.error(`[Stock Analysis] Parse Error: ${e.message}, Output: ${stdout}`);
                reject(e);
            }
        });
    });
}

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

        // 詳細資訊 (抓取所有 li.price-detail-item)
        const details = {};
        $('li.price-detail-item').each((i, el) => {
            const spans = $(el).find('span');
            const label = spans.first().text().trim();
            const value = spans.last().text().trim();
            if (label === '開盤') details.open = value;
            else if (label === '最高') details.high = value;
            else if (label === '最低') details.low = value;
            else if (label === '總量' || label === '成交量') details.volume = value;
            else if (label === '昨收') details.prevClose = value;
            else if (label === '漲停') details.limitUp = value;
            else if (label === '跌停') details.limitDown = value;
            else if (label === '本益比') details.peRatio = value;
            else if (label === '殖利率') details.yield = value;
            else if (label === '每股盈餘') details.eps = value;
        });

        // 52週高低通常在一個特殊的區塊，或是 hidden 在某處，我們嘗試直接抓取標籤
        // Yahoo 頁面上通常有 52週最高 與 52週最低
        $('li.price-detail-item').each((i, el) => {
            const label = $(el).find('span').first().text().trim();
            const value = $(el).find('span').last().text().trim();
            if (label.includes('52週最高')) details.yearHigh = value;
            if (label.includes('52週最低')) details.yearLow = value;
        });

        // 走勢圖 fallback
        const isOTC = code.toUpperCase().endsWith('.TWO');
        const marketPrefix = isOTC ? 'otc' : 'tse';
        const cleanId = code.split('.')[0];
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
 * 建立資料列
 */
function buildDataRow(label1, value1, label2, value2, color1 = '#333333', color2 = '#333333') {
    return {
        type: 'box',
        layout: 'horizontal',
        margin: 'sm',
        contents: [
            { type: 'text', text: label1, size: 'xs', color: '#888888', flex: 2 },
            { type: 'text', text: value1 || '-', size: 'xs', color: color1, align: 'end', flex: 3 },
            { type: 'separator', margin: 'md' },
            { type: 'text', text: label2, size: 'xs', color: '#888888', margin: 'md', flex: 2 },
            { type: 'text', text: value2 || '-', size: 'xs', color: color2, align: 'end', flex: 3 }
        ]
    };
}

/**
 * 建構股票 Flex Message
 */
function buildStockFlex(data) {
    const { details } = data;

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
                // 第一組：開盤 / 成交量
                buildDataRow('開盤', details.open, '成交量', details.volume),
                // 第二組：昨日最高 / 最低
                buildDataRow('最高', details.high, '最低', details.low, '#c0392b', '#00a84e'),
                // 第三組：昨收 / 漲停 (或跌停)
                buildDataRow('昨收', details.prevClose, '漲跌停', `${details.limitUp}/${details.limitDown}`),

                { type: 'separator', margin: 'md' },

                // 第四組：本益比 / 殖利率
                buildDataRow('本益比', details.peRatio, '殖利率', details.yield),
                // 第五組：EPS / 52週高低 (縮寫版)
                buildDataRow('EPS', details.eps, '52週高', details.yearHigh)
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
                },
                {
                    type: 'button',
                    action: { type: 'message', label: '查看技術分析', text: `分析 ${data.id}` },
                    style: 'secondary',
                    height: 'sm',
                    margin: 'sm'
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
    }
}

/**
 * 處理股票分析指令
 */
async function handleStockAnalysis(replyToken, query) {
    try {
        await lineUtils.replyText(replyToken, `🔄 正在分析 ${query} 的技術指標 (四大買賣點)... 請稍候`);

        // 此處需要先查詢代號 (如果輸入的是名稱)
        let code = query;
        if (!/^\d+/.test(query)) {
            const found = await searchStock(query);
            if (found) code = found.split('.')[0];
        } else {
            code = query.split('.')[0];
        }

        const result = await analyzeStock(code);

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ 分析失敗: ${result.error || '未知錯誤'}`);
            return;
        }

        // 建構回應訊息
        const color = result.action === 'BUY' ? '#ff333a' : (result.action === 'SELL' ? '#00a84e' : '#333333');
        const icon = result.action === 'BUY' ? '🔴' : (result.action === 'SELL' ? '🟢' : '⚪');

        const flex = {
            type: 'bubble',
            size: 'kilo',
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: '技術指標分析', weight: 'bold', color: '#1DB446', size: 'xs' },
                    { type: 'text', text: `${result.name} (${result.code})`, weight: 'bold', size: 'xl', margin: 'md' },
                    { type: 'separator', margin: 'lg' },
                    {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: result.message || '無顯著訊號', wrap: true, size: 'md', weight: 'regular', color: '#555555' }
                        ],
                        margin: 'lg'
                    },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                            { type: 'text', text: '建議動作', size: 'sm', color: '#aaaaaa', flex: 1, align: 'start', gravity: 'center' },
                            { type: 'text', text: `${icon} ${result.action}`, size: 'xl', weight: 'bold', color: color, flex: 2, align: 'end' }
                        ],
                        margin: 'lg'
                    }
                ],
                paddingAll: '20px'
            }
        };

        await lineUtils.replyFlex(replyToken, `${result.name} 分析結果`, flex);

    } catch (error) {
        console.error('[Stock Analysis] Handler Error:', error);
        await handleError(error, { replyText: (t) => lineUtils.replyText(replyToken, t) });
    }
}

module.exports = {
    handleStockQuery,
    handleStockAnalysis
};
