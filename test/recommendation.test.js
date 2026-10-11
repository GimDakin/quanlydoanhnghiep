const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseCriteria, recommend } = require('../src/recommendation');
const { parseProduct } = require('../src/product');
const products = [
  { id: 1, ten_sp: 'Tai nghe Bluetooth', gia: 150000, so_luong_ton: 2, danh_muc: 'Phụ kiện' },
  { id: 2, ten_sp: 'Tai nghe gaming', gia: 500000, so_luong_ton: 4, danh_muc: 'Phụ kiện', tu_khoa: 'bluetooth' },
  { id: 3, ten_sp: 'Tai nghe Bluetooth', gia: 90000, so_luong_ton: 0, danh_muc: 'Phụ kiện' },
  { id: 4, ten_sp: 'Đèn ngủ', gia: 80000, so_luong_ton: 5, danh_muc: 'Đồ trang trí', mo_ta: 'Trang tri phong ngu' }
];
test('budget and stock are hard constraints', () => {
  const result = recommend(products, parseCriteria({ query: 'tai nghe', budget: 150000 }));
  assert.deepEqual(result.map(p => p.id), [1]);
  assert.equal(result[0].gia, 150000);
});
test('Vietnamese accents, category and metadata matching', () => {
  assert.deepEqual(recommend(products, parseCriteria({ query: 'đèn ngủ' })).map(p => p.id), [4]);
  assert.deepEqual(recommend(products, parseCriteria({ query: 'bluetooth', category: 'Phụ kiện' })).map(p => p.id), [1, 2]);
});
test('unmatched need returns no invented product; blank request sorts by price', () => {
  assert.deepEqual(recommend(products, parseCriteria({ query: 'laptop' })), []);
  assert.deepEqual(recommend(products, parseCriteria({})).map(p => p.id), [4, 1, 2]);
  assert.deepEqual(recommend(products, parseCriteria({ budget: 0 })), []);
});
test('reject invalid query, budget and limits', () => {
  for (const budget of [-1, 'abc', 1.1, true, [], {}, 2147483648]) assert.throws(() => parseCriteria({ budget }));
  assert.throws(() => parseCriteria({ query: {} }));
  assert.throws(() => parseCriteria({ limit: 11 }));
  assert.throws(() => parseCriteria({ query: 'a'.repeat(501) }));
});
test('validate product without breaking old four-column input', () => {
  assert.equal(parseProduct({ ten_sp: 'Test', gia: '0', so_luong_ton: '10', danh_muc: 'Phu kien' }).tu_khoa, '');
  for (const gia of ['', -1, 'bad', 1.5]) assert.throws(() => parseProduct({ ten_sp: 'Test', gia, so_luong_ton: 10 }));
});
