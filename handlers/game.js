/**
 * 遊戲功能模組
 */
const { replyText } = require('../utils/line');

// === 剪刀石頭布 ===
async function handleRPS(replyToken, userChoice) {
    const choices = ['剪刀', '石頭', '布'];
    const emojis = { '剪刀': '✌️', '石頭': '✊', '布': '🖐️' };
    const botChoice = choices[Math.floor(Math.random() * 3)];

    let result;
    if (userChoice === botChoice) {
        result = '🤝 平手！';
    } else if (
        (userChoice === '剪刀' && botChoice === '布') ||
        (userChoice === '石頭' && botChoice === '剪刀') ||
        (userChoice === '布' && botChoice === '石頭')
    ) {
        result = '🎉 你贏了！';
    } else {
        result = '😢 你輸了！';
    }

    const msg = `${emojis[userChoice]} vs ${emojis[botChoice]}\n你：${userChoice}\n我：${botChoice}\n\n${result}`;
    await replyText(replyToken, msg);
}

module.exports = {
    handleRPS
};
