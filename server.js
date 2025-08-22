const express = require('express');
const path = require('path');

const app = express();

app.use(express.static(path.join(__dirname, 'app/dist/jarvis-fe/browser')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'app/dist/jarvis-fe/browser/index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
