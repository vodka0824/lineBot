const axios = require('axios');
const cheerio = require('cheerio');
const lineUtils = require('../utils/line');

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
    const today = new Date().toISOString().split('T')[0];

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
                const title = $('title').text();
                const match = title.match(/.{2,3}座/); // Matches "牡羊座", "射手座"

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
    const today = new Date().toISOString().split('T')[0];

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
 * Get Daily Horoscope
 * @param {string} signName - The constellation name (e.g., '牡羊')
 * @returns {Promise<Object>} Horoscope data
 */
async function getHoroscope(signName) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const index = await getSignIndex(signName);

    if (index === undefined || index === null) {
        return null;
    }

    const url = `https://astro.click108.com.tw/daily_${index}.php?iAcDay=${today}&iAstro=${index}`;

    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // 1. Parse Short Comment (今日短評)
        // User confirmed structure: <div class="TODAY_WORD"><p>Content</p></div>
        let shortComment = '';
        const todayWord = $('.TODAY_WORD p');
        if (todayWord.length) {
            shortComment = todayWord.text().trim();
        }

        // 2. Parse Lucky Items (.LUCKY)
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
            // Based on probe: 
            // 0: Number (class NUMERAL)
            // 1: Color
            // 2: Direction
            // 3: Time (class TIME)
            // 4: Constellation
            if (h4s.length >= 5) {
                luckyItems.number = $(h4s[0]).text().trim();
                luckyItems.color = $(h4s[1]).text().trim();
                luckyItems.direction = $(h4s[2]).text().trim();
                luckyItems.time = $(h4s[3]).text().trim();
                luckyItems.constellation = $(h4s[4]).text().trim();
            }
        }

        // 3. Parse Main Content (Only P tags that are NOT short comment)
        // Actually, the main content usually follows the ratings.
        // Let's just grab all text in .TODAY_CONTENT, excluding H3 and the short comment P if possible.
        // Simpler approach: Just grab all P tags in TODAY_CONTENT.
        // One of them is likely the short comment.

        const paragraphs = [];
        $('.TODAY_CONTENT p').each((i, el) => {
            const text = $(el).text().trim();
            // Filter out empty or duplicate short comment if exact match
            if (text && text !== shortComment) {
                paragraphs.push(text);
            }
        });

        // Determine Sign Name
        // Extract from Title to be accurate: "牡羊座今日運勢" -> "牡羊座"
        const title = $('title').text();
        const titleMatch = title.match(/.{2,3}座/);
        const name = titleMatch ? titleMatch[0] : signName;

        return {
            name: name,
            date: today,
            shortComment,
            lucky: luckyItems,
            content: paragraphs.join('\n\n'),
            url: url
        };

    } catch (error) {
        console.error(`[Horoscope] Error fetching for ${index}:`, error.message);
        throw new Error('無法取得運勢資料');
    }
}

/**
 * Handle Horoscope Command
 */
async function handleHoroscope(replyToken, signName) {
    try {
        const data = await getHoroscope(signName);
        if (!data) {
            await lineUtils.replyText(replyToken, '❌ 找不到此星座，請輸入正確的星座名稱 (例如：牡羊、獅子)');
            return;
        }

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
                        text: `🔮 ${data.name} 今日運勢`,
                        weight: "bold",
                        size: "xl",
                        color: "#ffffff"
                    },
                    {
                        type: "text",
                        text: data.date,
                        size: "sm",
                        color: "#eeeeee",
                        margin: "sm"
                    }
                ],
                backgroundColor: "#4527A0", // Deep Purple
                paddingAll: "20px"
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    // 1. Short Comment
                    {
                        type: "box",
                        layout: "vertical",
                        contents: [
                            {
                                type: "text",
                                text: data.shortComment || "暫無短評",
                                wrap: true,
                                align: "center",
                                color: "#5D4037",
                                weight: "bold",
                                size: "md"
                            }
                        ],
                    {
                        type: "box",
                        layout: "vertical",
                        contents: [
                            {
                                type: "text",
                                text: data.shortComment || "暫無短評",
                                wrap: true,
                                align: "center",
                                color: "#E65100", // Dark Orange
                                weight: "bold",
                                size: "md"
                            }
                        ],
                        backgroundColor: "#FFF3E0", // Light Orange
                        cornerRadius: "8px",
                        paddingAll: "12px",
                        margin: "md"
                    },
                    // REMOVED Separator
                    // 2. Lucky Items Grid
                    {
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
                                            { type: "span", text: data.lucky.time || '-', weight: "bold", color: "#C2185B", size: "md" } // Pink/Red
                                        ],
                                        flex: 1
                                    },
                                    {
                                        type: "text",
                                        contents: [
                                            { type: "span", text: "🧭 方位: ", color: "#999999", size: "sm" },
                                            { type: "span", text: data.lucky.direction || '-', weight: "bold", color: "#00796B", size: "md" } // Teal
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
                                            { type: "span", text: data.lucky.constellation || '-', weight: "bold", color: "#7B1FA2", size: "md" } // Purple
                                        ],
                                        flex: 1
                                    }
                                ]
                            }
                        ]
                    },
                    // REMOVED Separator
                    // 3. Main Content
                    {
                        type: "text",
                        text: data.content,
                        wrap: true,
                        size: "sm",
                        color: "#444444",
                        margin: "md",
                        lineSpacing: "5px" // Increase line spacing specifically for readability
                    }
                ]
            }
        };

        await lineUtils.replyFlex(replyToken, `🔮 ${data.name}運勢`, flexContents);

    } catch (error) {
        console.error('[Horoscope] Handle Error:', error);
        await lineUtils.replyText(replyToken, '❌ 讀取運勢失敗，請稍後再試。');
    }
}

module.exports = {
    handleHoroscope
};
