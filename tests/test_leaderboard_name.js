const fs = require('fs');
const path = require('path');

// Read handler code
const handlerPath = path.join(__dirname, '../handlers/leaderboard.js');
let handlerCode = fs.readFileSync(handlerPath, 'utf8');

// Mock dependencies
const mockLineUtils = {
    getGroupMemberName: async (gid, uid) => {
        console.log(`[MockLine] Fetching name for ${uid}...`);
        return 'MockUser_' + uid;
    }
};

const mockDocData = { displayName: 'ExistingUser' };
const mockDoc = {
    exists: true,
    data: () => mockDocData,
    id: 'user1'
};

const mockRef = {
    get: async () => mockDoc,
    update: async (data) => console.log('[MockDB] Update:', JSON.stringify(data)),
    set: async (data) => console.log('[MockDB] Set:', JSON.stringify(data))
};

const mockDb = {
    collection: () => ({
        doc: () => ({
            collection: () => ({
                doc: () => mockRef
            })
        })
    })
};

const mockFirestore = {
    FieldValue: {
        increment: (n) => `INCREMENT(${n})`
    }
};

// Inject mocks
// We need to inject `lineUtils` and `db` (which is instantiated inside the file)
// Since `db` is `new Firestore()`, we can just mock `Firestore` class?
// No, simpler to string replace.
let testCode = handlerCode.replace("const { Firestore } = require('@google-cloud/firestore');", "");
testCode = testCode.replace("const lineUtils = require('../utils/line');", "");
testCode = testCode.replace("const db = new Firestore();", "const db = mockDb;");

// Prepend mocks
const prefix = `
const mockLineUtils = {
    getGroupMemberName: async (gid, uid) => {
        console.log(\`[MockLine] Fetching name for \${uid}...\`);
        return 'FETCHED_NAME';
    }
};
const lineUtils = mockLineUtils; // Inject lineUtils

const mockDb = {
    collection: () => ({
        doc: () => ({
            collection: () => ({
                doc: () => mockRef
            })
        })
    })
};
const Firestore = { FieldValue: { increment: (n) => \`INC(\${n})\` } };
let mockDocExists = false;
let mockDocData = {};

const mockRef = {
    get: async () => ({ exists: mockDocExists, data: () => mockDocData }),
    update: async (data) => console.log('[MockDB] Update:', JSON.stringify(data)),
    set: async (data) => console.log('[MockDB] Set:', JSON.stringify(data))
};
`;

const tempPath = path.join(__dirname, 'temp_leaderboard_test.js');
fs.writeFileSync(tempPath, prefix + testCode);

const testedModule = require('./temp_leaderboard_test.js');

async function runTest() {
    console.log('--- Test 1: New User (No Name Provided) -> Should Fetch ---');
    mockDocExists = false;
    await testedModule.recordMessage('g1', 'u1');
    // Expected: [MockLine] Fetching..., [MockDB] Set: { ..., displayName: 'FETCHED_NAME' }

    console.log('\n--- Test 2: Existing User (No Name Provided, DB has Name) -> Should Use DB ---');
    mockDocExists = true;
    mockDocData = { displayName: 'DB_NAME' };
    await testedModule.recordMessage('g1', 'u1');
    // Expected: [MockDB] Update: { ..., displayName: 'DB_NAME' } -> Actually logic says: if finalDisplayName is set, update it.
    // Wait, in my code, if DB has name, `finalDisplayName` becomes 'DB_NAME'.
    // `...(finalDisplayName ? { displayName: finalDisplayName } : {})` will allow update.
    // Ideally if it's the same, maybe we don't need to write it, but writing it ensures consistency.

    console.log('\n--- Test 3: Existing User (Unknown Name in DB) -> Should Fetch ---');
    mockDocData = { displayName: '未知用戶' };
    await testedModule.recordMessage('g1', 'u1');
    // Expected: [MockLine] Fetching..., [MockDB] Update: { ..., displayName: 'FETCHED_NAME' }
}

runTest().catch(console.error).finally(() => {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
});
