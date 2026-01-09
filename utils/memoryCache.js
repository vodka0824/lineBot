/**
 * LRU Memory Cache with TTL support
 * 用於減少 Firestore 讀取與外部 API 呼叫，提升回應速度並降低 Cloud Run CPU 使用
 */

class LRUCache {
    /**
     * @param {number} maxSize - 最大快取項目數（預設 100）
     */
    constructor(maxSize = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.hits = 0;
        this.misses = 0;
    }

    /**
     * 取得快取值
     * @param {string} key - 快取鍵值
     * @returns {*} 快取的值，若不存在或過期則返回 null
     */
    get(key) {
        if (!this.cache.has(key)) {
            this.misses++;
            return null;
        }

        const item = this.cache.get(key);

        // 檢查是否過期
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            this.misses++;
            return null;
        }

        // LRU: 移到最後（最近使用）
        this.cache.delete(key);
        this.cache.set(key, item);
        this.hits++;
        return item.value;
    }

    /**
     * 設定快取值
     * @param {string} key - 快取鍵值
     * @param {*} value - 要快取的值
     * @param {number} ttlSeconds - 存活時間（秒），預設 300 秒（5 分鐘）
     */
    set(key, value, ttlSeconds = 300) {
        // 如果已存在,先刪除(更新)
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // 如果超過最大容量,淘汰最舊的項目(第一個)
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, {
            value,
            expiry: Date.now() + (ttlSeconds * 1000)
        });
    }

    /**
     * 刪除快取項目
     * @param {string} key - 快取鍵值
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * 清除所有快取
     */
    clear() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }

    /**
     * 取得快取統計資訊
     * @returns {object} 統計資訊
     */
    getStats() {
        const total = this.hits + this.misses;
        const hitRate = total > 0 ? (this.hits / total * 100).toFixed(2) : 0;

        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: `${hitRate}%`
        };
    }
}

// 建立全域單例實例 (容量從 100 調整至 200 以支援延長的 TTL)
const memoryCache = new LRUCache(200);

module.exports = memoryCache;
