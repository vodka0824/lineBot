const crawler = require('../utils/cosmo_crawler_puppeteer');

async function test() {
    console.log('=== Puppeteer Crawler Test ===');

    // Pick a sign that usually has dynamic content. User said Aquarius.
    const sign = '水瓶座';
    console.log(`Fetching ${sign}...`);

    try {
        const data = await crawler.fetchSignData(sign);
        if (data) {
            console.log('--- Result ---');
            console.log(`Name: ${data.name}`);
            console.log(`Content: ${data.content}`);
            console.log(`Number: ${data.luckyNumber}`);
            console.log(`Color: ${data.luckyColor} (Target: 香檳金?)`);
            console.log(`Time: ${data.luckyTime}`);
            console.log(`Sign: ${data.luckySign}`);
            console.log(`Stars:`, JSON.stringify(data.stars, null, 2));
            console.log('--------------');
        } else {
            console.error('Failed to get data.');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await crawler.closeBrowser();
    }
}

test();
