const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.cosmopolitan.com';
const DAILY_HUB = 'https://www.cosmopolitan.com/tw/horoscopes/today/';
const WEEKLY_HUB = 'https://www.cosmopolitan.com/tw/horoscopes/weekly/';

// Fake User Agent
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

async function probe() {
    console.log('=== Probing Cosmopolitan TW Horoscope ===\n');

    try {
        // 1. Analyze Daily Hub to find links
        console.log(`[1] Fetching Daily Hub: ${DAILY_HUB}`);
        const hubRes = await axios.get(DAILY_HUB, { headers: HEADERS });
        const $hub = cheerio.load(hubRes.data);

        // Try to find links to individual signs
        // Cosmo might list them as tiles or inside a specific container
        // Common layout: <a class="custom-item-title" href="...">Aries</a>

        let signLinks = [];
        $hub('a').each((i, el) => {
            const href = $hub(el).attr('href');
            const text = $hub(el).text().trim();
            // Filter for likely sign pages (usually contain the English or Chinese name)
            if (href && href.includes('/daily/') && !signLinks.some(l => l.href === href)) {
                signLinks.push({ text, href: href.startsWith('http') ? href : BASE_URL + href });
            }
        });

        // If no /daily/ links found, maybe they use a different structure (e.g. one page for all?)
        // Let's dump some titles to see what we found
        console.log(`   Found ${signLinks.length} potential daily links.`);
        if (signLinks.length === 0) {
            console.log('   WARNING: No obvious daily links found. Dumping top 10 links for logic check:');
            $hub('a').slice(0, 10).each((i, el) => console.log(`   - ${$hub(el).text().trim()} : ${$hub(el).attr('href')}`));
        } else {
            console.log('   Sample Link:', signLinks[0]);
        }

        // 2. If we found a link, probe the content of one sign
        let targetUrl = signLinks.length > 0 ? signLinks[0].href : null;

        // Fallback: Use the user provided example structure if possible, logic deduction
        // If the hub failed, let's try a direct guess based on user input URL pattern if it was daily... 
        // User gave: https://www.cosmopolitan.com/tw/horoscopes/today/ 
        // Maybe the content IS on the hub page?
        // Let's check headers on the hub page for signs
        const headings = $hub('h2, h3').map((i, el) => $hub(el).text().trim()).get();
        console.log('   Hub Headings sample:', headings.slice(0, 5));

        if (!targetUrl) {
            console.log('   Trying to guess a sign URL... (Cosmo often rotates IDs, this is risky)');
            // Let's pause here if we can't find links dinamically.
        } else {
            console.log(`\n[2] Fetching Sign Detail: ${targetUrl}`);
            const signRes = await axios.get(targetUrl, { headers: HEADERS });
            const $sign = cheerio.load(signRes.data);

            const title = $sign('title').text();
            console.log(`   Page Title: ${title}`);

            // Check content availability
            const paragraphs = $sign('p').map((i, el) => $sign(el).text().trim()).get();
            const luckyContent = paragraphs.join('\n');

            console.log('   --- Content Preview ---');
            console.log(luckyContent.substring(0, 300) + '...');

            // Check for Lucky Items
            const hasLuckyNumber = luckyContent.includes('幸運數字');
            const hasLuckyColor = luckyContent.includes('幸運顏色');
            console.log(`   \n   Contains Lucky Number? ${hasLuckyNumber}`);
            console.log(`   Contains Lucky Color? ${hasLuckyColor}`);
        }

    } catch (e) {
        console.error('Probe Failed:', e.message);
        if (e.response) console.error('Status:', e.response.status);
    }
}

probe();
