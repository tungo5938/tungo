const { loadEnv } = require('./lib/env');
loadEnv();

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/health', require('./routes/health'));
app.use('/api/coding-sessions', require('./routes/coding'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/products', require('./routes/products'));
app.use('/api/bonus', require('./routes/bonus'));
app.use('/api/ideas', require('./routes/ideas'));
app.use('/api/settings', require('./routes/settings'));

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => {
  console.log(`Hermes Deck running at http://localhost:${PORT}`);
});
