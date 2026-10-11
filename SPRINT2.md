# Sprint 2 — Groq hiểu nhu cầu mua sắm

Bản cập nhật chỉ thêm hiểu nhu cầu một lượt, chưa có chat nhiều lượt, giỏ hàng hay checkout.
AI trích xuất từ khóa/ngân sách; thuật toán Sprint 1 chọn sản phẩm và tạo lý do dựa trên dữ liệu kho.
Không cho AI tạo sản phẩm, giá hay tự khẳng định thông số kỹ thuật.

## Cài bản cập nhật trên Windows

1. Dừng server bằng Ctrl+C. Sao chép thư mục code hiện tại để dự phòng.
2. Giải nén `sprint2-update.zip` vào `C:\Users\buigi\quanlyweb-github`, chọn thay thế file trùng tên.
   ZIP không chứa `.env`, `package.json` hay SQL; giữ key và database đang dùng.
3. File `.env` cần có `GROQ_API_KEY=...`. Có thể thêm `GROQ_MODEL=llama-3.3-70b-versatile`.
4. Trong terminal của thư mục dự án, chạy `npm test`, sau đó `npm start`.
   Không cần cài thêm thư viện hay migration. Cần Node.js >=20.
5. Đăng nhập, mở `/goiy`. Nhập `T có 200k, cần tai nghe Bluetooth` và bấm Hỏi AI.
   Để trống ngân sách/danh mục để kiểm tra trích xuất từ câu.
6. Xem dòng AI hiểu và kết quả. Với dữ liệu thử Sprint 1, Mini 150000 xuất hiện,
   Pro 500000 và hàng hết tồn không xuất hiện. Giá trị AI hiểu vẫn cần kiểm tra;
   đây là đầu ra xác suất, không bảo đảm hiểu mọi cách diễn đạt.
7. Nhập ngân sách riêng 100000: không được trả sản phẩm vượt 100000.
   Khi cả câu và ô nhập có ngân sách, backend lấy giới hạn thấp hơn.
8. Thử nút Tìm bằng bộ lọc thường với từ khóa `bluetooth`: chức năng Sprint 1 vẫn hoạt động.
9. Để thử lỗi key, tạm xóa giá trị GROQ_API_KEY, khởi động lại server:
   Hỏi AI phải báo lỗi rõ ràng; bộ lọc thường vẫn chạy. Khôi phục key rồi restart.
10. Thử đăng xuất, trang gợi ý phải yêu cầu đăng nhập. Tối đa 10 yêu cầu AI/phút/tài khoản.

## Kiểm thử và giới hạn

`npm test`: kiểm thử cũ + kiểm thử AI trích xuất, JSON lỗi, ngân sách sai,
key thiếu, lỗi nhà cung cấp, xác thực, ràng buộc kho và giới hạn gọi API.
Các kiểm thử dùng phản hồi Groq và truy vấn SQL giả lập, không gọi API tính phí.
Chưa kiểm chứng Groq thật từ môi trường phát triển vì key chỉ nằm trên máy người dùng.

Chỉ gửi câu nhu cầu đến Groq; không gửi email, mật khẩu, lịch sử mua hàng hoặc dữ liệu kho.
Timeout 15 giây; không tự gọi lại để tránh nhân chi phí. AI JSON được kiểm tra kiểu/giới hạn
trước khi dùng; query database dùng tham số. Model có thể đổi qua GROQ_MODEL.
Limiter lưu trong tiến trình, cần Redis/shared store nếu triển khai nhiều server.
Gói Free và model có thể thay đổi; lỗi 429/401/403 được trả bằng thông báo có thể xử lý.

Tài liệu chính thức:
https://console.groq.com/docs/text-chat
https://console.groq.com/docs/structured-outputs

## Lưu Git sau khi kiểm tra chạy thật

Trong terminal mới: `git status`, xem khác biệt, rồi add và commit các file cập nhật.
Không add `.env`. Phiên bản này không chứa API key.
