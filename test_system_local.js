/**
 * 系統/管理員功能測試 (Local Mock)
 */

// 1. Mock Auth Utils
const authUtils = require('./utils/auth');
authUtils.isSuperAdmin = (userId) => userId === 'ADMIN001';
authUtils.createRegistrationCode = async (userId) => 'TEST-COD';
authUtils.registerGroup = async (code, groupId, userId) => {
    if (code === 'TEST-COD') return { success: true, message: '✅ 群組授權成功 (Mock)' };
    return { success: false, message: '❌ 無效驗證碼' };
};

// 2. Mock Line Utils
const lineUtils = require('./utils/line');
lineUtils.replyText = async (token, text) => {
    console.log(`[Reply] ${text}`);
};

// 3. Test Target
const systemHandler = require('./handlers/system');

async function test() {
    console.log('=== TEST 1: Admin Generate Code ===');
    console.log('Case 1.1: Non-Admin');
    await systemHandler.handleGenerateCode('USER001', 'token1');

    console.log('\nCase 1.2: Admin');
    await systemHandler.handleGenerateCode('ADMIN001', 'token2');

    console.log('\n=== TEST 2: Group Registration ===');
    console.log('Case 2.1: Invalid Code');
    await systemHandler.handleRegisterGroup('GROUP001', 'USER001', 'WRONG', 'token3');

    console.log('\nCase 2.2: Valid Code');
    await systemHandler.handleRegisterGroup('GROUP001', 'USER001', 'TEST-COD', 'token4');
}

test();
