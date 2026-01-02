/**
 * Rate Limiting 測試
 */
const rateLimit = require('../utils/rateLimit');

describe('Rate Limiting', () => {
    beforeEach(() => {
        // 每次測試前清理
        const { resetRateLimit } = rateLimit;
        // 注意：實際上 rateLimit 使用 Map，我們需要手動清理或重新載入模組
    });

    test('should allow requests within limit', () => {
        const userId = 'test_user_1_' + Date.now();
        const action = 'test_action';

        expect(rateLimit.checkRateLimit(userId, action, 3, 60000)).toBe(true);
        expect(rateLimit.checkRateLimit(userId, action, 3, 60000)).toBe(true);
        expect(rateLimit.checkRateLimit(userId, action, 3, 60000)).toBe(true);
    });

    test('should block requests exceeding limit', () => {
        const userId = 'test_user_2_' + Date.now();
        const action = 'test_action';

        // 使用完配額
        rateLimit.checkRateLimit(userId, action, 3, 60000);
        rateLimit.checkRateLimit(userId, action, 3, 60000);
        rateLimit.checkRateLimit(userId, action, 3, 60000);

        // 第4次應該被拒絕
        expect(rateLimit.checkRateLimit(userId, action, 3, 60000)).toBe(false);
    });

    test('should return correct remaining quota', () => {
        const userId = 'test_user_3_' + Date.now();
        const action = 'test_action';
        const limit = 5;

        expect(rateLimit.getRemainingQuota(userId, action, limit, 60000)).toBe(5);

        rateLimit.checkRateLimit(userId, action, limit, 60000);
        expect(rateLimit.getRemainingQuota(userId, action, limit, 60000)).toBe(4);

        rateLimit.checkRateLimit(userId, action, limit, 60000);
        expect(rateLimit.getRemainingQuota(userId, action, limit, 60000)).toBe(3);
    });

    test('should reset user rate limit', () => {
        const userId = 'test_user_4_' + Date.now();
        const action = 'test_action';

        // 使用配額
        rateLimit.checkRateLimit(userId, action, 2, 60000);
        rateLimit.checkRateLimit(userId, action, 2, 60000);
        expect(rateLimit.checkRateLimit(userId, action, 2, 60000)).toBe(false);

        // 重置
        rateLimit.resetRateLimit(userId, action);

        // 應該可以再次使用
        expect(rateLimit.checkRateLimit(userId, action, 2, 60000)).toBe(true);
    });

    test('should use predefined limits correctly', () => {
        const userId = 'test_user_5_' + Date.now();

        // 測試預設的 AI 限制（10次/分鐘）
        expect(rateLimit.checkLimit(userId, 'ai')).toBe(true);

        // 測試預設的爬蟲限制（5次/分鐘）
        expect(rateLimit.checkLimit(userId, 'crawler')).toBe(true);
    });
});
