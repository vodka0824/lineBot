const funHandler = require('../handlers/fun.js');

// Mock context minimal
const context = {
    replyToken: 'test_token',
    groupId: 'test_group',
    userId: 'test_user',
    isGroup: true,
    isAuthorizedGroup: true
};

// Mock lineUtils
const lineUtils = require('../utils/line.js');
lineUtils.replyToLine = async (token, messages) => {
    if (messages[0].type === 'image') {
        console.log(`✅ SUCCESS! Image URL: ${messages[0].originalContentUrl}`);
    } else {
        console.log(`❓ Unexpected message type: ${JSON.stringify(messages)}`);
    }
};
lineUtils.replyText = async (token, text) => {
    console.log(`❌ FAILURE! Reply Text: ${text}`);
};

async function test() {
    console.log('Testing White Silk...');
    try {
        await funHandler.handleRandomImage(context, '白絲');
    } catch (e) {
        console.log(`❌ CRASH: ${e.message}`);
    }
}

test();
