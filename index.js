require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');

const app = express();
app.set('view engine', 'ejs');
const PORT = 3000;

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: process.env.DB_PASSWORD,
  database: 'quanlybanhang'
});

db.connect((err) => {
  if (err) {
    console.error('Loi ket noi database:', err);
    return;
  }
  console.log('Da ket noi MySQL thanh cong!');
});

app.get('/sanpham', (req, res) => {
  db.query('SELECT * FROM sanpham', (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send('Loi truy van database');
      return;
    }
    res.render('sanpham', { sanpham: results });
  });
});

app.listen(PORT, () => {
  console.log(`Server dang chay o http://localhost:${PORT}`);
});