 -- =========================================================================
-- HỆ THỐNG QUẢN LÝ ĐÀO TẠO  –  v2.0
-- SQL Server (T-SQL)  |  Chuẩn hóa 3NF  |  Mở rộng thực tế
-- Ngành KT Điện-Điện tử, PTIT Hà Nội
-- =========================================================================
-- MODULES:
--   1. Chương trình đào tạo (CHUONGTRINH_DAOTAO, CTDT_MONHOC)
--   2. Lịch học chuẩn hóa   (LICHHOC  – tách khỏi LOPHOCPHAN)
--   3. Tách đăng ký / kết quả (DANGKY + KETQUA_HOCTAP)
--   4. Học phí tự động       (HOCPHI  – trigger tính khi DK/hủy)
--   5. Kiểm tra trùng lịch   (TRG_KiemTraTrungLich)
--   6. 5 views phân tích     (V_BangDiem, V_TinChiTichLuy, V_GPA,
--                             V_SinhVienNoMon, V_MonDongNhat)
--   7. Phân quyền hệ thống   (ROLE SinhVien / GiangVien / QuanTri)
-- =========================================================================


-- =========================================================================
-- PHẦN 0: TẠO DATABASE VÀ XÓA TÀN DƯ CŨ
-- Thứ tự DROP: Views → Procedures → Triggers → Tables (theo FK ngược)
-- =========================================================================

IF DB_ID('QuanLyDangKyTinChi') IS NULL
BEGIN
    CREATE DATABASE QuanLyDangKyTinChi COLLATE Vietnamese_CI_AS;
END
GO

USE QuanLyDangKyTinChi;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- ---------- Views ----------
DROP VIEW IF EXISTS V_MonDongNhat;
DROP VIEW IF EXISTS V_SinhVienNoMon;
DROP VIEW IF EXISTS V_GPA;
DROP VIEW IF EXISTS V_BangDiem;
DROP VIEW IF EXISTS V_TinChiTichLuy;
GO

-- ---------- Stored Procedures ----------
DROP PROCEDURE IF EXISTS SP_TinhHocPhi;
DROP PROCEDURE IF EXISTS SP_MonCoTheDangKy;
DROP PROCEDURE IF EXISTS SP_HuyDangKy;
DROP PROCEDURE IF EXISTS SP_DangKyTinChi;
DROP PROCEDURE IF EXISTS SP_RestoreDatabase;
DROP PROCEDURE IF EXISTS SP_BackupDatabase;
GO

-- ---------- Triggers ----------
DROP TRIGGER IF EXISTS TRG_TinhHocPhi;
DROP TRIGGER IF EXISTS TRG_KiemTraTrungLich;
DROP TRIGGER IF EXISTS TRG_CapNhatKetQua;
DROP TRIGGER IF EXISTS TRG_KiemTraSySo;
-- legacy name (v1)
DROP TRIGGER IF EXISTS TRG_CapNhatTrangThai;
GO

-- ---------- Tables (thứ tự phụ thuộc FK ngược) ----------
DROP TABLE IF EXISTS HOCPHI;
DROP TABLE IF EXISTS KETQUA_HOCTAP;
DROP TABLE IF EXISTS DANGKY;
DROP TABLE IF EXISTS DANGKYTINCHI;          -- legacy v1, xóa nếu còn tồn tại
DROP TABLE IF EXISTS LICHHOC;
DROP TABLE IF EXISTS YEUCAU_TIENQUYET;
DROP TABLE IF EXISTS LOPHOCPHAN;
DROP TABLE IF EXISTS CTDT_MONHOC;
DROP TABLE IF EXISTS DOTDANGKY;
DROP TABLE IF EXISTS QUANTRI;
DROP TABLE IF EXISTS SINHVIEN;
DROP TABLE IF EXISTS LOPHOC;
DROP TABLE IF EXISTS CHUONGTRINH_DAOTAO;
DROP TABLE IF EXISTS MONHOC;
DROP TABLE IF EXISTS GIAOVIEN;
GO


-- =========================================================================
-- PHẦN 1: DDL - TẠO CẤU TRÚC BẢNG (v2.0)
-- Sơ đồ phụ thuộc:
--   GIAOVIEN ←── LOPHOC ←── SINHVIEN
--   MONHOC   ←── CHUONGTRINH_DAOTAO (qua CTDT_MONHOC)
--   DOTDANGKY ←┐
--   MONHOC ────┤
--   GIAOVIEN ──┴─ LOPHOCPHAN ──── LICHHOC
--                     │
--                   DANGKY ──── HOCPHI (trigger)
--                   KETQUA_HOCTAP (tach rieng)
-- =========================================================================

-- ---------------------------------------------------------
-- 1.1  GIAOVIEN
-- ---------------------------------------------------------
CREATE TABLE GIAOVIEN (
    MaGV        VARCHAR(10)   NOT NULL,
    TenGV       NVARCHAR(50)  NOT NULL,
    ChuyenNganh NVARCHAR(50),
    HocVi       NVARCHAR(30)  CHECK (HocVi IN (N'Cu nhan', N'Thac si', N'Tien si', N'GS', N'PGS')),
    Khoa        NVARCHAR(50),
    Email       VARCHAR(50)   UNIQUE,
    DienThoai   VARCHAR(10),
    MatKhau     NVARCHAR(256) NOT NULL,   -- Hash SHA-256, KHONG luu plain text
    IsDeleted   BIT           NOT NULL CONSTRAINT DF_GIAOVIEN_IsDeleted DEFAULT (0),
    DeletedAt   DATETIME2(0)  NULL,
    DeletedBy   NVARCHAR(50)  NULL,
    CONSTRAINT PK_GIAOVIEN PRIMARY KEY (MaGV)
);
GO

-- ---------------------------------------------------------
-- 1.2  MONHOC
-- ---------------------------------------------------------
CREATE TABLE MONHOC (
    MaMon    VARCHAR(10)   NOT NULL,
    TenMon   NVARCHAR(100) NOT NULL,
    SoTinChi INT           NOT NULL CHECK (SoTinChi BETWEEN 1 AND 6),
    Loai     NVARCHAR(20)  NOT NULL CHECK (Loai IN (N'Bat buoc', N'Tu chon')),
    MoTa     NVARCHAR(MAX),
    IsDeleted BIT           NOT NULL CONSTRAINT DF_MONHOC_IsDeleted DEFAULT (0),
    DeletedAt DATETIME2(0)  NULL,
    DeletedBy NVARCHAR(50)  NULL,
    CONSTRAINT PK_MONHOC PRIMARY KEY (MaMon)
);
GO

-- ---------------------------------------------------------
-- 1.3  CHUONGTRINH_DAOTAO  [MỚI]
--      Mỗi ngành / khóa có 1 chương trình đào tạo riêng.
--      CTDT_MONHOC là bảng liên kết M:N giữa CT và MONHOC,
--      lưu thêm thuộc tính: HocKyDeXuat, BatBuoc.
-- ---------------------------------------------------------
CREATE TABLE CHUONGTRINH_DAOTAO (
    MaCT       VARCHAR(10)   NOT NULL,
    TenCT      NVARCHAR(100) NOT NULL,
    Nganh      NVARCHAR(100) NOT NULL,
    NamApDung  INT           NOT NULL,
    CONSTRAINT PK_CTDT PRIMARY KEY (MaCT)
);
GO

CREATE TABLE CTDT_MONHOC (
    MaCT         VARCHAR(10) NOT NULL,
    MaMon        VARCHAR(10) NOT NULL,
    HocKyDeXuat  INT         NOT NULL CHECK (HocKyDeXuat BETWEEN 1 AND 10),
    BatBuoc      BIT         NOT NULL CONSTRAINT DF_CTDT_BB DEFAULT 1,
    CONSTRAINT PK_CTDT_MON     PRIMARY KEY (MaCT, MaMon),
    CONSTRAINT FK_CTDT_MON_CT  FOREIGN KEY (MaCT)  REFERENCES CHUONGTRINH_DAOTAO(MaCT),
    CONSTRAINT FK_CTDT_MON_MON FOREIGN KEY (MaMon) REFERENCES MONHOC(MaMon)
);
GO

-- ---------------------------------------------------------
-- 1.4  LOPHOC
-- ---------------------------------------------------------
CREATE TABLE LOPHOC (
    MaLop        VARCHAR(10)  NOT NULL,
    TenLop       NVARCHAR(50) NOT NULL,
    Khoa         NVARCHAR(50),
    MaGVChuNhiem VARCHAR(10),
    SySo         INT          CHECK (SySo > 0),
    NamNhapHoc   INT          CHECK (NamNhapHoc BETWEEN 2000 AND YEAR(GETDATE())),
    CONSTRAINT PK_LOPHOC    PRIMARY KEY (MaLop),
    CONSTRAINT FK_LOPHOC_GV FOREIGN KEY (MaGVChuNhiem)
        REFERENCES GIAOVIEN(MaGV) ON DELETE SET NULL
);
GO

-- ---------------------------------------------------------
-- 1.5  SINHVIEN
-- ---------------------------------------------------------
CREATE TABLE SINHVIEN (
    MaSV        VARCHAR(10)   NOT NULL,
    TenSV       NVARCHAR(50)  NOT NULL,
    NamNhapHoc  INT           CHECK (NamNhapHoc BETWEEN 2000 AND YEAR(GETDATE())),
    ChuyenNganh NVARCHAR(50),
    MaLop       VARCHAR(10),
    Email       VARCHAR(50)   UNIQUE,
    DienThoai   VARCHAR(10),
    MatKhau     NVARCHAR(256) NOT NULL,   -- Hash SHA-256, KHONG luu plain text
    IsDeleted   BIT           NOT NULL CONSTRAINT DF_SINHVIEN_IsDeleted DEFAULT (0),
    DeletedAt   DATETIME2(0)  NULL,
    DeletedBy   NVARCHAR(50)  NULL,
    CONSTRAINT PK_SINHVIEN PRIMARY KEY (MaSV),
    CONSTRAINT FK_SV_LOP   FOREIGN KEY (MaLop)
        REFERENCES LOPHOC(MaLop) ON DELETE SET NULL
);
GO

-- ---------------------------------------------------------
-- 1.5A QUANTRI  [MỚI]
-- ---------------------------------------------------------
CREATE TABLE QUANTRI (
    MaQT      VARCHAR(10)   NOT NULL,
    TenQT     NVARCHAR(50)  NOT NULL,
    Email     VARCHAR(50)   NOT NULL UNIQUE,
    MatKhau   NVARCHAR(256) NOT NULL,
    DienThoai VARCHAR(10),
    IsDeleted BIT           NOT NULL CONSTRAINT DF_QUANTRI_IsDeleted DEFAULT (0),
    DeletedAt DATETIME2(0)  NULL,
    DeletedBy NVARCHAR(50)  NULL,
    CONSTRAINT PK_QUANTRI PRIMARY KEY (MaQT)
);
GO

-- ---------------------------------------------------------
-- 1.6  DOTDANGKY
--      Tạo trước LOPHOCPHAN vì LOPHOCPHAN tham chiếu bảng này.
-- ---------------------------------------------------------
CREATE TABLE DOTDANGKY (
    MaDot     VARCHAR(10)  NOT NULL,
    NamHoc    INT          NOT NULL,
    HocKy     INT          NOT NULL CHECK (HocKy IN (1, 2, 3)),
    NgayBD    DATE         NOT NULL,
    NgayKT    DATE         NOT NULL,
    TrangThai NVARCHAR(20) NOT NULL
              CONSTRAINT DF_DOT_TrangThai DEFAULT N'Sap toi'
              CHECK (TrangThai IN (N'Sap toi', N'Dang mo', N'Da dong')),
    CONSTRAINT PK_DOTDANGKY PRIMARY KEY (MaDot),
    CONSTRAINT CHK_NGAY     CHECK (NgayKT > NgayBD),
    CONSTRAINT UQ_DOT       UNIQUE (HocKy, NamHoc)   -- mỗi HK/năm chỉ 1 đợt DK
);
GO

-- ---------------------------------------------------------
-- 1.7  LOPHOCPHAN
--      Phong và ThoiGian đã tách ra bảng LICHHOC bên dưới.
--      Một lớp HP có thể học nhiều phòng (LT vs thực hành).
-- ---------------------------------------------------------
CREATE TABLE LOPHOCPHAN (
    MaLopHP  VARCHAR(15) NOT NULL,
    MaMon    VARCHAR(10) NOT NULL,
    MaGV     VARCHAR(10) NOT NULL,
    MaDot    VARCHAR(10) NOT NULL,
    SysoMax  INT         NOT NULL CHECK (SysoMax BETWEEN 10 AND 100),
    IsDeleted BIT          NOT NULL CONSTRAINT DF_LOPHOCPHAN_IsDeleted DEFAULT (0),
    DeletedAt DATETIME2(0) NULL,
    DeletedBy NVARCHAR(50) NULL,
    CONSTRAINT PK_LOPHOCPHAN PRIMARY KEY (MaLopHP),
    CONSTRAINT FK_LHP_MON    FOREIGN KEY (MaMon) REFERENCES MONHOC(MaMon),
    CONSTRAINT FK_LHP_GV     FOREIGN KEY (MaGV)  REFERENCES GIAOVIEN(MaGV),
    CONSTRAINT FK_LHP_DOT    FOREIGN KEY (MaDot) REFERENCES DOTDANGKY(MaDot),
    CONSTRAINT UQ_LHP        UNIQUE (MaMon, MaGV, MaDot)
);
GO

-- ---------------------------------------------------------
-- 1.8  LICHHOC  [MỚI - tách từ LOPHOCPHAN.ThoiGian]
--      Mỗi lớp HP có 1 hoặc nhiều buổi học (LT + BT / TH).
--      Thu: 2=Thứ Hai … 7=Thứ Bảy.
--      Tiết: 1-14 (mỗi tiết 50 phút, khởi đầu từ 7:00).
--      Dùng để kiểm tra TRÙNG LỊCH chính xác.
-- ---------------------------------------------------------
CREATE TABLE LICHHOC (
    MaLich     INT IDENTITY(1,1) NOT NULL,
    MaLopHP    VARCHAR(15) NOT NULL,
    Thu        INT         NOT NULL CHECK (Thu BETWEEN 2 AND 7),
    TietBatDau INT         NOT NULL CHECK (TietBatDau BETWEEN 1 AND 14),
    SoTiet     INT         NOT NULL CHECK (SoTiet BETWEEN 1 AND 6),
    Phong      NVARCHAR(20),
    CONSTRAINT PK_LICHHOC    PRIMARY KEY (MaLich),
    CONSTRAINT FK_LICH_LHP   FOREIGN KEY (MaLopHP) REFERENCES LOPHOCPHAN(MaLopHP)
                                ON DELETE CASCADE
);
GO

-- ---------------------------------------------------------
-- 1.9  DANGKY  (đổi tên từ DANGKYTINCHI)
--      Lưu hành động đăng ký / hủy. KHÔNG lưu điểm ở đây.
--      Điểm và lịch sử học → KETQUA_HOCTAP (bảng 1.10).
-- ---------------------------------------------------------
CREATE TABLE DANGKY (
    MaSV       VARCHAR(10) NOT NULL,
    MaLopHP    VARCHAR(15) NOT NULL,
    NgayDangKy DATE        NOT NULL
               CONSTRAINT DF_DK_NgayDK DEFAULT (CAST(GETDATE() AS DATE)),
    TrangThai  NVARCHAR(20) NOT NULL
               CONSTRAINT DF_DK_TrangThai DEFAULT N'Cho xac nhan'
               CHECK (TrangThai IN (N'Cho xac nhan', N'Da xac nhan', N'Da huy')),
    CONSTRAINT PK_DANGKY    PRIMARY KEY (MaSV, MaLopHP),
    CONSTRAINT FK_DK_SV     FOREIGN KEY (MaSV)    REFERENCES SINHVIEN(MaSV),
    CONSTRAINT FK_DK_LHP    FOREIGN KEY (MaLopHP) REFERENCES LOPHOCPHAN(MaLopHP)
);
GO

-- ---------------------------------------------------------
-- 1.10 KETQUA_HOCTAP  [MỚI]
--      Lưu điểm và lịch sử học lại (LanHoc tăng dần).
--      PK (MaSV, MaMon, LanHoc) → hỗ trợ học lại nhiều lần.
--      KHÔNG có FK đến DANGKY (kết quả tồn tại độc lập sau khi học xong).
-- ---------------------------------------------------------
CREATE TABLE KETQUA_HOCTAP (
    MaSV      VARCHAR(10)  NOT NULL,
    MaMon     VARCHAR(10)  NOT NULL,
    LanHoc    INT          NOT NULL CONSTRAINT DF_KQ_LanHoc DEFAULT 1
                           CHECK (LanHoc >= 1),
    HocKy     INT          NOT NULL CHECK (HocKy IN (1, 2, 3)),
    NamHoc    INT          NOT NULL,
    Diem      DECIMAL(4,2)          CHECK (Diem BETWEEN 0 AND 10),
    TrangThai NVARCHAR(20) NOT NULL
              CONSTRAINT DF_KQ_TrangThai DEFAULT N'Chua co diem'
              CHECK (TrangThai IN (N'Dat', N'Khong dat', N'Chua co diem')),
    CONSTRAINT PK_KETQUA      PRIMARY KEY (MaSV, MaMon, LanHoc),
    CONSTRAINT FK_KQ_SV       FOREIGN KEY (MaSV)  REFERENCES SINHVIEN(MaSV),
    CONSTRAINT FK_KQ_MON      FOREIGN KEY (MaMon) REFERENCES MONHOC(MaMon)
);
GO

-- ---------------------------------------------------------
-- 1.11 HOCPHI  [MỚI]
--      Được tính tự động qua TRG_TinhHocPhi khi insert/delete DANGKY.
--      DonGia: 700,000 VND/TC (chuẩn học phí PTIT 2024).
--      Cho phép update thủ công TrangThai = N'Da thanh toan'.
-- ---------------------------------------------------------
CREATE TABLE HOCPHI (
    MaSV       VARCHAR(10)  NOT NULL,
    HocKy      INT          NOT NULL CHECK (HocKy IN (1, 2, 3)),
    NamHoc     INT          NOT NULL,
    SoTinChi   INT          NOT NULL CONSTRAINT DF_HP_SoTC DEFAULT 0,
    DonGia     MONEY        NOT NULL CONSTRAINT DF_HP_DonGia DEFAULT 700000,
    TongTien   AS (SoTinChi * DonGia) PERSISTED,   -- cột tính toán
    TrangThai  NVARCHAR(20) NOT NULL
               CONSTRAINT DF_HP_TrangThai DEFAULT N'Chua thanh toan'
               CHECK (TrangThai IN (N'Chua thanh toan', N'Da thanh toan', N'Mien giam')),
    CONSTRAINT PK_HOCPHI    PRIMARY KEY (MaSV, HocKy, NamHoc),
    CONSTRAINT FK_HP_SV     FOREIGN KEY (MaSV) REFERENCES SINHVIEN(MaSV)
);
GO

-- ---------------------------------------------------------
-- 1.12 YEUCAU_TIENQUYET
--      Quan hệ đệ quy M:N trên MONHOC.
-- ---------------------------------------------------------
CREATE TABLE YEUCAU_TIENQUYET (
    MonChinh      VARCHAR(10)  NOT NULL,
    MonTienQuyet  VARCHAR(10)  NOT NULL,
    DiemMin       DECIMAL(4,2) NOT NULL
                  CONSTRAINT DF_YC_DiemMin DEFAULT 5.0
                  CHECK (DiemMin BETWEEN 0 AND 10),
    CONSTRAINT PK_YEUCAU PRIMARY KEY (MonChinh, MonTienQuyet),
    CONSTRAINT FK_YC_CHIN FOREIGN KEY (MonChinh)     REFERENCES MONHOC(MaMon),
    CONSTRAINT FK_YC_TQ   FOREIGN KEY (MonTienQuyet) REFERENCES MONHOC(MaMon),
    CONSTRAINT CHK_YC     CHECK (MonChinh <> MonTienQuyet)
);
GO


-- =========================================================================
-- PHẦN 2: DML - NHẬP DỮ LIỆU MẪU (v2.0)
-- Ngành KT Điện-Điện tử, PTIT Hà Nội  |  Khóa 2022 + 2023
-- =========================================================================

-- MatKhau: gia tri hash SHA-256 cua MaGV (mac dinh, yeu cau doi khi dang nhap lan dau)
-- Tinh gia tri hash o tang ung dung; day la gia tri mau 64-ky-tu hex
INSERT INTO GIAOVIEN (MaGV,TenGV,ChuyenNganh,HocVi,Khoa,Email,DienThoai,MatKhau) VALUES
('GV001',N'Nguyen Duc Hung',   N'KT Dien tu',    N'Tien si',N'KT Dien-Dien tu','hung.nd@ptit.edu.vn',   '0912100001',
 LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'GV001'), 2))),
('GV002',N'Tran Thi Mai Anh', N'Mach dien',      N'Thac si',N'KT Dien-Dien tu','maianh.tt@ptit.edu.vn', '0912100002',
 LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'GV002'), 2))),
('GV003',N'Le Duc Thinh',     N'Vi xu ly nhung', N'Tien si',N'KT Dien-Dien tu','thinh.ld@ptit.edu.vn',  '0912100003',
 LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'GV003'), 2))),
('GV004',N'Pham Quoc Cuong',  N'Dien tu so',     N'PGS',    N'KT Dien-Dien tu','cuong.pq@ptit.edu.vn',  '0912100004',
 LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'GV004'), 2))),
('GV005',N'Hoang Thi Lan',    N'Xu ly tin hieu', N'Thac si',N'KT Dien-Dien tu','lan.ht@ptit.edu.vn',    '0912100005',
 LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'GV005'), 2)));
GO

INSERT INTO MONHOC (MaMon, TenMon, SoTinChi, Loai, MoTa) VALUES
('KDD101',N'Mach dien 1',                    3,N'Bat buoc',N'Phan tich mach dien tuyen tinh, dinh luat Kirchhoff'),
('KDD102',N'Mach dien 2',                    3,N'Bat buoc',N'Mach phi tuyen, mach co thong so phan bo'),
('KDD201',N'Dien tu co ban',                 3,N'Bat buoc',N'Linh kien ban dan, khuyech dai, tao dao dong'),
('KDD202',N'Dien tu so',                     3,N'Bat buoc',N'Logic to hop, logic tuan tu, FPGA co ban'),
('KDD301',N'Ky thuat vi xu ly',              3,N'Bat buoc',N'Kien truc 8051/ARM, lap trinh Assembly va C nhung'),
('KDD302',N'Ly thuyet tin hieu va he thong', 3,N'Bat buoc',N'Bien doi Fourier, Laplace, ham truyen dat'),
('KDD303',N'Xu ly tin hieu so',              3,N'Bat buoc',N'Bien doi DFT, FFT, thiet ke bo loc so FIR/IIR'),
('KDD304',N'KT dieu khien tu dong',          3,N'Bat buoc',N'Bo dieu khien PID, on dinh he thong'),
('KDD401',N'Thong tin so',                   3,N'Bat buoc',N'Ma hoa kenh, dieu che so ASK/FSK/PSK/QAM'),
('KDD402',N'Truong dien tu',                 3,N'Tu chon', N'Phuong trinh Maxwell, song dien tu, an ten');
GO

-- ---------------------------------------------------------
-- 2.1  Chương trình đào tạo (MODULE MỚI)
-- ---------------------------------------------------------
INSERT INTO CHUONGTRINH_DAOTAO VALUES
('CT2022DT', N'KT Dien-Dien tu Khoa 2022', N'KT Dien-Dien tu', 2022),
('CT2023DT', N'KT Dien-Dien tu Khoa 2023', N'KT Dien-Dien tu', 2023);
GO

-- Lộ trình môn học theo từng học kỳ (HocKyDeXuat) trong chương trình CT2022DT
INSERT INTO CTDT_MONHOC (MaCT, MaMon, HocKyDeXuat, BatBuoc) VALUES
('CT2022DT','KDD101',1,1),   -- HK1: Mạch điện 1  (Bắt buộc)
('CT2022DT','KDD201',1,1),   -- HK1: Điện tử cơ bản (Bắt buộc)
('CT2022DT','KDD102',2,1),   -- HK2: Mạch điện 2
('CT2022DT','KDD202',2,1),   -- HK2: Điện tử số
('CT2022DT','KDD302',3,1),   -- HK3: Lý thuyết tín hiệu
('CT2022DT','KDD301',4,1),   -- HK4: Vi xử lý
('CT2022DT','KDD303',4,1),   -- HK4: Xử lý tín hiệu số
('CT2022DT','KDD304',5,1),   -- HK5: KT điều khiển
('CT2022DT','KDD401',6,1),   -- HK6: Thông tin số
('CT2022DT','KDD402',6,0);   -- HK6: Trường điện từ (Tự chọn)
GO

INSERT INTO YEUCAU_TIENQUYET VALUES
('KDD102','KDD101',5.0),
('KDD202','KDD201',5.0),
('KDD301','KDD202',5.0),
('KDD302','KDD101',5.0),
('KDD303','KDD302',6.0),
('KDD304','KDD102',5.0),
('KDD304','KDD302',5.0);
GO

INSERT INTO DOTDANGKY VALUES
('DOT20231',2023,1,'2023-07-10','2023-07-25',N'Da dong'),
('DOT20232',2023,2,'2023-12-11','2023-12-25',N'Da dong'),
('DOT20241',2024,1,'2024-07-08','2024-07-22',N'Dang mo');
GO

INSERT INTO LOPHOC VALUES
('D22CQDT01',N'KT Dien-Dien tu K2022 Lop 1',N'KT Dien-Dien tu','GV001',55,2022),
('D22CQDT02',N'KT Dien-Dien tu K2022 Lop 2',N'KT Dien-Dien tu','GV004',55,2022),
('D23CQDT01',N'KT Dien-Dien tu K2023 Lop 1',N'KT Dien-Dien tu','GV003',55,2023);
GO

-- MatKhau mac dinh = hash SHA-256 cua MaSV (tinh o tang ung dung)
INSERT INTO SINHVIEN (MaSV,TenSV,NamNhapHoc,ChuyenNganh,MaLop,Email,DienThoai,MatKhau) VALUES
('B22DCDT001',N'Nguyen Van Tuan', 2022,N'KT Dien-Dien tu','D22CQDT01',
 'tuan.nv22@sv.ptit.edu.vn', '0931000001',
 LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'B22DCDT001'), 2))),
('B22DCDT002',N'Tran Thi Huong',  2022,N'KT Dien-Dien tu','D22CQDT01',
 'huong.tt22@sv.ptit.edu.vn','0931000002',
 LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'B22DCDT002'), 2))),
('B22DCDT003',N'Le Minh Duc',     2022,N'KT Dien-Dien tu','D22CQDT01',
 'duc.lm22@sv.ptit.edu.vn',  '0931000003',
 LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'B22DCDT003'), 2))),
('B22DCDT004',N'Pham Thi Thu',    2022,N'KT Dien-Dien tu','D22CQDT02',
 'thu.pt22@sv.ptit.edu.vn',  '0931000004',
 LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'B22DCDT004'), 2))),
('B22DCDT005',N'Hoang Van Binh',  2022,N'KT Dien-Dien tu','D22CQDT02',
 'binh.hv22@sv.ptit.edu.vn', '0931000005',
 LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'B22DCDT005'), 2))),
('B23DCDT001',N'Nguyen Thi Linh', 2023,N'KT Dien-Dien tu','D23CQDT01',
 'linh.nt23@sv.ptit.edu.vn', '0931000006',
 LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'B23DCDT001'), 2)));
GO

INSERT INTO QUANTRI (MaQT, TenQT, Email, MatKhau, DienThoai) VALUES
('ADMIN001', N'Quan tri vien', 'admin@ptit.edu.vn',
 LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'ADMIN001'), 2)), '0912999999');
GO

-- ---------------------------------------------------------
-- 2.2  Lớp học phần (bỏ Phong, ThoiGian – chuyển vào LICHHOC)
-- ---------------------------------------------------------
INSERT INTO LOPHOCPHAN (MaLopHP, MaMon, MaGV, MaDot, SysoMax) VALUES
-- HK1 2023-2024
('KDD101_DT01_231','KDD101','GV002','DOT20231',55),
('KDD101_DT02_231','KDD101','GV001','DOT20231',55),
('KDD201_DT01_231','KDD201','GV001','DOT20231',50),
('KDD302_DT01_231','KDD302','GV005','DOT20231',50),
-- HK2 2023-2024
('KDD102_DT01_232','KDD102','GV002','DOT20232',50),
('KDD202_DT01_232','KDD202','GV004','DOT20232',50),
('KDD303_DT01_232','KDD303','GV005','DOT20232',45),
-- HK1 2024-2025 (đang mở)
('KDD301_DT01_241','KDD301','GV003','DOT20241',50),
('KDD304_DT01_241','KDD304','GV001','DOT20241',45),
('KDD401_DT01_241','KDD401','GV003','DOT20241',50);
GO

-- ---------------------------------------------------------
-- 2.3  Lịch học (MODULE MỚI – migrate từ chuỗi ThoiGian cũ)
--      Định dạng gốc: 'Thu X Tiet Y-Z'  →  TietBatDau=Y, SoTiet=(Z-Y+1)
-- ---------------------------------------------------------
INSERT INTO LICHHOC (MaLopHP, Thu, TietBatDau, SoTiet, Phong) VALUES
-- HK1 2023-2024
('KDD101_DT01_231', 2, 1, 3, 'P.101'),   -- Thứ 2 Tiết 1-3
('KDD101_DT02_231', 4, 1, 3, 'P.102'),   -- Thứ 4 Tiết 1-3
('KDD201_DT01_231', 3, 4, 3, 'P.201'),   -- Thứ 3 Tiết 4-6
('KDD302_DT01_231', 5, 1, 3, 'P.301'),   -- Thứ 5 Tiết 1-3
-- HK2 2023-2024
('KDD102_DT01_232', 2, 4, 3, 'P.101'),   -- Thứ 2 Tiết 4-6
('KDD202_DT01_232', 3, 1, 3, 'P.Lab1'), -- Thứ 3 Tiết 1-3
('KDD303_DT01_232', 4, 4, 3, 'P.301'),   -- Thứ 4 Tiết 4-6
-- HK1 2024-2025 (đang mở)
('KDD301_DT01_241', 2, 4, 3, 'P.Lab2'), -- Thứ 2 Tiết 4-6
('KDD304_DT01_241', 5, 4, 3, 'P.201'),   -- Thứ 5 Tiết 4-6
('KDD401_DT01_241', 3, 1, 3, 'P.302');  -- Thứ 3 Tiết 1-3
GO

-- ---------------------------------------------------------
-- 2.4  Kết quả học tập HK1 & HK2 2023-2024 (lịch sử đã học)
--      Mô phỏng: Tuấn và Hương đã học xong 2 HK đầu
-- ---------------------------------------------------------
INSERT INTO KETQUA_HOCTAP (MaSV, MaMon, LanHoc, HocKy, NamHoc, Diem, TrangThai) VALUES
-- Tuấn – HK1 2023
('B22DCDT001','KDD101',1,1,2023,7.5,N'Dat'),
('B22DCDT001','KDD201',1,1,2023,8.0,N'Dat'),
-- Tuấn – HK2 2023
('B22DCDT001','KDD102',1,2,2023,6.5,N'Dat'),
('B22DCDT001','KDD202',1,2,2023,7.0,N'Dat'),
-- Hương – HK1 2023  (thi lại KDD101 lần 2)
('B22DCDT002','KDD101',1,1,2023,4.0,N'Khong dat'),
('B22DCDT002','KDD101',2,1,2023,5.5,N'Dat'),
('B22DCDT002','KDD201',1,1,2023,6.0,N'Dat'),
-- Đức – HK1 2023
('B22DCDT003','KDD101',1,1,2023,9.0,N'Dat'),
('B22DCDT003','KDD201',1,1,2023,8.5,N'Dat');
GO
-- =========================================================================
-- PHẦN 3: STORED PROCEDURES (v2.0)
--   SP_DangKyTinChi   – đăng ký (7 bước kiểm tra)
--   SP_HuyDangKy      – hủy đăng ký
--   SP_MonCoTheDangKy – gợi ý môn có thể đăng ký cho SV
--   SP_TinhHocPhi     – tính học phí thủ công cuối đợt
-- =========================================================================

-- ---------------------------------------------------------
-- 3.1  SP_DangKyTinChi  (7 bước)
--      Bước mới so với v1: Bước 6 – kiểm tra trùng lịch
-- ---------------------------------------------------------
CREATE PROCEDURE SP_DangKyTinChi
    @MaSV    VARCHAR(10),
    @MaLopHP VARCHAR(15),
    @KetQua  NVARCHAR(200) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TrangThaiDot NVARCHAR(20);
    DECLARE @MaDot        VARCHAR(10);
    DECLARE @SySoMax      INT;
    DECLARE @SoSVDaDK     INT;
    DECLARE @MaMon        VARCHAR(10);
    DECLARE @SoTCHK       INT;
    DECLARE @SoTCMon      INT;
    DECLARE @ThieuTQ      INT;

    -- Lấy thông tin lớp HP
    SELECT @MaDot = MaDot, @MaMon = MaMon
    FROM LOPHOCPHAN WHERE MaLopHP = @MaLopHP;

    IF @MaDot IS NULL
    BEGIN
        SET @KetQua = N'LOI: Lop hoc phan khong ton tai.'; RETURN;
    END

    -- Bước 1: Đợt đăng ký đang mở?
    SELECT @TrangThaiDot = TrangThai FROM DOTDANGKY WHERE MaDot = @MaDot;
    IF @TrangThaiDot <> N'Dang mo'
    BEGIN
        SET @KetQua = N'LOI: Dot dang ky chua mo hoac da dong.'; RETURN;
    END

    -- Bước 2: Đã đăng ký lớp HP này chưa?
    IF EXISTS (SELECT 1 FROM DANGKY WHERE MaSV = @MaSV AND MaLopHP = @MaLopHP)
    BEGIN
        SET @KetQua = N'LOI: Sinh vien da dang ky lop nay roi.'; RETURN;
    END

    -- Bước 3: Còn chỗ không?
    SELECT @SySoMax  = SysoMax FROM LOPHOCPHAN WHERE MaLopHP = @MaLopHP;
    SELECT @SoSVDaDK = COUNT(*) FROM DANGKY WHERE MaLopHP = @MaLopHP;
    IF @SoSVDaDK >= @SySoMax
    BEGIN
        SET @KetQua = N'LOI: Lop hoc phan da day cho.'; RETURN;
    END

    -- Bước 4: Không vượt 25 TC/học kỳ?
    SELECT @SoTCMon = SoTinChi FROM MONHOC WHERE MaMon = @MaMon;
    SELECT @SoTCHK  = COALESCE(SUM(mh.SoTinChi), 0)
    FROM DANGKY dk
    JOIN LOPHOCPHAN lhp ON dk.MaLopHP = lhp.MaLopHP
    JOIN MONHOC    mh   ON lhp.MaMon  = mh.MaMon
    WHERE dk.MaSV = @MaSV AND lhp.MaDot = @MaDot;

    IF (@SoTCHK + @SoTCMon) > 25
    BEGIN
        SET @KetQua = N'LOI: Vuot 25 TC/HK. Hien: '
                    + CAST(@SoTCHK AS NVARCHAR) + N' TC.'; RETURN;
    END

    -- Bước 5: Đủ điều kiện tiên quyết?
    SELECT @ThieuTQ = COUNT(*)
    FROM YEUCAU_TIENQUYET yq
    WHERE yq.MonChinh = @MaMon
    AND NOT EXISTS (
        SELECT 1 FROM KETQUA_HOCTAP kq
        WHERE kq.MaSV  = @MaSV
          AND kq.MaMon = yq.MonTienQuyet
          AND kq.Diem >= yq.DiemMin
          AND kq.TrangThai = N'Dat'
    );
    IF @ThieuTQ > 0
    BEGIN
        SET @KetQua = N'LOI: Chua du dieu kien tien quyet.'; RETURN;
    END

    -- Bước 6: Kiểm tra trùng lịch (so sánh với tất cả lớp đã đăng ký trong đợt)
    IF EXISTS (
        SELECT 1
        FROM LICHHOC      L_new           -- lịch của lớp muốn đăng ký
        JOIN DANGKY       dk_cur          -- các đăng ký hiện tại của SV trong đợt
            ON dk_cur.MaSV = @MaSV
        JOIN LOPHOCPHAN   lhp_cur
            ON lhp_cur.MaLopHP = dk_cur.MaLopHP
           AND lhp_cur.MaDot   = @MaDot
        JOIN LICHHOC      L_cur           -- lịch của các lớp đó
            ON L_cur.MaLopHP = dk_cur.MaLopHP
        WHERE L_new.MaLopHP = @MaLopHP
          AND L_new.Thu     = L_cur.Thu
          -- Kiểm tra overlap tiết: [A, A+sA) giao [B, B+sB) ≠ ∅
          AND L_new.TietBatDau < L_cur.TietBatDau + L_cur.SoTiet
          AND L_cur.TietBatDau < L_new.TietBatDau + L_new.SoTiet
    )
    BEGIN
        SET @KetQua = N'LOI: Trung lich voi lop hoc phan da dang ky.'; RETURN;
    END

    -- Bước 7: Tất cả hợp lệ → Ghi nhận đăng ký
    INSERT INTO DANGKY (MaSV, MaLopHP, NgayDangKy, TrangThai)
    VALUES (@MaSV, @MaLopHP, CAST(GETDATE() AS DATE), N'Da xac nhan');

    SET @KetQua = N'THANH CONG: Dang ky hoan tat.';
END;
GO

-- ---------------------------------------------------------
-- 3.2  SP_HuyDangKy
--      Chỉ hủy được khi đợt đăng ký còn đang mở.
--      TRG_TinhHocPhi sẽ tự cập nhật HOCPHI sau khi DELETE.
-- ---------------------------------------------------------
CREATE PROCEDURE SP_HuyDangKy
    @MaSV    VARCHAR(10),
    @MaLopHP VARCHAR(15),
    @KetQua  NVARCHAR(200) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @MaDot        VARCHAR(10);
    DECLARE @TrangThaiDot NVARCHAR(20);

    -- Kiểm tra đăng ký tồn tại
    SELECT @MaDot = lhp.MaDot
    FROM DANGKY     dk
    JOIN LOPHOCPHAN lhp ON lhp.MaLopHP = dk.MaLopHP
    WHERE dk.MaSV = @MaSV AND dk.MaLopHP = @MaLopHP;

    IF @MaDot IS NULL
    BEGIN
        SET @KetQua = N'LOI: Khong tim thay dang ky can huy.'; RETURN;
    END

    -- Kiểm tra đợt vẫn đang mở
    SELECT @TrangThaiDot = TrangThai FROM DOTDANGKY WHERE MaDot = @MaDot;
    IF @TrangThaiDot <> N'Dang mo'
    BEGIN
        SET @KetQua = N'LOI: Dot dang ky da dong, khong the huy.'; RETURN;
    END

    -- Xóa đăng ký (TRG_TinhHocPhi sẽ cập nhật HOCPHI tự động)
    DELETE FROM DANGKY WHERE MaSV = @MaSV AND MaLopHP = @MaLopHP;

    SET @KetQua = N'THANH CONG: Huy dang ky thanh cong.';
END;
GO

-- ---------------------------------------------------------
-- 3.3  SP_MonCoTheDangKy
--      Trả về danh sách môn học SV có thể đăng ký trong đợt @MaDot.
--      Logic:
--        (a) Môn thuộc đợt đó (có lớp HP chưa đầy)
--        (b) Chưa đạt môn đó (chưa có KQ Dat)
--        (c) Đủ tiên quyết (hoặc không có tiên quyết)
-- ---------------------------------------------------------
CREATE PROCEDURE SP_MonCoTheDangKy
    @MaSV  VARCHAR(10),
    @MaDot VARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT
        mh.MaMon,
        mh.TenMon,
        mh.SoTinChi,
        lhp.MaLopHP,
        gv.TenGV        AS GiaoVien,
        lich.GioHoc
    FROM MONHOC    mh
    JOIN LOPHOCPHAN lhp ON lhp.MaMon = mh.MaMon AND lhp.MaDot = @MaDot
    JOIN GIAOVIEN  gv   ON gv.MaGV   = lhp.MaGV
    -- Lịch tổng hợp dạng chuỗi cho dễ đọc
    OUTER APPLY (
        SELECT STRING_AGG(CONCAT(N'T',Thu,N' T',TietBatDau,N'-',TietBatDau+SoTiet-1,' ',Phong), ' | ')
               AS GioHoc
        FROM LICHHOC WHERE MaLopHP = lhp.MaLopHP
    ) lich
    -- (a) Lớp chưa đầy
    WHERE (SELECT COUNT(*) FROM DANGKY WHERE MaLopHP = lhp.MaLopHP) < lhp.SysoMax

    -- (b) SV chưa đạt môn này
    AND NOT EXISTS (
        SELECT 1 FROM KETQUA_HOCTAP kq
        WHERE kq.MaSV = @MaSV AND kq.MaMon = mh.MaMon AND kq.TrangThai = N'Dat'
    )

    -- (c) Đủ tiên quyết (mọi tiên quyết đều đã Dat)
    AND NOT EXISTS (
        SELECT 1 FROM YEUCAU_TIENQUYET yq
        WHERE yq.MonChinh = mh.MaMon
        AND NOT EXISTS (
            SELECT 1 FROM KETQUA_HOCTAP kq2
            WHERE kq2.MaSV  = @MaSV
              AND kq2.MaMon = yq.MonTienQuyet
              AND kq2.Diem >= yq.DiemMin
              AND kq2.TrangThai = N'Dat'
        )
    )
    ORDER BY mh.MaMon;
END;
GO

-- ---------------------------------------------------------
-- 3.4  SP_TinhHocPhi
--      Gọi thủ công cuối đợt để đảm bảo HOCPHI đồng bộ.
--      Thường trigger đã xử lý real-time; SP này dùng để
--      reconcile / tính lại toàn bộ nếu cần.
-- ---------------------------------------------------------
CREATE PROCEDURE SP_TinhHocPhi
    @MaDot VARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @HocKy INT, @NamHoc INT;
    SELECT @HocKy = HocKy, @NamHoc = NamHoc FROM DOTDANGKY WHERE MaDot = @MaDot;

    -- UPSERT học phí cho tất cả SV có đăng ký trong đợt
    MERGE HOCPHI AS target
    USING (
        SELECT
            dk.MaSV,
            @HocKy           AS HocKy,
            @NamHoc          AS NamHoc,
            SUM(mh.SoTinChi) AS SoTinChi
        FROM DANGKY dk
        JOIN LOPHOCPHAN lhp ON lhp.MaLopHP = dk.MaLopHP AND lhp.MaDot = @MaDot
        JOIN MONHOC     mh  ON mh.MaMon    = lhp.MaMon
        GROUP BY dk.MaSV
    ) AS source (MaSV, HocKy, NamHoc, SoTinChi)
    ON (target.MaSV = source.MaSV AND target.HocKy = source.HocKy AND target.NamHoc = source.NamHoc)
    WHEN MATCHED THEN
        UPDATE SET SoTinChi = source.SoTinChi
    WHEN NOT MATCHED THEN
        INSERT (MaSV, HocKy, NamHoc, SoTinChi)
        VALUES (source.MaSV, source.HocKy, source.NamHoc, source.SoTinChi);

    PRINT N'Cap nhat hoc phi dot ' + @MaDot + N' hoan tat.';
END;
GO

-- ---------------------------------------------------------
-- 3.5  SP_BackupDatabase / SP_RestoreDatabase  [MỚI]
-- ---------------------------------------------------------
CREATE PROCEDURE SP_BackupDatabase
    @BackupPath NVARCHAR(260) = N'C:\SQLBackups\QuanLyDangKyTinChi_full.bak'
AS
BEGIN
    SET NOCOUNT ON;

    BACKUP DATABASE QuanLyDangKyTinChi
    TO DISK = @BackupPath
    WITH INIT,
         FORMAT,
         NAME = N'QuanLyDangKyTinChi - Full Backup',
         STATS = 10;

    RESTORE HEADERONLY FROM DISK = @BackupPath;
END;
GO

CREATE PROCEDURE SP_RestoreDatabase
    @BackupPath NVARCHAR(260) = N'C:\SQLBackups\QuanLyDangKyTinChi_full.bak'
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        ALTER DATABASE QuanLyDangKyTinChi SET SINGLE_USER WITH ROLLBACK IMMEDIATE;

        RESTORE DATABASE QuanLyDangKyTinChi
        FROM DISK = @BackupPath
        WITH REPLACE,
             RECOVERY,
             STATS = 10;

        ALTER DATABASE QuanLyDangKyTinChi SET MULTI_USER;
    END TRY
    BEGIN CATCH
        IF DB_ID(N'QuanLyDangKyTinChi') IS NOT NULL
        BEGIN
            ALTER DATABASE QuanLyDangKyTinChi SET MULTI_USER;
        END;
        THROW;
    END CATCH
END;
GO

-- =========================================================================
-- PHẦN 4: TRIGGERS (v2.0)
--   TRG_KiemTraSySo      – bảo vệ sĩ số tối đa (safety net)
--   TRG_KiemTraTrungLich – ngăn đăng ký 2 lớp trùng giờ  [MỚI]
--   TRG_CapNhatKetQua    – tự cập nhật TrangThai khi nhập điểm
--   TRG_TinhHocPhi       – tính học phí real-time khi DK/hủy [MỚI]
-- =========================================================================

-- ---------------------------------------------------------
-- 4.1  TRG_KiemTraSySo
--      Safety net: kiểm tra lại sĩ số ngay sau INSERT DANGKY.
--      SP_DangKyTinChi đã check bước 3, trigger là lớp bảo vệ thứ hai.
-- ---------------------------------------------------------
CREATE TRIGGER TRG_KiemTraSySo
ON DANGKY
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM LOPHOCPHAN lhp
        JOIN (
            SELECT dk.MaLopHP, COUNT(*) AS SoHienTai
            FROM DANGKY dk
            JOIN inserted i ON dk.MaLopHP = i.MaLopHP
            GROUP BY dk.MaLopHP
        ) ht ON lhp.MaLopHP = ht.MaLopHP
        WHERE ht.SoHienTai > lhp.SysoMax
    )
    BEGIN
        THROW 50001, N'Loi: Lop hoc phan da vuot qua si so toi da!', 1;
        ROLLBACK TRANSACTION;
    END
END;
GO

-- ---------------------------------------------------------
-- 4.2  TRG_KiemTraTrungLich  [MỚI]
--      Ngăn SV đăng ký 2 lớp có lịch học trùng giờ.
--      Kiểm tra trên tất cả rows trong `inserted` (set-based).
--      Điều kiện overlap tiết: [A, A+sA) ∩ [B, B+sB) ≠ ∅
--        ↔ A < B+sB  AND  B < A+sA
-- ---------------------------------------------------------
CREATE TRIGGER TRG_KiemTraTrungLich
ON DANGKY
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    -- Tìm cặp lịch học bị trùng: lớp mới đăng ký vs lớp đã có
    IF EXISTS (
        SELECT 1
        FROM inserted       ins                          -- đăng ký mới
        JOIN LICHHOC        L_new ON L_new.MaLopHP = ins.MaLopHP  -- lịch lớp mới
        -- Tất cả đăng ký HIỆN TẠI của SV đó (bao gồm cả inserted, trừ chính nó)
        JOIN DANGKY         dk_cur
            ON  dk_cur.MaSV    = ins.MaSV
            AND dk_cur.MaLopHP <> ins.MaLopHP
        -- Lọc cùng đợt đăng ký (tránh so sánh HK khác nhau)
        JOIN LOPHOCPHAN     lhp_new ON lhp_new.MaLopHP = ins.MaLopHP
        JOIN LOPHOCPHAN     lhp_cur ON lhp_cur.MaLopHP = dk_cur.MaLopHP
                                    AND lhp_cur.MaDot   = lhp_new.MaDot
        JOIN LICHHOC        L_cur ON L_cur.MaLopHP = dk_cur.MaLopHP  -- lịch lớp cũ
        WHERE L_new.Thu = L_cur.Thu
          AND L_new.TietBatDau < L_cur.TietBatDau + L_cur.SoTiet
          AND L_cur.TietBatDau < L_new.TietBatDau + L_new.SoTiet
    )
    BEGIN
        THROW 50002, N'Loi: Phat hien trung lich hoc khi dang ky!', 1;
        ROLLBACK TRANSACTION;
    END
END;
GO

-- ---------------------------------------------------------
-- 4.3  TRG_CapNhatKetQua
--      Tự cập nhật TrangThai trong KETQUA_HOCTAP khi Diem thay đổi.
--      Ngưỡng đạt: Diem >= 5.0.
-- ---------------------------------------------------------
CREATE TRIGGER TRG_CapNhatKetQua
ON KETQUA_HOCTAP
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(Diem) RETURN;

    UPDATE kq
    SET TrangThai = CASE
        WHEN i.Diem >= 5.0 THEN N'Dat'
        ELSE N'Khong dat'
    END
    FROM KETQUA_HOCTAP kq
    JOIN inserted i ON kq.MaSV  = i.MaSV
                    AND kq.MaMon = i.MaMon
                    AND kq.LanHoc= i.LanHoc
    WHERE i.Diem IS NOT NULL;
END;
GO

-- ---------------------------------------------------------
-- 4.4  TRG_TinhHocPhi  [MỚI]
--      Tự cập nhật HOCPHI real-time sau mỗi INSERT / DELETE DANGKY.
--      Đơn giá: 700,000 VND/TC (chuẩn PTIT 2024).
--      Dùng MERGE để UPSERT an toàn.
-- ---------------------------------------------------------
CREATE TRIGGER TRG_TinhHocPhi
ON DANGKY
AFTER INSERT, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Thu thập các (MaSV, HocKy, NamHoc) bị ảnh hưởng từ cả inserted và deleted
    ;WITH AffectedRows AS (
        SELECT DISTINCT dk_aff.MaSV, dd.HocKy, dd.NamHoc
        FROM (
            SELECT MaSV, MaLopHP FROM inserted
            UNION
            SELECT MaSV, MaLopHP FROM deleted
        ) dk_aff
        JOIN LOPHOCPHAN lhp ON lhp.MaLopHP = dk_aff.MaLopHP
        JOIN DOTDANGKY  dd  ON dd.MaDot    = lhp.MaDot
    ),
    -- Tính lại SoTinChi hiện tại cho từng (MaSV, HocKy, NamHoc)
    NewTotals AS (
        SELECT
            ar.MaSV,
            ar.HocKy,
            ar.NamHoc,
            COALESCE(SUM(mh.SoTinChi), 0) AS SoTinChi
        FROM AffectedRows ar
        LEFT JOIN DANGKY     dk  ON dk.MaSV  = ar.MaSV
        LEFT JOIN LOPHOCPHAN lhp ON lhp.MaLopHP = dk.MaLopHP
        LEFT JOIN DOTDANGKY  dd  ON dd.MaDot = lhp.MaDot
                                 AND dd.HocKy  = ar.HocKy
                                 AND dd.NamHoc = ar.NamHoc
        LEFT JOIN MONHOC     mh  ON mh.MaMon = lhp.MaMon
        GROUP BY ar.MaSV, ar.HocKy, ar.NamHoc
    )
    MERGE HOCPHI AS target
    USING NewTotals AS source
    ON (target.MaSV   = source.MaSV
    AND target.HocKy  = source.HocKy
    AND target.NamHoc = source.NamHoc)
    WHEN MATCHED THEN
        UPDATE SET SoTinChi = source.SoTinChi
    WHEN NOT MATCHED AND source.SoTinChi > 0 THEN
        INSERT (MaSV, HocKy, NamHoc, SoTinChi)
        VALUES (source.MaSV, source.HocKy, source.NamHoc, source.SoTinChi);
END;
GO

-- =========================================================================
-- PHẦN 5: VIEWS (v2.0)
--   V_BangDiem       – bảng điểm chi tiết từng SV / môn / HK
--   V_TinChiTichLuy  – tổng TC tích lũy toàn khóa
--   V_GPA            – GPA theo từng học kỳ và tích lũy  [MỚI]
--   V_SinhVienNoMon  – SV còn nợ môn (chưa đạt lần nào) [MỚI]
--   V_MonDongNhat    – lớp HP / môn học đông nhất         [MỚI]
-- =========================================================================

-- ---------------------------------------------------------
-- 5.1  V_BangDiem  (cập nhật: đọc từ KETQUA_HOCTAP)
-- ---------------------------------------------------------
CREATE VIEW V_BangDiem AS
SELECT
    sv.MaSV,
    sv.TenSV,
    lh.TenLop,
    mh.MaMon,
    mh.TenMon,
    mh.SoTinChi,
    gv.TenGV      AS GiaoVienDay,
    kq.HocKy,
    kq.NamHoc,
    kq.LanHoc,
    kq.Diem,
    kq.TrangThai
FROM SINHVIEN       sv
JOIN LOPHOC         lh  ON lh.MaLop  = sv.MaLop
JOIN KETQUA_HOCTAP  kq  ON kq.MaSV   = sv.MaSV
JOIN MONHOC         mh  ON mh.MaMon  = kq.MaMon
-- Lấy giảng viên dạy lần gần nhất (join LOPHOCPHAN + DOTDANGKY qua HocKy/NamHoc)
LEFT JOIN LOPHOCPHAN lhp ON lhp.MaMon = kq.MaMon
LEFT JOIN DOTDANGKY  dd  ON dd.MaDot  = lhp.MaDot
                         AND dd.HocKy  = kq.HocKy
                         AND dd.NamHoc = kq.NamHoc
LEFT JOIN GIAOVIEN   gv  ON gv.MaGV   = lhp.MaGV;
GO

-- ---------------------------------------------------------
-- 5.2  V_TinChiTichLuy  (cập nhật: dùng KETQUA_HOCTAP)
--      Chỉ đếm lần học ĐẠT và TC đạt cao nhất mỗi môn.
-- ---------------------------------------------------------
CREATE VIEW V_TinChiTichLuy AS
SELECT
    sv.MaSV,
    sv.TenSV,
    COUNT(DISTINCT kq.MaMon)              AS SoMonDaHoc,
    COALESCE(SUM(mh.SoTinChi), 0)         AS TongTC,
    COALESCE(
        ROUND(
            SUM(kq_best.Diem * mh.SoTinChi)
            / NULLIF(SUM(mh.SoTinChi), 0)
        , 2)
    , 0)                                   AS DiemTBTichLuy
FROM SINHVIEN sv
LEFT JOIN (
    -- Lấy điểm cao nhất (lần học tốt nhất) của mỗi môn
    SELECT MaSV, MaMon, MAX(Diem) AS Diem
    FROM KETQUA_HOCTAP
    WHERE TrangThai = N'Dat'
    GROUP BY MaSV, MaMon
) kq_best ON kq_best.MaSV = sv.MaSV
LEFT JOIN KETQUA_HOCTAP kq ON kq.MaSV = sv.MaSV AND kq.MaMon = kq_best.MaMon
                           AND kq.TrangThai = N'Dat'
LEFT JOIN MONHOC mh ON mh.MaMon = kq_best.MaMon
GROUP BY sv.MaSV, sv.TenSV;
GO

-- ---------------------------------------------------------
-- 5.3  V_GPA  [MỚI]
--      GPA tích lũy dùng điểm lần học TỐT NHẤT mỗi môn.
--      GPA = Σ(Điểm_tốt_nhất × SoTinChi) / Σ(SoTinChi)  — chỉ môn đã Đạt
--      Thang điểm 4: GPA4 = GPA10 / 2.5  (gần đúng theo quy đổi PTIT)
-- ---------------------------------------------------------
CREATE VIEW V_GPA AS
WITH BestScores AS (
    SELECT MaSV, MaMon, MAX(Diem) AS DiemTotNhat
    FROM KETQUA_HOCTAP
    WHERE TrangThai = N'Dat'
    GROUP BY MaSV, MaMon
)
SELECT
    sv.MaSV,
    sv.TenSV,
    COUNT(bs.MaMon)                                             AS SoMonDat,
    COALESCE(SUM(mh.SoTinChi), 0)                              AS TCTichLuy,
    COALESCE(
        ROUND(
            SUM(bs.DiemTotNhat * mh.SoTinChi)
            / NULLIF(SUM(mh.SoTinChi), 0)
        , 2)
    , 0)                                                        AS GPA10,
    COALESCE(
        ROUND(
            SUM(bs.DiemTotNhat * mh.SoTinChi)
            / NULLIF(SUM(mh.SoTinChi), 0) / 2.5
        , 2)
    , 0)                                                        AS GPA4
FROM SINHVIEN  sv
LEFT JOIN BestScores bs ON bs.MaSV  = sv.MaSV
LEFT JOIN MONHOC     mh ON mh.MaMon = bs.MaMon
GROUP BY sv.MaSV, sv.TenSV;
GO

-- ---------------------------------------------------------
-- 5.4  V_SinhVienNoMon  [MỚI]
--      SV nợ môn = đã từng học nhưng CHƯA CÓ lần nào Đạt.
--      (Phân biệt với SV chưa học môn đó lần nào)
-- ---------------------------------------------------------
CREATE VIEW V_SinhVienNoMon AS
SELECT
    sv.MaSV,
    sv.TenSV,
    lh.TenLop,
    mh.MaMon,
    mh.TenMon,
    mh.SoTinChi,
    COUNT(kq.LanHoc)   AS SoLanHoc,
    MAX(kq.Diem)       AS DiemCaoNhat
FROM SINHVIEN       sv
JOIN LOPHOC         lh  ON lh.MaLop  = sv.MaLop
JOIN KETQUA_HOCTAP  kq  ON kq.MaSV   = sv.MaSV
JOIN MONHOC         mh  ON mh.MaMon  = kq.MaMon
WHERE kq.TrangThai = N'Khong dat'
  AND NOT EXISTS (
      SELECT 1 FROM KETQUA_HOCTAP kq2
      WHERE kq2.MaSV   = kq.MaSV
        AND kq2.MaMon  = kq.MaMon
        AND kq2.TrangThai = N'Dat'
  )
GROUP BY sv.MaSV, sv.TenSV, lh.TenLop, mh.MaMon, mh.TenMon, mh.SoTinChi;
GO

-- ---------------------------------------------------------
-- 5.5  V_MonDongNhat  [MỚI]
--      Số SV đăng ký từng lớp HP, sắp xếp giảm dần.
--      Hữu ích để phòng đào tạo theo dõi nhu cầu học.
-- ---------------------------------------------------------
CREATE VIEW V_MonDongNhat AS
SELECT
    lhp.MaLopHP,
    mh.TenMon,
    gv.TenGV         AS GiaoVien,
    dd.HocKy,
    dd.NamHoc,
    COUNT(dk.MaSV)   AS SoSVDangKy,
    lhp.SysoMax,
    CAST(COUNT(dk.MaSV) * 100.0 / lhp.SysoMax AS DECIMAL(5,1)) AS TySuatLap
FROM LOPHOCPHAN  lhp
JOIN MONHOC      mh  ON mh.MaMon  = lhp.MaMon
JOIN GIAOVIEN    gv  ON gv.MaGV   = lhp.MaGV
JOIN DOTDANGKY   dd  ON dd.MaDot  = lhp.MaDot
LEFT JOIN DANGKY dk  ON dk.MaLopHP = lhp.MaLopHP
GROUP BY lhp.MaLopHP, mh.TenMon, gv.TenGV, dd.HocKy, dd.NamHoc,
         lhp.SysoMax;
GO

-- =========================================================================
-- PHẦN 6: ĐÁNH CHỈ MỤC – INDEXING (v2.0)
-- Chiến lược: index trên FK và cột thường dùng trong WHERE/JOIN
-- =========================================================================

-- DANGKY (thay thế DANGKYTINCHI)
CREATE NONCLUSTERED INDEX IDX_DK_SV     ON DANGKY(MaSV);
CREATE NONCLUSTERED INDEX IDX_DK_LopHP  ON DANGKY(MaLopHP);          -- [MỚI]

-- LOPHOCPHAN
CREATE NONCLUSTERED INDEX IDX_LHP_MON   ON LOPHOCPHAN(MaMon);
CREATE NONCLUSTERED INDEX IDX_LHP_DOT   ON LOPHOCPHAN(MaDot);

-- LICHHOC  – index kép để tăng tốc kiểm tra trùng lịch  [MỚI]
CREATE NONCLUSTERED INDEX IDX_LICH_Thu  ON LICHHOC(MaLopHP, Thu, TietBatDau);

-- SINHVIEN                                                            [MỚI]
CREATE NONCLUSTERED INDEX IDX_SV_Lop    ON SINHVIEN(MaLop);

-- KETQUA_HOCTAP – hay dùng WHERE MaSV + TrangThai                    [MỚI]
CREATE NONCLUSTERED INDEX IDX_KQ_SV_TT  ON KETQUA_HOCTAP(MaSV, TrangThai) INCLUDE (MaMon, Diem);

-- HOCPHI                                                              [MỚI]
CREATE NONCLUSTERED INDEX IDX_HP_SV     ON HOCPHI(MaSV);

-- Soft delete indexes                                                   [MỚI]
CREATE NONCLUSTERED INDEX IDX_SV_IsDeleted    ON SINHVIEN(IsDeleted);
CREATE NONCLUSTERED INDEX IDX_GV_IsDeleted    ON GIAOVIEN(IsDeleted);
CREATE NONCLUSTERED INDEX IDX_MON_IsDeleted   ON MONHOC(IsDeleted);
CREATE NONCLUSTERED INDEX IDX_LHP_IsDeleted   ON LOPHOCPHAN(IsDeleted);
CREATE NONCLUSTERED INDEX IDX_QT_IsDeleted    ON QUANTRI(IsDeleted);
GO

-- =========================================================================
-- PHẦN 7: PHÂN QUYỀN HỆ THỐNG  [MỚI]
-- 3 ROLE: SinhVienRole / GiangVienRole / QuanTriRole
-- Lưu ý: Các ROLE này là DATABASE ROLE.
--        Row-level security (SV chỉ xem điểm của mình) cần thực hiện
--        thông qua VIEW có WHERE + SESSION_CONTEXT hoặc RLS Policy.
-- =========================================================================

-- Tạo role nếu chưa có
IF DATABASE_PRINCIPAL_ID('SinhVienRole')  IS NULL  CREATE ROLE SinhVienRole;
IF DATABASE_PRINCIPAL_ID('GiangVienRole') IS NULL  CREATE ROLE GiangVienRole;
IF DATABASE_PRINCIPAL_ID('QuanTriRole')   IS NULL  CREATE ROLE QuanTriRole;
GO

-- ---------------------------------------------------------
-- 7.1  SinhVienRole
--      Tra cứu thông tin + thực hiện đăng ký / hủy môn
-- ---------------------------------------------------------
GRANT SELECT ON MONHOC              TO SinhVienRole;
GRANT SELECT ON LOPHOCPHAN          TO SinhVienRole;
GRANT SELECT ON LICHHOC             TO SinhVienRole;
GRANT SELECT ON DOTDANGKY           TO SinhVienRole;
GRANT SELECT ON CTDT_MONHOC         TO SinhVienRole;
GRANT SELECT ON CHUONGTRINH_DAOTAO  TO SinhVienRole;
GRANT SELECT ON YEUCAU_TIENQUYET    TO SinhVienRole;
GRANT SELECT ON V_BangDiem          TO SinhVienRole;
GRANT SELECT ON V_TinChiTichLuy     TO SinhVienRole;
GRANT SELECT ON V_GPA               TO SinhVienRole;
GRANT SELECT ON HOCPHI              TO SinhVienRole;
GRANT EXECUTE ON SP_DangKyTinChi    TO SinhVienRole;
GRANT EXECUTE ON SP_HuyDangKy       TO SinhVienRole;
GRANT EXECUTE ON SP_MonCoTheDangKy  TO SinhVienRole;
GO

-- ---------------------------------------------------------
-- 7.2  GiangVienRole
--      Xem danh sách lớp, nhập / sửa điểm sinh viên
-- ---------------------------------------------------------
GRANT SELECT ON SINHVIEN            TO GiangVienRole;
GRANT SELECT ON DANGKY              TO GiangVienRole;
GRANT SELECT ON LOPHOCPHAN          TO GiangVienRole;
GRANT SELECT ON LICHHOC             TO GiangVienRole;
GRANT SELECT ON MONHOC              TO GiangVienRole;
GRANT SELECT ON V_BangDiem          TO GiangVienRole;
GRANT SELECT ON V_MonDongNhat       TO GiangVienRole;
-- Giảng viên INSERT / UPDATE kết quả học tập (nhập điểm)
GRANT INSERT, UPDATE ON KETQUA_HOCTAP TO GiangVienRole;
GO

-- ---------------------------------------------------------
-- 7.3  QuanTriRole
--      Toàn quyền trên database
-- ---------------------------------------------------------
GRANT CONTROL ON DATABASE::QuanLyDangKyTinChi TO QuanTriRole;
GO


-- =========================================================================
-- PHẦN 8: KỊCH BẢN KIỂM THỬ (v2.0)  –  10 test cases
-- =========================================================================

-- ---------------------------------------------------------
-- TEST 1: Đăng ký hợp lệ
--         Tuấn đăng ký Thông tin số (KDD401) – đợt 20241 đang mở,
--         không có tiên quyết, còn chỗ, không trùng lịch.
-- ---------------------------------------------------------
PRINT N'=== TEST 1: DANG KY HOP LE ===';
DECLARE @KQ NVARCHAR(200);
EXEC SP_DangKyTinChi
    @MaSV    = 'B22DCDT001',
    @MaLopHP = 'KDD401_DT01_241',
    @KetQua  = @KQ OUTPUT;
PRINT @KQ;
-- Kỳ vọng: THANH CONG
GO

-- ---------------------------------------------------------
-- TEST 2: Nhập điểm → TRG_CapNhatKetQua tự set TrangThai
-- ---------------------------------------------------------
PRINT N'=== TEST 2: NHAP DIEM (TRIGGER CAPNHAT KETQUA) ===';
-- Tuấn vừa học xong KDD401 HK1/2024, điểm 8.5
INSERT INTO KETQUA_HOCTAP (MaSV, MaMon, LanHoc, HocKy, NamHoc, Diem)
VALUES ('B22DCDT001','KDD401',1,1,2024,8.5);

-- Kiểm tra trigger đã cập nhật TrangThai
SELECT MaSV, MaMon, LanHoc, Diem, TrangThai
FROM KETQUA_HOCTAP
WHERE MaSV = 'B22DCDT001' AND MaMon = 'KDD401';
-- Kỳ vọng: TrangThai = 'Dat'
GO

-- ---------------------------------------------------------
-- TEST 3: Học phí tự động sau đăng ký (TRG_TinhHocPhi)
-- ---------------------------------------------------------
PRINT N'=== TEST 3: HOC PHI TU DONG SAU DANG KY ===';
SELECT MaSV, HocKy, NamHoc, SoTinChi, TongTien, TrangThai
FROM HOCPHI
WHERE MaSV = 'B22DCDT001';
-- Kỳ vọng: SoTinChi=3 (KDD401), TongTien=2,100,000
GO

-- ---------------------------------------------------------
-- TEST 4: Đăng ký trùng – phải báo lỗi
-- ---------------------------------------------------------
PRINT N'=== TEST 4: DANG KY TRUNG LOI ===';
DECLARE @KQ2 NVARCHAR(200);
EXEC SP_DangKyTinChi
    @MaSV    = 'B22DCDT001',
    @MaLopHP = 'KDD401_DT01_241',
    @KetQua  = @KQ2 OUTPUT;
PRINT @KQ2;
-- Kỳ vọng: LOI da dang ky lop nay roi
GO

-- ---------------------------------------------------------
-- TEST 5: Đăng ký đợt đã đóng – phải báo lỗi
-- ---------------------------------------------------------
PRINT N'=== TEST 5: DANG KY DOT DA DONG LOI ===';
DECLARE @KQ3 NVARCHAR(200);
EXEC SP_DangKyTinChi
    @MaSV    = 'B22DCDT002',
    @MaLopHP = 'KDD101_DT01_231',
    @KetQua  = @KQ3 OUTPUT;
PRINT @KQ3;
-- Kỳ vọng: LOI dot da dong
GO

-- ---------------------------------------------------------
-- TEST 6: Vi phạm tiên quyết – phải báo lỗi
--         Hương chưa qua KDD202 (Điện tử số) nên không đk được KDD301
-- ---------------------------------------------------------
PRINT N'=== TEST 6: VI PHAM TIEN QUYET LOI ===';
DECLARE @KQ4 NVARCHAR(200);
EXEC SP_DangKyTinChi
    @MaSV    = 'B22DCDT002',
    @MaLopHP = 'KDD301_DT01_241',
    @KetQua  = @KQ4 OUTPUT;
PRINT @KQ4;
-- Kỳ vọng: LOI chua du dieu kien tien quyet
GO

-- ---------------------------------------------------------
-- TEST 7: Đăng ký trùng lịch – TRG_KiemTraTrungLich fire
--         Chèn tạm 1 lịch học trùng giờ với KDD401 của Tuấn
--         rồi thử đăng ký để trigger chặn lại.
-- ---------------------------------------------------------
PRINT N'=== TEST 7: TRUNG LICH -> TRIGGER ROLLBACK ===';
-- Đẩy 1 môn học phụ vào DOT20241 có giờ học trùng (Thứ 3 tiết 1-3)
INSERT INTO LOPHOCPHAN (MaLopHP, MaMon, MaGV, MaDot, SysoMax) VALUES ('KDD201_TEST', 'KDD201', 'GV001', 'DOT20241', 50);
INSERT INTO LICHHOC (MaLopHP, Thu, TietBatDau, SoTiet, Phong) VALUES ('KDD201_TEST', 3, 2, 3, 'P.Test'); -- Trùng tiết 2-4 với 1-3

BEGIN TRY
    INSERT INTO DANGKY (MaSV, MaLopHP, NgayDangKy, TrangThai)
    VALUES ('B22DCDT001','KDD201_TEST','2024-07-15',N'Da xac nhan');
    PRINT N'KET QUA: Insert thanh cong (KHONG mong doi!)';
END TRY
BEGIN CATCH
    PRINT N'KET QUA: ' + ERROR_MESSAGE();
END CATCH
-- Xóa môn test
DELETE FROM LICHHOC WHERE MaLopHP = 'KDD201_TEST';
DELETE FROM LOPHOCPHAN WHERE MaLopHP = 'KDD201_TEST';
GO

-- ---------------------------------------------------------
-- TEST 8: Hủy đăng ký – học phí tự giảm
-- ---------------------------------------------------------
PRINT N'=== TEST 8: HUY DANG KY + HOC PHI GIAM ===';

-- Đăng ký thêm 1 môn (KDD301 - đã thỏa mãn tiên quyết)
DECLARE @KQ5 NVARCHAR(200);
EXEC SP_DangKyTinChi
    @MaSV    = 'B22DCDT001',
    @MaLopHP = 'KDD301_DT01_241',
    @KetQua  = @KQ5 OUTPUT;
PRINT N'Dang ky KDD301: ' + @KQ5;

SELECT SoTinChi, TongTien FROM HOCPHI
WHERE MaSV = 'B22DCDT001' AND HocKy = 1 AND NamHoc = 2024;
-- Kỳ vọng: SoTinChi=6 (3+3), TongTien=4,200,000

-- Hủy KDD301
DECLARE @KQ6 NVARCHAR(200);
EXEC SP_HuyDangKy
    @MaSV    = 'B22DCDT001',
    @MaLopHP = 'KDD301_DT01_241',
    @KetQua  = @KQ6 OUTPUT;
PRINT N'Huy KDD301: ' + @KQ6;

SELECT SoTinChi, TongTien FROM HOCPHI
WHERE MaSV = 'B22DCDT001' AND HocKy = 1 AND NamHoc = 2024;
-- Kỳ vọng: SoTinChi=3, TongTien=2,100,000
GO

-- ---------------------------------------------------------
-- TEST 9: SP_MonCoTheDangKy – gợi ý môn có thể đăng ký
--         Tuấn đã đạt KDD101, KDD102, KDD201, KDD202, KDD401.
--         Đợt 20241 – HK1 2024.
-- ---------------------------------------------------------
PRINT N'=== TEST 9: MON CO THE DANG KY (TUAN - DOT20241) ===';
EXEC SP_MonCoTheDangKy
    @MaSV  = 'B22DCDT001',
    @MaDot = 'DOT20241';
-- Kỳ vọng: KDD301 (đã đủ TQ KDD202), KDD304 (đủ TQ KDD102+KDD302 – Tuấn chưa qua KDD302 nên KHÔNG có)
GO

-- ---------------------------------------------------------
-- TEST 10: Views phân tích tổng hợp
-- ---------------------------------------------------------
PRINT N'=== TEST 10A: V_GPA (tat ca sinh vien) ===';
SELECT * FROM V_GPA ORDER BY GPA10 DESC;
GO

PRINT N'=== TEST 10B: V_SinhVienNoMon ===';
SELECT * FROM V_SinhVienNoMon;
-- Kỳ vọng: Hương nợ KDD101 lần 1 (diem 4.0), đã qua lần 2 → KHÔNG hiện
GO

PRINT N'=== TEST 10C: V_MonDongNhat (HK1 2024) ===';
SELECT TOP 5 * FROM V_MonDongNhat
WHERE NamHoc = 2024 AND HocKy = 1
ORDER BY SoSVDangKy DESC;
GO

PRINT N'=== TEST 10D: HOCPHI toan bo ===';
SELECT sv.TenSV, hp.HocKy, hp.NamHoc, hp.SoTinChi, hp.TongTien, hp.TrangThai
FROM HOCPHI hp
JOIN SINHVIEN sv ON sv.MaSV = hp.MaSV
ORDER BY hp.NamHoc, hp.HocKy, sv.TenSV;
GO