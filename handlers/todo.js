/**
 * 待辦事項模組
 */
const { db, Firestore } = require('../utils/firestore');
const flexUtils = require('../utils/flex');
const lineUtils = require('../utils/line');

// 新增待辦事項（含優先級與分類）
async function addTodo(groupId, text, userId, priority = 'low', category = 'other') {
    const todoRef = db.collection('todos').doc(groupId);
    const doc = await todoRef.get();

    const priorityOrder = { high: 1, medium: 2, low: 3 };
    const priorityEmoji = { high: '🔴', medium: '🟡', low: '🟢' };
    const categoryInfo = {
        new: { label: '新機', icon: '🆕' },
        repair: { label: '維修', icon: '🔧' },
        other: { label: '其他', icon: '📋' }
    };

    const newItem = {
        text: text,
        priority: priority,
        priorityOrder: priorityOrder[priority] || 3,
        category: category, // new, repair, other
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

    const cat = categoryInfo[category] || categoryInfo.other;
    return { ...newItem, emoji: priorityEmoji[priority], catIcon: cat.icon, catLabel: cat.label };
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

// 完成待辦事項 (支援 Index 或 ID) - Transactional
async function completeTodo(groupId, indexOrId) {
    const todoRef = db.collection('todos').doc(groupId);

    try {
        return await db.runTransaction(async (t) => {
            const doc = await t.get(todoRef);
            if (!doc.exists) return { success: false, message: '沒有待辦事項' };

            const items = doc.data().items || [];
            let targetIndex = -1;
            const isId = String(indexOrId).length > 5;

            if (isId) {
                targetIndex = items.findIndex(item => String(item.createdAt) === String(indexOrId));
            } else {
                // Logic needs to match exactly the view logic: Filter, Map, Sort
                // Since user sees sorted list, we must find the item at that sorted index.
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

            // Update state
            items[targetIndex].done = true;
            items[targetIndex].completedAt = Date.now();

            t.update(todoRef, { items: items });
            return { success: true, text: item.text };
        });
    } catch (e) {
        console.error('[Todo] Complete Error:', e);
        return { success: false, message: '更新失敗，請重試' };
    }
}

// 刪除待辦事項 (支援 Index 或 ID) - Transactional
async function deleteTodo(groupId, indexOrId) {
    const todoRef = db.collection('todos').doc(groupId);

    try {
        return await db.runTransaction(async (t) => {
            const doc = await t.get(todoRef);
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
            t.update(todoRef, { items: items });

            return { success: true, text: deletedItem.text };
        });
    } catch (e) {
        console.error('[Todo] Delete Error:', e);
        return { success: false, message: '刪除失敗，請重試' };
    }
}

// 清空待辦事項
async function clearTodos(groupId) {
    await db.collection('todos').doc(groupId).set({ items: [] });
}

// 更新待辦事項優先級
async function updateTodoPriority(groupId, indexOrId, newPriority) {
    const todoRef = db.collection('todos').doc(groupId);
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    const priorityEmoji = { high: '🔴', medium: '🟡', low: '🟢' };

    try {
        return await db.runTransaction(async (t) => {
            const doc = await t.get(todoRef);
            if (!doc.exists) return { success: false, message: '沒有待辦事項' };

            const items = doc.data().items || [];
            const targetIndex = items.findIndex(item => String(item.createdAt) === String(indexOrId));

            if (targetIndex === -1) return { success: false, message: '找不到該項目' };

            // Update
            items[targetIndex].priority = newPriority;
            items[targetIndex].priorityOrder = priorityOrder[newPriority] || 3;

            t.update(todoRef, { items: items });
            return {
                success: true,
                text: items[targetIndex].text,
                priority: newPriority,
                emoji: priorityEmoji[newPriority]
            };
        });
    } catch (e) {
        console.error('[Todo] Update Priority Error:', e);
        return { success: false, message: '更新失敗' };
    }
}

// 更新待辦事項分類
async function updateTodoCategory(groupId, indexOrId, newCategory) {
    const todoRef = db.collection('todos').doc(groupId);
    const categoryInfo = {
        new: { label: '新機', icon: '🆕' },
        repair: { label: '維修', icon: '🔧' },
        other: { label: '其他', icon: '📋' }
    };

    try {
        return await db.runTransaction(async (t) => {
            const doc = await t.get(todoRef);
            if (!doc.exists) return { success: false, message: '沒有待辦事項' };

            const items = doc.data().items || [];
            const targetIndex = items.findIndex(item => String(item.createdAt) === String(indexOrId));

            if (targetIndex === -1) return { success: false, message: '找不到該項目' };

            // Update
            items[targetIndex].category = newCategory;
            t.update(todoRef, { items: items });

            const cat = categoryInfo[newCategory] || categoryInfo.other;
            return {
                success: true,
                text: items[targetIndex].text,
                category: newCategory,
                label: cat.label,
                icon: cat.icon
            };
        });
    } catch (e) {
        console.error('[Todo] Update Category Error:', e);
        return { success: false, message: '更新失敗' };
    }
}

// 建構待辦清單 Flex Message (UI Optimized Phase 2)
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

        // Category Badge Component (Text with Background - Safer)
        const catBadge = flexUtils.createText({
            text: ` ${catInfo.label} `, // Add spaces for visual padding if paddingAll not flawless
            size: 'xxs',
            color: '#FFFFFF',
            weight: 'bold',
            flex: 0
        });

        // Manual override for properties not exposed by createText
        catBadge.backgroundColor = catInfo.color;
        catBadge.cornerRadius = 'sm';
        catBadge.align = 'center';
        catBadge.gravity = 'center'; // Vertical align in row

        // Action Button
        const actionBtn = flexUtils.createButton({
            action: {
                type: 'postback',
                label: isDone ? '刪除' : '完成',
                data: `action=${isDone ? 'delete_todo' : 'complete_todo'}&groupId=${groupId}&id=${item.createdAt}`
            },
            style: isDone ? 'secondary' : 'primary', // Completed=Gray(Secondary), Active=Blue(Primary)
            color: isDone ? undefined : COLORS.SUCCESS,
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

        ], { alignItems: 'center', paddingAll: '8px' }); // Removed margin: 'none' just to be safe, default is usually 0 if not specified or md. Let's rely on padding.
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
            console.error('[Todo] Complete Failed:', res.message);
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
    } else if (action === 'update_priority') {
        const priority = params.get('priority');
        const res = await updateTodoPriority(groupId, id, priority);

        if (res.success) {
            // Refresh List
            const list = await getTodoList(groupId);
            const flex = buildTodoFlex(groupId, list);
            const msg = flexUtils.createFlexMessage('待辦清單更新', flex);
            await lineUtils.replyToLine(ctx.replyToken, [msg]);
        } else {
            await lineUtils.replyText(ctx.replyToken, `❌ ${res.message}`);
        }
    } else if (action === 'update_category') {
        const category = params.get('category');
        console.log(`[Todo] Update Category: id=${id}, cat=${category}`);

        const res = await updateTodoCategory(groupId, id, category);

        if (res.success) {
            console.log(`[Todo] Category updated to ${res.label}, sending Priority Quick Reply`);
            const quickReply = {
                items: [
                    {
                        type: 'action',
                        action: { type: 'postback', label: '🔴 高優先', data: `action=update_priority&groupId=${groupId}&id=${id}&priority=high`, displayText: '設定為：高優先' }
                    },
                    {
                        type: 'action',
                        action: { type: 'postback', label: '🟡 中優先', data: `action=update_priority&groupId=${groupId}&id=${id}&priority=medium`, displayText: '設定為：中優先' }
                    },
                    {
                        type: 'action',
                        action: { type: 'postback', label: '🟢 低優先', data: `action=update_priority&groupId=${groupId}&id=${id}&priority=low`, displayText: '設定為：低優先' }
                    }
                ]
            };
            const message = {
                type: 'text',
                text: `👌 已設定分類為「${res.label}」。請選擇優先級：`,
                quickReply: quickReply
            };
            try {
                await lineUtils.replyToLine(ctx.replyToken, [message]);
            } catch (qrError) {
                console.error('[Todo] Failed to send Priority Quick Reply', qrError);
                await lineUtils.replyText(ctx.replyToken, `👌 已設定分類為「${res.label}」。(選單顯示失敗，請手動輸入優先級)`);
            }
        } else {
            console.error('[Todo] Update Category Failed:', res.message);
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
            let category = 'other'; // default

            // Keywords Mapping
            const priorityMap = {
                '高': 'high', 'high': 'high', '急': 'high', '🔴': 'high',
                '中': 'medium', 'medium': 'medium', '🟡': 'medium',
                '低': 'low', 'low': 'low', '🟢': 'low'
            };
            const categoryMap = {
                '新機': 'new', '新': 'new', 'new': 'new', '🆕': 'new',
                '維修': 'repair', '修': 'repair', 'repair': 'repair', 'fix': 'repair', '🔧': 'repair',
                '其他': 'other', 'other': 'other', '📋': 'other'
            };

            // Parse Priority
            const priorityRegex = /(!|\[)?(高|中|低|急|緩|high|medium|low|🔴|🟡|🟢)(!|\])?/i;
            const pMatch = content.match(priorityRegex);
            if (pMatch) {
                const pKey = pMatch[2].toLowerCase();
                if (priorityMap[pKey]) {
                    priority = priorityMap[pKey];
                    // Replace only the first occurrence to avoid removing content words
                    content = content.replace(pMatch[0], ' ').trim();
                }
            }

            // Parse Category
            for (const [key, val] of Object.entries(categoryMap)) {
                // Regex to match keyword as a token (space/bracket around it) or at boundaries
                const catRegex = new RegExp(`(^|[\\s\\[【])(${key})($|[\\s\\]】])`, 'i');
                const cMatch = content.match(catRegex);
                if (cMatch) {
                    category = val;
                    content = content.replace(cMatch[0], ' ').trim();
                    break;
                }
            }

            // Cleanup extra spaces
            content = content.replace(/\s+/g, ' ').trim();

            if (content) {
                const newItem = await addTodo(targetId, content, userId, priority, category);

                // Construct Quick Reply for Category (Step 1)
                const quickReply = {
                    items: [
                        {
                            type: 'action',
                            action: { type: 'postback', label: '🆕 新機', data: `action=update_category&groupId=${targetId}&id=${newItem.createdAt}&category=new`, displayText: '設定為：新機' }
                        },
                        {
                            type: 'action',
                            action: { type: 'postback', label: '🔧 維修', data: `action=update_category&groupId=${targetId}&id=${newItem.createdAt}&category=repair`, displayText: '設定為：維修' }
                        },
                        {
                            type: 'action',
                            action: { type: 'postback', label: '📋 其他', data: `action=update_category&groupId=${targetId}&id=${newItem.createdAt}&category=other`, displayText: '設定為：其他' }
                        }
                    ]
                };

                const message = {
                    type: 'text',
                    text: `✅ 已新增${newItem.emoji}：[${newItem.catLabel}] ${newItem.text}\n(請選擇分類，獲取更精確的標籤)`,
                    quickReply: quickReply
                };

                await lineUtils.replyToLine(replyToken, [message]);
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
    updateTodoPriority,
    updateTodoCategory,
    clearTodos,
    handleTodoCommand,
    handleTodoPostback
};
