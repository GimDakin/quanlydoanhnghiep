const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const path = require('node:path');
const { checkout, changeStatus, cartLines, address, createOrderRouter } = require('../src/orders');
const shipping = { ten_nguoi_nhan: 'Tester', sdt_nguoi_nhan: '0912345678', dia_chi_giao: 'Ha Noi' };
function fakePool({ shortage = false, failDetail = false, existing = false, status = 'Moi', legacy = false } = {}) {
  const events = []; let state = status;
  const query = async (sql, values) => {
    events.push({ sql, values });
    if (sql.includes('information_schema.tables')) return [[{ TABLE_NAME: 'sanpham', ENGINE: 'InnoDB' }, { TABLE_NAME: 'donhang', ENGINE: 'InnoDB' }, { TABLE_NAME: 'chitietdonhang', ENGINE: 'InnoDB' }]];
    if (sql.startsWith('SELECT id FROM donhang')) return [existing ? [{ id: 7 }] : []];
    if (sql.startsWith('SELECT id, ten_sp')) return [[{ id: values[0], ten_sp: 'Tai nghe', gia: 150000, so_luong_ton: shortage ? 0 : 10 }]];
    if (sql.startsWith('INSERT INTO donhang')) return [{ insertId: 7 }];
    if (sql.startsWith('INSERT INTO chitietdonhang') && failDetail) throw Error('Simulated detail write failure');
    if (sql.startsWith('SELECT id, trang_thai')) return [[{ id: 7, trang_thai: state, khachhang_id: 2 }]];
    if (sql.startsWith('SELECT checkout_token')) return [[{ checkout_token: legacy ? null : 'a'.repeat(64) }]];
    if (sql.startsWith('SELECT sanpham_id')) return [[{ sanpham_id: 1, so_luong: 2 }]];
    if (sql.startsWith('UPDATE donhang')) state = values[0];
    return [{ affectedRows: 1 }];
  };
  const conn = { query, beginTransaction: async () => events.push({ sql: 'BEGIN' }), commit: async () => events.push({ sql: 'COMMIT' }), rollback: async () => events.push({ sql: 'ROLLBACK' }), release: () => events.push({ sql: 'RELEASE' }) };
  return { query, getConnection: async () => conn, events };
}
test('cart/address validation rejects negative, oversized, empty and tampered values', () => {
  for (const cart of [{}, { 1: -1 }, { 1: 100 }, { abc: 1 }, { 1: 1.5 }]) assert.throws(() => cartLines(cart));
  assert.deepEqual(cartLines({ 2: 1, 1: 2 }), [{ id: 1, qty: 2 }, { id: 2, qty: 1 }]);
  assert.deepEqual(address(shipping), shipping);
  assert.throws(() => address({ ...shipping, sdt_nguoi_nhan: 'abc' }));
  assert.throws(() => address({ ...shipping, dia_chi_giao: '' }));
});
test('checkout locks stock and snapshots server price; client price is irrelevant', async () => {
  const pool = fakePool();
  assert.equal(await checkout(pool, 2, { 1: 2 }, { ...shipping, tong_tien: 1 }, 'a'.repeat(64)), 7);
  const insert = pool.events.find(e => e.sql.startsWith('INSERT INTO donhang'));
  assert.equal(insert.values[1], 300000);
  const detail = pool.events.find(e => e.sql.startsWith('INSERT INTO chitietdonhang'));
  assert.deepEqual(detail.values, [7, 1, 2, 150000, 'Tai nghe']);
  assert.ok(pool.events.some(e => e.sql.includes('FOR UPDATE')));
  assert.ok(pool.events.some(e => e.sql === 'COMMIT'));
  assert.ok(!pool.events.some(e => e.sql === 'ROLLBACK'));
  assert.equal(pool.events.at(-1).sql, 'RELEASE');
});
test('insufficient stock and detail write failure roll back without commit', async () => {
  for (const flags of [{ shortage: true }, { failDetail: true }]) {
    const pool = fakePool(flags);
    await assert.rejects(checkout(pool, 2, { 1: 2 }, shipping, 'a'.repeat(64)));
    assert.ok(pool.events.some(e => e.sql === 'ROLLBACK'));
    assert.ok(!pool.events.some(e => e.sql === 'COMMIT'));
    assert.equal(pool.events.at(-1).sql, 'RELEASE');
  }
});
test('same checkout token returns the existing order without further writes', async () => {
  const pool = fakePool({ existing: true });
  assert.equal(await checkout(pool, 2, {}, shipping, 'a'.repeat(64)), 7);
  assert.ok(!pool.events.some(e => e.sql.startsWith('INSERT') || e.sql === 'BEGIN'));
});
test('cancellation restores stock once; repeated status is idempotent', async () => {
  const pool = fakePool();
  await changeStatus(pool, 7, 'Da huy');
  await changeStatus(pool, 7, 'Da huy');
  const restocks = pool.events.filter(e => e.sql.includes('so_luong_ton +'));
  assert.equal(restocks.length, 1); assert.deepEqual(restocks[0].values, [2, 1]);
});
test('delivered or legacy orders cannot be canceled; state cannot skip steps', async () => {
  for (const [flags, target] of [[{ status: 'Da giao' }, 'Da huy'], [{ legacy: true }, 'Da huy'], [{}, 'Da giao']]) {
    const pool = fakePool(flags); await assert.rejects(changeStatus(pool, 7, target), e => e.status === 409);
    assert.ok(pool.events.some(e => e.sql === 'ROLLBACK'));
    assert.ok(!pool.events.some(e => e.sql.includes('so_luong_ton +')));
  }
});
test('order HTTP routes protect CSRF, ownership and admin access; cart renders', async () => {
  const app = express(); app.set('view engine', 'ejs'); app.set('views', path.join(__dirname, '../views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: 'testing-only-secret', resave: false, saveUninitialized: false }));
  app.get('/test-login', (req, res) => { req.session.khachhang = { id: 2, ten: 'Test', vai_tro: 'khach' }; res.send('ok'); });
  app.use((req, res, next) => { res.locals.currentUser = req.session.khachhang; next(); });
  const queries = [];
  const pool = { query: async (sql, values) => {
    queries.push({ sql, values });
    if (sql.includes('FROM sanpham')) return [[{ id: 1, ten_sp: '<script>Test</script>', gia: 150000, so_luong_ton: 10 }]];
    return [[]];
  } };
  app.use(createOrderRouter({ promise: () => pool }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/giohang', { redirect: 'manual' })).status, 302);
    const login = await fetch(base + '/test-login'); const cookie = login.headers.get('set-cookie').split(';')[0];
    const cartPage = await fetch(base + '/giohang', { headers: { cookie } }); const text = await cartPage.text();
    assert.equal(cartPage.status, 200);
    const csrf = text.match(/name="cart-csrf" content="([a-f0-9]+)"/)[1];
    const post = (route, body) => fetch(base + route, { method: 'POST', headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body), redirect: 'manual' });
    assert.equal((await post('/giohang/them', { id: 1 })).status, 403);
    assert.equal((await post('/giohang/them', { id: 1, _csrf: csrf })).status, 302);
    const populated = await fetch(base + '/giohang', { headers: { cookie } });
    const html = await populated.text(); assert.match(html, /&lt;script&gt;/); assert.match(html, /150\.000/);
    assert.equal((await post('/giohang/capnhat', { id: 1, qty: -1, _csrf: csrf })).status, 400);
    assert.equal((await fetch(base + '/donhang/7', { headers: { cookie } })).status, 404);
    assert.ok(queries.some(e => e.sql.includes('AND khachhang_id = ?') && e.values[1] === 2));
    assert.equal((await fetch(base + '/admin/donhang', { headers: { cookie } })).status, 403);
    assert.equal((await post('/admin/donhang/7/trangthai', { trang_thai: 'Da huy', _csrf: csrf })).status, 403);
    assert.equal((await post('/giohang/xoa', { id: 1, _csrf: csrf })).status, 302);
  } finally { await new Promise(r => server.close(r)); }
});
test('checkout rejects nontransactional engines and overflowing legacy INT total', async () => {
  const nontransactional = fakePool();
  const conn = await nontransactional.getConnection();
  const original = conn.query;
  conn.query = async (sql, values) => sql.includes('information_schema.tables') ? [[{ TABLE_NAME: 'sanpham', ENGINE: 'MyISAM' }]] : original(sql, values);
  await assert.rejects(checkout(nontransactional, 2, { 1: 2 }, shipping, 'a'.repeat(64)), e => e.status === 409);
  const overflow = fakePool(); const conn2 = await overflow.getConnection(); const original2 = conn2.query;
  conn2.query = async (sql, values) => sql.startsWith('SELECT id, ten_sp') ? [[{ id: 1, ten_sp: 'Test', gia: 2147483647, so_luong_ton: 10 }]] : original2(sql, values);
  await assert.rejects(checkout(overflow, 2, { 1: 2 }, shipping, 'a'.repeat(64)), e => e.status === 400);
  assert.ok(!overflow.events.some(e => e.sql.startsWith('INSERT INTO donhang')));
});
test('customer cancellation verifies ownership under the lock before changing stock', async () => {
  const pool = fakePool();
  await assert.rejects(changeStatus(pool, 7, 'Da huy', 99), e => e.status === 404);
  assert.ok(!pool.events.some(e => e.sql.includes('so_luong_ton +') || e.sql.startsWith('UPDATE donhang')));
  assert.ok(pool.events.some(e => e.sql === 'ROLLBACK'));
});
test('customer may cancel only a new own order, retry does not restock twice', async () => {
  const pool = fakePool(); await changeStatus(pool, 7, 'Da huy', 2); await changeStatus(pool, 7, 'Da huy', 2);
  assert.equal(pool.events.filter(e => e.sql.includes('so_luong_ton +')).length, 1);
  const confirmed = fakePool({ status: 'Xac nhan' });
  await assert.rejects(changeStatus(confirmed, 7, 'Da huy', 2), e => e.status === 409);
  assert.ok(!confirmed.events.some(e => e.sql.includes('so_luong_ton +')));
});
