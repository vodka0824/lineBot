const { Firestore } = require('@google-cloud/firestore');
const db = new Firestore();

async function testSetDotNotation() {
    const docRef = db.collection('test_debug').doc('dot_notation_test');

    console.log('Testing set with dot notation key...');
    await docRef.set({
        'nested.field': 'value1'
    }, { merge: true });

    const doc = await docRef.get();
    console.log('Result data:', JSON.stringify(doc.data(), null, 2));

    if (doc.data()['nested.field'] === 'value1') {
        console.log('Confirmed: set() with dot notation created a FLAT key with dot in name.');
    } else if (doc.data().nested && doc.data().nested.field === 'value1') {
        console.log('Confirmed: set() with dot notation created a NESTED object.');
    } else {
        console.log('Unknown result.');
    }

    // Clean up
    await docRef.delete();
}

async function testSetNestedObject() {
    const docRef = db.collection('test_debug').doc('nested_object_test');

    console.log('\nTesting set with nested object structure...');
    await docRef.set({
        nested: {
            field: 'value2'
        }
    }, { merge: true });

    const doc = await docRef.get();
    console.log('Result data:', JSON.stringify(doc.data(), null, 2));

    // Test merge
    await docRef.set({
        nested: {
            other: 'value3'
        }
    }, { merge: true });

    const docAfterMerge = await docRef.get();
    console.log('Result after merge:', JSON.stringify(docAfterMerge.data(), null, 2));

    // Clean up
    await docRef.delete();
}

(async () => {
    try {
        await testSetDotNotation();
        await testSetNestedObject();
    } catch (e) {
        console.error(e);
    }
})();
