const express = require('express');
const { createHash, timingSafeEqual } = require('node:crypto');
const { parseProduct } = require('./product');
const { integer, OrderError, requireTransactionalTables } = require('./orders');
function productVersion(p) {
  return createHash('sha256').update(JSON.stringify([p.ten_sp, Number(p.gia), Number(p.so_luong_ton), p.danh_muc || '', p.mo_ta || '', p.thuong_hieu || '', p.tu_khoa || ''])).digest('hex');
}
async function updateProduct(pool, id, product, expectedVersion) {
  if (typeof expectedVersion !== 'string' || !/^[a-f0-9]{64}$/.test(expectedVersion)) throw new OrderError(400, 'Biểu mẫu đã cũ. Mở lại trang sửa sản phẩm.');
  const conn = await pool.getConnection();
  try {
    await requireTransactionalTables(conn);
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM sanpham WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) throw new OrderError(404, 'Không tìm thấy sản phẩm');
    if (productVersion(rows[0]) !== expectedVersion) throw new OrderError(409, 'Sản phẩm hoặc tồn kho đã thay đổi trong lúc bạn sửa. Mở lại trang sửa để xem dữ liệu mới nhất, rồi nhập lại.');
    await conn.query('UPDATE sanpham SET ten_sp = ?, gia = ?, so_luong_ton = ?, danh_muc = ?, mo_ta = ?, thuong_hieu = ?, tu_khoa = ? WHERE id = ?', [product.ten_sp, product.gia, product.so_luong_ton, product.danh_muc, product.mo_ta, product.thuong_hieu, product.tu_khoa, id]);
    await conn.commit();
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
function createProductRouter(db) {
  const router = express.Router(); const pool = db.promise();
  router.use('/admin/sanpham', (req, res, next) => {
    if (!req.session.khachhang) return res.redirect('/dangnhap');
    if (req.session.khachhang.vai_tro !== 'admin') return res.status(403).send('Chỉ admin được sửa sản phẩm');
    if (req.method === 'POST') {
      const token = req.body?._csrf;
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || typeof req.session.cartCsrf !== 'string' || !timingSafeEqual(Buffer.from(token), Buffer.from(req.session.cartCsrf))) return res.status(403).send('Phiên biểu mẫu không hợp lệ. Tải lại trang.');
    }
    next();
  });
  router.get('/admin/sanpham/:id/sua', async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM sanpham WHERE id = ?', [integer(req.params.id)]);
    if (!rows.length) throw new OrderError(404, 'Không tìm thấy sản phẩm');
    res.render('sua-sanpham', { sp: rows[0], version: productVersion(rows[0]) });
  });
  router.post('/admin/sanpham/:id/sua', async (req, res) => {
    const id = integer(req.params.id);
    let product;
    try { product = parseProduct(req.body); } catch (error) { throw new OrderError(400, error.message); }
    await updateProduct(pool, id, product, req.body.version);
    res.redirect(`/sanpham/${id}`);
  });
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.status || 500).send(error.status ? error.message : 'Không cập nhật được sản phẩm. Thử lại sau.');
  });
  return router;
}
module.exports = { createProductRouter, updateProduct, productVersion };
