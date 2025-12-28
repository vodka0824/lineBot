const axios = require('axios');

async function testAudioUrl() {
    const romanization = 'lí hó';
    const audioUrl = `https://hapsing.itaigi.tw/bangtsam?taibun=${encodeURIComponent(romanization)}`;

    console.log('Testing URL:', audioUrl);

    try {
        const res = await axios.head(audioUrl, { timeout: 10000 });
        console.log('Status:', res.status);
        console.log('Content-Type:', res.headers['content-type']);
        console.log('Content-Length:', res.headers['content-length']);
    } catch (e) {
        console.log('HEAD Error:', e.message);

        // Try GET request
        try {
            const res = await axios.get(audioUrl, {
                timeout: 10000,
                responseType: 'arraybuffer'
            });
            console.log('GET Status:', res.status);
            console.log('GET Content-Type:', res.headers['content-type']);
            console.log('GET Data Length:', res.data?.length);
        } catch (e2) {
            console.log('GET Error:', e2.message);
        }
    }
}

testAudioUrl();
