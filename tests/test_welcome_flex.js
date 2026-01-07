/**
 * Welcome Flex Message 測試腳本
 * 驗證 Flex 結構是否符合 LINE API 規範
 */

// 模擬 buildWelcomeFlex 的返回結果
const flexUtils = require('../utils/flex');

async function testWelcomeFlex() {
    console.log('=== Testing Welcome Flex Message Structure ===\n');

    // 模擬用戶資料
    const mockProfile = {
        displayName: '測試用戶',
        pictureUrl: 'https://via.placeholder.com/200x200'
    };

    // 模擬配置
    const mockConfig = {
        text: '歡迎加入，{user}！請先閱讀群組規則。',
        imageUrl: 'https://images.unsplash.com/photo-1542435503-956c469947f6?w=1000'
    };

    try {
        // 手動建構 Flex（與 welcome.js 相同）
        const displayName = mockProfile.displayName;
        const pictureUrl = mockProfile.pictureUrl;
        const welcomeText = mockConfig.text.replace('{user}', displayName);
        const heroUrl = mockConfig.imageUrl;

        const flex = flexUtils.createBubble({
            size: 'mega',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: '🌟 WELCOME', weight: 'bold', size: 'xl', color: '#1E90FF', align: 'center' }
                ],
                paddingBottom: '0px'
            },
            hero: {
                type: "image",
                url: heroUrl,
                size: "full",
                aspectRatio: "20:13",
                aspectMode: "cover"
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "image",
                                url: pictureUrl,
                                size: "md",
                                aspectMode: "cover",
                                aspectRatio: "1:1",
                                backgroundColor: "#CCCCCC",
                                cornerRadius: "100px",
                                flex: 0
                            },
                            {
                                type: "box",
                                layout: "vertical",
                                contents: [
                                    { type: 'spacer', size: 'xs' },
                                    { type: 'text', text: `Hi, ${displayName}`, weight: 'bold', size: 'lg', wrap: true },
                                    { type: 'text', text: '很高興認識你！', size: 'xs', color: '#888888', margin: 'xs' },
                                    { type: 'spacer', size: 'xs' }
                                ],
                                paddingStart: "15px"
                            }
                        ],
                        margin: "md"
                    },
                    { type: "separator", margin: "lg" },
                    {
                        type: "text",
                        text: welcomeText,
                        wrap: true,
                        size: "sm",
                        color: "#555555",
                        margin: "lg"
                    }
                ],
                paddingAll: "20px"
            }
        });

        // 驗證結構
        console.log('✅ Flex Message 建構成功\n');
        console.log('基本資訊:');
        console.log('  Type:', flex.type);
        console.log('  Size:', flex.size);
        console.log('  Has Header:', !!flex.header);
        console.log('  Has Hero:', !!flex.hero);
        console.log('  Has Body:', !!flex.body);
        console.log('');

        // 輸出完整 JSON
        console.log('=== Complete Flex JSON ===');
        const jsonString = JSON.stringify(flex, null, 2);
        console.log(jsonString);
        console.log('');

        // 檢查不支援的屬性
        const unsupportedProps = ['justifyContent', 'alignItems', 'marginBottom'];
        const found = unsupportedProps.filter(prop => jsonString.includes(prop));

        if (found.length > 0) {
            console.error('❌ 發現不支援的屬性:', found);
            console.error('   這些屬性會導致 LINE API 返回 400 錯誤！');
            process.exit(1);
        } else {
            console.log('✅ 未發現不支援的屬性');
        }

        // 驗證必要屬性
        console.log('\n=== 屬性驗證 ===');
        const checks = [
            { name: 'bubble.type', value: flex.type === 'bubble' },
            { name: 'hero.url (https)', value: flex.hero?.url?.startsWith('https://') },
            { name: 'body.contents (array)', value: Array.isArray(flex.body?.contents) },
            { name: 'No justifyContent', value: !jsonString.includes('justifyContent') }
        ];

        checks.forEach(check => {
            const status = check.value ? '✓' : '✗';
            console.log(`  ${status} ${check.name}`);
        });

        const allPassed = checks.every(c => c.value);
        console.log('');
        if (allPassed) {
            console.log('🎉 所有驗證通過！Flex Message 符合 LINE API 規範。');
            process.exit(0);
        } else {
            console.error('❌ 部分驗證失敗！請檢查上方錯誤。');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ 測試失敗:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testWelcomeFlex();
