# Sprint 4 — Sửa sản phẩm và khách tự hủy đơn

## Cập nhật

1. Dừng server đang chạy bằng Ctrl+C và sao chép thư mục code để dự phòng.
2. Giải nén `sprint4-update.zip` vào thư mục `quanlyweb-github`, thay thế file trùng.
3. Không cần SQL migration, không thêm thư viện và không đổi `.env`.
4. Chạy `npm test`, sau đó `npm start`. Chỉ chạy một server trên cổng 3000.

## Sửa sản phẩm (admin)

- Đăng nhập admin, ở danh sách hoặc chi tiết sản phẩm bấm Sửa sản phẩm.
- Có thể sửa tên, giá, tồn kho còn bán, danh mục, mô tả, thương hiệu và từ khóa.
- Backend kiểm tra đầu vào và CSRF, yêu cầu quyền admin, khóa dòng sản phẩm trước
  khi cập nhật. Không sửa các tên/giá snapshot đã lưu trong đơn cũ.
- Form giữ phiên bản dữ liệu lúc mở. Nếu tồn kho hoặc dữ liệu sản phẩm đã thay đổi
  khi lưu, server trả 409 thay vì ghi đè. Mở lại trang sửa, xem dữ liệu mới rồi nhập lại.
- Tồn kho là số còn có thể bán (đã trừ đơn đặt), không phải tổng số tồn trước đặt hàng.
  Việc chỉnh số tuyệt đối dành cho admin kiểm kê; chưa có sổ nhập/xuất kho/audit.

## Khách tự hủy đơn

- Khách vào Đơn của tôi, mở chi tiết đơn mới rồi bấm Hủy đơn của tôi.
- Chỉ đơn thuộc tài khoản hiện tại, trạng thái Moi và được tạo bởi checkout mới
  mới có thể hủy. Admin xác nhận xong thì khách không được tự hủy nữa.
- Khi hủy, backend khóa đơn, kiểm tra chủ đơn và trạng thái trong cùng transaction,
  hoàn kho và chuyển Da huy. Gửi lại cùng yêu cầu không hoàn kho lần thứ hai.
- Admin vẫn dùng luồng hủy riêng của Sprint 3, có thể hủy Moi/Xac nhan.
- Không xóa đơn/sản phẩm khỏi database; lịch sử mua và snapshot được giữ nguyên.

## Kiểm thử thủ công trên database thử

1. Admin đổi Mini từ 150000 sang 170000, tồn kho sang 12. Danh sách/chi tiết/giỏ
   hàng phải dùng giá mới. Đơn mua trước đó giữ giá cũ.
2. Tài khoản khách không thấy link sửa và mở /admin/sanpham/1/sua trả 403.
3. Mở form sửa cùng sản phẩm ở hai tab. Lưu một tab rồi lưu tab còn lại: tab cũ
   trả 409. Nếu cả hai chỉ lưu nội dung y hệt, không có dữ liệu mới cần bảo vệ.
4. Mở form sửa, ở trình duyệt khác mua 1 đơn vị, sau đó lưu form cũ: 409; tồn kho
   phải giữ kết quả sau mua, không tăng lại vì form cũ.
5. Khách đặt đơn mới, tự hủy: trạng thái Da huy, hoàn đúng lượng đã mua.
6. Khách B dùng ID đơn của khách A để POST /donhang/:id/huy (CSRF của B): 404,
   đơn của A và tồn kho không đổi. Thiếu CSRF: 403.
7. Admin xác nhận đơn của A; A không thấy nút tự hủy. Form cũ nếu gửi lại trả 409,
   không hoàn kho. Admin vẫn có thể hủy đơn đã xác nhận theo quyền riêng.
8. Hủy/gửi lại yêu cầu: tồn kho chỉ tăng một lần. Test đồng thời xác nhận/hủy trên
   MySQL thật: thao tác nào lấy khóa trước quyết định trạng thái, không được vừa
   xác nhận xong vừa cho khách hủy từ form cũ.
9. Kiểm tra lại AI, giỏ, checkout, hủy admin, đăng nhập và import Excel.

## Kiểm thử tự động

`npm test` có kiểm tra quyền admin, CSRF, dữ liệu sai, HTML escaping,
optimistic concurrency, snapshot không đổi, ownership và trạng thái khi khách hủy,
rollback và không hoàn kho hai lần. SQL được giả lập; migration/khóa thực tế và các
ca đồng thời cần kiểm tra trên MySQL thử. Không có API call Groq thật trong test.

## Về đổi giao diện sau này

Backend đặt trong src/*.js và index.js; EJS trong views và CSS/JS trong public.
Có thể thay bố cục/màu sắc mà giữ route, method, tên trường, _csrf và checkout_token.
Nếu đổi cách tương tác, phải kiểm thử lại vì form và frontend JavaScript vẫn là
một phần của luồng mua hàng. Chưa cần đổi sang React để làm giao diện đẹp.
