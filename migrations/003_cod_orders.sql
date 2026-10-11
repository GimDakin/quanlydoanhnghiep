-- Additive only: legacy orders/details remain valid, snapshots default to NULL.
ALTER TABLE donhang ADD COLUMN ten_nguoi_nhan VARCHAR(100) NULL;
-- statement
ALTER TABLE donhang ADD COLUMN sdt_nguoi_nhan VARCHAR(20) NULL;
-- statement
ALTER TABLE donhang ADD COLUMN dia_chi_giao VARCHAR(500) NULL;
-- statement
ALTER TABLE donhang ADD COLUMN phuong_thuc_thanh_toan VARCHAR(20) NOT NULL DEFAULT 'COD';
-- statement
ALTER TABLE donhang ADD COLUMN checkout_token CHAR(64) NULL UNIQUE;
-- statement
ALTER TABLE chitietdonhang ADD COLUMN ten_sp_snapshot VARCHAR(150) NULL;
