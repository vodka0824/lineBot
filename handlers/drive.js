/**
 * Google Drive 隨機圖片模組
 */
const { google } = require('googleapis');
const { CACHE_DURATION } = require('../config/constants');

// 快取記憶體
let driveCache = {
    lastUpdated: {},
    fileLists: {}
};
const DRIVE_CACHE_DURATION = CACHE_DURATION.DRIVE;

/**
 * 從指定 Drive 資料夾隨機取得一張圖片 URL
 */
async function getRandomDriveImage(folderId) {
    const now = Date.now();

    // 檢查快取
    if (driveCache.fileLists[folderId] &&
        driveCache.lastUpdated[folderId] &&
        (now - driveCache.lastUpdated[folderId] < DRIVE_CACHE_DURATION)) {
        console.log(`[Drive Cache] 命中快取: ${folderId}`);
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

    try {
        console.log(`[Drive API] 請求新清單: ${folderId}`);
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
        driveCache.lastUpdated[folderId] = now;

        const randomFile = fileData[Math.floor(Math.random() * fileData.length)];
        const ext = randomFile.mimeType === 'image/png' ? '#.png' : '#.jpg';

        return `https://lh3.googleusercontent.com/u/0/d/${randomFile.id}=w1000${ext}`;
    } catch (error) {
        console.error('[Drive API] Error:', error.message);
        return null;
    }
}

module.exports = {
    getRandomDriveImage
};
