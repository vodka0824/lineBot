const express = require('express');
const { lineBot } = require('./index');

const app = express();
app.use(express.json());

// LINE Webhook endpoint
app.post('/', lineBot);
app.get('/', (req, res) => res.send('LINE Bot is running!'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
