const express = require('express');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const transitions = { Moi: ['Xac nhan', 'Da huy'], 'Xac nhan': ['Dang giao', 'Da huy'], 'Dang giao': ['Da giao'], 'Da giao': [], 'Da huy': [] };
class OrderError extends Error { constructor(status, message) { super(message); this.status = status; } }
function integer(value, max = 2147483647) {
  if (!['string', 'number'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw new OrderError(400, 'ID hoặc số lượng không hợp lệ');
  return Number(value);
}
function cartLines(cart = {}) {
  if (!cart || typeof cart !== 'object' || Array.isArray(cart)) throw new OrderError(400, 'Giỏ hàng không hợp lệ');
  const lines = Object.entries(cart).map(([id, qty]) => ({ id: integer(id), qty: integer(qty, 99) })).sort((a, b) => a.id - b.id);
  if (!lines.length || lines.length > 100) throw new OrderError(400, 'Giỏ hàng cần có từ 1 đến 100 sản phẩm');
  return lines;
}
function address(body) {
  const fields = { ten_nguoi_nhan: 100, sdt_nguoi_nhan: 20, dia_chi_giao: 500 };
  const result = {};
  for (const [field, max] of Object.entries(fields)) {
    if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > max) throw new OrderError(400, 'Vui lòng nhập đầy đủ thông tin giao hàng hợp lệ');
    result[field] = body[field].trim();
  }
  if (!/^\+?[0-9 ()-]{8,20}$/.test(result.sdt_nguoi_nhan)) throw new OrderError(400, 'Số điện thoại không hợp lệ');
  return result;
}
async function requireTransactionalTables(conn) {
  const [tables] = await conn.query("SELECT TABLE_NAME, ENGINE FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('sanpham', 'donhang', 'chitietdonhang')");
  if (tables.length !== 3 || tables.some(t => String(t.ENGINE).toUpperCase() !== 'INNODB')) throw new OrderError(409, 'Đặt hàng cần cả ba bảng sanpham, donhang, chitietdonhang dùng InnoDB. Kiểm tra database trước khi tiếp tục.');
}
async function findOrder(db, userId, token) {
  const [rows] = await db.query('SELECT id FROM donhang WHERE khachhang_id = ? AND checkout_token = ?', [userId, token]);
  return rows[0]?.id;
}
async function checkout(pool, userId, cart, shipping, token) {
  const previous = await findOrder(pool, userId, token);
  if (previous) return previous;
  const lines = cartLines(cart);
  const conn = await pool.getConnection();
  try {
    await requireTransactionalTables(conn);
    await conn.beginTransaction();
    // Lock products in a consistent order. Prices/stock are re-read inside this transaction.
    const items = []; let total = 0;
    for (const line of lines) {
      const [rows] = await conn.query('SELECT id, ten_sp, gia, so_luong_ton FROM sanpham WHERE id = ? FOR UPDATE', [line.id]);
      const p = rows[0];
      if (!p || Number(p.so_luong_ton) < line.qty) throw new OrderError(409, 'Sản phẩm đã hết hoặc không đủ tồn kho. Hãy cập nhật giỏ hàng.');
      const price = Number(p.gia);
      if (!Number.isSafeInteger(price) || price < 0) throw new OrderError(409, 'Giá sản phẩm không hợp lệ');
      total += price * line.qty;
      if (!Number.isSafeInteger(total) || total > 2147483647) throw new OrderError(400, 'Tổng đơn vượt giới hạn hỗ trợ');
      items.push({ ...line, price, name: p.ten_sp });
    }
    const [order] = await conn.query("INSERT INTO donhang (khachhang_id, ngay_dat, trang_thai, tong_tien, ten_nguoi_nhan, sdt_nguoi_nhan, dia_chi_giao, phuong_thuc_thanh_toan, checkout_token) VALUES (?, CURRENT_DATE(), 'Moi', ?, ?, ?, ?, 'COD', ?)", [userId, total, shipping.ten_nguoi_nhan, shipping.sdt_nguoi_nhan, shipping.dia_chi_giao, token]);
    for (const item of items) {
      await conn.query('INSERT INTO chitietdonhang (donhang_id, sanpham_id, so_luong, don_gia, ten_sp_snapshot) VALUES (?, ?, ?, ?, ?)', [order.insertId, item.id, item.qty, item.price, item.name]);
      const [updated] = await conn.query('UPDATE sanpham SET so_luong_ton = so_luong_ton - ? WHERE id = ? AND so_luong_ton >= ?', [item.qty, item.id, item.qty]);
      if (updated.affectedRows !== 1) throw new OrderError(409, 'Tồn kho vừa thay đổi. Hãy thử lại.');
    }
    await conn.commit(); return order.insertId;
  } catch (error) {
    await conn.rollback();
    if (error.code === 'ER_DUP_ENTRY' || error.status === 409) { const id = await findOrder(conn, userId, token); if (id) return id; }
    throw error;
  } finally { conn.release(); }
}
async function changeStatus(pool, id, target, ownerId = null) {
  if (!Object.hasOwn(transitions, target)) throw new OrderError(400, 'Trạng thái không hợp lệ');
  const conn = await pool.getConnection();
  try {
    await requireTransactionalTables(conn);
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id, trang_thai, khachhang_id FROM donhang WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) throw new OrderError(404, 'Không tìm thấy đơn');
    if (ownerId !== null && Number(rows[0].khachhang_id) !== Number(ownerId)) throw new OrderError(404, 'Không tìm thấy đơn');
    const current = rows[0].trang_thai;
    if (ownerId !== null && (target !== 'Da huy' || !['Moi', 'Da huy'].includes(current))) throw new OrderError(409, 'Khách chỉ được hủy đơn mới, trước khi cửa hàng xác nhận');
    if (current === target) { await conn.commit(); return; }
    if (!transitions[current]?.includes(target)) throw new OrderError(409, 'Không thể chuyển trạng thái đơn theo hướng này');
    // Only new COD orders created here have reserved inventory. Do not restock legacy orders.
    if (target === 'Da huy') {
      const [orders] = await conn.query('SELECT checkout_token FROM donhang WHERE id = ?', [id]);
      if (!orders[0]?.checkout_token) throw new OrderError(409, 'Đơn cũ cần xử lý tồn kho thủ công trước khi hủy');
      const [details] = await conn.query('SELECT sanpham_id, so_luong FROM chitietdonhang WHERE donhang_id = ? ORDER BY sanpham_id', [id]);
      for (const detail of details) {
        const [updated] = await conn.query('UPDATE sanpham SET so_luong_ton = so_luong_ton + ? WHERE id = ?', [detail.so_luong, detail.sanpham_id]);
        if (updated.affectedRows !== 1) throw new OrderError(409, 'Không thể hoàn tồn kho cho sản phẩm đã xóa');
      }
    }
    await conn.query('UPDATE donhang SET trang_thai = ? WHERE id = ?', [target, id]);
    await conn.commit();
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
function createOrderRouter(db) {
  const pool = db.promise(); const router = express.Router();
  router.use((req, res, next) => {
    if (req.session.khachhang) {
      req.session.cartCsrf ||= randomBytes(32).toString('hex');
      res.locals.cartCsrf = req.session.cartCsrf;
    }
    const ownRoute = /^\/(giohang(?:\/|$)|dathang(?:\/|$)|donhang(?:\/|$)|admin\/donhang(?:\/|$))/.test(req.path);
    if (!ownRoute) return next();
    if (!req.session.khachhang) return res.redirect('/dangnhap');
    req.session.cartCsrf ||= randomBytes(32).toString('hex');
    res.locals.cartCsrf = req.session.cartCsrf;
    if (req.method === 'POST') {
      const supplied = req.body?._csrf;
      if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(req.session.cartCsrf))) return res.status(403).send('Phiên biểu mẫu không hợp lệ. Tải lại trang rồi thử lại.');
    }
    next();
  });
  router.get('/giohang', async (req, res) => {
    const cart = req.session.cart || {}; const ids = Object.keys(cart);
    let items = [];
    if (ids.length) {
      const lines = cartLines(cart);
      const [rows] = await pool.query('SELECT id, ten_sp, gia, so_luong_ton FROM sanpham WHERE id IN (?)', [lines.map(p => p.id)]);
      items = lines.map(line => { const p = rows.find(p => p.id === line.id); return { id: line.id, ten_sp: p?.ten_sp || 'Sản phẩm không còn tồn tại', gia: p ? Number(p.gia) : 0, so_luong_ton: p?.so_luong_ton || 0, qty: line.qty }; });
    }
    req.session.checkoutToken ||= randomBytes(32).toString('hex');
    res.render('giohang', { items, total: items.reduce((sum, p) => sum + p.gia * p.qty, 0), checkoutToken: req.session.checkoutToken });
  });
  router.post('/giohang/them', (req, res) => {
    const id = integer(req.body.id); const qty = integer(req.body.qty === undefined ? 1 : req.body.qty, 99);
    req.session.cart ||= {};
    if (!req.session.cart[id] && Object.keys(req.session.cart).length >= 100) throw new OrderError(400, 'Giỏ hàng tối đa 100 sản phẩm');
    const nextQty = (req.session.cart[id] || 0) + qty;
    if (nextQty > 99) throw new OrderError(400, 'Tối đa 99 đơn vị mỗi sản phẩm');
    req.session.cart[id] = nextQty; delete req.session.checkoutToken;
    res.redirect('/giohang');
  });
  router.post('/giohang/capnhat', (req, res) => {
    const id = integer(req.body.id); const qty = integer(req.body.qty, 99);
    if (!req.session.cart?.[id]) throw new OrderError(404, 'Sản phẩm chưa có trong giỏ');
    req.session.cart[id] = qty; delete req.session.checkoutToken; res.redirect('/giohang');
  });
  router.post('/giohang/xoa', (req, res) => {
    const id = integer(req.body.id); if (req.session.cart) delete req.session.cart[id];
    delete req.session.checkoutToken; res.redirect('/giohang');
  });
  router.post('/dathang', async (req, res) => {
    const shipping = address(req.body);
    const token = req.body.checkout_token;
    if (typeof token !== 'string' || token !== req.session.checkoutToken || !/^[a-f0-9]{64}$/.test(token)) throw new OrderError(400, 'Biểu mẫu đặt hàng đã cũ. Mở lại giỏ hàng.');
    const id = await checkout(pool, req.session.khachhang.id, req.session.cart, shipping, token);
    req.session.cart = {}; // Keep token so a retry redirects to the same persisted order.
    res.redirect(`/donhang/${id}`);
  });
  router.get('/donhang', async (req, res) => {
    const [orders] = await pool.query('SELECT * FROM donhang WHERE khachhang_id = ? ORDER BY id DESC LIMIT 100', [req.session.khachhang.id]);
    res.render('donhang', { orders, admin: false, transitions });
  });
  router.get('/donhang/:id', async (req, res) => {
    const id = integer(req.params.id);
    const isAdmin = req.session.khachhang.vai_tro === 'admin';
    const [orders] = await pool.query(`SELECT * FROM donhang WHERE id = ?${isAdmin ? '' : ' AND khachhang_id = ?'}`, isAdmin ? [id] : [id, req.session.khachhang.id]);
    if (!orders.length) throw new OrderError(404, 'Không tìm thấy đơn');
    const [details] = await pool.query('SELECT c.*, COALESCE(c.ten_sp_snapshot, s.ten_sp) AS ten_sp FROM chitietdonhang c LEFT JOIN sanpham s ON s.id = c.sanpham_id WHERE c.donhang_id = ? ORDER BY c.id', [id]);
    res.render('chitiet-donhang', { order: orders[0], details });
  });
  router.post('/donhang/:id/huy', async (req, res) => {
    const id = integer(req.params.id);
    await changeStatus(pool, id, 'Da huy', req.session.khachhang.id);
    res.redirect(`/donhang/${id}`);
  });
  router.use('/admin/donhang', (req, res, next) => {
    if (req.session.khachhang.vai_tro !== 'admin') return res.status(403).send('Chỉ admin được quản lý đơn'); next();
  });
  router.get('/admin/donhang', async (req, res) => {
    const [orders] = await pool.query('SELECT * FROM donhang ORDER BY id DESC LIMIT 100');
    res.render('donhang', { orders, admin: true, transitions });
  });
  router.post('/admin/donhang/:id/trangthai', async (req, res) => {
    await changeStatus(pool, integer(req.params.id), req.body.trang_thai); res.redirect('/admin/donhang');
  });
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.status || 500).send(error.status ? error.message : 'Không xử lý được đơn hàng. Kiểm tra migration hoặc thử lại.');
  });
  return router;
}
module.exports = { createOrderRouter, checkout, changeStatus, cartLines, address, transitions, integer, OrderError, requireTransactionalTables };
