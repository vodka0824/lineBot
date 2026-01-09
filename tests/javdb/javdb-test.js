/**
 * JavDB 測試腳本
 * 
 * 使用方式:
 *   node javdb-test.js SSIS-001
 *   node javdb-test.js SSIS-001 ABP-123 STARS-456
 */

const { searchByCode, batchSearch } = require('./javdb-api');

// 解析命令列參數
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('❌ 請提供番號');
    console.log('\n使用方式:');
    console.log('  node javdb-test.js SSIS-001');
    console.log('  node javdb-test.js SSIS-001 ABP-123 STARS-456');
    process.exit(1);
}

// 格式化輸出
function printResult(result) {
    console.log('\n' + '='.repeat(60));

    if (result.success) {
        console.log('✅ 查詢成功');
        console.log(`📝 番號: ${result.data.code}`);
        console.log(`🎬 標題: ${result.data.title}`);
        console.log(`🖼️  封面: ${result.data.coverUrl}`);
        if (result.data.detailUrl) {
            console.log(`🔗 詳情: ${result.data.detailUrl}`);
        }
    } else {
        console.log('❌ 查詢失敗');
        console.log(`錯誤: ${result.error}`);
    }

    console.log('='.repeat(60));
}

// 執行測試
async function runTest() {
    console.log('🔍 JavDB 番號查詢測試\n');
    console.log(`⚠️  警告: 此工具僅供測試用途，請勿濫用\n`);

    if (args.length === 1) {
        // 單一查詢
        console.log(`查詢番號: ${args[0]}`);
        const result = await searchByCode(args[0]);
        printResult(result);
    } else {
        // 批次查詢
        console.log(`批次查詢 ${args.length} 個番號\n`);
        const results = await batchSearch(args);

        results.forEach((result, index) => {
            console.log(`\n[${index + 1}/${results.length}] ${args[index]}`);
            printResult(result);
        });

        // 統計
        const successCount = results.filter(r => r.success).length;
        console.log(`\n📊 統計: ${successCount}/${results.length} 成功`);
    }
}

// 執行並捕捉錯誤
runTest().catch(error => {
    console.error('\n💥 執行錯誤:', error);
    process.exit(1);
});
