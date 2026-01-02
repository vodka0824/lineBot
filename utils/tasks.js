/**
 * Cloud Tasks 工具模組
 * 用於建立非同步背景任務，降低 webhook 回應時間
 */
const { CloudTasksClient } = require('@google-cloud/tasks');

// 環境變數
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
const LOCATION = process.env.CLOUD_TASKS_LOCATION || 'asia-east1';
const QUEUE_NAME = process.env.CLOUD_TASKS_QUEUE || 'linebot-tasks';
const SERVICE_URL = process.env.CLOUD_RUN_SERVICE_URL;

// Client 初始化
const client = new CloudTasksClient();

/**
 * 建立 Cloud Task
 * @param {string} handlerName - Handler 名稱 (e.g., 'horoscope', 'crawler')
 * @param {Object} params - Handler 參數
 * @param {number} delaySeconds - 延遲秒數（選填，預設 0）
 * @returns {Promise<boolean>} - Returns true if task created successfully, false otherwise
 */
async function createTask(handlerName, params, delaySeconds = 0) {
    // Check if Cloud Tasks is configured
    if (!PROJECT_ID || !SERVICE_URL) {
        console.warn('[CloudTasks] Not configured (missing PROJECT_ID or SERVICE_URL)');
        // Return false to signal that task was not created
        return false;
    }

    try {
        const queuePath = client.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);

        const task = {
            httpRequest: {
                httpMethod: 'POST',
                url: `${SERVICE_URL}/worker`,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: Buffer.from(JSON.stringify({
                    handlerName,
                    params
                })).toString('base64'),
            },
        };

        // 如果有延遲，設定 scheduleTime
        if (delaySeconds > 0) {
            const scheduleTime = new Date();
            scheduleTime.setSeconds(scheduleTime.getSeconds() + delaySeconds);
            task.scheduleTime = {
                seconds: scheduleTime.getTime() / 1000,
            };
        }

        const [response] = await client.createTask({ parent: queuePath, task });
        console.log(`[CloudTasks] Created task: ${response.name} for handler: ${handlerName}`);

        return true;
    } catch (error) {
        console.error('[CloudTasks] Failed to create task:', error.message);
        // Return false to signal failure
        return false;
    }
}

/**
 * 批次建立多個任務
 * @param {Array<{handlerName: string, params: Object}>} tasks
 */
async function createBatchTasks(tasks) {
    const promises = tasks.map(({ handlerName, params, delaySeconds }) =>
        createTask(handlerName, params, delaySeconds)
    );

    return Promise.allSettled(promises);
}

module.exports = {
    createTask,
    createBatchTasks
};
