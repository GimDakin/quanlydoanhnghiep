function parseProduct(body = {}) {
  const { ten_sp, gia, so_luong_ton, danh_muc = '', mo_ta = '', thuong_hieu = '', tu_khoa = '' } = body;
  const fields = { ten_sp, danh_muc, mo_ta, thuong_hieu, tu_khoa };
  const limits = { ten_sp: 150, danh_muc: 100, mo_ta: 10000, thuong_hieu: 100, tu_khoa: 500 };
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== 'string' || value.length > limits[key]) throw new Error(`Truong ${key} khong hop le`);
    fields[key] = value.trim();
  }
  if (!fields.ten_sp) throw new Error('Ten san pham khong duoc de trong');
  for (const [key, value] of Object.entries({ gia, so_luong_ton })) {
    if (!['string', 'number'].includes(typeof value) || String(value).trim() === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0 || Number(value) > 2147483647) throw new Error(`Truong ${key} phai la so nguyen khong am`);
    fields[key] = Number(value);
  }
  return fields;
}
module.exports = { parseProduct };
