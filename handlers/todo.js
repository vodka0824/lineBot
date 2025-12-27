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

module.exports = {
    addTodo,
    getTodoList,
    completeTodo,
    deleteTodo,
    clearTodos
};
