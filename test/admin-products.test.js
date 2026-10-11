const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const path = require('node:path');
const { createProductRouter, updateProduct, productVersion } = require('../src/admin-products');
const { createOrderRouter } = require('../src/orders');
const { parseProduct } = require('../src/product');
const product = { id: 1, ten_sp: 'Tai nghe', gia: 150000, so_luong_ton: 10, danh_muc: 'Phu kien', mo_ta: '', thuong_hieu: '', tu_khoa: 'bluetooth' };
function fakePool(p = product) {
  const events = [];
  const query = async (sql, values) => {
    events.push({ sql, values });
    if (sql.includes('information_schema.tables')) return [[{ ENGINE: 'InnoDB' }, { ENGINE: 'InnoDB' }, { ENGINE: 'InnoDB' }]];
    if (sql.startsWith('SELECT * FROM sanpham')) return [values[0] === 999 ? [] : [{ ...p }]];
    return [{ affectedRows: 1 }];
  };
  const conn = { query, beginTransaction: async () => events.push({ sql: 'BEGIN' }), commit: async () => events.push({ sql: 'COMMIT' }), rollback: async () => events.push({ sql: 'ROLLBACK' }), release: () => events.push({ sql: 'RELEASE' }) };
  return { query, getConnection: async () => conn, events };
}
test('admin update locks product and writes validated values without changing order snapshots', async () => {
  const pool = fakePool(); const newProduct = parseProduct({ ...product, gia: '170000', so_luong_ton: '15', ten_sp: 'Tai nghe moi' });
  await updateProduct(pool, 1, newProduct, productVersion(product));
  const query = pool.events.find(e => e.sql.startsWith('UPDATE sanpham'));
  assert.deepEqual(query.values, ['Tai nghe moi', 170000, 15, 'Phu kien', '', '', 'bluetooth', 1]);
  assert.ok(pool.events.some(e => e.sql.includes('FOR UPDATE')));
  assert.ok(pool.events.some(e => e.sql === 'COMMIT'));
  assert.ok(!pool.events.some(e => /UPDATE (donhang|chitietdonhang)/.test(e.sql)));
});
test('stale stock or metadata is rejected, preventing overwriting a checkout/admin change', async () => {
  for (const current of [{ ...product, so_luong_ton: 9 }, { ...product, mo_ta: 'Changed' }]) {
    const pool = fakePool(current);
    await assert.rejects(updateProduct(pool, 1, parseProduct(product), productVersion(product)), e => e.status === 409);
    assert.ok(pool.events.some(e => e.sql === 'ROLLBACK'));
    assert.ok(!pool.events.some(e => e.sql.startsWith('UPDATE')));
  }
});
test('product edit HTTP routes enforce admin and CSRF; validate data and render escaped fields', async () => {
  const pool = fakePool({ ...product, ten_sp: '<script>Test</script>' });
  const app = express(); app.set('view engine', 'ejs'); app.set('views', path.join(__dirname, '../views'));
  app.use(express.urlencoded({ extended: true })); app.use(session({ secret: 'test-only', saveUninitialized: false, resave: false }));
  app.get('/test-login/:role', (req, res) => { req.session.khachhang = { id: 2, ten: 'Test', vai_tro: req.params.role }; res.send('ok'); });
  app.use((req, res, next) => { res.locals.currentUser = req.session.khachhang; next(); });
  const db = { promise: () => pool }; app.use(createOrderRouter(db)); app.use(createProductRouter(db));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async role => { const r = await fetch(base + '/test-login/' + role); return r.headers.get('set-cookie').split(';')[0]; };
  try {
    assert.equal((await fetch(base + '/admin/sanpham/1/sua', { redirect: 'manual' })).status, 302);
    const customer = await login('khach');
    assert.equal((await fetch(base + '/admin/sanpham/1/sua', { headers: { cookie: customer } })).status, 403);
    const cookie = await login('admin');
    const page = await fetch(base + '/admin/sanpham/1/sua', { headers: { cookie } }); const html = await page.text();
    assert.equal(page.status, 200); assert.match(html, /&lt;script&gt;/);
    const csrf = html.match(/name="cart-csrf" content="([a-f0-9]+)"/)[1];
    const version = html.match(/name="version" value="([a-f0-9]+)"/)[1];
    const post = body => fetch(base + '/admin/sanpham/1/sua', { method: 'POST', headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body), redirect: 'manual' });
    assert.equal((await post(product)).status, 403);
    assert.equal((await post({ ...product, _csrf: csrf, version, gia: -1 })).status, 400);
    assert.equal((await post({ ...product, _csrf: csrf, version })).status, 302);
    assert.equal((await fetch(base + '/admin/sanpham/999/sua', { headers: { cookie } })).status, 404);
    assert.equal((await fetch(base + '/admin/sanpham/abc/sua', { headers: { cookie } })).status, 400);
  } finally { await new Promise(r => server.close(r)); }
});
