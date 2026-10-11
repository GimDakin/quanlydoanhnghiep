-- Each statement separated by the marker below. No seed or privilege changes.
CREATE TABLE IF NOT EXISTS khachhang (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ten VARCHAR(100) NOT NULL,
  sdt VARCHAR(15),
  email VARCHAR(100),
  diachi VARCHAR(255)
);
-- statement
CREATE TABLE IF NOT EXISTS sanpham (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ten_sp VARCHAR(150) NOT NULL,
  gia INT NOT NULL,
  so_luong_ton INT DEFAULT 0,
  danh_muc VARCHAR(100)
);
-- statement
CREATE TABLE IF NOT EXISTS donhang (
  id INT AUTO_INCREMENT PRIMARY KEY,
  khachhang_id INT,
  ngay_dat DATE,
  trang_thai VARCHAR(50) DEFAULT 'Moi',
  tong_tien INT DEFAULT 0,
  FOREIGN KEY (khachhang_id) REFERENCES khachhang(id)
);
-- statement
CREATE TABLE IF NOT EXISTS chitietdonhang (
  id INT AUTO_INCREMENT PRIMARY KEY,
  donhang_id INT,
  sanpham_id INT,
  so_luong INT NOT NULL,
  don_gia INT NOT NULL,
  FOREIGN KEY (donhang_id) REFERENCES donhang(id),
  FOREIGN KEY (sanpham_id) REFERENCES sanpham(id)
);
