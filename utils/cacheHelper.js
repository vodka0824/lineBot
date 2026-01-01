/**
 * 通用記憶體快取工具 (Simple Memory Cache)
 */
class CacheHelper {
    constructor(defaultTtl = 60 * 1000) {
        this.cache = new Map();
        this.defaultTtl = defaultTtl;
    }

    /**
     * 取得快取資料
     * @param {string} key 快取鍵值
     * @returns {any|null} 資料或 null (若不存在或過期)
     */
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        const now = Date.now();
        if (now > item.expiry) {
            this.cache.delete(key);
            return null;
        }

        return item.value;
    }

    /**
     * 設定快取資料
     * @param {string} key 快取鍵值
     * @param {any} value 資料
     * @param {number} ttl 存活時間 (毫秒)，未指定則使用預設值
     */
    set(key, value, ttl = null) {
        const expiry = Date.now() + (ttl || this.defaultTtl);
        this.cache.set(key, { value, expiry });
    }

    /**
     * 清除特定快取
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * 清除所有快取
     */
    clear() {
        this.cache.clear();
    }
}

module.exports = CacheHelper;
