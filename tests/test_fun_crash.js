const funHandler = require('../handlers/fun.js');
const lineUtils = require('../utils/line.js');

// Mock lineUtils to avoid real API calls
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
    console.log('--- Testing 腳控 (JSON) ---');
    try {
        await funHandler.handleRandomImage(context, '腳控');
        console.log('✅ 腳控 OK');
    } catch (error) {
        console.error('❌ 腳控 Failed:', error);
    }

    console.log('\n--- Testing 黑絲 (Redirect) ---');
    try {
        await funHandler.handleRandomImage(context, '黑絲');
        console.log('✅ 黑絲 OK');
    } catch (error) {
        console.error('❌ 黑絲 Failed:', error);
    }
}

test();
