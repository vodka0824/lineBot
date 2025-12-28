const { crawlOilPrice, buildOilPriceFlex } = require('../handlers/crawler');

async function test() {
    console.log('Testing fixed crawlOilPrice...');
    const data = await crawlOilPrice();
    console.log('Returned Data:', JSON.stringify(data, null, 2));

    if (data) {
        console.log('\n=== Parsed Prices ===');
        console.log('CPC (中油):', data.cpc);
        console.log('FPC (台塑):', data.fpc);
        console.log('Prediction:', data.prediction);

        console.log('\n=== Flex Message Preview ===');
        const flex = buildOilPriceFlex(data);
        console.log('Type:', flex.type);
        console.log('Header:', flex.header?.contents?.[0]?.text);
    }
}

test();
