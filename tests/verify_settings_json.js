const flexUtils = require('../utils/flex');

const SETTINGS_STRUCT = {
    life: {
        label: '🛠️ 生活小幫手',
        color: '#1DB446',
        items: {
            news: '生活資訊',
            finance: '匯率金融',
            weather: '天氣空氣',
            food: '美食搜尋',
            delivery: '物流服務'
        }
    },
    entertainment: {
        label: '🎮 娛樂與互動',
        color: '#FF334B',
        items: {
            voice: '語音互動',
            fun: '趣味功能',
            leaderboard: '群組排行'
        }
    },
    todo: {
        label: '📝 待辦事項',
        color: '#AA33FF',
        items: {}
    }
};

// Mock authUtils
const authUtils = {
    isFeatureEnabled: async () => true // Mock return true
};

async function buildSettingsFlex(groupId) {
    const bodyContents = [];

    // Iterate Top-Level Categories
    for (const [catKey, config] of Object.entries(SETTINGS_STRUCT)) {
        // 1. Get Master Switch Status
        const isMasterEnabled = await authUtils.isFeatureEnabled(groupId, catKey);

        // Header Row (Category Label + Master Toggle)
        // Using createBox for custom layout (Label + Status Button)
        const masterToggle = flexUtils.createBox('horizontal', [
            flexUtils.createText({ text: config.label, weight: 'bold', size: 'md', color: config.color, flex: 1, gravity: 'center' }),
            {
                type: 'text',
                text: isMasterEnabled ? '✅ 全區開啟' : '🔴 全區關閉',
                size: 'xs',
                color: isMasterEnabled ? '#1DB446' : '#FF334B',
                align: 'end',
                gravity: 'center',
                action: {
                    type: 'postback',
                    label: 'ToggleMaster',
                    data: `action=toggle_feature&feature=${catKey}&enable=${!isMasterEnabled}&groupId=${groupId}`
                }
            }
        ], { margin: 'lg', paddingAll: '5px', backgroundColor: '#F5F5F5', cornerRadius: '4px' });

        bodyContents.push(masterToggle);

        // 2. Sub-Items Grid
        const itemKeys = Object.keys(config.items);
        if (itemKeys.length > 0) {
            let currentRow = [];
            for (let i = 0; i < itemKeys.length; i++) {
                const itemKey = itemKeys[i];
                const itemLabel = config.items[itemKey];
                const fullKey = `${catKey}.${itemKey}`;
                const isItemEnabled = await authUtils.isFeatureEnabled(groupId, fullKey);
                const nextState = !isItemEnabled;

                const itemBox = flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: itemLabel, size: 'sm', color: '#555555', flex: 1, gravity: 'center' }),
                    flexUtils.createText({ text: isItemEnabled ? 'ON' : 'OFF', size: 'xxs', weight: 'bold', color: isItemEnabled ? '#1DB446' : '#AAAAAA', align: 'end', gravity: 'center' })
                ], {
                    backgroundColor: '#FFFFFF',
                    cornerRadius: '4px',
                    paddingAll: '4px',
                    margin: 'xs',
                    borderColor: '#EFEFEF',
                    borderWidth: '1px',
                    action: {
                        type: 'postback',
                        data: `action=toggle_feature&feature=${fullKey}&enable=${nextState}&groupId=${groupId}`
                    },
                    flex: 1
                });

                currentRow.push(itemBox);

                // Row constraints (2 items per row)
                if (currentRow.length === 2 || i === itemKeys.length - 1) {
                    bodyContents.push(flexUtils.createBox('horizontal', [...currentRow], { spacing: 'xs', margin: 'xs' }));
                    currentRow = [];
                }
            }
        }
    }

    // Build Final Bubble
    const header = flexUtils.createBox('vertical', [
        flexUtils.createText({ text: '⚙️ 群組功能設定', weight: 'bold', size: 'lg', color: '#FFFFFF' }),
        flexUtils.createText({ text: '點擊標題切換全區，點擊按鈕切換細項', size: 'xxs', color: '#DDDDDD' })
    ], { backgroundColor: '#333333' });

    return flexUtils.createBubble({
        header: header,
        body: flexUtils.createBox('vertical', bodyContents, { paddingAll: '12px', backgroundColor: '#FFFFFF' })
    });
}

// Generate JSON
(async () => {
    console.log('--- Generating Settings Flex JSON ---');
    try {
        const json = await buildSettingsFlex('Cxxxxxxxxx');

        // Simulate replyFlex wrapping
        const message = {
            type: "flex",
            altText: "Settings",
            contents: json
        };

        const fs = require('fs');
        fs.writeFileSync('tests/settings_payload.json', JSON.stringify(message, null, 2));
        console.log('JSON written to tests/settings_payload.json');
    } catch (e) {
        console.error(e);
    }
})();
