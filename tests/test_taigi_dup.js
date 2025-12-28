const axios = require('axios');

const ITAIGI_API = 'https://itaigi.tw/%E5%B9%B3%E8%87%BA%E9%A0%85%E7%9B%AE%E5%88%97%E8%A1%A8/%E6%8F%A3%E5%88%97%E8%A1%A8';

async function testSearch(keyword) {
    console.log(`\n=== 查詢: ${keyword} ===`);
    const url = `${ITAIGI_API}?%E9%97%9C%E9%8D%B5%E5%AD%97=${encodeURIComponent(keyword)}`;

    try {
        const res = await axios.get(url, { timeout: 10000 });
        const results = res.data?.列表 || [];

        console.log('原始列表數量:', results.length);

        const parsed = [];
        for (const item of results.slice(0, 5)) {
            console.log('\n--- 項目 ---');
            console.log('外語資料:', item.外語資料);

            const translations = item.新詞文本 || [];
            console.log('翻譯數量:', translations.length);

            for (const trans of translations.slice(0, 3)) {
                console.log('  文本:', trans.文本資料, '音標:', trans.音標資料);
                if (trans.音標資料) {
                    parsed.push({
                        hanzi: trans.文本資料 || keyword,
                        romanization: trans.音標資料
                    });
                }
            }
        }

        console.log('\n=== 解析後結果 ===');
        console.log('數量:', parsed.length);
        parsed.forEach((p, i) => console.log(`${i + 1}. ${p.hanzi} (${p.romanization})`));

        // 檢查重複
        const unique = [...new Map(parsed.map(p => [p.romanization, p])).values()];
        console.log('\n去重後數量:', unique.length);

    } catch (e) {
        console.log('Error:', e.message);
    }
}

testSearch('瘋女人');
