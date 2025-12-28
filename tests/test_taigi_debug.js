const axios = require('axios');

async function testCorrectUrl() {
    const keyword = '你好';

    // 使用瀏覽器發現的正確 URL (不經過 encodeURI，讓 axios 自己處理)
    const url = `https://itaigi.tw/平台項目列表/揣列表`;

    console.log('Testing with params object...');
    try {
        const res = await axios.get(url, {
            params: { '關鍵字': keyword },
            timeout: 10000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });
        console.log('Status:', res.status);
        console.log('Is string:', typeof res.data === 'string');
        console.log('Data:', JSON.stringify(res.data, null, 2).substring(0, 800));
    } catch (e) {
        console.log('Error:', e.message);
    }

    // 也試試直接用完整編碼 URL
    console.log('\n\nTrying fully encoded URL...');
    const encodedUrl = 'https://itaigi.tw/%E5%B9%B3%E8%87%BA%E9%A0%85%E7%9B%AE%E5%88%97%E8%A1%A8/%E6%8F%A3%E5%88%97%E8%A1%A8?%E9%97%9C%E9%8D%B5%E5%AD%97=' + encodeURIComponent(keyword);
    console.log('URL:', encodedUrl);
    try {
        const res = await axios.get(encodedUrl, {
            timeout: 10000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });
        console.log('Status:', res.status);
        console.log('Is string:', typeof res.data === 'string');
        if (typeof res.data !== 'string') {
            console.log('Data:', JSON.stringify(res.data, null, 2).substring(0, 800));
        } else {
            console.log('First 200 chars:', res.data.substring(0, 200));
        }
    } catch (e) {
        console.log('Error:', e.message);
    }
}

testCorrectUrl();
