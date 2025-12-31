/**
 * 待辦事項模組
 */
const { db, Firestore } = require('../utils/firestore');
const flexUtils = require('../utils/flex');
const lineUtils = require('../utils/line');

// 新增待辦事項（含優先級）
async function addTodo(groupId, text, userId, priority = 'low') {
    const todoRef = db.collection('todos').doc(groupId);
    const doc = await todoRef.get();

    const priorityOrder = { high: 1, medium: 2, low: 3 };
    const priorityEmoji = { high: '🔴', medium: '🟡', low: '🟢' };

    const newItem = {
        text: text,
        priority: priority,
        priorityOrder: priorityOrder[priority] || 3,
        done: false,
        createdAt: Date.now(),
        createdBy: userId
    };

    if (doc.exists) {
        await todoRef.update({
            items: Firestore.FieldValue.arrayUnion(newItem)
        });
    } else {
        await todoRef.set({
            items: [newItem]
        });
    }

    return { ...newItem, emoji: priorityEmoji[priority] };
}

// 取得待辦事項列表（依優先級排序）
async function getTodoList(groupId) {
    const doc = await db.collection('todos').doc(groupId).get();
    if (!doc.exists) {
        return [];
    }
    const items = doc.data().items || [];
    return items.sort((a, b) => (a.priorityOrder || 3) - (b.priorityOrder || 3));
}

// 完成待辦事項 (支援 Index 或 ID)
async function completeTodo(groupId, indexOrId) {
    const todoRef = db.collection('todos').doc(groupId);
    const doc = await todoRef.get();

    if (!doc.exists) return { success: false, message: '沒有待辦事項' };

    const items = doc.data().items || [];

    // 嘗試 ID 匹配 (假設 ID 是 createdAt 數字)
    // 如果 indexOrId 是字串且長度長 (timestamp)，則視為 ID
    let targetIndex = -1;
    const isId = String(indexOrId).length > 5; // Simple heuristic for timestamp

    if (isId) {
        targetIndex = items.findIndex(item => String(item.createdAt) === String(indexOrId));
    } else {
        // Legacy Index Logic (1-based from view, but here we expect 0-based from caller?)
        // Wait, handleTodoCommand passed (userIndex - 1).
        // Let's stick to 0-based index if number.

        // 注意：必須先排序才能用 Index 匹配，因為顯示時有排序
        // 但若用 Index，必須保證排序演算法完全一致
        const mappedItems = items.map((item, idx) => ({ ...item, _realIdx: idx }));
        mappedItems.sort((a, b) => (a.priorityOrder || 3) - (b.priorityOrder || 3));

        const sortedIndex = parseInt(indexOrId);
        if (sortedIndex >= 0 && sortedIndex < mappedItems.length) {
            targetIndex = mappedItems[sortedIndex]._realIdx;
        }
    }

    if (targetIndex === -1) return { success: false, message: '找不到該項目' };

    const item = items[targetIndex];
    if (item.done) return { success: false, message: '此項目已完成' };

    items[targetIndex].done = true;
    items[targetIndex].completedAt = Date.now();
    await todoRef.update({ items: items });

    return { success: true, text: item.text };
}

// 刪除待辦事項 (支援 Index 或 ID)
async function deleteTodo(groupId, indexOrId) {
    const todoRef = db.collection('todos').doc(groupId);
    const doc = await todoRef.get();

    if (!doc.exists) return { success: false, message: '沒有待辦事項' };

    const items = doc.data().items || [];
    let targetIndex = -1;
    const isId = String(indexOrId).length > 5;

    if (isId) {
        targetIndex = items.findIndex(item => String(item.createdAt) === String(indexOrId));
    } else {
        const mappedItems = items.map((item, idx) => ({ ...item, _realIdx: idx }));
        mappedItems.sort((a, b) => (a.priorityOrder || 3) - (b.priorityOrder || 3));

        const sortedIndex = parseInt(indexOrId);
        if (sortedIndex >= 0 && sortedIndex < mappedItems.length) {
            targetIndex = mappedItems[sortedIndex]._realIdx;
        }
    }

    if (targetIndex === -1) return { success: false, message: '找不到該項目' };

    const deletedItem = items.splice(targetIndex, 1)[0];
    await todoRef.update({ items: items });

    return { success: true, text: deletedItem.text };
}

// 清空待辦事項
async function clearTodos(groupId) {
    await db.collection('todos').doc(groupId).set({ items: [] });
}

// 建構待辦清單 Flex Message
function buildTodoFlex(groupId, todos) {
    const { COLORS } = flexUtils;

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

    const rows = todos.map((item, index) => {
        const isDone = item.done;

        // Priority Color
        let pColor = COLORS.SUCCESS; // Low
        if (item.priority === 'high') pColor = COLORS.DANGER;
        if (item.priority === 'medium') pColor = COLORS.WARNING;
        if (isDone) pColor = COLORS.GRAY;

        // Status Icon
        const statusIcon = isDone ? '✅' : '⬜';
        const textDecoration = isDone ? 'line-through' : 'none';
        const textColor = isDone ? COLORS.GRAY : COLORS.DARK_GRAY;

        // Action Buttons (Only for active items?)
        // Let's show Delete always, Complete only if not done.
        // Actually showing buttons for Done items allows "Uncheck"? No, logic is one-way currenty.
        // Let's just allow Delete for Done items.

        const buttons = [];
        if (!isDone) {
            buttons.push(flexUtils.createButton({
                action: {
                    type: 'postback',
                    label: '完成',
                    data: `action=complete_todo&groupId=${groupId}&id=${item.createdAt}`
                },
                color: COLORS.SUCCESS,
                height: 'sm',
                flex: 1
            }));
        }

        buttons.push(flexUtils.createButton({
            action: {
                type: 'postback',
                label: '刪除',
                data: `action=delete_todo&groupId=${groupId}&id=${item.createdAt}`
            },
            color: COLORS.GRAY, // Subtle delete
            height: 'sm',
            flex: 1
        }));

        return flexUtils.createBox('vertical', [
            flexUtils.createBox('horizontal', [
                // Icon & Text
                flexUtils.createText({ text: statusIcon, flex: 1, gravity: 'center' }),
                flexUtils.createText({
                    text: item.text,
                    flex: 6,
                    gravity: 'center',
                    color: textColor,
                    wrap: true,
                    // decoration: textDecoration // Flex text doesn't support decoration property directly in generic implementation yet? 
                    // Checked LINE generic: decoration is valid style property for text? No, it used to be.
                    // Actually Flex Text component supports `decoration: 'line-through'`.
                    // But my createText utility might pass it through?
                    // flexUtils.createText just spreads args. Let's add it to object manually if needed.
                }),
                // Priority Indicator
                flexUtils.createText({ text: '●', color: pColor, flex: 1, align: 'end', size: 'xs', gravity: 'center' })
            ], { alignItems: 'center' }),

            // Buttons Row
            flexUtils.createBox('horizontal', buttons, { spacing: 'sm', margin: 'sm' }),
            flexUtils.createSeparator('md')
        ], { margin: 'md' });
    });

    return flexUtils.createBubble({
        header,
        body: flexUtils.createBox('vertical', rows)
    });
}

// 處理待辦 Postback
async function handleTodoPostback(ctx, data) {
    const params = new URLSearchParams(data);
    const action = params.get('action');
    const groupId = params.get('groupId');
    const id = params.get('id');

    if (!groupId || !id) return;

    if (action === 'complete_todo') {
        const res = await completeTodo(groupId, id);
        if (res.success) {
            // Refresh List
            const list = await getTodoList(groupId);
            const flex = buildTodoFlex(groupId, list);
            const msg = flexUtils.createFlexMessage('待辦清單更新', flex);
            await lineUtils.replyToLine(ctx.replyToken, [msg]);
        } else {
            await lineUtils.replyText(ctx.replyToken, `❌ ${res.message}`);
        }
    } else if (action === 'delete_todo') {
        const res = await deleteTodo(groupId, id);
        if (res.success) {
            // Refresh List
            const list = await getTodoList(groupId);
            const flex = buildTodoFlex(groupId, list);
            const msg = flexUtils.createFlexMessage('待辦清單更新', flex);
            await lineUtils.replyToLine(ctx.replyToken, [msg]);
        } else {
            await lineUtils.replyText(ctx.replyToken, `❌ ${res.message}`);
        }
    }
}

// 統一處理指令
async function handleTodoCommand(replyToken, groupId, userId, text) {
    // 支援個人待辦：若無 groupId (私訊)，則使用 userId
    const targetId = groupId || userId;

    try {
        const msg = text.trim();

        // 1. 列表查詢 (待辦)
        if (msg === '待辦') {
            const list = await getTodoList(targetId);
            const bubble = buildTodoFlex(targetId, list);
            const flexMsg = flexUtils.createFlexMessage('待辦事項清單', bubble);
            await lineUtils.replyToLine(replyToken, [flexMsg]);
            return;
        }

        // 2. 新增待辦 (待辦 XXX)
        if (msg.startsWith('待辦 ')) {
            let content = msg.replace(/^待辦\s+/, '').trim();
            let priority = 'low';

            const priorityMap = {
                '高': 'high', 'high': 'high', '急': 'high', '🔴': 'high',
                '中': 'medium', 'medium': 'medium', '🟡': 'medium',
                '低': 'low', 'low': 'low', '🟢': 'low'
            };

            const priorityRegex = /^(!|\[)?(高|中|低|急|緩|high|medium|low|🔴|🟡|🟢)(!|\])?\s+/i;
            const match = content.match(priorityRegex);

            if (match) {
                const pKey = match[2].toLowerCase();
                if (priorityMap[pKey]) {
                    priority = priorityMap[pKey];
                    content = content.replace(priorityRegex, '').trim();
                }
            }

            if (content) {
                const newItem = await addTodo(targetId, content, userId, priority);
                // Confirm with text, user can pull list if needed.
                // Or reply with updated list? 
                // Creating list is better UX? text confirmation is simpler for quick add.
                await lineUtils.replyText(replyToken, `✅ 已新增${newItem.emoji}：${newItem.text}\n(輸入「待辦」查看清單)`);
            }
            return;
        }

        // 3. Legacy Text Commands (兼容舊版)
        if (msg.startsWith('完成 ')) {
            const indexStr = msg.replace(/^完成\s+/, '').trim();
            const index = parseInt(indexStr, 10) - 1;
            if (isNaN(index)) return;
            const res = await completeTodo(targetId, index);
            await lineUtils.replyText(replyToken, res.success ? `🎉 已完成：${res.text}` : `❌ ${res.message}`);
            return;
        }

        if (msg.startsWith('刪除 ')) {
            const indexStr = msg.replace(/^刪除\s+/, '').trim();
            const index = parseInt(indexStr, 10) - 1;
            if (isNaN(index)) return;
            const res = await deleteTodo(targetId, index);
            await lineUtils.replyText(replyToken, res.success ? `🗑️ 已刪除：${res.text}` : `❌ ${res.message}`);
            return;
        }

        // 4. 抽籤
        if (msg.startsWith('抽')) {
            const list = await getTodoList(targetId);
            const activeItems = list.filter(item => !item.done);
            if (activeItems.length === 0) {
                await lineUtils.replyText(replyToken, '🎉 所有事項都完成了！(或清單為空)');
            } else {
                const randomItem = activeItems[Math.floor(Math.random() * activeItems.length)];
                await lineUtils.replyText(replyToken, `🎰 命運的安排：\n\n${randomItem.emoji || '🟢'} ${randomItem.text}`);
            }
            return;
        }

    } catch (error) {
        console.error('[Todo] Error:', error);
        await lineUtils.replyText(replyToken, '❌ 處理待辦事項時發生錯誤');
    }
}

module.exports = {
    addTodo,
    getTodoList,
    completeTodo,
    deleteTodo,
    clearTodos,
    handleTodoCommand,
    handleTodoPostback
};
