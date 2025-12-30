const axios = require('axios');

async function testHoroscope() {
    const constellations = [
        '牡羊', '金牛', '雙子', '巨蟹', '獅子', '處女',
        '天秤', '天蠍', '射手', '摩羯', '水瓶', '雙魚'
    ];

    // Test assumption: iAstro=0 is Aries
    // And what is the filename? 
    // User said: daily_*.php and iAstro=*.
    // Let's try daily_0.php, daily_1.php...

    const date = '2025-01-01'; // Future date or today. user said 2025-12-30 (which is today in their context)

    // Try to hit valid URL
    const tryUrl = async (index) => {
        const url = `https://astro.click108.com.tw/daily_${index}.php?iAcDay=${date}&iAstro=${index}`;
        console.log(`Trying ${url}...`);
        try {
            const res = await axios.get(url);
            if (res.status === 200) {
                console.log(`Success for index ${index}! Title length: ${res.data.length}`);
                // Extract title or something to verify which constellation it is
                const match = res.data.match(/<title>(.*?)<\/title>/);
                console.log(`Title: ${match ? match[1] : 'No title'}`);
            }
        } catch (e) {
            console.log(`Error for ${index}: ${e.message}`);
        }
    };

    await tryUrl(0);
    await tryUrl(1);
    // Also try daily_aries.php just in case user meant wildcard as string
}

testHoroscope();
