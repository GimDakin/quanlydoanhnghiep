require('dotenv').config();
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('node:fs');
const upload = multer({ dest: require('path').join(__dirname, 'uploads'), limits: { fileSize: 5 * 1024 * 1024 } });
const { parseProduct } = require('./src/product');
const express = require('express');
const mysql = require('mysql2');

const app = express();
app.set('view engine', 'ejs');
app.set('views', require('path').join(__dirname, 'views'));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(require('path').join(__dirname, 'public')));
app.use(session({ secret: process.env.SESSION_SECRET || 'local-development-only-change-me', resave: false, saveUninitialized: false }));
app.use((req, res, next) => {
  res.locals.currentUser = req.session.khachhang || null;
  next();
});
const PORT = Number(process.env.PORT || 3000);

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'quanlybanhang'
});


function yeuCauDangNhap(req, res, next) {
  if (!req.session.khachhang) {
    return res.redirect('/dangnhap');
  }
  next();
}

app.get('/sanpham', yeuCauDangNhap, (req, res) => {
  const tuKhoa = req.query.search || '';
  const sql = 'SELECT * FROM sanpham WHERE ten_sp LIKE ?';

  db.query(sql, [`%${tuKhoa}%`], (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send('Loi truy van database');
      return;
    }
    res.render('sanpham', { sanpham: results, tuKhoa: tuKhoa });
  });
});

function yeuCauAdmin(req, res, next) {
  if (!req.session.khachhang || req.session.khachhang.vai_tro !== 'admin') {
    return res.status(403).send('Ban khong co quyen truy cap trang nay');
  }
  next();
}

app.post('/sanpham', yeuCauDangNhap, yeuCauAdmin, (req, res) => {
  let product;
  try { product = parseProduct(req.body); }
  catch (err) { return res.status(400).send(err.message); }
  const { ten_sp, gia, so_luong_ton, danh_muc, mo_ta, thuong_hieu, tu_khoa } = product;
  const sql = 'INSERT INTO sanpham (ten_sp, gia, so_luong_ton, danh_muc, mo_ta, thuong_hieu, tu_khoa) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.query(sql, [ten_sp, gia, so_luong_ton, danh_muc, mo_ta, thuong_hieu, tu_khoa], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).send('Loi them san pham');
      return;
    }
    res.redirect('/sanpham');
  });
});

app.post('/import-sanpham', yeuCauDangNhap, yeuCauAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('Vui long chon file Excel');
  let values;
  try {
    const workbook = xlsx.readFile(req.file.path);
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    if (!data.length || data.length > 5000) throw new Error('File phai co tu 1 den 5000 san pham');
    values = data.map(row => {
      const p = parseProduct(row);
      return [p.ten_sp, p.gia, p.so_luong_ton, p.danh_muc, p.mo_ta, p.thuong_hieu, p.tu_khoa];
    });
  } catch (err) { return res.status(400).send('File Excel khong hop le: ' + err.message); }
  finally { fs.unlinkSync(req.file.path); }
  db.query('INSERT INTO sanpham (ten_sp, gia, so_luong_ton, danh_muc, mo_ta, thuong_hieu, tu_khoa) VALUES ?', [values], (err) => {
    if (err) return res.status(500).send('Loi import Excel');
    res.redirect('/sanpham');
  });
});

app.use(require('./src/ai-shopping').createAIRouter(db));

// Manual recommendations remain available independently of AI.
const { parseCriteria, recommend } = require('./src/recommendation');
app.get('/', (req, res) => res.redirect('/sanpham'));
app.get('/sanpham/:id', yeuCauDangNhap, (req, res) => {
  if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(400).send('ID khong hop le');
  db.query('SELECT * FROM sanpham WHERE id = ?', [req.params.id], (err, rows) => {
    if (err) return res.status(500).send('Loi truy van database');
    if (!rows.length) return res.status(404).send('Khong tim thay san pham');
    res.render('chitiet-sanpham', { sp: rows[0] });
  });
});
app.get('/goiy', yeuCauDangNhap, (req, res) => res.render('goiy'));
app.post('/api/goiy', (req, res) => {
  if (!req.session.khachhang) return res.status(401).json({ error: 'Vui long dang nhap' });
  let criteria;
  try { criteria = parseCriteria(req.body); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  const clauses = ['so_luong_ton > 0', 'gia >= 0'];
  const values = [];
  if (criteria.budget !== null) { clauses.push('gia <= ?'); values.push(criteria.budget); }
  if (criteria.category) { clauses.push('danh_muc = ?'); values.push(criteria.category); }
  // Exact ranking across every eligible item; do not truncate before ranking.
  db.query(`SELECT id, ten_sp, gia, so_luong_ton, danh_muc, mo_ta, thuong_hieu, tu_khoa
    FROM sanpham WHERE ${clauses.join(' AND ')}`, values, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Loi truy van database. Kiem tra migration.' });
    res.json({ algorithm: 'content-v1', products: recommend(rows, criteria) });
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
    let matKhauDung = false;
    try { matKhauDung = typeof mat_khau === 'string' && typeof khachhang.mat_khau === 'string' && await bcrypt.compare(mat_khau, khachhang.mat_khau); }
    catch { matKhauDung = false; }

    if (!matKhauDung) {
      res.send('Sai mat khau! <a href="/dangnhap">Thu lai</a>');
      return;
    }

    // Buoc 3: Neu dung, luu thong tin khach hang vao session
    req.session.khachhang = { id: khachhang.id, ten: khachhang.ten, vai_tro: khachhang.vai_tro };

    // Buoc 4: Chuyen huong ve trang san pham
    res.redirect('/sanpham');
  });
});

app.get('/dangxuat', (req, res) => {
  req.session.destroy((err) => {
    res.redirect('/dangnhap');
  });
});

if (require.main === module) {
  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required in production');
  }
  db.getConnection((err, connection) => {
    if (err) { console.error('Khong ket noi duoc MySQL:', err.code); process.exitCode = 1; db.end(); return; }
    connection.release();
    app.listen(PORT, () => console.log(`Server dang chay o http://localhost:${PORT}`));
  });
}
module.exports = { app, db };
