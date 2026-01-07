const { Firestore } = require('@google-cloud/firestore');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const authUtils = require('../utils/auth');
const logger = require('../utils/logger');

const db = new Firestore();

// Default Configuration
const DEFAULT_WELCOME_IMAGE = 'https://images.unsplash.com/photo-1542435503-956c469947f6?auto=format&fit=crop&w=1000&q=80';
const DEFAULT_WELCOME_TEXT = '歡迎加入我們！請先查看記事本的版規喔～';

// Random Welcome Images Collection
const WELCOME_IMAGES = [
    'https://images.unsplash.com/photo-1542435503-956c469947f6?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1000&q=80'
];

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

    // 使用欄位級別更新，避免覆蓋其他配置
    await db.collection('groups').doc(groupId).set({
        'welcomeConfig.text': text,
        'welcomeConfig.updatedAt': Firestore.FieldValue.serverTimestamp(),
        'welcomeConfig.updatedBy': userId
    }, { merge: true });

    return { success: true, message: '✅ 歡迎詞已更新！' };
}

/**
 * 設定歡迎圖
 */
async function setWelcomeImage(groupId, url, userId) {
    // URL Check? Simple start with http
    const isRandom = url === '隨機' || url === 'RANDOM';
    const finalUrl = isRandom ? 'RANDOM' : url;

    if (!isRandom && !url.startsWith('http')) {
        return { success: false, message: '❌ 請輸入有效的圖片網址 (http/https)' };
    }

    // 使用欄位級別更新，避免覆蓋其他配置
    await db.collection('groups').doc(groupId).set({
        'welcomeConfig.imageUrl': finalUrl,
        'welcomeConfig.updatedAt': Firestore.FieldValue.serverTimestamp(),
        'welcomeConfig.updatedBy': userId
    }, { merge: true });

    return { success: true, message: `✅ 歡迎圖已更新為：${isRandom ? '隨機美圖' : '指定圖片'}` };
}

/**
 * 建構歡迎 Flex Message
 */
async function buildWelcomeFlex(memberProfile, config) {
    const displayName = memberProfile.displayName || '新朋友';
    // Use a more reliable placeholder service
    const pictureUrl = memberProfile.pictureUrl || 'https://dummyimage.com/200x200/cccccc/ffffff.png&text=User';

    const welcomeText = (config?.text || DEFAULT_WELCOME_TEXT).replace('{user}', displayName);
    let heroUrl = config?.imageUrl || DEFAULT_WELCOME_IMAGE;

    // Handle Random Image
    if (heroUrl === 'RANDOM') {
        heroUrl = WELCOME_IMAGES[Math.floor(Math.random() * WELCOME_IMAGES.length)];
    }

    // Safety: Ensure URL is valid for LINE (HTTPS)
    if (!heroUrl || !heroUrl.startsWith('http')) {
        heroUrl = DEFAULT_WELCOME_IMAGE;
    }

    if (heroUrl.startsWith('http:')) {
        heroUrl = heroUrl.replace(/^http:/, 'https:');
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
                            cornerRadius: "100px",
                            flex: 0 // Fixed size
                        },
                        {
                            type: "box",
                            layout: "vertical",
                            contents: [
                                { type: 'text', text: `Hi, ${displayName}`, weight: 'bold', size: 'lg', wrap: true },
                                { type: 'text', text: '很高興認識你！', size: 'xs', color: '#888888' }
                            ],
                            justifyContent: "center",
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
                    await lineUtils.replyFlex(replyToken, '歡迎新成員！', bubbles[0]);
                } catch (flexError) {
                    logger.warn('[Welcome] Flex reply failed, falling back to text', flexError);
                    // Fallback to text
                    const simpleText = (config?.text || DEFAULT_WELCOME_TEXT).replace('{user}', '新朋友');
                    await lineUtils.replyText(replyToken, simpleText + '\n(歡迎圖顯示失敗)');
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

        // 嘗試獲取用戶資料，失敗則使用預設值
        let profile = {
            displayName: '測試用戶',
            pictureUrl: 'https://via.placeholder.com/150'
        };

        try {
            profile = await lineUtils.getGroupMemberProfile(groupId, userId);
        } catch (error) {
            console.warn('[Welcome] Failed to get user profile, using fallback:', error.message);
        }

        const bubble = await buildWelcomeFlex(profile, config);
        await lineUtils.replyFlex(replyToken, '測試歡迎卡', bubble);
    } catch (error) {
        console.error('[Welcome] Test welcome error:', error);
        await lineUtils.replyText(replyToken, '❌ 測試歡迎卡失敗，請稍後再試');
    }
}

module.exports = {
    setWelcomeText,
    setWelcomeImage,
    handleMemberJoined,
    sendTestWelcome
};
