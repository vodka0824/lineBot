const axios = require('axios');
const cheerio = require('cheerio');

const CRAWLER_URLS = {
    OIL_PRICE: 'https://gas.goodlife.tw/'
};

async function testOriginal() {
    console.log('=== 原始爬蟲 ===');
    const res = await axios.get(CRAWLER_URLS.OIL_PRICE);
    const $ = cheerio.load(res.data);

    const title = $('#main').text().replace(/\n/g, '').split('(')[0].trim();
    const gasPrice = $('#gas-price').text().replace(/\n\n\n/g, '').replace(/ /g, '').trim();
    const cpc = $('#cpc').text().replace(/ /g, '').trim();

    console.log('Title:', title.substring(0, 50));
    console.log('Gas Price:', gasPrice.substring(0, 100));
    console.log('CPC:', cpc.substring(0, 100));
}

async function testNew() {
    console.log('\n=== 新版爬蟲 ===');
    const res = await axios.get(CRAWLER_URLS.OIL_PRICE);
    const $ = cheerio.load(res.data);

    // 檢查 #cpc 和 #fpc 內容
    console.log('#cpc HTML:', $('#cpc').html()?.substring(0, 200) || 'NOT FOUND');
    console.log('#fpc HTML:', $('#fpc').html()?.substring(0, 200) || 'NOT FOUND');

    // 列出所有 li
    console.log('\n#cpc li items:');
    $('#cpc li').each((i, el) => {
        console.log(`  [${i}] ${$(el).text().trim()}`);
    });

    console.log('\n#fpc li items:');
    $('#fpc li').each((i, el) => {
        console.log(`  [${i}] ${$(el).text().trim()}`);
    });

    // 嘗試其他選擇器
    console.log('\n=== 嘗試其他選擇器 ===');
    console.log('.gas-price:', $('.gas-price').text().substring(0, 100));
    console.log('#gas-price:', $('#gas-price').text().substring(0, 100));
}

async function run() {
    try {
        await testOriginal();
        await testNew();
    } catch (e) {
        console.error('Error:', e);
    }
}

run();
