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
 */
async function createTask(handlerName, params, delaySeconds = 0) {
    if (!PROJECT_ID) {
        console.warn('[CloudTasks] PROJECT_ID not set, task will not be created');
        return;
    }

    if (!SERVICE_URL) {
        console.warn('[CloudTasks] SERVICE_URL not set, task will not be created');
        return;
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

        return response;
    } catch (error) {
        console.error('[CloudTasks] Failed to create task:', error.message);
        // 不拋出錯誤，避免影響主流程
        // 若 Cloud Tasks 失敗，至少 webhook 還能正常回應
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
