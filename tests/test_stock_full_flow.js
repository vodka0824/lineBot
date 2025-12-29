const stockHandler = require('../handlers/stock');
const lineUtils = require('../utils/line'); // We will mock this or rely on it failing if no token
const assert = require('assert');

// Mock lineUtils
const replies = [];
lineUtils.replyText = async (token, text) => {
    console.log(`[Mock ReplyText] Token: ${token}, Text: ${text}`);
    replies.push({ type: 'text', text });
};
lineUtils.replyFlex = async (token, alt, flex) => {
    console.log(`[Mock ReplyFlex] Token: ${token}, Alt: ${alt}`);
    // console.log(JSON.stringify(flex, null, 2));
    replies.push({ type: 'flex', alt, flex });
};

async function testFullFlow() {
    console.log("Starting Full Flow Test for Stock Analysis...");

    // Test case: Analyze 2330
    const replyToken = 'test-token';
    const query = '2330';

    try {
        await stockHandler.handleStockAnalysis(replyToken, query);

        // Assertions
        const loadingMsg = replies.find(r => r.type === 'text' && r.text.includes('正在分析'));
        assert(loadingMsg, "Should send loading message");

        const flexMsg = replies.find(r => r.type === 'flex');
        assert(flexMsg, "Should send Flex Message result");

        const flexBody = flexMsg.flex.body.contents;
        // Check for specific fields
        const title = flexBody.find(c => c.text && c.text.includes('技術指標分析'));
        assert(title, "Flex should have title");

        const stockName = flexBody.find(c => c.text && c.text.includes('2330'));
        assert(stockName, "Flex should contain stock code");

        console.log("Full Flow Test PASSED! Received Flex Message with analysis.");

    } catch (e) {
        console.error("Test Failed:", e);
        process.exit(1);
    }
}

testFullFlow();
