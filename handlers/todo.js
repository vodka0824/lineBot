/**
 * 待辦事項模組
 */
const { db, Firestore } = require('../utils/firestore');

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

// 完成待辦事項
async function completeTodo(groupId, index) {
    const todoRef = db.collection('todos').doc(groupId);
    const doc = await todoRef.get();

    if (!doc.exists) {
        return { success: false, message: '沒有待辦事項' };
    }

    const items = doc.data().items || [];
    if (index < 0 || index >= items.length) {
        return { success: false, message: '無效的編號' };
    }

    const item = items[index];
    if (item.done) {
        return { success: false, message: '此項目已完成' };
    }

    items[index].done = true;
    items[index].completedAt = Date.now();
    await todoRef.update({ items: items });

    return { success: true, text: item.text };
}

// 刪除待辦事項
async function deleteTodo(groupId, index) {
    const todoRef = db.collection('todos').doc(groupId);
    const doc = await todoRef.get();

    if (!doc.exists) {
        return { success: false, message: '沒有待辦事項' };
    }

    const items = doc.data().items || [];
    if (index < 0 || index >= items.length) {
        return { success: false, message: '無效的編號' };
    }

    const deletedItem = items.splice(index, 1)[0];
    await todoRef.update({ items: items });

    return { success: true, text: deletedItem.text };
}

// 清空待辦事項
async function clearTodos(groupId) {
    await db.collection('todos').doc(groupId).set({ items: [] });
}

// 統一處理指令
async function handleTodoCommand(replyToken, groupId, userId, text) {
    const lineUtils = require('../utils/line'); // Lazy import to avoid cycle if any (though utils usually safe)

    // 支援個人待辦：若無 groupId (私訊)，則使用 userId
    const targetId = groupId || userId;

    try {
        const msg = text.trim();

        if (msg === '待辦') {
            const list = await getTodoList(targetId);
            if (list.length === 0) {
                await lineUtils.replyText(replyToken, '📝 目前沒有待辦事項');
            } else {
                const formatted = list.map((item, i) => {
                    const status = item.done ? '✅' : '⬜';
                    const priorityIcon = item.done ? '' : (item.emoji || '🟢');

                    const content = item.done ? `~${item.text}~` : item.text; // Strike-through simulated? LINE doesn't support markdown. Just status.
                    return `${i + 1}. ${status} ${priorityIcon} ${content}`;
                }).join('\n');
                await lineUtils.replyText(replyToken, `📝 待辦事項清單${groupId ? '' : ' (個人)'}：\n${formatted}`);
            }
            return;
        }

        if (msg.startsWith('待辦 ')) {
            let content = msg.replace(/^待辦\s+/, '').trim();
            let priority = 'low';

            // Check for priority patterns: !高, !中, !低 or [高], [中], [低]
            const priorityMap = {
                '高': 'high', 'high': 'high', '急': 'high', 'high': 'high', '🔴': 'high',
                '中': 'medium', 'medium': 'medium', '正常': 'medium', '🟡': 'medium',
                '低': 'low', 'low': 'low', '緩': 'low', '🟢': 'low'
            };

            // Regex to find priority prefix (e.g., "!高 ", "[高] ", "高 ") at the start of content
            const priorityRegex = /^(!|\[)?(高|中|低|急|緩|high|medium|low|🔴|🟡|🟢)(!|\])?\s+/i;
            const match = content.match(priorityRegex);

            if (match) {
                const pKey = match[2].toLowerCase(); // The keyword found
                if (priorityMap[pKey]) {
                    priority = priorityMap[pKey];
                    content = content.replace(priorityRegex, '').trim(); // Remove priority from text
                }
            }

            if (content) {
                const newItem = await addTodo(targetId, content, userId, priority);
                await lineUtils.replyText(replyToken, `✅ 已新增${newItem.emoji}：${newItem.text}`);
            }
            return;
        }

        if (msg.startsWith('完成 ')) {
            const indexStr = msg.replace(/^完成\s+/, '').trim();
            const index = parseInt(indexStr, 10) - 1; // User uses 1-based
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
    handleTodoCommand
};
