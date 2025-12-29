const funHandler = require('../handlers/fun.js');
const lineUtils = require('../utils/line.js');

// Mock lineUtils
lineUtils.replyText = async (token, text) => {
    console.log(`[Mock Reply] Token: ${token}, Text: ${text}`);
};
lineUtils.replyToLine = async (token, messages) => {
    console.log(`[Mock ReplyToLine] Token: ${token}, Messages: ${JSON.stringify(messages)}`);
};

// Mock Context
const context = {
    replyToken: 'mock_token',
    groupId: 'mock_group',
    userId: 'mock_user',
    isGroup: true,
    isAuthorizedGroup: true
};

async function test() {
    console.log('--- Testing 白絲 (White Silk) ---');
    try {
        await funHandler.handleRandomImage(context, '白絲');
        console.log('✅ 白絲 OK');
    } catch (error) {
        console.error('❌ 白絲 Failed:', error);
    }
}

test();
