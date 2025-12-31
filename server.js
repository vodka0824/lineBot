const express = require('express');
const { lineBot } = require('./index');

const app = express();
app.use(express.json());

// LINE Webhook 路由
app.post('/webhook', lineBot);

// 健康檢查端點
app.get('/', (req, res) => res.send('LINE Bot is running!'));

// Cron Endpoints
const cronHandler = require('./handlers/cron');
app.get('/api/cron/horoscope', cronHandler.handleHoroscopePrefetch);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
