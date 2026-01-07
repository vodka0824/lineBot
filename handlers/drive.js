/**
 * Google Drive 隨機圖片模組
 */
const { google } = require('googleapis');
const { CACHE_DURATION, KEYWORD_MAP } = require('../config/constants');
const memoryCache = require('../utils/memoryCache'); // 整合 LRU Cache

const DRIVE_CACHE_DURATION = CACHE_DURATION.DRIVE; // 60 分鐘

/**
 * 初始化快取 (預取所有關鍵字的檔案清單)
 */
async function initDriveCache() {
    console.log('[Drive] Initializing Prefetch...');
    const folderIds = Object.values(KEYWORD_MAP);

    // Process in parallel
    const promises = folderIds.map(async (folderId) => {
        // We reuse getRandomDriveImage logic but just to trigger cache population.
        // But getRandomDriveImage returns a string. We just want the side effect (filling cache).
        // Let's refactor slightly or just call it? 
        // Calling it works fine. Ideally we separate "fetchList" logic but for minimal change:
        await getRandomDriveImage(folderId);
    });

    await Promise.all(promises);
    console.log(`[Drive] Prefetch Complete. Cached ${folderIds.length} folders.`);
}

/**
 * 從指定 Drive 資料夾隨機取得一張圖片 URL
 */
async function getRandomDriveImage(folderId) {
    const cacheKey = `drive_files_${folderId}`;
    const now = Date.now();

    // 檢查 Memory Cache
    const cached = memoryCache.get(cacheKey);
    if (cached) {
        console.log(`[Drive] Memory Cache HIT: ${cacheKey}`);

        // Stale-While-Revalidate: 接近過期時後台刷新
        const cacheAge = now - cached.timestamp;
        if (cacheAge > DRIVE_CACHE_DURATION * 0.9) {
            console.log(`[Drive] Cache aging (${Math.round(cacheAge / 60000)}min), triggering background refresh`);
            fetchDriveList(folderId).catch(err => console.error('[Drive] Background Refresh Fail', err));
        }

        const files = cached.files;
        if (!files || files.length === 0) return null;

        const randomFile = files[Math.floor(Math.random() * files.length)];
        const ext = randomFile.mimeType === 'image/png' ? '#.png' : '#.jpg';
        return `https://lh3.googleusercontent.com/u/0/d/${randomFile.id}=w1000${ext}`;
    }

    // ✅ Cache Miss: 同步等待 API 呼叫（改善冷啟動體驗）
    console.log(`[Drive] Cache MISS for ${cacheKey}. Fetching synchronously...`);
    const files = await fetchDriveList(folderId);

    if (!files || files.length === 0) {
        console.warn(`[Drive] No files found for ${folderId}`);
        return null;
    }

    // 立即返回隨機圖片
    const randomFile = files[Math.floor(Math.random() * files.length)];
    const ext = randomFile.mimeType === 'image/png' ? '#.png' : '#.jpg';
    return `https://lh3.googleusercontent.com/u/0/d/${randomFile.id}=w1000${ext}`;
}

async function fetchDriveList(folderId) {
    const cacheKey = `drive_files_${folderId}`;

    try {
        console.log(`[Drive API] Fetching List: ${folderId}`);
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });
        const drive = google.drive({ version: 'v3', auth });

        let allFiles = [];
        let pageToken = null;

        do {
            const response = await drive.files.list({
                q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
                fields: 'nextPageToken, files(id, mimeType)',
                pageSize: 1000,
                pageToken: pageToken
            });

            const files = response.data.files;
            if (files && files.length > 0) {
                const fileData = files.map(f => ({ id: f.id, mimeType: f.mimeType }));
                allFiles = allFiles.concat(fileData);
            }

            pageToken = response.data.nextPageToken;
            if (pageToken) {
                console.log(`[Drive API] Fetching next page for ${folderId} (Current total: ${allFiles.length})...`);
            }

        } while (pageToken);

        if (allFiles.length === 0) return null;

        console.log(`[Drive API] Total files fetched for ${folderId}: ${allFiles.length}`);

        // ✅ 更新 Memory Cache（TTL 60 分鐘）
        memoryCache.set(cacheKey, {
            files: allFiles,
            timestamp: Date.now()
        }, DRIVE_CACHE_DURATION / 1000); // 轉換為秒

        console.log(`[Drive] Cached ${allFiles.length} files to Memory: ${cacheKey}`);

        return allFiles;
    } catch (error) {
        console.error('[Drive API] Error:', error.message);
        return null;
    }
}

/**
 * 取得 Google Drive 即時檔案數量及狀態
 */
async function getRealTimeDriveStats() {
    console.log('[Drive] Starting real-time stats fetch...');
    const stats = {};

    // 平行處理所有資料夾的查詢
    const queries = Object.entries(KEYWORD_MAP).map(async ([key, folderId]) => {
        // 直接呼叫 fetchDriveList 強制刷新 (會更新快取)
        const files = await fetchDriveList(folderId);
        stats[key] = files ? files.length : 0;
    });

    try {
        await Promise.all(queries);
        console.log('[Drive] Real-time stats fetch complete.');
    } catch (error) {
        console.error('[Drive] Real-time stats fetch failed:', error);
    }

    return stats;
}

module.exports = {
    getRandomDriveImage,
    initDriveCache,
    getRealTimeDriveStats // Replaced getDriveCacheStats
};
