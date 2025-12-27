/**
 * 通用快取類別
 */
class CachedCheck {
    constructor(duration) {
        this.cache = new Set();
        this.lastUpdated = 0;
        this.duration = duration;
    }

    /**
     * 檢查快取是否過期
     */
    isExpired() {
        return Date.now() - this.lastUpdated > this.duration;
    }

    /**
     * 更新快取
     */
    update(items) {
        this.cache = new Set(items);
        this.lastUpdated = Date.now();
    }

    /**
     * 檢查是否存在
     */
    has(id) {
        return this.cache.has(id);
    }

    /**
     * 新增項目
     */
    add(id) {
        this.cache.add(id);
    }

    /**
     * 清除快取
     */
    clear() {
        this.cache.clear();
        this.lastUpdated = 0;
    }
}

module.exports = { CachedCheck };
