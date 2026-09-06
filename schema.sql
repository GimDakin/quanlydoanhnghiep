-- Active: 1741678872905@@127.0.0.1@3306@quanlybanhang
CREATE DATABASE quanlybanhang

USE quanlybanhang

CREATE TABLE khachhang (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ten VARCHAR(100) NOT NULL,
  sdt VARCHAR(15),
  email VARCHAR(100),
  diachi VARCHAR(255)
);

CREATE TABLE sanpham (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ten_sp VARCHAR(150) NOT NULL,
  gia INT NOT NULL,
  so_luong_ton INT DEFAULT 0,
  danh_muc VARCHAR(100)
);

CREATE TABLE donhang (
  id INT AUTO_INCREMENT PRIMARY KEY,
  khachhang_id INT,
  ngay_dat DATE,
  trang_thai VARCHAR(50) DEFAULT 'Moi',
  tong_tien INT DEFAULT 0,
  FOREIGN KEY (khachhang_id) REFERENCES khachhang(id)
);

CREATE TABLE chitietdonhang (
  id INT AUTO_INCREMENT PRIMARY KEY,
  donhang_id INT,
  sanpham_id INT,
  so_luong INT NOT NULL,
  don_gia INT NOT NULL,
  FOREIGN KEY (donhang_id) REFERENCES donhang(id),
  FOREIGN KEY (sanpham_id) REFERENCES sanpham(id)
);

SHOW TABLES;

INSERT INTO khachhang (ten, sdt, email, diachi) 
VALUES ('Nguyen Van A', '0912345678', 'a@gmail.com', 'Ha Noi'), 
('Tran Thi B', '0987654321', 'b@gmail.com', 'TP.HCM'), 
('Le Van C', '0909090909', 'c@gmail.com', 'Da Nang');

INSERT INTO sanpham (ten_sp, gia, so_luong_ton, danh_muc) 
VALUES ('Tai nghe Bluetooth Mini', 150000, 50, 'Phu kien'), 
('Den ngu hinh mat trang', 89000, 30, 'Do trang tri'), 
('Ban tay giu dien thoai', 45000, 100, 'Phu kien'), 
('Binh giu nhiet 500ml', 120000, 20, 'Do gia dung');

SELECT * FROM khachhang;

SELECT * FROM sanpham;