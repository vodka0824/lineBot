
const fs = require('fs');
const path = require('path');

const handlerPath = path.join(__dirname, '../handlers/todo.js');
const tempPath = path.join(__dirname, 'temp_todo_ui_handler.js');

try {
    // 1. Read Handler Code
    let handlerCode = fs.readFileSync(handlerPath, 'utf8');

    // 2. Inject Mock Flex Utils
    const mockFlexUtilsCode = `
    const flexUtils = {
        createHeader: (t, s, c) => ({ type: 'header', title: t, subtitle: s }),
        createButton: (opts) => ({ type: 'button', label: opts.action.label, color: opts.color }),
        createText: (opts) => ({ type: 'text', text: opts.text, decoration: opts.decoration, color: opts.color }),
        createSeparator: () => ({ type: 'separator' }),
        createBox: (layout, contents) => ({ type: 'box', layout, contents }),
        createBubble: (opts) => opts,
        createFlexMessage: (alt, contents) => ({ type: 'flex', alt, contents }),
        COLORS: { PRIMARY: '#1E90FF', SUCCESS: '#00B900', DANGER: '#FF334B', WARNING: '#FFCC00', GRAY: '#AAAAAA', DARK_GRAY: '#555555' }
    };
    const db = {}; 
    const Firestore = {}; 
    const lineUtils = {}; 
    `;

    // Filter out requires and bad lines
    const lines = handlerCode.split('\n');
    const newLines = [
        mockFlexUtilsCode,
        ...lines.filter(l => !l.trim().startsWith('const { db') && !l.trim().startsWith('const flexUtils') && !l.trim().startsWith('const lineUtils'))
    ];

    // Append Export
    // Ensure we handle the closing of the previous module.exports if necessary, or just append property
    const fileContent = newLines.join('\n') + '\n;try { module.exports.buildTodoFlex = buildTodoFlex; } catch(e) {}';

    fs.writeFileSync(tempPath, fileContent);

    // 3. Load Handler
    // Purge cache just in case
    delete require.cache[require.resolve(tempPath)];
    const handler = require(tempPath);

    console.log('Exported keys:', Object.keys(handler));

    if (typeof handler.buildTodoFlex !== 'function') {
        throw new Error('buildTodoFlex is not exported! Keys: ' + Object.keys(handler).join(', '));
    }

    // 4. Run Test
    console.log('Running UI Test...');
    const todos = [];
    for (let i = 1; i <= 20; i++) {
        todos.push({
            text: `Task ${i}`,
            createdAt: `${i}`,
            priority: 'low',
            done: i <= 2 // 1, 2 Done
        });
    }

    const flex = handler.buildTodoFlex('g1', todos);
    const bodyContents = flex.body.contents;

    // Verify
    const boxes = bodyContents.filter(c => c.type === 'box');
    const texts = bodyContents.filter(c => c.type === 'text');

    console.log(`Boxes: ${boxes.length}, Extra Texts: ${texts.length}`);

    if (boxes.length !== 15) throw new Error(`Expected 15 items, got ${boxes.length}`);

    // Check hidden count text
    const hiddenText = texts[0];
    if (!hiddenText || !hiddenText.text.includes('還有 5 項')) throw new Error('Hidden text missing or wrong');

    console.log('✅ Item Count OK');

    // Check Task 1 (Done)
    const task1Text = boxes[0].contents[0].contents[1]; // Box -> Horizontal -> Text(Title)
    if (task1Text.decoration !== 'line-through') throw new Error('Task 1 decoration missing');
    if (boxes[0].contents[1].contents.length !== 1) throw new Error('Task 1 has wrong button count');
    if (boxes[0].contents[1].contents[0].label !== '刪除') throw new Error('Task 1 button is not Delete');

    console.log('✅ Task 1 Styles OK');

    // Check Task 3 (Active)
    const task3Text = boxes[2].contents[0].contents[1];
    if (task3Text.decoration === 'line-through') throw new Error('Task 3 should not have line-through');
    if (boxes[2].contents[1].contents[0].label !== '完成') throw new Error('Task 3 button is not Complete');

    console.log('✅ Task 3 Styles OK');
    console.log('🎉 All UI Tests Passed');

} catch (e) {
    console.error('Test Failed:', e);
    process.exit(1);
} finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
}
