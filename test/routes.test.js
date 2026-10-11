// HTTP integration with a query stub. Does not claim to test MySQL or migration DDL.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { app, db } = require('../index');
let server, base, hash;
const queries = [];
const product = { id: 1, ten_sp: '<script>alert(1)</script> Tai nghe', gia: 100000, so_luong_ton: 2, danh_muc: 'Phu kien', mo_ta: 'bluetooth' };
before(async () => {
  hash = await bcrypt.hash('password-test', 4);
  db.query = (sql, values, callback) => {
    queries.push({ sql, values });
    if (sql.includes('FROM khachhang')) return callback(null, [{ id: 2, ten: 'Tester', vai_tro: values[0] === 'admin@test.local' ? 'admin' : 'khach', mat_khau: hash }]);
    if (sql.startsWith('INSERT')) return callback(null, { insertId: 3 });
    callback(null, sql.includes('WHERE id') && values[0] === '999' ? [] : [product]);
  };
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); await db.promise().end(); });
async function login(email) {
  const response = await fetch(base + '/dangnhap', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, mat_khau: 'password-test' }), redirect: 'manual' });
  assert.equal(response.status, 302);
  return response.headers.get('set-cookie').split(';')[0];
}
test('anonymous pages redirect and recommendation API returns 401', async () => {
  for (const route of ['/sanpham', '/goiy', '/sanpham/1']) assert.equal((await fetch(base + route, { redirect: 'manual' })).status, 302);
  assert.equal((await fetch(base + '/api/goiy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
});
test('existing login/search and new detail pages render escaped data', async () => {
  const cookie = await login('user@test.local');
  const response = await fetch(base + '/sanpham?search=tai', { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /&lt;script&gt;/);
  assert.ok(queries.some(q => q.sql.includes('LIKE ?') && q.values[0] === '%tai%'));
  for (const route of ['/goiy', '/sanpham/1']) assert.equal((await fetch(base + route, { headers: { cookie } })).status, 200);
  assert.equal((await fetch(base + '/sanpham/999', { headers: { cookie } })).status, 404);
  assert.equal((await fetch(base + '/sanpham/abc', { headers: { cookie } })).status, 400);
});
test('recommendation validates input and uses bound SQL budget', async () => {
  const cookie = await login('user@test.local');
  const request = body => fetch(base + '/api/goiy', { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await request({ budget: -1 })).status, 400);
  const response = await request({ query: 'bluetooth', budget: 100000, category: 'Phu kien' });
  assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.products[0].id, 1);
  assert.ok(queries.some(q => q.sql.includes('gia <= ?') && q.values[0] === 100000 && q.values[1] === 'Phu kien'));
});
test('product insertion remains admin-only and rejects invalid values', async () => {
  const send = (cookie, body) => fetch(base + '/sanpham', { method: 'POST', headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body), redirect: 'manual' });
  const body = { ten_sp: 'Test', gia: '1000', so_luong_ton: '1', danh_muc: 'Phu kien' };
  assert.equal((await send(await login('user@test.local'), body)).status, 403);
  const admin = await login('admin@test.local');
  assert.equal((await send(admin, { ...body, gia: '-1' })).status, 400);
  assert.equal((await send(admin, body)).status, 302);
  assert.equal((await fetch(base + '/import-sanpham', { method: 'POST', headers: { cookie: admin } })).status, 400);
});
test('existing registration and logout routes still work', async () => {
  assert.equal((await fetch(base + '/dangky')).status, 200);
  const response = await fetch(base + '/dangky', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ten: 'User', email: 'new@test.local', mat_khau: 'password-test', sdt: '123' }) });
  assert.equal(response.status, 200);
  const cookie = await login('user@test.local');
  assert.equal((await fetch(base + '/dangxuat', { headers: { cookie }, redirect: 'manual' })).status, 302);
  assert.equal((await fetch(base + '/sanpham', { headers: { cookie }, redirect: 'manual' })).status, 302);
});
test('Excel import accepts legacy columns and rejects an invalid batch before inserting', async () => {
  const xlsx = require('xlsx');
  const cookie = await login('admin@test.local');
  const uploadRows = rows => {
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book, xlsx.utils.json_to_sheet(rows), 'Products');
    const buffer = xlsx.write(book, { type: 'buffer', bookType: 'xlsx' });
    const form = new FormData(); form.append('file', new Blob([buffer]), 'products.xlsx');
    return fetch(base + '/import-sanpham', { method: 'POST', headers: { cookie }, body: form, redirect: 'manual' });
  };
  const valid = { ten_sp: 'Legacy product', gia: 10000, so_luong_ton: 2, danh_muc: 'Phu kien' };
  assert.equal((await uploadRows([valid])).status, 302);
  const count = queries.filter(q => q.sql.startsWith('INSERT INTO sanpham')).length;
  assert.equal((await uploadRows([valid, { ...valid, gia: -1 }])).status, 400);
  assert.equal(queries.filter(q => q.sql.startsWith('INSERT INTO sanpham')).length, count);
});
