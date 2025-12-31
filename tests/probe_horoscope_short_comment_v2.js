const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
    // Try a few indices to be sure
    for (let i = 0; i < 3; i++) {
        const url = `https://astro.click108.com.tw/daily_${i}.php`;
        console.log(`\nFetching ${url}...`);

        try {
            const res = await axios.get(url);
            const $ = cheerio.load(res.data);

            // Dump .TODAY_CONTENT
            const content = $('.TODAY_CONTENT');
            console.log(`Content Length: ${content.length}`);
            if (content.length) {
                console.log(`Content HTML (Partial): ${content.html().substring(0, 500)}`);

                // Check all H3s
                content.find('h3').each((j, el) => {
                    console.log(`H3[${j}]: "${$(el).text()}"`);
                    console.log(`  Next: <${$(el).next().get(0)?.tagName}> Text: "${$(el).next().text().substring(0, 30)}..."`);
                });

                // Check all Ps
                content.find('p').each((j, el) => {
                    console.log(`P[${j}]: "${$(el).text().substring(0, 50)}..."`);
                });
            } else {
                console.log('No .TODAY_CONTENT found');
            }

        } catch (e) {
            console.error(e.message);
        }
    }
}

probe();
