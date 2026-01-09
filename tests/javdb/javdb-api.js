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

        // Step 2: 解析搜尋結果頁面
        const $ = cheerio.load(response.data);

        // 尋找第一個搜尋結果
        const firstResult = $('.movie-list .item').first();

        if (firstResult.length === 0) {
            return {
                success: false,
                error: '找不到該番號'
            };
        }

        // Step 3: 提取基本資訊
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

        // Step 4: 訪問詳情頁面獲取更多資訊
        let additionalInfo = {};
        if (detailUrl) {
            try {
                const detailResponse = await axios.get(detailUrl, {
                    timeout: CONFIG.timeout,
                    headers: CONFIG.headers
                });

                const detail$ = cheerio.load(detailResponse.data);

                // 初始化資訊物件
                additionalInfo = {
                    date: '',
                    duration: '',
                    director: '',
                    studio: '',
                    series: '',
                    rating: '',
                    actors: []
                };

                // 方法1: 解析資訊面板（nav class="panel"）
                detail$('nav.panel .panel-block').each((i, elem) => {
                    const $elem = detail$(elem);
                    const text = $elem.text().trim();
                    const strongText = $elem.find('strong').text().trim();

                    // 根據標籤提取資訊
                    if (strongText.includes('日期') || strongText.includes('發行日期')) {
                        // 日期格式: "日期: 2023-06-09"
                        additionalInfo.date = text.replace(strongText, '').replace(/[:：]/g, '').trim();
                    } else if (strongText.includes('時長') || strongText.includes('長度')) {
                        additionalInfo.duration = text.replace(strongText, '').replace(/[:：]/g, '').trim();
                    } else if (strongText.includes('導演')) {
                        additionalInfo.director = text.replace(strongText, '').replace(/[:：]/g, '').trim();
                    } else if (strongText.includes('片商') || strongText.includes('製作商')) {
                        additionalInfo.studio = text.replace(strongText, '').replace(/[:：]/g, '').trim();
                    } else if (strongText.includes('系列')) {
                        additionalInfo.series = text.replace(strongText, '').replace(/[:：]/g, '').trim();
                    } else if (strongText.includes('番號')) {
                        // 確認番號
                        const codeFromDetail = text.replace(strongText, '').replace(/[:：]/g, '').trim();
                        if (codeFromDetail && !additionalInfo.code) {
                            additionalInfo.code = codeFromDetail;
                        }
                    }
                });

                // 方法2: 從連結提取資訊
                if (!additionalInfo.director) {
                    const directorLink = detail$('a[href*="/directors/"]').first();
                    if (directorLink.length) {
                        additionalInfo.director = directorLink.text().trim();
                    }
                }

                if (!additionalInfo.studio) {
                    const studioLink = detail$('a[href*="/makers/"]').first();
                    if (studioLink.length) {
                        additionalInfo.studio = studioLink.text().trim();
                    }
                }

                if (!additionalInfo.series) {
                    const seriesLink = detail$('a[href*="/series/"]').first();
                    if (seriesLink.length) {
                        additionalInfo.series = seriesLink.text().trim();
                    }
                }

                // 提取評分
                const scoreElement = detail$('.score .score-text, .score-text');
                if (scoreElement.length) {
                    additionalInfo.rating = scoreElement.text().trim();
                }

                // 提取演員
                detail$('a[href*="/actors/"]').each((i, elem) => {
                    const actorName = detail$(elem).text().trim();
                    if (actorName && additionalInfo.actors.length < 5) {
                        additionalInfo.actors.push(actorName);
                    }
                });

                // 清理空字符串
                Object.keys(additionalInfo).forEach(key => {
                    if (typeof additionalInfo[key] === 'string' && !additionalInfo[key]) {
                        delete additionalInfo[key];
                    }
                });

                console.log('[JavDB] 提取詳細資訊:', JSON.stringify(additionalInfo));

            } catch (detailError) {
                console.log('[JavDB] 無法取得詳細資訊:', detailError.message);
                // 即使詳情頁失敗，仍返回基本資訊
            }
        }

        console.log(`[JavDB] 找到: ${title}`);

        return {
            success: true,
            data: {
                code: cleanCode,
                title: title,
                coverUrl: coverUrl,
                detailUrl: detailUrl,
                ...additionalInfo
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
