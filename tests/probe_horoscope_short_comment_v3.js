const axios = require('axios');

async function probe() {
    const url = 'https://astro.click108.com.tw/daily_0.php';
    console.log(`Fetching ${url}...`);

    try {
        const res = await axios.get(url);
        const html = res.data;
        const index = html.indexOf('今日短評');

        if (index !== -1) {
            console.log('Found "今日短評" at index:', index);
            const start = Math.max(0, index - 100);
            const end = Math.min(html.length, index + 300);
            console.log('--- Context ---');
            console.log(html.substring(start, end));
            console.log('--- End Context ---');
        } else {
            console.log('"今日短評" not found in raw HTML.');
        }

    } catch (e) {
        console.error(e);
    }
}

probe();
