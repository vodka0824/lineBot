/**
 * JavDB API 模組 - 番號查詢封面
 * 
 * 警告: 此模組僅供技術測試用途
 * - 請勿用於商業或公開服務
 * - 尊重網站服務條款
 * - 內容涉及成人資訊，請謹慎使用
 */

const axios = require('axios');
const cheerio = require('cheerio');

// 配置
const CONFIG = {
    baseUrl: 'https://javdb.com',
    searchPath: '/search',
    timeout: 10000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8'
    }
};

// 簡單的速率限制
const rateLimiter = {
    requests: [],
    maxRequests: 10,
    timeWindow: 60000, // 1 分鐘

    checkLimit() {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.timeWindow);

        if (this.requests.length >= this.maxRequests) {
            return false;
        }

        this.requests.push(now);
        return true;
    }
};

/**
 * 根據番號搜尋 AV 封面
 * @param {string} code - 番號 (例如: SSIS-001)
 * @returns {Promise<Object>} 查詢結果
 */
async function searchByCode(code) {
    // 驗證輸入
    if (!code || typeof code !== 'string') {
        return {
            success: false,
            error: '番號格式錯誤'
        };
    }

    // 清理番號（移除空白、轉大寫）
    const cleanCode = code.trim().toUpperCase();

    // 速率限制檢查
    if (!rateLimiter.checkLimit()) {
        return {
            success: false,
            error: '請求過於頻繁，請稍後再試'
        };
    }

    try {
        console.log(`[JavDB] 搜尋番號: ${cleanCode}`);

        // Step 1: 搜尋番號
        const searchUrl = `${CONFIG.baseUrl}${CONFIG.searchPath}?q=${encodeURIComponent(cleanCode)}&f=all`;

        const response = await axios.get(searchUrl, {
            timeout: CONFIG.timeout,
            headers: CONFIG.headers,
            validateStatus: (status) => status < 500 // 接受 4xx 狀態碼
        });

        if (response.status === 404) {
            return {
                success: false,
                error: '找不到該番號'
            };
        }

        // Step 2: 解析 HTML
        const $ = cheerio.load(response.data);

        // 尋找第一個搜尋結果
        const firstResult = $('.movie-list .item').first();

        if (firstResult.length === 0) {
            return {
                success: false,
                error: '找不到該番號'
            };
        }

        // Step 3: 提取資訊
        const coverUrl = firstResult.find('img').attr('src') || firstResult.find('img').attr('data-src');
        const title = firstResult.find('.video-title').text().trim();
        const detailLink = firstResult.find('a').attr('href');
        const detailUrl = detailLink ? `${CONFIG.baseUrl}${detailLink}` : null;

        // 驗證封面 URL
        if (!coverUrl) {
            return {
                success: false,
                error: '無法取得封面圖片'
            };
        }

        console.log(`[JavDB] 找到: ${title}`);

        return {
            success: true,
            data: {
                code: cleanCode,
                title: title,
                coverUrl: coverUrl,
                detailUrl: detailUrl
            }
        };

    } catch (error) {
        console.error('[JavDB] 錯誤:', error.message);

        // 友善的錯誤訊息
        if (error.code === 'ENOTFOUND') {
            return {
                success: false,
                error: '無法連接到 JavDB 網站'
            };
        } else if (error.code === 'ETIMEDOUT') {
            return {
                success: false,
                error: '請求超時，請稍後再試'
            };
        } else {
            return {
                success: false,
                error: `查詢失敗: ${error.message}`
            };
        }
    }
}

/**
 * 批次查詢多個番號
 * @param {string[]} codes - 番號陣列
 * @param {number} delay - 每次請求間隔 (毫秒)
 * @returns {Promise<Object[]>} 查詢結果陣列
 */
async function batchSearch(codes, delay = 1000) {
    const results = [];

    for (const code of codes) {
        const result = await searchByCode(code);
        results.push(result);

        // 延遲以避免過度請求
        if (delay > 0 && codes.indexOf(code) < codes.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    return results;
}

module.exports = {
    searchByCode,
    batchSearch
};
