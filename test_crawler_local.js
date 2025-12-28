const crawler = require('./handlers/crawler');

async function test() {
    console.log('=== 開始測試爬蟲模組 ===\n');

    try {
        console.log('[1/6] Testing crawlOilPrice...');
        const oil = await crawler.crawlOilPrice();
        console.log('Result:', oil ? oil.substring(0, 50) + '...' : 'null');
    } catch (e) { console.error('Failed:', e.message); }

    try {
        console.log('\n[2/6] Testing getRandomJav...');
        const jav = await crawler.getRandomJav();
        console.log('Result:', jav);
    } catch (e) { console.error('Failed:', e.message); }

    try {
        console.log('\n[3/6] Testing crawlNewMovies...');
        const movies = await crawler.crawlNewMovies();
        console.log('Result:', movies ? movies.substring(0, 50) + '...' : 'null');
    } catch (e) { console.error('Failed:', e.message); }

    /*
    try {
        console.log('\n[4/6] Testing crawlAppleNews...');
        const apple = await crawler.crawlAppleNews();
        console.log('Result:', apple ? apple.substring(0, 50) + '...' : 'null');
    } catch (e) { console.error('Failed:', e.message); }

    try {
        console.log('\n[5/6] Testing crawlTechNews...');
        const tech = await crawler.crawlTechNews();
        console.log('Result:', tech ? tech.substring(0, 50) + '...' : 'null');
    } catch (e) { console.error('Failed:', e.message); }
    
    try {
        console.log('\n[6/6] Testing crawlPttHot...');
        const ptt = await crawler.crawlPttHot();
        console.log('Result:', ptt ? ptt.substring(0, 50) + '...' : 'null');
    } catch (e) { console.error('Failed:', e.message); }
    */

    console.log('\n=== 測試結束 ===');
}

test();
