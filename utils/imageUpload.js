const { Storage } = require('@google-cloud/storage');
const axios = require('axios');
const sizeOf = require('image-size');
const storage = new Storage();

// 使用專案 ID 作為 bucket 名稱（Cloud Run 會自動創建）
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'my-line-bot-482407_cloudbuild';
const LINE_CONTENT_API = 'https://api-data.line.me/v2/bot/message';

/**
 * 從 LINE 下載圖片
 */
async function downloadImageFromLine(messageId, lineToken) {
    const url = `${LINE_CONTENT_API}/${messageId}/content`;
    const response = await axios.get(url, {
        headers: {
            'Authorization': `Bearer ${lineToken}`
        },
        responseType: 'arraybuffer',
        timeout: 30000
    });

    return Buffer.from(response.data);
}

/**
 * 上傳圖片到 Firebase Storage
 */
async function uploadToStorage(buffer, destination) {
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(destination);

    await file.save(buffer, {
        metadata: {
            contentType: 'image/jpeg',
            cacheControl: 'public, max-age=31536000'
        }
    });

    // 設定為公開可讀
    await file.makePublic();

    // 取得公開 URL
    const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${destination}`;
    return publicUrl;
}

/**
 * 處理歡迎圖片上傳
 */
async function processWelcomeImage(messageId, groupId, lineToken) {
    try {
        console.log(`[ImageUpload] Processing welcome image for group ${groupId}`);

        // 1. 從 LINE 下載圖片
        const imageBuffer = await downloadImageFromLine(messageId, lineToken);

        // 檢查檔案大小（10MB 限制）
        const MAX_SIZE = 10 * 1024 * 1024;
        if (imageBuffer.length > MAX_SIZE) {
            return { success: false, error: '圖片檔案過大（最大 10MB）' };
        }

        // 2. 生成檔案路徑
        const currentPath = `welcome-images/${groupId}/current.jpg`;

        // 3. 計算圖片比例
        let aspectRatio = '1:1'; // Default
        try {
            const dimensions = sizeOf(imageBuffer);
            if (dimensions && dimensions.width && dimensions.height) {
                // Ensure integers and format as W:H
                aspectRatio = `${Math.round(dimensions.width)}:${Math.round(dimensions.height)}`;
            }
        } catch (e) {
            console.warn('[ImageUpload] Failed to calculate aspect ratio:', e);
        }

        // 4. 上傳到 Storage
        const publicUrl = await uploadToStorage(imageBuffer, currentPath);

        console.log(`[ImageUpload] Successfully uploaded to ${publicUrl}`);
        return { success: true, url: publicUrl, aspectRatio: aspectRatio };
    } catch (error) {
        console.error('[ImageUpload] Error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    processWelcomeImage,
    downloadImageFromLine,
    uploadToStorage
};
