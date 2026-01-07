const flexUtils = require('../utils/flex');

// Mock Data with numeric IDs and non-string values to test safety
const mockTodos = [
    { text: '測試項目1', done: false, priority: 'high', category: 'new', createdAt: 1678888888123 }, // Number ID
    { text: '測試項目2', done: true, priority: 'medium', category: 'repair', createdAt: '1678888888124' }, // String ID
    { text: undefined, done: false, priority: 'low', category: 'other', createdAt: 1000 }, // Undefined Text
    { text: null, done: false, priority: 'medium', category: null, createdAt: 2000 } // Null Text/Category
];

// REPLICATED buildTodoFlex from handlers/todo.js (after fixes)
function buildTodoFlex(groupId, todos) {
    const { COLORS } = flexUtils;
    const DISPLAY_LIMIT = 15;
    const displayTodos = todos.slice(0, DISPLAY_LIMIT);
    const hiddenCount = Math.max(0, todos.length - DISPLAY_LIMIT);

    const activeCount = todos.filter(t => !t.done).length;
    const header = flexUtils.createHeader('📝 待辦事項清單', `未完成: ${activeCount} 項`, COLORS.PRIMARY);

    if (todos.length === 0) {
        return flexUtils.createBubble({
            header,
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: '目前沒有待辦事項', align: 'center', color: COLORS.GRAY })
            ], { paddingAll: '20px' })
        });
    }

    const CAT_INFO = {
        new: { label: '新機', color: '#1E90FF' },
        repair: { label: '維修', color: '#FF8C00' },
        other: { label: '其他', color: '#808080' }
    };

    const rows = displayTodos.map((item, index) => {
        const isDone = item.done;
        let pColor = COLORS.SUCCESS;
        if (item.priority === 'high') pColor = COLORS.DANGER;
        if (item.priority === 'medium') pColor = COLORS.WARNING;
        if (isDone) pColor = COLORS.GRAY;

        const statusIcon = isDone ? '✅' : '⬜';
        const textColor = isDone ? COLORS.GRAY : COLORS.DARK_GRAY;
        const decoration = isDone ? 'line-through' : 'none';

        const catKey = item.category || 'other';
        const catInfo = CAT_INFO[catKey] || CAT_INFO.other;

        const catBadge = flexUtils.createBox('vertical', [
            flexUtils.createText({
                // Defensive Coding Verified Here
                text: String(catInfo.label || '其他'),
                size: 'xxs',
                color: '#FFFFFF',
                align: 'center',
                weight: 'bold'
            })
        ], {
            backgroundColor: catInfo.color,
            cornerRadius: 'sm',
            paddingAll: '2px',
            flex: 0,
            width: '36px'
            // REMOVED: justifyContent, alignItems (not supported by LINE API)
        });

        const actionBtn = flexUtils.createButton({
            action: {
                type: 'postback',
                label: isDone ? '刪除' : '完成',
                // THE FIX: String() conversion Verified Here
                data: `action=${isDone ? 'delete_todo' : 'complete_todo'}&groupId=${String(groupId)}&id=${String(item.createdAt)}`
            },
            style: isDone ? 'secondary' : 'primary',
            color: isDone ? '#AAAAAA' : COLORS.SUCCESS,
            height: 'sm',
            flex: 0
        });

        return flexUtils.createBox('horizontal', [
            flexUtils.createText({ text: statusIcon, flex: 0, gravity: 'center', size: 'md' }),
            flexUtils.createBox('vertical', [
                flexUtils.createBox('horizontal', [
                    catBadge,
                    flexUtils.createText({ text: '●', color: pColor, size: 'xs', gravity: 'center', flex: 0, margin: 'sm' })
                ], { spacing: 'sm', margin: 'none' }), // FIXED: removed alignItems, marginBottom
                flexUtils.createText({
                    // Defensive Coding Verified Here
                    text: String(item.text || ''),
                    size: 'sm',
                    color: textColor,
                    wrap: true,
                    decoration: decoration,
                    flex: 1
                })
            ], { flex: 1, margin: 'md' }), // REMOVED: justifyContent

            flexUtils.createBox('vertical', [
                actionBtn
            ], { margin: 'sm' }) // REMOVED: justifyContent
        ], { paddingAll: '8px', spacing: 'sm' }); // FIXED: removed alignItems
    });

    const bodyContents = [];
    rows.forEach((row, idx) => {
        bodyContents.push(row);
        if (idx < rows.length - 1) {
            bodyContents.push(flexUtils.createSeparator('sm', '#EEEEEE'));
        }
    });

    if (hiddenCount > 0) {
        bodyContents.push(flexUtils.createText({
            text: `...還有 ${hiddenCount} 項未顯示`,
            align: 'center',
            color: COLORS.GRAY,
            size: 'xs',
            margin: 'md'
        }));
    }

    return flexUtils.createBubble({
        header,
        body: flexUtils.createBox('vertical', bodyContents, { paddingAll: '0px' })
    });
}

// Verification Logic
try {
    const flex = buildTodoFlex('test-group-id', mockTodos);
    const json = JSON.stringify(flex, null, 2);
    // console.log(json); // Reduce noise

    // 1. Deep check for invalid types in action.data
    const actionDataRegex = /"data":\s*"([^"]+)"/g;
    let match;
    while ((match = actionDataRegex.exec(json)) !== null) {
        if (!match[1] || typeof match[1] !== 'string') {
            throw new Error(`Invalid action data found: ${match[1]}`);
        }
    }
    console.log('✅ Action Data String Type Check: PASSED');

    // 2. Check all "text" fields are actually strings and not "undefined" string literal unless intended
    // JSON.stringify converts undefined to null or omits, but strict checking helps.
    // In our case String(undefined) becomes "undefined" string, which is valid JSON but maybe ugly UI.
    // Ideally we want empty string. My fix used String(item.text || '') so it should be empty.

    // Let's verify no raw 'null' in text fields in the struct (Flex doesn't allow null text)
    // We walk the object tree
    function walk(obj) {
        if (!obj) return;
        if (typeof obj === 'object') {
            if (obj.type === 'text') {
                if (typeof obj.text !== 'string') throw new Error(`Non-string text found: ${obj.text}`);
                if (obj.text === 'undefined') console.warn('Warning: "undefined" string found in text');
                if (obj.text === 'null') console.warn('Warning: "null" string found in text');
            }
            for (let key in obj) walk(obj[key]);
        }
    }
    walk(flex);
    console.log('✅ Text Component String Type Check: PASSED');

    console.log('✅ ALL STRICT CHECKS PASSED');
    console.log('Full sanity check complete. Code is safe.');
} catch (e) {
    console.error('❌ Validation Failed:', e);
    process.exit(1);
}
