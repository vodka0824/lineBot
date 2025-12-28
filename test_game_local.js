const game = require('./handlers/game');
const line = require('./utils/line');

// Mock replyText to capture output instead of calling API
line.replyText = async (token, text) => {
    console.log(`\n[Mock Reply] Token: ${token}`);
    console.log(`Text:\n${text}`);
};

async function test() {
    console.log('=== 開始測試遊戲模組 ===');

    console.log('\n[1/3] User: 剪刀');
    await game.handleRPS('token1', '剪刀');

    console.log('\n[2/3] User: 石頭');
    await game.handleRPS('token2', '石頭');

    console.log('\n[3/3] User: 布');
    await game.handleRPS('token3', '布');

    console.log('\n=== 測試結束 ===');
}

test();
