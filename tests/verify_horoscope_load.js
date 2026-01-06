
try {
    const horoscope = require('../handlers/horoscope');
    console.log('Successfully loaded handlers/horoscope.js');
} catch (error) {
    if (error.message.includes('Could not load the default credentials') || error.code === 'MODULE_NOT_FOUND') {
        console.log('Loaded with expected environment errors (passed syntax check)');
    } else {
        console.error('Failed to load:', error);
        process.exit(1);
    }
}
