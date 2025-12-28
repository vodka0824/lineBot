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
        const randomFileId = files[Math.floor(Math.random() * files.length)];
        return `https://lh3.googleusercontent.com/u/0/d/${randomFileId}=w1000`;
    }

    try {
        console.log(`[Drive API] 請求新清單: ${folderId}`);
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });
        const drive = google.drive({ version: 'v3', auth });

        const response = await drive.files.list({
            q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
            fields: 'files(id)',
            pageSize: 1000
        });

        const files = response.data.files;
        if (!files || files.length === 0) return null;

        const fileIds = files.map(f => f.id);
        driveCache.fileLists[folderId] = fileIds;
        driveCache.lastUpdated[folderId] = now;

        const randomFileId = fileIds[Math.floor(Math.random() * fileIds.length)];
        return `https://lh3.googleusercontent.com/u/0/d/${randomFileId}=w1000`;
    } catch (error) {
        console.error('[Drive API] Error:', error.message);
        return null;
    }
}

module.exports = {
    getRandomDriveImage
};
