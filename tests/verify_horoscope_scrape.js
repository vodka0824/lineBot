const horoscopeHandler = require('../handlers/horoscope');

// Mock lineUtils
const lineUtils = {
    replyText: async (token, text) => {
        console.log(`[Reply] ${text}`);
    }
};

// Hack: we need to expose getHoroscope or just try handleHoroscope
async function test() {
    console.log('Testing Aries (牡羊)...');
    // Using handleHoroscope which calls replyText
    // We need to monkey patch lineUtils in horoscopeHandler if we required it there.
    // However, since we require it inside handler file, we can't easily mock it without dependency injection.
    // But wait, the handler file requires `../utils/line`.
    // We can't easily mock it in this simple script unless we use a testing framwork or proxy.

    // Alternative: Just copy getHoroscope logic or assume if it runs it works.
    // Or better: Modify handler to export getHoroscope for testing?
    // It's not exported.

    // Let's use re-require or just trust the previous probe + implementation structure.
    // But I want to see the OUTPUT format.

    // I'll create a small script that USES the logic of getHoroscope directly (by copying) to verify parsing.
    // Because I can't easily import the internal function.

    // WAIT, I CAN verify by running the bot and triggering command if I had a emulator.
    // But I don't.

    // Let's rely on my previous probe which worked.
    // I'll make a new file that imports cheerio and axios and runs the EXACT same logic as `getHoroscope` to verify parsing.

    const axios = require('axios');
    const cheerio = require('cheerio');

    const index = 0; // Aries
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const url = `https://astro.click108.com.tw/daily_${index}.php?iAcDay=${today}&iAstro=${index}`;

    console.log(`Fetching ${url}...`);
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const todayContent = $('.TODAY_CONTENT');
        const paragraphs = [];
        todayContent.find('p').each((i, el) => {
            const text = $(el).text().trim();
            if (text) paragraphs.push(text);
        });

        console.log('--- Parsed Content ---');
        console.log(paragraphs.join('\n\n'));
        console.log('--- End ---');

        if (paragraphs.length > 0) console.log('✅ Parsing Successful');
        else console.log('❌ Parsing Failed (No content)');

    } catch (e) {
        console.log(e);
    }
}

test();
