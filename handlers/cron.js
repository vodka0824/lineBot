/**
 * 排程任務處理器 (Cron Jobs)
 * 供 Cloud Scheduler 呼叫
 */
const horoscopeHandler = require('./horoscope');

// 簡單的 API Key 驗證，避免被惡意觸發 (雖然 Cloud Scheduler 可以設 OIDC，但簡單 Key 也很有效)
const CRON_KEY = process.env.CRON_KEY || 'SECRET_CRON_KEY'; // 務必在 Env 設定

async function handleHoroscopePrefetch(req, res) {
    const { key, type } = req.query;

    if (key !== CRON_KEY) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!['daily', 'weekly', 'monthly'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type. Use daily, weekly, or monthly.' });
    }

    try {
        console.log(`[Cron] 開始執行運勢預抓取: ${type}`);
        const results = await horoscopeHandler.prefetchAll(type);
        console.log(`[Cron] 完成預抓取: ${type}, 成功: ${results.success}, 失敗: ${results.failed}`);
        res.json({ success: true, results });
    } catch (error) {
        console.error('[Cron] 執行失敗:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    handleHoroscopePrefetch
};
