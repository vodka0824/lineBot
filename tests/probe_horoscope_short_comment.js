const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    // Leo (Index 4 per my finding, or dynamic?)
    // Let's use Index 0 (Leo seems to be 0 or Aries 0? Mapping is chaotic but page structure is same)
    // Use index 0.
    const url = 'https://astro.click108.com.tw/daily_0.php';
    console.log(`Fetching ${url}...`);

    try {
        const res = await axios.get(url);
        const $ = cheerio.load(res.data);

        console.log('--- Searching for "今日短評" ---');

        // Find element containing text "今日短評"
        const els = $('*:contains("今日短評")');
        console.log(`Found ${els.length} elements containing "今日短評"`);

        els.each((i, el) => {
            // Filter leaf nodes or close to leaf
            if ($(el).children().length < 2) {
                console.log(`\n[${i}] Tag: <${el.tagName}> Class: "${$(el).attr('class')}"`);
                console.log(`Text: "${$(el).text().trim()}"`);

                // Check siblings
                const next = $(el).next();
                console.log(`Next Sibling: <${next.get(0)?.tagName}> Text: "${next.text().trim().substring(0, 50)}..."`);

                // Check parent's next sibling (if H3 is inside a div?)
                const parent = $(el).parent();
                const parentNext = parent.next();
                console.log(`Parent Next: <${parentNext.get(0)?.tagName}> Text: "${parentNext.text().trim().substring(0, 50)}..."`);
            }
        });

        console.log('\n--- Checking H3 Specifically ---');
        $('h3').each((i, el) => {
            if ($(el).text().includes('今日短評')) {
                console.log(`H3 Found! Content: "${$(el).text()}"`);
                console.log(`Next Element: <${$(el).next().get(0)?.tagName}>`);
                console.log(`Next Element HTML: ${$(el).next().html()}`);
            }
        });

    } catch (e) {
        console.error(e);
    }
}

probe();
