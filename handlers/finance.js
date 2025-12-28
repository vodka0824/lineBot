/**
 * 分期計算模組
 */
const lineUtils = require('../utils/line');

/**
 * 分唄/銀角分期計算
 */
async function handleFinancing(replyToken, amount, type) {
    let results = [];

    if (type === 'fenbei') {
        // 分唄利率對照表
        const rates = {
            6: 0.1745,
            9: 0.11833,
            12: 0.09041,
            15: 0.07366,
            18: 0.06277,
            21: 0.05452,
            24: 0.04833,
            30: 0.04
        };
        results = [6, 9, 12, 15, 18, 21, 24, 30].map(term => {
            const monthly = Math.floor(amount * rates[term]);
            return `${term}期: ${monthly} 元/期 (總額: ${monthly * term})`;
        });
    } else {
        // 銀角利率對照表
        const rates = {
            3: 1.026,
            6: 1.04,
            9: 1.055,
            12: 1.065,
            18: 1.09,
            24: 1.115
        };
        results = Object.keys(rates).map(term => {
            const total = Math.round(amount * rates[term]);
            return `${term}期: ${Math.round(total / term)} 元/期 (總額: ${total})`;
        });
    }

    await lineUtils.replyText(replyToken, `💰 分期試算\n原價: ${amount}\n\n${results.join('\n')}`);
}

/**
 * 刷卡分期計算
 */
async function handleCreditCard(replyToken, amount) {
    const isSmall = amount * 0.0249 < 498;

    const calc = (rate, term) => {
        const total = Math.round(amount * rate + (isSmall ? 0 : 498));
        return `${term}期: ${Math.round(total / term)} 元/期 (總額: ${total})`;
    };

    let msg = '';
    if (isSmall) {
        msg = `💳 刷卡分期試算\n原價: ${amount}\n\n`;
        msg += `付清: ${Math.round(amount * 1.0449)}\n`;
        msg += calc(1.0549, 3) + '\n';
        msg += calc(1.0599, 6) + '\n';
        msg += calc(1.0849, 12) + '\n';
        msg += calc(1.0849, 24);
    } else {
        msg = `💳 刷卡分期試算\n原價: ${amount}\n\n`;
        msg += `付清: ${Math.round(amount * 1.02) + 498}\n`;
        msg += calc(1.03, 3) + '\n';
        msg += calc(1.035, 6) + '\n';
        msg += calc(1.06, 12) + '\n';
        msg += calc(1.06, 24);
    }

    await lineUtils.replyText(replyToken, msg);
}

module.exports = {
    handleFinancing,
    handleCreditCard
};
