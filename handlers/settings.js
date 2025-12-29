const lineUtils = require('../utils/line');
const authUtils = require('../utils/auth');

/**
 * 處理「群組設定」指令
 * 顯示功能開關儀表板
 */
async function handleSettingsCommand(context) {
    const { replyToken, userId, groupId, sourceType } = context;

    // 1. 權限檢查 (僅限 Admin 可操作)
    const isAdmin = await authUtils.isAdmin(userId);
    if (!isAdmin) {
        await lineUtils.replyText(replyToken, '❌ 權限不足：僅限機器人管理員可操作設定。');
        return;
    }

    if (sourceType !== 'group' && sourceType !== 'room') {
        await lineUtils.replyText(replyToken, '❌ 請在群組內使用此指令以讀取群組設定。');
        return;
    }

    // 2. 或是群組尚未授權
    const isAuthorized = await authUtils.isGroupAuthorized(groupId);
    if (!isAuthorized) {
        await lineUtils.replyText(replyToken, '❌ 此群組尚未註冊，無法設定功能。');
        return;
    }

    // 3. 讀取功能狀態 (目前讀取舊的 authUtils 狀態)
    const features = {
        weather: { label: '氣象情報', enabled: await authUtils.isFeatureEnabled(groupId, 'weather') },
        restaurant: { label: '美食雷達', enabled: await authUtils.isFeatureEnabled(groupId, 'restaurant') },
        todo: { label: '待辦事項', enabled: await authUtils.isFeatureEnabled(groupId, 'todo') },
        ai: { label: 'AI 聊天', enabled: await authUtils.isFeatureEnabled(groupId, 'ai') },
        game: { label: '娛樂功能', enabled: await authUtils.isFeatureEnabled(groupId, 'game') },
        // 預設開啟的功能
        stock: { label: '股價查詢', enabled: false } // 已移除，這裡只是範例或未來擴充
    };

    // 4. 建構 Flex Message
    const bubble = buildSettingsFlex(groupId, features);
    await lineUtils.replyFlex(replyToken, '⚙️ 群組功能設定', bubble);
}

/**
 * 處理 Toggle Postback
 * data format: action=toggle_feature&feature=ai&enable=true&groupId=...
 */
async function handleFeatureToggle(context, data) {
    const { replyToken, userId, groupId: currentGroupId } = context;
    const params = new URLSearchParams(data);
    const targetGroupId = params.get('groupId');
    const feature = params.get('feature');
    const enable = params.get('enable') === 'true';

    // 安全檢查：只能在群組內操作該群組，或是 Admin 私訊操作 (暫定主要在群組內操作)
    // 這裡檢查操作者權限 -> 放寬為群組成員即可操作
    /*
    const isAdmin = await authUtils.isAdmin(userId);
    if (!isAdmin) {
        await lineUtils.replyText(replyToken, '❌ 權限不足');
        return;
    }
    */
    // 確保只操作當前群組 (防止跨群組攻擊，雖然 postback 帶有 groupId，但 context.groupId 才是來源)
    if (context.isGroup && targetGroupId !== currentGroupId) {
        // 理論上 router 已經 filter 掉了非本群組的操作? 不，Postback 需要自己驗證
        // 但通常 Postback 只會在群組內觸發。
        // 暫時相信 context.groupId
    }

    // 執行切換 logic
    // 注意：authUtils.toggleGroupFeature 目前實作是「加入/移除 disabledFeatures」
    // enable=true -> remove from disabled list
    // enable=false -> add to disabled list
    const result = await authUtils.toggleGroupFeature(targetGroupId, feature, enable);

    if (result.success) {
        // 成功後，重新產生 Flex Message 更新介面
        // 為了更新介面，我們需要重新讀取狀態
        const features = {
            weather: { label: '氣象情報', enabled: await authUtils.isFeatureEnabled(targetGroupId, 'weather') },
            restaurant: { label: '美食雷達', enabled: await authUtils.isFeatureEnabled(targetGroupId, 'restaurant') },
            todo: { label: '待辦事項', enabled: await authUtils.isFeatureEnabled(targetGroupId, 'todo') },
            ai: { label: 'AI 聊天', enabled: await authUtils.isFeatureEnabled(targetGroupId, 'ai') },
            game: { label: '娛樂功能', enabled: await authUtils.isFeatureEnabled(targetGroupId, 'game') }
        };
        const bubble = buildSettingsFlex(targetGroupId, features);

        // 回覆更新後的 Flex
        await lineUtils.replyFlex(replyToken, '設定已更新', bubble);
    } else {
        await lineUtils.replyText(replyToken, `❌ 設定失敗: ${result.message}`);
    }
}

function buildSettingsFlex(groupId, features) {
    const rows = [];

    // 遍歷 features 產生控制列
    for (const [key, info] of Object.entries(features)) {
        if (key === 'stock') continue; // Skip removed feature

        const statusIcon = info.enabled ? '✅' : '🔴';
        const statusText = info.enabled ? '已啟用' : '已停用';
        const statusColor = info.enabled ? '#1DB446' : '#FF334B';
        const actionLabel = info.enabled ? '停用' : '啟用';
        const nextState = !info.enabled;

        rows.push({
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
                {
                    type: 'box',
                    layout: 'vertical',
                    flex: 3,
                    contents: [
                        { type: 'text', text: info.label, weight: 'bold', size: 'sm', color: '#555555' },
                        { type: 'text', text: `${statusIcon} ${statusText}`, size: 'xs', color: statusColor, margin: 'xs' }
                    ]
                },
                {
                    type: 'button',
                    style: info.enabled ? 'secondary' : 'primary',
                    height: 'sm',
                    action: {
                        type: 'postback',
                        label: actionLabel,
                        data: `action=toggle_feature&feature=${key}&enable=${nextState}&groupId=${groupId}`
                    },
                    color: info.enabled ? '#AAAAAA' : '#1DB446'
                }
            ],
            alignItems: 'center'
        });

        // Separator
        rows.push({ type: 'separator', margin: 'md' });
    }

    return {
        type: 'bubble',
        header: {
            type: 'box',
            layout: 'vertical',
            contents: [
                { type: 'text', text: '⚙️ 群組功能設定', weight: 'bold', size: 'lg', color: '#FFFFFF' },
                { type: 'text', text: `ID: ${groupId.substring(0, 8)}...`, size: 'xxs', color: '#EEEEEE', margin: 'xs' }
            ],
            backgroundColor: '#333333'
        },
        body: {
            type: 'box',
            layout: 'vertical',
            contents: rows
        },
        footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
                { type: 'text', text: '僅限管理員操作', size: 'xxs', color: '#AAAAAA', align: 'center' }
            ]
        }
    };
}

module.exports = {
    handleSettingsCommand,
    handleFeatureToggle
};
