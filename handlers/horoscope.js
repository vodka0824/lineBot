const axios = require('axios');
const cheerio = require('cheerio');
const lineUtils = require('../utils/line');

// Helper to get Taiwan Date (YYYY-MM-DD)
function getTaiwanDate() {
    const d = new Date();
    d.setUTCHours(d.getUTCHours() + 8);
    return d.toISOString().split('T')[0];
}

// Cache for dynamic index mapping
let SIGN_CACHE = null;
let CACHE_DATE = '';

// Standard Fallback Mapping (Most common structure)
const FALLBACK_MAPPING = {
    '牡羊座': 0, '金牛座': 1, '雙子座': 2, '巨蟹座': 3,
    '獅子座': 4, '處女座': 5, '天秤座': 6, '天蠍座': 7,
    '射手座': 8, '摩羯座': 9, '水瓶座': 10, '雙魚座': 11
};

const KNOWN_SIGNS = [
    '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座',
    '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'
];

/**
 * Refresh the mapping from index (0-11) to Sign Name
 */
async function refreshCache() {
    console.log('[Horoscope] Refreshing cache...');
    const mapping = {};
    const promises = [];
    const today = getTaiwanDate();

    // Click108 usually uses 0-11. We scan 0-11.
    for (let i = 0; i < 12; i++) {
        promises.push((async () => {
            try {
                // Fetch with today's date to ensure consistency
                const url = `https://astro.click108.com.tw/daily_${i}.php?iAcDay=${today}&iAstro=${i}`;
                const res = await axios.get(url, {
                    timeout: 5000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
                });
                const $ = cheerio.load(res.data);

                // Parse Title for Sign Name (e.g. "牡羊座今日運勢") to be accurate
                // Use strict regex to avoid matching "運勢 | 星座"
                const title = $('title').text();
                const signRegex = new RegExp(`(${KNOWN_SIGNS.join('|')})`);
                const match = title.match(signRegex);

                let sign = '';
                if (match) {
                    sign = match[0];
                } else {
                    // Fallback to Lucky Constellation logic (less reliable) but only if title fails
                    const lucky = $('.LUCKY');
                    if (lucky.length) {
                        // WARNING: lucky constellation != current sign. 
                        // But often page content reflects the sign requested.
                        // Actually, the previous logic WAS wrong because it grabbed the Lucky sign.
                        // If title fails, we might just assume standard mapping or check H2.
                        // Let's rely on standard mapping as fallback if title fails.
                    }
                }

                if (sign && KNOWN_SIGNS.includes(sign)) {
                    mapping[sign] = i;
                    // Also map without '座'
                    const shortName = sign.replace('座', '');
                    mapping[shortName] = i;
                }
            } catch (e) {
                // Ignore errors
            }
        })());
    }

    await Promise.all(promises);

    // Merge with Fallback for any missing keys
    for (const [sign, idx] of Object.entries(FALLBACK_MAPPING)) {
        if (mapping[sign] === undefined) {
            mapping[sign] = idx;
            mapping[sign.replace('座', '')] = idx;
        }
    }

    // Manual Alias Mapping
    const aliases = {
        '白羊': '牡羊',
        '天平': '天秤',
        '人馬': '射手',
        '山羊': '摩羯'
    };
    for (const [alias, target] of Object.entries(aliases)) {
        if (mapping[target] !== undefined) {
            mapping[alias] = mapping[target];
        }
    }

    SIGN_CACHE = mapping;
    CACHE_DATE = today;
    console.log('[Horoscope] Cache refreshed:', mapping);
}

/**
 * Get Index for Sign
 */
async function getSignIndex(signName) {
    const today = getTaiwanDate();

    // Refresh if cache is empty or date changed
    if (!SIGN_CACHE || CACHE_DATE !== today) {
        await refreshCache();
    }

    // Normalize input
    let cleanName = signName.trim();
    // Handle English or other aliases if needed

    return SIGN_CACHE[cleanName];
}

// Reverse Mapping for display
const INDEX_TO_NAME = [
    '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座',
    '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'
];

/**
 * Get Horoscope Data
 * @param {string} signName - The constellation name (e.g., '牡羊')
 * @param {string} type - 'daily', 'weekly', 'monthly'
 * @returns {Promise<Object>} Horoscope data
 */
async function getHoroscope(signName, type = 'daily') {
    const today = getTaiwanDate(); // YYYY-MM-DD (Taiwan Time)
    const index = await getSignIndex(signName);

    if (index === undefined || index === null) {
        return null;
    }

    let url = '';
    switch (type) {
        case 'weekly':
            url = `https://astro.click108.com.tw/weekly_${index}.php?iAcDay=${today}&iType=1&iAstro=${index}`;
            break;
        case 'monthly':
            url = `https://astro.click108.com.tw/monthly_${index}.php?iAcDay=${today}&iType=2&iAstro=${index}`;
            break;
        case 'daily':
        default:
            url = `https://astro.click108.com.tw/daily_${index}.php?iAcDay=${today}&iAstro=${index}`;
            break;
    }

    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // 1. Parse Short Comment (今日短評 / 本週 / 本月 ?)
        // Weekly has Short Comment. Monthly might not.
        let shortComment = '';
        const todayWord = $('.TODAY_WORD p');
        if (todayWord.length) {
            shortComment = todayWord.text().trim();
        }

        // 2. Parse Lucky Items (.LUCKY)
        // Weekly has Lucky Items. Monthly might not.
        const luckyItems = {
            number: '',
            color: '',
            direction: '',
            time: '',
            constellation: ''
        };

        const luckyContainer = $('.LUCKY');
        if (luckyContainer.length) {
            const h4s = luckyContainer.find('h4');
            if (h4s.length >= 5) {
                // Daily/Weekly usually have full set
                luckyItems.number = $(h4s[0]).text().trim();
                luckyItems.color = $(h4s[1]).text().trim();
                luckyItems.direction = $(h4s[2]).text().trim();
                luckyItems.time = $(h4s[3]).text().trim();
                luckyItems.constellation = $(h4s[4]).text().trim();
            } else if (h4s.length > 0) {
                // Partial lucky items? (Just in case)
                luckyItems.number = $(h4s[0]).text().trim();
            }
        }

        // 3. Parse Detailed Sections
        const sections = [];
        let currentSection = null;

        $('.TODAY_CONTENT p').each((i, el) => {
            const text = $(el).text().trim();
            if (!text || text === shortComment) return;

            // Expanded Match for Weekly/Monthly headers
            // Matches: "整體運勢", "愛情運勢", "事業運勢", "財運運勢", "健康運勢", "工作運勢", "求職運勢", "戀愛運勢"
            const headerMatch = text.match(/^(整體|愛情|事業|財運|健康|工作|求職|戀愛)運勢/);

            if (headerMatch) {
                let type = 'other';
                if (text.includes('整體')) type = 'overall';
                else if (text.includes('愛情') || text.includes('戀愛')) type = 'love';
                else if (text.includes('事業') || text.includes('工作') || text.includes('求職')) type = 'career';
                else if (text.includes('財運')) type = 'wealth';
                else if (text.includes('健康')) type = 'health';

                currentSection = {
                    title: text,
                    content: '',
                    type: type
                };
                sections.push(currentSection);
            } else {
                if (currentSection) {
                    currentSection.content += (currentSection.content ? '\n' : '') + text;
                }
            }
        });

        // Determine Sign Name
        const title = $('title').text();
        const signRegex = new RegExp(`(${KNOWN_SIGNS.join('|')})`);
        const titleMatch = title.match(signRegex);
        const name = titleMatch ? titleMatch[0] : signName;

        return {
            name: name,
            date: today,
            type: type, // Pass back type for UI
            shortComment,
            lucky: luckyItems,
            sections: sections,
            url: url
        };
    } catch (error) {
        console.error(`[Horoscope] Error fetching ${type} for ${index}:`, error.message);
        throw new Error('無法取得運勢資料');
    }
}

/**
 * Handle Horoscope Command
 */
async function handleHoroscope(replyToken, signName, type = 'daily') {
    try {
        const data = await getHoroscope(signName, type);
        if (!data) {
            await lineUtils.replyText(replyToken, '❌ 找不到此星座，請輸入正確的星座名稱 (例如：牡羊、獅子)');
            return;
        }

        // Define Title Prefix
        let periodName = '今日';
        if (type === 'weekly') periodName = '本週';
        if (type === 'monthly') periodName = '本月';

        // Helper for Section Colors
        const getSectionColor = (type) => {
            switch (type) {
                case 'overall': return '#E65100'; // Dark Orange
                case 'love': return '#E91E63';    // Pink
                case 'career': return '#1565C0';  // Blue
                case 'wealth': return '#2E7D32';  // Green
                case 'health': return '#00ACC1';  // Cyan
                default: return '#333333';
            }
        };

        // Build Section Components
        const sectionComponents = [];
        if (data.sections && data.sections.length > 0) {
            data.sections.forEach((section) => {
                sectionComponents.push(
                    {
                        type: "text",
                        text: section.title,
                        weight: "bold",
                        size: "md",
                        color: getSectionColor(section.type),
                        margin: "lg"
                    },
                    {
                        type: "text",
                        text: section.content,
                        size: "md",
                        color: "#555555",
                        wrap: true,
                        lineSpacing: "4px",
                        margin: "sm"
                    }
                );
            });
        } else {
            sectionComponents.push({
                type: "text",
                text: "運勢內容讀取中...",
                size: "sm",
                color: "#999999"
            });
        }

        // Conditional Body Components
        const bodyContents = [];

        // 1. Short Comment (Only if exists)
        if (data.shortComment) {
            bodyContents.push({
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: data.shortComment,
                        wrap: true,
                        align: "center",
                        color: "#E65100",
                        weight: "bold",
                        size: "md"
                    }
                ],
                backgroundColor: "#FFF3E0",
                cornerRadius: "8px",
                paddingAll: "12px",
                margin: "none"
            });
            bodyContents.push({ type: "separator", margin: "md" });
        }

        // 2. Lucky Items (Only if exists and has data)
        // Monthly might not have these
        if (data.lucky && data.lucky.number) {
            bodyContents.push({
                type: "box",
                layout: "vertical",
                margin: "md",
                spacing: "sm",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                contents: [
                                    { type: "span", text: "🔢 數字: ", color: "#999999", size: "sm" },
                                    { type: "span", text: data.lucky.number || '-', weight: "bold", color: "#E64A19", size: "md" }
                                ],
                                flex: 1
                            },
                            {
                                type: "text",
                                contents: [
                                    { type: "span", text: "🎨 顏色: ", color: "#999999", size: "sm" },
                                    { type: "span", text: data.lucky.color || '-', weight: "bold", color: "#1976D2", size: "md" }
                                ],
                                flex: 1
                            }
                        ]
                    },
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                contents: [
                                    { type: "span", text: "⏰ 吉時: ", color: "#999999", size: "sm" },
                                    { type: "span", text: data.lucky.time || '-', weight: "bold", color: "#C2185B", size: "md" }
                                ],
                                flex: 1
                            },
                            {
                                type: "text",
                                contents: [
                                    { type: "span", text: "🧭 方位: ", color: "#999999", size: "sm" },
                                    { type: "span", text: data.lucky.direction || '-', weight: "bold", color: "#00796B", size: "md" }
                                ],
                                flex: 1
                            }
                        ]
                    },
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                contents: [
                                    { type: "span", text: "🤝 貴人: ", color: "#999999", size: "sm" },
                                    { type: "span", text: data.lucky.constellation || '-', weight: "bold", color: "#7B1FA2", size: "md" }
                                ],
                                flex: 1
                            }
                        ]
                    }
                ]
            });
            bodyContents.push({ type: "separator", margin: "md" });
        }

        // 3. Sections
        bodyContents.push(...sectionComponents);

        // Build Flex Message
        const flexContents = {
            type: "bubble",
            size: "giga",
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: `🔮 ${data.name} ${periodName}運勢 ${data.date}`,
                        weight: "bold",
                        size: "md",
                        color: "#ffffff",
                        wrap: true
                    }
                ],
                backgroundColor: "#4527A0", // Deep Purple
                paddingAll: "12px"
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: bodyContents
            }
        };

        await lineUtils.replyFlex(replyToken, `🔮 ${data.name}${periodName}運勢`, flexContents);

    } catch (error) {
        console.error('[Horoscope] Handle Error:', error);
        await lineUtils.replyText(replyToken, '❌ 讀取運勢失敗，請稍後再試。');
    }
}

module.exports = {
    handleHoroscope
};
