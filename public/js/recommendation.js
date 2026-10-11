const form = document.getElementById('recommendation-form');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const status = document.getElementById('recommendation-status');
  const results = document.getElementById('recommendation-results');
  const endpoint = event.submitter?.value === 'manual' ? '/api/goiy' : '/api/goiy-ai';
  const buttons = [...form.querySelectorAll('button')];
  buttons.forEach(button => { button.disabled = true; }); results.replaceChildren(); status.textContent = 'Đang tìm...';
  try {
    const data = Object.fromEntries(new FormData(form));
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    status.textContent = payload.products.length ? `Tìm thấy ${payload.products.length} gợi ý.` : 'Không có sản phẩm khớp. Thử từ khóa ngắn hơn hoặc đổi ngân sách.';
    if (payload.criteria) {
      const budget = payload.criteria.budget === null ? 'chưa giới hạn' : `${payload.criteria.budget.toLocaleString('vi-VN')}đ`;
      status.textContent = `AI hiểu: ${payload.criteria.query}; ngân sách tối đa: ${budget}. ${status.textContent}`;
    }
    for (const product of payload.products) {
      const card = document.createElement('article'); card.className = 'product-card product-info';
      const link = document.createElement('a'); link.href = `/sanpham/${product.id}`; link.textContent = product.ten_sp;
      const price = document.createElement('p'); price.textContent = `${product.gia.toLocaleString('vi-VN')}đ`;
      const reason = document.createElement('p'); reason.textContent = product.reasons.join(' • ');
      const add = document.createElement('form'); add.action = '/giohang/them'; add.method = 'POST';
      for (const [name, value] of Object.entries({ id: product.id, qty: 1, _csrf: document.querySelector('meta[name="cart-csrf"]').content })) {
        const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; add.append(input);
      }
      const buy = document.createElement('button'); buy.type = 'submit'; buy.textContent = 'Thêm vào giỏ'; add.append(buy);
      card.append(link, price, reason, add); results.append(card);
    }
  } catch (error) { status.textContent = error.message || 'Không thể tải gợi ý.'; }
  finally { buttons.forEach(button => { button.disabled = false; }); }
});
