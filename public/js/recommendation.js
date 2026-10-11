const form = document.getElementById('recommendation-form');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const status = document.getElementById('recommendation-status');
  const results = document.getElementById('recommendation-results');
  const button = form.querySelector('button');
  button.disabled = true; results.replaceChildren(); status.textContent = 'Đang tìm...';
  try {
    const data = Object.fromEntries(new FormData(form));
    const response = await fetch('/api/goiy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    status.textContent = payload.products.length ? `Tìm thấy ${payload.products.length} gợi ý.` : 'Không có sản phẩm khớp. Thử từ khóa ngắn hơn hoặc đổi ngân sách.';
    for (const product of payload.products) {
      const card = document.createElement('article'); card.className = 'product-card product-info';
      const link = document.createElement('a'); link.href = `/sanpham/${product.id}`; link.textContent = product.ten_sp;
      const price = document.createElement('p'); price.textContent = `${product.gia.toLocaleString('vi-VN')}đ`;
      const reason = document.createElement('p'); reason.textContent = product.reasons.join(' • ');
      card.append(link, price, reason); results.append(card);
    }
  } catch (error) { status.textContent = error.message || 'Không thể tải gợi ý.'; }
  finally { button.disabled = false; }
});
