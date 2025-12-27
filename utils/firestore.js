/**
 * Firestore 操作模組
 */
const { Firestore } = require('@google-cloud/firestore');

const db = new Firestore();

module.exports = { db, Firestore };
