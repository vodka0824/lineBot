try {
    console.log('Starting debug...');
    require('./server.js');
    console.log('Server module required successfully');
} catch (error) {
    console.error('CRASH DURING STARTUP:', error);
}
