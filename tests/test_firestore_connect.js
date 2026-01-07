const { Firestore } = require('@google-cloud/firestore');

async function testConnection() {
    console.log('Attempting to connect to Firestore...');
    try {
        const db = new Firestore();
        // Try to read a random doc, or list collections
        const collections = await db.listCollections();
        console.log('Connected successfully!');
        console.log('Collections:', collections.map(c => c.id).join(', '));

        // Try to read 'todos' collection
        // Just check if we can access it
        console.log('Checking "todos" collection...');
        const todosRef = db.collection('todos');
        const snapshot = await todosRef.limit(1).get();
        if (snapshot.empty) {
            console.log('No documents in "todos" collection.');
        } else {
            console.log('Successfully read from "todos" collection.');
            console.log('Sample doc ID:', snapshot.docs[0].id);
        }

    } catch (e) {
        console.error('Firestore Connection Failed:', e);
    }
}

testConnection();
