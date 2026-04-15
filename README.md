# Front_end cho hệ thống quản lý đào tạo

Frontend này chạy bằng Vite và gọi backend FastAPI qua `/api`.

## Chạy local

Yêu cầu:
- Node.js 18+
- Python + SQL Server (backend đang dùng pyodbc)

Các bước:
1. Chạy backend ở thư mục gốc:
   - `uvicorn main:app --reload`
2. Mở terminal mới tại `Front_end` và cài thư viện:
   - `npm install`
3. Chạy frontend:
   - `npm run dev`
   - **Windows PowerShell**: Nếu gặp lỗi script policy, dùng: `cmd /c npm run dev`

Frontend sẽ mở ở `http://localhost:3000` và tự proxy API sang `http://localhost:8000`.

## Import dữ liệu CSV vào SQL Server

Sau khi backend chạy, gọi endpoint:

- `POST http://localhost:8000/api/admin/import-csv`

Body mặc định:

```json
{
  "clear_existing": false
}
```

API sẽ nạp các file trong thư mục `database/`:
- `giaovien_CN_KT_Dien_DienTu.csv`
- `mon_hoc.csv`
- `sinh_vien.csv`
