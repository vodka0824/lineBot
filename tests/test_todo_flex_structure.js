const flexUtils = require('../utils/flex');

// Mock Data
const mockTodos = [
    { text: '測試項目1', done: false, priority: 'high', category: 'new', createdAt: '123' },
    { text: '測試項目2', done: true, priority: 'medium', category: 'repair', createdAt: '124' },
    { text: '測試項目3', done: false, priority: 'low', category: 'other', createdAt: '125' }
];

// Copy of buildTodoFlex from handlers/todo.js for isolation testing
function buildTodoFlex(groupId, todos) {
    const { COLORS } = flexUtils;

    // Phase 1 Optimization: Limit to top 15 items to prevent payload issues
    const DISPLAY_LIMIT = 15;
    const displayTodos = todos.slice(0, DISPLAY_LIMIT);
    const hiddenCount = Math.max(0, todos.length - DISPLAY_LIMIT);

    // Header
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

    // Category Info
    const CAT_INFO = {
        new: { label: '新機', color: '#1E90FF' }, // Blue
        repair: { label: '維修', color: '#FF8C00' }, // Orange
        other: { label: '其他', color: '#808080' }  // Gray
    };

    const rows = displayTodos.map((item, index) => {
        const isDone = item.done;

        // Priority Color
        let pColor = COLORS.SUCCESS; // Low
        if (item.priority === 'high') pColor = COLORS.DANGER;
        if (item.priority === 'medium') pColor = COLORS.WARNING;
        if (isDone) pColor = COLORS.GRAY;

        // Styles
        const statusIcon = isDone ? '✅' : '⬜';
        const textColor = isDone ? COLORS.GRAY : COLORS.DARK_GRAY;
        const decoration = isDone ? 'line-through' : 'none';

        // Category Badge
        const catKey = item.category || 'other';
        const catInfo = CAT_INFO[catKey] || CAT_INFO.other;

        // Category Badge Component (Box)
        const catBadge = flexUtils.createBox('vertical', [
            flexUtils.createText({
                text: catInfo.label,
                size: 'xxs',
                color: '#FFFFFF',
                align: 'center',
                weight: 'bold'
            })
        ], {
            backgroundColor: catInfo.color,
            cornerRadius: 'sm',
            paddingAll: '2px', // Standard padding
            flex: 0,
            width: '36px', // Explicit formatting
            justifyContent: 'center',
            alignItems: 'center'
        });

        // Action Button
        const actionBtn = flexUtils.createButton({
            action: {
                type: 'postback',
                label: isDone ? '刪除' : '完成',
                data: `action=${isDone ? 'delete_todo' : 'complete_todo'}&groupId=${groupId}&id=${item.createdAt}`
            },
            style: isDone ? 'secondary' : 'primary', // Completed=Gray(Secondary), Active=Blue(Primary)
            color: isDone ? '#AAAAAA' : COLORS.SUCCESS, // Explicit color, avoided undefined
            height: 'sm',
            flex: 0
        });

        // Main Row Container (Single Line Layout where possible)
        return flexUtils.createBox('horizontal', [
            // 1. Status Icon
            flexUtils.createText({ text: statusIcon, flex: 0, gravity: 'center', size: 'md' }),

            // 2. Content (Badge + Text)
            flexUtils.createBox('vertical', [
                // Top Row: Badge + Priority
                flexUtils.createBox('horizontal', [
                    catBadge,
                    flexUtils.createText({ text: '●', color: pColor, size: 'xs', gravity: 'center', flex: 0, margin: 'sm' })
                ], { alignItems: 'center', marginBottom: '4px' }),

                // Bottom Row: Text
                flexUtils.createText({
                    text: item.text,
                    size: 'sm',
                    color: textColor,
                    wrap: true,
                    decoration: decoration,
                    flex: 1
                })
            ], { flex: 1, margin: 'md', justifyContent: 'center' }),

            // 3. Action Button (Right Side)
            flexUtils.createBox('vertical', [
                actionBtn
            ], { flex: 0, width: '60px', justifyContent: 'center' })

        ], { alignItems: 'center', paddingAll: '8px' });
    });

    const bodyContents = [];
    rows.forEach((row, idx) => {
        bodyContents.push(row);
        if (idx < rows.length - 1) {
            bodyContents.push(flexUtils.createSeparator('sm', '#EEEEEE'));
        }
    });

    // Indication of hidden items
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

try {
    const flex = buildTodoFlex('test-group', mockTodos);
    console.log(JSON.stringify(flex, null, 2));
    console.log('Flex Message structure build successful.');
} catch (e) {
    console.error('Error building Flex Message:', e);
}
