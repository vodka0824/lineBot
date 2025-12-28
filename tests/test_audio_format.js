const axios = require('axios');

async function testAudioFormat() {
    const romanization = 'lí hó';
    const audioUrl = `https://hapsing.itaigi.tw/bangtsam?taibun=${encodeURIComponent(romanization)}`;

    console.log('Testing URL:', audioUrl);

    try {
        const res = await axios.get(audioUrl, {
            timeout: 10000,
            responseType: 'arraybuffer'
        });

        const buffer = Buffer.from(res.data);

        console.log('Status:', res.status);
        console.log('Content-Type:', res.headers['content-type']);
        console.log('Content-Length:', res.headers['content-length']);
        console.log('Buffer Length:', buffer.length);

        // 檢查音檔格式 (Magic Bytes)
        const header = buffer.slice(0, 12).toString('hex');
        console.log('File Header (hex):', header);

        // 常見格式
        // MP3: starts with 'fffb' or 'fff3' or 'ID3'
        // WAV: starts with 'RIFF'
        // M4A: starts with 'ftypM4A' or 'ftypisom'
        // OGG: starts with 'OggS'

        const headerStr = buffer.slice(0, 4).toString('utf8');
        console.log('Header String:', headerStr);

        if (header.startsWith('fff') || header.startsWith('494433')) {
            console.log('Format: MP3');
        } else if (headerStr === 'RIFF') {
            console.log('Format: WAV');
        } else if (headerStr === 'OggS') {
            console.log('Format: OGG');
        } else if (header.includes('66747970')) { // 'ftyp'
            console.log('Format: M4A/MP4');
        } else {
            console.log('Format: Unknown');
        }

        // LINE Audio Message 需求:
        // - 格式: M4A (首選) 或 MP3 (也可能支持)
        // - HTTPS URL
        // - 需要指定 duration (毫秒)

    } catch (e) {
        console.log('Error:', e.message);
    }
}

testAudioFormat();
