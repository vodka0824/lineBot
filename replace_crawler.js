const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'handlers', 'crawler_v2.js');
const dest = path.join(__dirname, 'handlers', 'crawler.js');

try {
    const content = fs.readFileSync(src);
    fs.writeFileSync(dest, content);
    console.log('Successfully overwrote crawler.js with crawler_v2.js');
} catch (e) {
    console.error('Error overwriting file:', e);
    process.exit(1);
}
