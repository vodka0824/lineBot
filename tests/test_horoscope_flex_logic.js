
// Mock Flex Utils (Simplified for test)
const flexUtils = {
    createText: ({ text }) => ({ type: 'text', text }), // Only care about text
    createBox: (layout, contents) => ({ type: 'box', layout, contents }),
    createHeader: () => ({ type: 'header' }),
    createBubble: ({ body }) => body, // Return body for inspection
    COLORS: { DARK_GRAY: '#555', PRIMARY: '#111' }
};

// Mock Helper
const getSectionColor = () => '#000';

// The function under test (COPIED from handlers/horoscope.js with fixes)
function buildHoroscopeFlex(data, type = 'daily') {
    const { COLORS } = flexUtils;
    let periodName = '今日';
    const bodyContents = [];

    // ... (Skipping Top Parts for brevity, focusing on Sections loop) ...

    // 3. Detailed Sections
    if (data.sections && data.sections.length > 0) {
        data.sections.forEach(section => {
            // Validate content is not empty to avoid 400
            if (!section.title || !section.content) return;

            bodyContents.push(flexUtils.createText({ text: section.title }));
            bodyContents.push(flexUtils.createText({ text: section.content }));
        });
    } else {
        bodyContents.push(flexUtils.createText({ text: '運勢內容讀取中...' }));
    }

    return flexUtils.createBubble({ size: 'mega', header: {}, body: flexUtils.createBox('vertical', bodyContents) });
}

// Test Case
console.log('Testing buildHoroscopeFlex with empty sections...');

const badData = {
    name: '牡羊座',
    date: '2026-01-06',
    sections: [
        { title: '整體運勢', content: '今天不錯', type: 'overall' }, // Valid
        { title: '愛情運勢', content: '', type: 'love' },           // Invalid: Empty Content
        { title: '', content: '未知區塊', type: 'other' },          // Invalid: Empty Title
        { title: '事業運勢', content: '加油', type: 'career' }      // Valid
    ]
};

const result = buildHoroscopeFlex(badData);

// Inspect Result
// expected: 2 valid sections = 4 text components (title + content each)
const textComponents = result.contents.filter(c => c.type === 'text');
console.log(`Generated ${textComponents.length} text components.`);

if (textComponents.length === 4) {
    console.log('✅ Success: Invalid sections were skipped.');
    console.log('Texts:', textComponents.map(c => c.text));
} else {
    console.error('❌ Failure: Expected 4 text components, got ' + textComponents.length);
    console.log('Texts:', textComponents.map(c => c.text));
    process.exit(1);
}
