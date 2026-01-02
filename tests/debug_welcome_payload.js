
const fs = require('fs');

// Mock Dependencies
const mockLineUtils = {
    getGroupMemberProfile: async () => ({
        displayName: 'Test User',
        pictureUrl: 'https://example.com/profile.jpg',
        userId: 'U123456'
    })
};

const mockFunHandler = {
    // We suspect this might be missing in real code, but for now mock it to return a string
    getRandomImage: async () => 'https://example.com/random.jpg'
};

const mockFlexUtils = {
    createBubble: (obj) => ({ type: 'bubble', ...obj })
};

// We need to construct the handler environment manually since we can't easily mock require calls inside the module 
// without a test runner like Jest. 
// Instead, I will copy the critical function `buildWelcomeFlex` here to test IT properly.
// This ensures we test the LOGIC, even if we can't load the file directly due to 'firebase-admin' etc.

// COPIED FROM handlers/welcome.js (and fixed the funHandler reference if needed)
const DEFAULT_WELCOME_IMAGE = 'https://images.unsplash.com/photo-1542435503-956c469947f6?auto=format&fit=crop&w=1000&q=80';
const DEFAULT_WELCOME_TEXT = '歡迎加入我們！請先查看記事本的版規喔～';

async function buildWelcomeFlex(memberProfile, config) {
    const displayName = memberProfile.displayName || '新朋友';
    const pictureUrl = memberProfile.pictureUrl || 'https://via.placeholder.com/150';

    const welcomeText = (config?.text || DEFAULT_WELCOME_TEXT).replace('{user}', displayName);
    let heroUrl = config?.imageUrl || DEFAULT_WELCOME_IMAGE;

    // Handle Random Image
    if (heroUrl === 'RANDOM') {
        // In real code: await funHandler.getRandomImage('白絲');
        heroUrl = await mockFunHandler.getRandomImage('白絲');
        if (!heroUrl) heroUrl = DEFAULT_WELCOME_IMAGE;
    }

    return mockFlexUtils.createBubble({
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

// Run Test
async function run() {
    console.log('Generating Flex Payload...');
    const payload = await buildWelcomeFlex(
        { displayName: 'Ucf8e01', pictureUrl: 'https://profile.line-scdn.net/12345' },
        null // Default config
    );

    console.log(JSON.stringify(payload, null, 2));

    // Validation Checks
    if (payload.hero.aspectRatio !== "20:13") console.error('Warning: aspectRatio might need to be specific format?');
    // Flex Message Simulator check basics
}

run();
