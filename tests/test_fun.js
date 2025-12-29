const assert = require('assert');
const funHandler = require('../handlers/fun');

// Mock Data
const MOCK_CONTEXT = {
    replyToken: 'R_TEST',
    messageObject: {
        type: 'text',
        text: '狂標 @Teser 3',
        mention: {
            mentions: [
                { index: 3, length: 6, userId: 'U_TARGET' }
            ]
        }
    }
};

const MOCK_MATCH = ['狂標 3', ' 3', '3'];

// Mock Line Utils
const lineUtils = {
    replyToLine: async (token, messages) => {
        console.log(`[Mock] replyToLine called with ${messages.length} messages`);
        console.log(JSON.stringify(messages, null, 2));

        // Assertions
        assert.strictEqual(token, 'R_TEST');
        assert.strictEqual(messages.length, 3); // Requested 3
        assert.strictEqual(messages[0].text, '起來嗨！ @Target');
        assert.strictEqual(messages[0].mention.mentions[0].userId, 'U_TARGET');
        return true;
    },
    replyText: async (token, text) => {
        console.log(`[Mock] replyText: ${text}`);
    }
};

// Inject Mock
funHandler.lineUtils = lineUtils; // This won't work simply because we required it inside fun.js.
// Since modules are cached and require is sync, we can't easily mock internal requires without tools like proxyquire or jest.
// For this simple script, let's redefine the method on the required lineUtils instance if possible, 
// BUT fun.js requires '../utils/line'. We can modify the cache or just rely on manual inspection logic if we can't mock.

// Hacky Mock Strategy: modifying the prototype or the object in the cache if possible.
// Or we just modify the test to require the actual utils and overwrite its methods.
const realLineUtils = require('../utils/line');
realLineUtils.replyToLine = lineUtils.replyToLine;
realLineUtils.replyText = lineUtils.replyText;

// Test Execution
async function runTest() {
    console.log('=== Test Tag Blast ===');
    await funHandler.handleTagBlast(MOCK_CONTEXT, MOCK_MATCH);
    console.log('PASS: Tag Blast Logic Verified');
}

runTest().catch(console.error);
