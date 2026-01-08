const { Firestore } = require('@google-cloud/firestore');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const authUtils = require('../utils/auth');
const logger = require('../utils/logger');

const db = new Firestore();

// Default Configuration
const DEFAULT_WELCOME_IMAGE = 'https://images.unsplash.com/photo-1542435503-956c469947f6?auto=format&fit=crop&w=1000&q=80';
const DEFAULT_WELCOME_TEXT = '歡迎加入我們！請先查看記事本的版規喔～';

/**
 * 驗證圖片 URL 是否有效
 */
function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;

    // 必須是 HTTPS（LINE 要求）
    if (!url.startsWith('https://')) return false;

    // 基本長度檢查
    if (url.length > 2000) return false;

    // 檢查是否為圖片檔案（常見格式）或已知圖床
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const knownHosts = ['unsplash.com', 'imgur.com', 'googleusercontent.com', 'placeholder.com', 'dummyimage.com'];

    const hasImageExt = imageExtensions.some(ext => url.toLowerCase().includes(ext));
    const hasKnownHost = knownHosts.some(host => url.includes(host));
    const hasQueryParam = url.includes('?'); // Query 參數通常表示動態圖片

    return hasImageExt || hasKnownHost || hasQueryParam;
}

/**
 * 取得群組歡迎設定
 */
async function getWelcomeConfig(groupId) {
    try {
        const doc = await db.collection('groups').doc(groupId).get();
        if (!doc.exists) return null;
        return doc.data().welcomeConfig || null;
    } catch (error) {
        console.error('Error fetching welcome config:', error);
        return null;
    }
}

/**
 * 設定歡迎詞
 */
async function setWelcomeText(groupId, text, userId) {
    if (!text) return { success: false, message: '❌ 請輸入歡迎詞內容' };

    // 使用巢狀物件結構，確保 set merge 能正確處理
    await db.collection('groups').doc(groupId).set({
        welcomeConfig: {
            text: text,
            updatedAt: Firestore.FieldValue.serverTimestamp(),
            updatedBy: userId
        }
    }, { merge: true });

    return { success: true, message: '✅ 歡迎詞已更新！' };
}

/**
 * 設定歡迎圖（僅支援上傳圖片）
 */
async function setWelcomeImage(groupId, url, userId) {
    // URL Check
    if (!url.startsWith('http')) {
        return { success: false, message: '❌ 請輸入有效的圖片網址 (http/https)' };
    }

    // 使用巢狀物件結構，確保 set merge 能正確處理
    await db.collection('groups').doc(groupId).set({
        welcomeConfig: {
            imageUrl: url,
            updatedAt: Firestore.FieldValue.serverTimestamp(),
            updatedBy: userId
        }
    }, { merge: true });

    return { success: true, message: '✅ 歡迎圖已更新！' };
}

/**
 * 建構歡迎 Flex Message
 */
async function buildWelcomeFlex(memberProfile, config) {
    const displayName = memberProfile.displayName || '新朋友';
    // Use via.placeholder.com for better compatibility
    let pictureUrl = memberProfile.pictureUrl || 'https://via.placeholder.com/200x200/cccccc/ffffff.png?text=User';

    const welcomeText = (config?.text || DEFAULT_WELCOME_TEXT).replace('{user}', displayName);
    let heroUrl = config?.imageUrl || DEFAULT_WELCOME_IMAGE;

    // ✅ 嚴格驗證 Hero URL 與快取處理
    if (!isValidImageUrl(heroUrl)) {
        logger.warn(`[Welcome] Invalid hero URL: ${heroUrl}, using default`);
        heroUrl = DEFAULT_WELCOME_IMAGE;
    } else {
        // 加上時間戳以避免 LINE 快取 (如果 URL 已經有參數則用 &，否則用 ?)
        const separator = heroUrl.includes('?') ? '&' : '?';
        heroUrl = `${heroUrl}${separator}_t=${Date.now()}`;
    }

    // ✅ 驗證 Profile Picture URL
    if (!isValidImageUrl(pictureUrl)) {
        logger.warn(`[Welcome] Invalid profile picture URL, using placeholder`);
        pictureUrl = 'https://via.placeholder.com/200x200/cccccc/ffffff.png?text=User';
    }

    return flexUtils.createBubble({
        size: 'mega',
        header: {
            type: 'box',
            layout: 'vertical',
            contents: [
                { type: 'text', text: '🌟 WELCOME', weight: 'bold', size: 'xl', color: '#1E90FF', align: 'center' }
            ],
            paddingBottom: '0px'
        },
        hero: {
            type: "image",
            url: heroUrl,
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover"
        },
        body: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                        {
                            type: "image",
                            url: pictureUrl,
                            size: "md",
                            aspectMode: "cover",
                            aspectRatio: "1:1",
                            backgroundColor: "#CCCCCC",
                            flex: 0 // Fixed size
                        },
                        {
                            type: "box",
                            layout: "vertical",
                            contents: [
                                { type: 'spacer', size: 'xs' },  // ✅ 上方留白實現垂直置中
                                { type: 'text', text: `Hi, ${displayName}`, weight: 'bold', size: 'lg', wrap: true },
                                { type: 'text', text: '很高興認識你！', size: 'xs', color: '#888888', margin: 'xs' },
                                { type: 'spacer', size: 'xs' }   // ✅ 下方留白
                            ],
                            paddingStart: "15px"
                        }
                    ],
                    margin: "md"
                },
                { type: "separator", margin: "lg" },
                {
                    type: "text",
                    text: welcomeText,
                    wrap: true,
                    size: "sm",
                    color: "#555555",
                    margin: "lg"
                }
            ],
            paddingAll: "20px"
        }
    });
}

/**
 * 處理成員加入事件
 */
async function handleMemberJoined(event) {
    const { replyToken, source } = event;

    // Safety check for source
    if (!source || !source.groupId) {
        logger.warn('[Welcome] Event missing source or groupId', { event });
        return;
    }
    const { groupId } = source; // joined members are in event.joined.members usually

    logger.info(`[Welcome] Member joined event detected in group: ${groupId}`);

    // Safety check
    if (!event.joined || !event.joined.members || !Array.isArray(event.joined.members)) {
        logger.warn('[Welcome] Invalid event structure', { event });
        return;
    }

    const newMembers = event.joined.members;
    logger.info(`[Welcome] Processing ${newMembers.length} new members`);

    try {
        // Fetch group config once
        const config = await getWelcomeConfig(groupId);
        logger.debug(`[Welcome] Config for ${groupId}:`, config);

        // Check if enabled (default true if config exists, or if config is null we assume enabled default?)
        // Let's assume enabled by default unless explicitly disabled, or opt-in?
        // User requested feature, assume opt-in or default ON. Let's start default ON for "Premium" feel.
        // Spec said: "welcomeConfig { enabled: true }"
        if (config && config.enabled === false) {
            logger.info(`[Welcome] Welcome message disabled for group ${groupId}`);
            return;
        }

        const bubbles = [];

        for (const member of newMembers) {
            try {
                // Get User Profile (Need to wait a bit? sometimes immediate get profile fails? usually ok)
                let profile = { displayName: '新成員' };
                if (member.userId) {
                    try {
                        profile = await lineUtils.getGroupMemberProfile(groupId, member.userId);
                    } catch (e) {
                        logger.warn(`[Welcome] Failed to fetch profile for user ${member.userId}: ${e.message}`);
                    }
                }

                const bubble = await buildWelcomeFlex(profile, config);
                bubbles.push(bubble);
            } catch (e) {
                logger.error('[Welcome] Error building welcome bubble:', e);
            }
        }

        if (bubbles.length > 0) {
            logger.info(`[Welcome] Sending ${bubbles.length} welcome bubbles`);
            if (bubbles.length === 1) {
                try {
                    const flex = bubbles[0];

                    // ✅ 嚴格驗證 Flex 結構
                    if (!flex || !flex.type || flex.type !== 'bubble') {
                        throw new Error('Invalid Flex structure: not a bubble');
                    }

                    await lineUtils.replyFlex(replyToken, '歡迎新成員！', flex);
                    logger.info('[Welcome] Single Flex message sent successfully');
                } catch (flexError) {
                    logger.error('[Welcome] Flex reply failed:', {
                        error: flexError.message,
                        stack: flexError.stack?.substring(0, 200),
                        flexPreview: JSON.stringify(bubbles[0]).substring(0, 300)
                    });

                    // ✅ 降級策略 1：發送歡迎圖 + 文字
                    try {
                        const profile = newMembers[0].userId
                            ? await lineUtils.getGroupMemberProfile(groupId, newMembers[0].userId).catch(() => ({ displayName: '新朋友' }))
                            : { displayName: '新朋友' };

                        const welcomeText = (config?.text || DEFAULT_WELCOME_TEXT).replace('{user}', profile.displayName || '新朋友');

                        // 選擇圖片
                        let heroUrl = config?.imageUrl || DEFAULT_WELCOME_IMAGE;
                        if (heroUrl === 'RANDOM') {
                            heroUrl = WELCOME_IMAGES[Math.floor(Math.random() * WELCOME_IMAGES.length)];
                        }
                        if (!isValidImageUrl(heroUrl)) {
                            heroUrl = DEFAULT_WELCOME_IMAGE;
                        }

                        await lineUtils.replyToLine(replyToken, [
                            { type: 'image', originalContentUrl: heroUrl, previewImageUrl: heroUrl },
                            { type: 'text', text: `🌟 ${welcomeText}` }
                        ]);

                        logger.info('[Welcome] Fallback to image + text succeeded');
                    } catch (fallbackError) {
                        logger.error('[Welcome] Fallback also failed:', fallbackError);
                        // ✅ 最終降級：純文字
                        const simpleText = (config?.text || DEFAULT_WELCOME_TEXT).replace('{user}', '新朋友');
                        await lineUtils.replyText(replyToken, `🌟 ${simpleText}`);
                        logger.info('[Welcome] Final fallback to text succeeded');
                    }
                }
            } else {
                try {
                    await lineUtils.replyFlex(replyToken, '歡迎新成員！', { type: 'carousel', contents: bubbles });
                } catch (carouselError) {
                    logger.warn('[Welcome] Carousel reply failed', carouselError);
                    await lineUtils.replyText(replyToken, '歡迎新成員加入！');
                }
            }
            logger.info('[Welcome] Message sent successfully');
        } else {
            logger.warn('[Welcome] No bubbles generated');
        }
    } catch (error) {
        logger.error('[Welcome] Critical error in handleMemberJoined:', error);
    }
}

/**
 * 發送測試歡迎訊息
 */
async function sendTestWelcome(replyToken, groupId, userId) {
    try {
        const config = await getWelcomeConfig(groupId);
        logger.info(`[Welcome] Test config loaded for group ${groupId}:`, config);

        // 嘗試獲取用戶資料，失敗則使用預設值
        let profile = {
            displayName: '測試用戶',
            pictureUrl: 'https://via.placeholder.com/200x200/cccccc/ffffff.png?text=User'
        };

        try {
            profile = await lineUtils.getGroupMemberProfile(groupId, userId);
            logger.info(`[Welcome] Got user profile: ${profile.displayName}`);
        } catch (error) {
            logger.warn('[Welcome] Failed to get user profile, using fallback:', error.message);
        }

        logger.info('[Welcome] Building test welcome flex...');
        const bubble = await buildWelcomeFlex(profile, config);

        logger.info('[Welcome] Sending test welcome flex...');
        logger.info('[Welcome] Flex JSON:', JSON.stringify(bubble, null, 2));
        await lineUtils.replyFlex(replyToken, '測試歡迎卡', bubble);

        logger.info('[Welcome] Test welcome sent successfully');
    } catch (error) {
        logger.error('[Welcome] Test welcome error:', {
            error: error.message,
            stack: error.stack?.substring(0, 500),
            response: error.response?.data
        });
        // Token 已消耗，不再嘗試回覆
        throw error;
    }
}

module.exports = {
    setWelcomeText,
    setWelcomeImage,
    handleMemberJoined,
    sendTestWelcome
};
