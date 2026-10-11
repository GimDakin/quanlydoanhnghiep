-- Runner checks information_schema before each ADD COLUMN; safe to resume after partial DDL.
ALTER TABLE khachhang ADD COLUMN mat_khau VARCHAR(255) NULL;
-- statement
ALTER TABLE khachhang ADD COLUMN so_du_vi INT DEFAULT 0;
-- statement
ALTER TABLE khachhang ADD COLUMN hang_thanh_vien VARCHAR(20) DEFAULT 'Thuong';
-- statement
ALTER TABLE khachhang ADD COLUMN vai_tro VARCHAR(20) DEFAULT 'khach';
-- statement
ALTER TABLE sanpham ADD COLUMN mo_ta TEXT NULL;
-- statement
ALTER TABLE sanpham ADD COLUMN thuong_hieu VARCHAR(100) NULL;
-- statement
ALTER TABLE sanpham ADD COLUMN tu_khoa VARCHAR(500) NULL;
