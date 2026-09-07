require('dotenv').config();
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer');
const xlsx = require('xlsx');
const upload = multer({ dest: 'uploads/' });
const express = require('express');
const mysql = require('mysql2');

const app = express();
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); 
app.use(session({ secret: 'day-la-chuoi-bi-mat-cua-ban', resave: false, saveUninitialized: false })); 
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

function yeuCauDangNhap(req, res, next) {
  if (!req.session.khachhang) {
    return res.redirect('/dangnhap');
  }
  next();
}

app.get('/sanpham', yeuCauDangNhap, (req, res) => {
  db.query('SELECT * FROM sanpham', (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send('Loi truy van database');
      return;
    }
    res.render('sanpham', { sanpham: results });
  });
});

app.post('/sanpham', yeuCauDangNhap, (req, res) => {
  const { ten_sp, gia, so_luong_ton, danh_muc } = req.body;
  const sql = 'INSERT INTO sanpham (ten_sp, gia, so_luong_ton, danh_muc) VALUES (?, ?, ?, ?)';
  db.query(sql, [ten_sp, gia, so_luong_ton, danh_muc], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).send('Loi them san pham');
      return;
    }
    res.redirect('/sanpham');
  });
});

app.post('/import-sanpham', yeuCauDangNhap, upload.single('file'), (req, res) => {
  const workbook = xlsx.readFile(req.file.path);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  const values = data.map(row => [row.ten_sp, row.gia, row.so_luong_ton, row.danh_muc]);

  const sql = 'INSERT INTO sanpham (ten_sp, gia, so_luong_ton, danh_muc) VALUES ?';
  db.query(sql, [values], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).send('Loi import Excel');
      return;
    }
    res.redirect('/sanpham');
  });
});

app.get('/dangky', (req, res) => {
  res.render('dangky');
});

app.post('/dangky', async (req, res) => {
  const { ten, email, mat_khau, sdt } = req.body;
  try {
    const hash = await bcrypt.hash(mat_khau, 10);
    const sql = 'INSERT INTO khachhang (ten, email, mat_khau, sdt) VALUES (?, ?, ?, ?)';
    db.query(sql, [ten, email, hash, sdt], (err, result) => {
      if (err) {
        console.error(err);
        res.status(500).send('Loi dang ky, co the email da ton tai');
        return;
      }
      res.send('Dang ky thanh cong! <a href="/dangky">Dang ky them</a>');
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Loi ma hoa mat khau');
  }
});

app.get('/dangnhap', (req, res) => {
  res.render('dangnhap');
});

app.post('/dangnhap', (req, res) => {
  const { email, mat_khau } = req.body;

  // Buoc 1: Tim khach hang co email nay trong database
  const sql = 'SELECT * FROM khachhang WHERE email = ?';

  db.query(sql, [email], async (err, results) => {
    // Neu co loi hoac khong tim thay email nao khop
    if (err || results.length === 0) {
      res.send('Email khong ton tai! <a href="/dangnhap">Thu lai</a>');
      return;
    }

    const khachhang = results[0];

    // Buoc 2: So sanh mat khau nguoi dung go voi mat khau da ma hoa trong database
    const matKhauDung = await bcrypt.compare(mat_khau, khachhang.mat_khau);

    if (!matKhauDung) {
      res.send('Sai mat khau! <a href="/dangnhap">Thu lai</a>');
      return;
    }

    // Buoc 3: Neu dung, luu thong tin khach hang vao session
    req.session.khachhang = khachhang;

    // Buoc 4: Chuyen huong ve trang san pham
    res.redirect('/sanpham');
  });
});

app.listen(PORT, () => {
  console.log(`Server dang chay o http://localhost:${PORT}`);
});