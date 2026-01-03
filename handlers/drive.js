/**
 * Google Drive 隨機圖片模組
 */
const { google } = require('googleapis');
const { CACHE_DURATION, KEYWORD_MAP } = require('../config/constants');

// 快取記憶體
let driveCache = {
    lastUpdated: {},
    fileLists: {}
};
const DRIVE_CACHE_DURATION = CACHE_DURATION.DRIVE;

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
    const now = Date.now();

    // 檢查快取
    if (driveCache.fileLists[folderId] &&
        driveCache.lastUpdated[folderId] &&
        (now - driveCache.lastUpdated[folderId] < DRIVE_CACHE_DURATION)) {

        // Check if allow background refresh (e.g. if cache is > 50 mins old)
        // This is "Stale-While-Revalidate" optimization
        if (now - driveCache.lastUpdated[folderId] > DRIVE_CACHE_DURATION * 0.9) {
            // Trigger background refresh
            fetchDriveList(folderId).catch(err => console.error('[Drive] Background Refresh Fail', err));
        }

        const files = driveCache.fileLists[folderId];
        const randomFile = files[Math.floor(Math.random() * files.length)];
        // Determine extension based on cached mimeType
        // Backward compatibility: if cache has strings (old version), default to .jpg
        if (typeof randomFile === 'string') {
            return `https://lh3.googleusercontent.com/u/0/d/${randomFile}=w1000#.jpg`;
        }
        const ext = randomFile.mimeType === 'image/png' ? '#.png' : '#.jpg';
        return `https://lh3.googleusercontent.com/u/0/d/${randomFile.id}=w1000${ext}`;
    }

    // Cache Miss or Expired
    const fileData = await fetchDriveList(folderId);
    if (!fileData) return null;

    const randomFile = fileData[Math.floor(Math.random() * fileData.length)];
    const ext = randomFile.mimeType === 'image/png' ? '#.png' : '#.jpg';

    return `https://lh3.googleusercontent.com/u/0/d/${randomFile.id}=w1000${ext}`;
}

async function fetchDriveList(folderId) {
    try {
        console.log(`[Drive API] Fetching List: ${folderId}`);
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });
        const drive = google.drive({ version: 'v3', auth });

        const response = await drive.files.list({
            q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
            fields: 'files(id, mimeType)',
            pageSize: 1000
        });

        const files = response.data.files;
        if (!files || files.length === 0) return null;

        // Cache objects {id, mimeType} instead of just IDs
        const fileData = files.map(f => ({ id: f.id, mimeType: f.mimeType }));
        driveCache.fileLists[folderId] = fileData;
        driveCache.lastUpdated[folderId] = Date.now();

        return fileData;
    } catch (error) {
        console.error('[Drive API] Error:', error.message);
        return null;
    }
}

/**
 * 取得目前圖庫快取狀態
 */
function getDriveCacheStats() {
    const stats = {};
    for (const [folderId, files] of Object.entries(driveCache.fileLists)) {
        // Find key name from ID (Reverse lookup)
        const name = Object.keys(KEYWORD_MAP).find(key => KEYWORD_MAP[key] === folderId) || folderId;
        stats[name] = files ? files.length : 0;
    }
    return stats;
}

module.exports = {
    getRandomDriveImage,
    initDriveCache,
    getDriveCacheStats
};
