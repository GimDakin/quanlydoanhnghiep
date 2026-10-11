-- Fresh-install reference ONLY. For existing databases use npm run migrate.
-- Create/select your database before running this file. Not safe to rerun ADD COLUMN statements.
-- Each statement separated by the marker below. No seed or privilege changes.
CREATE TABLE IF NOT EXISTS khachhang (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ten VARCHAR(100) NOT NULL,
  sdt VARCHAR(15),
  email VARCHAR(100),
  diachi VARCHAR(255)
);
CREATE TABLE IF NOT EXISTS sanpham (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ten_sp VARCHAR(150) NOT NULL,
  gia INT NOT NULL,
  so_luong_ton INT DEFAULT 0,
  danh_muc VARCHAR(100)
);
CREATE TABLE IF NOT EXISTS donhang (
  id INT AUTO_INCREMENT PRIMARY KEY,
  khachhang_id INT,
  ngay_dat DATE,
  trang_thai VARCHAR(50) DEFAULT 'Moi',
  tong_tien INT DEFAULT 0,
  FOREIGN KEY (khachhang_id) REFERENCES khachhang(id)
);
CREATE TABLE IF NOT EXISTS chitietdonhang (
  id INT AUTO_INCREMENT PRIMARY KEY,
  donhang_id INT,
  sanpham_id INT,
  so_luong INT NOT NULL,
  don_gia INT NOT NULL,
  FOREIGN KEY (donhang_id) REFERENCES donhang(id),
  FOREIGN KEY (sanpham_id) REFERENCES sanpham(id)
);

-- Runner checks information_schema before each ADD COLUMN; safe to resume after partial DDL.
ALTER TABLE khachhang ADD COLUMN mat_khau VARCHAR(255) NULL;
ALTER TABLE khachhang ADD COLUMN so_du_vi INT DEFAULT 0;
ALTER TABLE khachhang ADD COLUMN hang_thanh_vien VARCHAR(20) DEFAULT 'Thuong';
ALTER TABLE khachhang ADD COLUMN vai_tro VARCHAR(20) DEFAULT 'khach';
ALTER TABLE sanpham ADD COLUMN mo_ta TEXT NULL;
ALTER TABLE sanpham ADD COLUMN thuong_hieu VARCHAR(100) NULL;
ALTER TABLE sanpham ADD COLUMN tu_khoa VARCHAR(500) NULL;

ALTER TABLE khachhang ADD UNIQUE INDEX uq_khachhang_email (email);
