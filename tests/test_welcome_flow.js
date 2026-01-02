
// Mock Dependencies
const mockLineUtils = {
    replyText: async (token, text) => { console.log(`[Reply] ${text}`); },
    replyFlex: async () => { }
};

// Mock Welcome Handler
const mockWelcomeHandler = {
    setWelcomeText: async (groupId, text, userId) => {
        console.log(`[Mock] setWelcomeText called with: ${text}`);
        return { success: true, message: `Text updated: ${text}` };
    },
    setWelcomeImage: async (groupId, url, userId) => {
        console.log(`[Mock] setWelcomeImage called with: ${url}`);
        return { success: true, message: `Image updated: ${url}` };
    },
    sendTestWelcome: async () => { console.log('[Mock] sendTestWelcome called'); },
    handleMemberJoined: async () => { }
};

// Mock Router
const mockRouter = {
    handlers: [],
    register: function (match, handler, options) {
        this.handlers.push({ match, handler, options });
    },
    registerPostback: function (match, handler) {
        this.handlers.push({ match, handler, type: 'postback' });
    }
};

try {
    const registerRoutes = require('../handlers/routes');

    // Mock handlers object
    const handlers = {
        financeHandler: {}, currencyHandler: {}, systemHandler: {}, weatherHandler: {},
        todoHandler: {}, restaurantHandler: {}, lotteryHandler: {}, taigiHandler: {},
        leaderboardHandler: {}, driveHandler: {}, crawlerHandler: {}, aiHandler: {},
        gameHandler: {}, lineUtils: mockLineUtils, settingsHandler: {},
        funHandler: {}, tcatHandler: {}, horoscopeHandler: {},
        welcomeHandler: mockWelcomeHandler
    };

    console.log('--- Registering Routes ---');
    registerRoutes(mockRouter, handlers);

    console.log('--- Testing Config Commands ---');

    // Test 1: Set Welcome Text
    const textRoute = mockRouter.handlers.find(h => h.match === '設定歡迎詞');
    if (textRoute) {
        const ctx = { replyToken: 't1', groupId: 'g1', userId: 'u1', message: '設定歡迎詞 Hello World' };
        textRoute.handler(ctx); // Async, but we just log
    } else {
        console.error('❌ Route "設定歡迎詞" not found');
    }

    // Test 2: Set Welcome Image
    const imgRoute = mockRouter.handlers.find(h => h.match === '設定歡迎圖');
    if (imgRoute) {
        const ctx = { replyToken: 't2', groupId: 'g1', userId: 'u1', message: '設定歡迎圖 https://test.com/img.jpg' };
        imgRoute.handler(ctx);
    } else {
        console.error('❌ Route "設定歡迎圖" not found');
    }

} catch (err) {
    console.error('❌ Test execution failed:', err);
    process.exit(1);
}
