require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');

const app = express();
const PORT = 3000;

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: process.env.DB_PASSWORD,
  database: 'student'
});

db.connect((err) => {
  if (err) {
    console.error('Loi ket noi database:', err);
    return;
  }
  console.log('Da ket noi MySQL thanh cong!');
});

app.get('/', (req, res) => {
  res.send('Xin chao, server dang chay!');
});

app.listen(PORT, () => {
  console.log(`Server dang chay o http://localhost:${PORT}`);
});