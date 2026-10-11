const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
function parseCriteria(body = {}) {
  const { query = '', category = '', budget = null, limit = 5 } = body;
  if (typeof query !== 'string' || query.length > 500 || typeof category !== 'string' || category.length > 100) throw new Error('Nhu cau toi da 500 ky tu; danh muc toi da 100 ky tu');
  const amount = budget === null || budget === '' ? null : Number(budget);
  if (budget !== null && budget !== '' && !['string', 'number'].includes(typeof budget)) throw new Error('Ngan sach khong hop le');
  if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647)) throw new Error('Ngan sach phai la so nguyen tu 0 den 2147483647');
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('So goi y phai tu 1 den 10');
  return { query: query.trim(), category: category.trim(), budget: amount, limit };
}
function recommend(products, criteria) {
  const tokens = [...new Set(normalize(criteria.query).split(/[^a-z0-9]+/).filter(Boolean))];
  const category = normalize(criteria.category);
  return products.filter(p => Number(p.so_luong_ton) > 0 && Number.isFinite(Number(p.gia)) && Number(p.gia) >= 0 &&
    (criteria.budget === null || Number(p.gia) <= criteria.budget) && (!category || normalize(p.danh_muc) === category))
    .map(p => {
      const name = new Set(normalize(p.ten_sp).split(/[^a-z0-9]+/));
      const text = new Set(normalize([p.danh_muc, p.mo_ta, p.thuong_hieu, p.tu_khoa].join(' ')).split(/[^a-z0-9]+/));
      const matched = tokens.filter(t => name.has(t) || text.has(t));
      const score = tokens.reduce((sum, t) => sum + (name.has(t) ? 3 : text.has(t) ? 1 : 0), 0);
      return { id: p.id, ten_sp: p.ten_sp, gia: Number(p.gia), danh_muc: p.danh_muc, so_luong_ton: p.so_luong_ton,
        score, reasons: [matched.length ? `Khop tu khoa: ${matched.join(', ')}` : 'Con hang', ...(criteria.budget !== null ? ['Trong ngan sach'] : [])] };
    }).filter(p => !tokens.length || p.score > 0)
    .sort((a, b) => b.score - a.score || a.gia - b.gia || a.id - b.id).slice(0, criteria.limit);
}
module.exports = { parseCriteria, recommend };
