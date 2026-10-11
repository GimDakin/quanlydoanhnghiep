# Sprint 3 — Giỏ hàng và đặt hàng COD

## Cập nhật trên máy Windows

1. Dừng server bằng Ctrl+C, sao chép thư mục code hiện tại làm bản dự phòng.
2. Giải nén `sprint3-update.zip` vào `C:\Users\buigi\quanlyweb-github`, chọn thay thế file trùng.
   Bản cập nhật giữ `.env`, cấu hình Groq và package.json. Không cần thư viện mới.
3. Dừng các chương trình khác đang ghi vào database; chạy:

   ```powershell
   node scripts/backup.js
   ```

   Phải hiện `Backup saved: ...`. File SQL nằm trong `backups`, chứa dữ liệu cá nhân:
   giữ riêng, không đưa lên GitHub. Script dành cho các bảng InnoDB của dự án;
   database có trigger/bảng khác cần dùng mysqldump. Kiểm tra restore vào database
   rỗng riêng (qua MySQL Workbench mở file SQL rồi chạy sau khi chọn database thử),
   đối chiếu số dòng. Không restore đè database đang dùng.
4. Chỉ tiếp tục khi backup thành công:

   ```powershell
   npm run migrate:check
   npm run migrate
   npm run migrate
   npm test
   npm start
   ```

   Migration 003 chỉ thêm cột nhận hàng, COD, checkout_token unique nullable và
   tên sản phẩm snapshot. Không xóa hàng hay đổi dữ liệu đơn cũ. MySQL DDL tự commit;
   nếu lỗi giữa chừng, sửa nguyên nhân và chạy lại runner. Chưa sửa migration cũ.
5. Đăng nhập lại, mở sản phẩm, bấm Thêm vào giỏ, nhập địa chỉ và đặt COD.

## Kiểm tra trên MySQL thật

- Giỏ: thêm từ danh sách, chi tiết và kết quả AI. Thêm cùng sản phẩm tăng số lượng.
  Cập nhật, xóa, giỏ trống đều hoạt động. Tối đa 99 đơn vị/mặt hàng, 100 mặt hàng.
- Đặt 2 tai nghe giá 150000: tổng 300000, đơn Moi, kho giảm 2, giỏ trống.
  Tên và giá trong chi tiết đơn không đổi khi sửa tên/giá sản phẩm sau đó.
- Hai tài khoản A/B: B mở URL đơn của A trả 404. User thường mở /admin/donhang trả 403.
- Admin: Moi -> Xac nhan -> Dang giao -> Da giao. Chỉ Moi/Xac nhan có thể Da huy;
  hủy hoàn tồn kho đúng một lần. Đơn cũ không có checkout_token không được tự hủy,
  vì không biết trước đây đã trừ tồn hay chưa.
- Tồn kho: mở giỏ khi còn hàng, sửa tồn về 0 trước khi xác nhận: trả 409, không tạo
  đơn hay chi tiết. Nếu mua nhiều mặt hàng, thiếu một mặt hàng phải rollback tất cả.
- Đồng thời: đặt tồn một sản phẩm về 1, dùng hai tài khoản ở hai trình duyệt khác nhau
  và cùng đặt 1 đơn vị. Chỉ một đơn thành công, kho không âm. Chạy test này trên MySQL.
- Gửi lại cùng POST đặt hàng khi không thay đổi giỏ: token unique đưa về cùng đơn,
  không trừ kho hai lần. Đổi giỏ tạo lượt đặt mới. Form cũ sau khi đổi giỏ bị từ chối.
- Request thay đổi giỏ/trạng thái không có _csrf phải trả 403. Nội dung tên/địa chỉ
  được EJS escape; không tạo HTML từ nội dung khách nhập.
- Regression: đăng ký/đăng nhập, tìm kiếm, import Excel, Hỏi AI và bộ lọc thường.

## Thiết kế và giới hạn

Giỏ lưu session (MemoryStore từ dự án cũ): restart server/đăng xuất mất giỏ,
nhưng đơn đã đặt vẫn ở MySQL. Đơn lưu trên server, backend không nhận giá từ khách.
Checkout khóa từng sản phẩm theo ID bằng FOR UPDATE, tạo đơn/chi tiết/trừ tồn trong
một transaction; chỉ hỗ trợ InnoDB. Hủy khóa đơn trước rồi hoàn tồn trong transaction.
Unique checkout_token tránh tạo đơn trùng cho cùng biểu mẫu. Giá VND nguyên, tổng
không vượt 2147483647 do giữ nguyên kiểu INT cũ. Chưa có phí vận chuyển, thuế,
thanh toán online, gửi email, hoàn tiền hay chức năng khách tự hủy.
COD là ghi nhận phương thức thu tiền khi giao, không phải xác nhận đã thu tiền.
Trang danh sách đơn hiển thị tối đa 100 đơn mới nhất, chưa phân trang.
CSRF được thêm cho route giỏ/đơn mới; bảo mật toàn bộ các route cũ chưa thuộc sprint này.

## Kiểm thử đã chạy

npm test gồm kiểm thử cũ và các ca giỏ, địa chỉ, CSRF, ownership/admin, giá snapshot,
rollback, checkout retry, hủy idempotent và chuyển trạng thái sai.
SQL được giả lập trong kiểm thử tự động. Chưa có MySQL server trong môi trường
phát triển; không tuyên bố đã kiểm chứng migration/khóa đồng thời thật. Các bước
trên là kiểm tra tích hợp cần thực hiện với database thử của người dùng.

## Lưu code

Kiểm tra git status và git diff trước khi commit. Không đưa `.env` hay `backups/`
lên GitHub. Hướng dẫn này giữ nhánh đang dùng; chưa tự push hay merge.
