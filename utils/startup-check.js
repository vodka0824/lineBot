/**
 * 啟動環境檢查模組
 * 
 * 在應用程式啟動時驗證所有必要的環境變數
 * 如果缺少任何必要的環境變數，應用程式將無法啟動
 */

// 必要的環境變數及其說明
const REQUIRED_ENV_VARS = {
    'LINE_TOKEN': 'LINE Bot Channel Access Token',
    'CHANNEL_ACCESS_TOKEN': 'LINE Bot Channel Access Token (alternative)',
    'GOOGLE_CLOUD_PROJECT': 'Google Cloud Project ID',
    'ADMIN_USER_ID': 'LINE Bot Admin User ID'
};

// 建議但非必要的環境變數
const OPTIONAL_ENV_VARS = {
    'GEMINI_KEY': 'Google Gemini API Key (for AI features)',
    'CWA_API_KEY': 'Central Weather Administration API Key',
    'GOOGLE_PLACES_API_KEY': 'Google Places API Key',
    'MOENV_API_KEY': 'Ministry of Environment API Key',
    'CRON_KEY': 'Cron Job Secret Key',
    'PREFETCH_SECRET': 'Prefetch Secret Key'
};

/**
 * 驗證環境變數
 * @returns {boolean} 是否通過驗證
 */
function validateEnvironment() {
    console.log('\n========================================');
    console.log('🔍 LINE Bot Startup Environment Check');
    console.log('========================================\n');

    const missing = [];
    const warnings = [];

    // 檢查必要環境變數
    console.log('📋 Checking required environment variables...\n');

    for (const [key, description] of Object.entries(REQUIRED_ENV_VARS)) {
        // LINE_TOKEN 和 CHANNEL_ACCESS_TOKEN 只需要其中一個
        if (key === 'CHANNEL_ACCESS_TOKEN' && process.env.LINE_TOKEN) {
            console.log(`  ✅ ${key} (using LINE_TOKEN instead)`);
            continue;
        }

        if (key === 'LINE_TOKEN' && process.env.CHANNEL_ACCESS_TOKEN) {
            console.log(`  ✅ ${key} (using CHANNEL_ACCESS_TOKEN instead)`);
            continue;
        }

        if (!process.env[key]) {
            missing.push(`${key} - ${description}`);
            console.log(`  ❌ ${key} - MISSING`);
        } else {
            console.log(`  ✅ ${key}`);
        }
    }

    // 檢查可選環境變數
    console.log('\n📋 Checking optional environment variables...\n');

    for (const [key, description] of Object.entries(OPTIONAL_ENV_VARS)) {
        if (!process.env[key]) {
            warnings.push(`${key} - ${description}`);
            console.log(`  ⚠️  ${key} - NOT SET (${description})`);
        } else {
            console.log(`  ✅ ${key}`);
        }
    }

    // 檢查結果
    console.log('\n========================================');

    if (missing.length > 0) {
        console.log('❌ STARTUP CHECK FAILED\n');
        console.log('Missing required environment variables:\n');
        missing.forEach(item => console.log(`  - ${item}`));
        console.log('\nPlease set these variables and restart the application.');
        console.log('See .env.example for reference.');
        console.log('========================================\n');
        return false;
    }

    if (warnings.length > 0) {
        console.log('⚠️  STARTUP CHECK PASSED (with warnings)\n');
        console.log('Optional environment variables not set:');
        console.log('(Some features may be disabled)\n');
        warnings.forEach(item => console.log(`  - ${item}`));
    } else {
        console.log('✅ STARTUP CHECK PASSED');
        console.log('All environment variables are properly configured!');
    }

    console.log('========================================\n');
    return true;
}

/**
 * 執行環境檢查，如果失敗則退出程序
 */
function validateOrExit() {
    if (!validateEnvironment()) {
        console.error('Application startup aborted due to missing environment variables.');
        process.exit(1);
    }
}

module.exports = {
    validateEnvironment,
    validateOrExit
};
