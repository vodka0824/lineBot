const crawlerHandler = require('../handlers/crawler');

async function testPttCrawler() {
    console.log('Testing PTT Beauty Crawler...');
    const keyword = '美腿';
    console.log(`Keyword: ${keyword}`);

    const imageUrl = await crawlerHandler.crawlPttBeautyImages(keyword);

    if (imageUrl) {
        console.log('✅ Success! Found image URL:');
        console.log(imageUrl);
    } else {
        console.error('❌ Failed. No image found.');
    }
}

testPttCrawler();
