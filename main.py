from pathlib import Path
import csv
import hashlib
import json
import logging
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
import pyodbc

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("lms-api")

pyodbc.pooling = True
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-me")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "30"))
JWT_REFRESH_EXPIRE_DAYS = int(os.getenv("JWT_REFRESH_EXPIRE_DAYS", "14"))


def _get_env(name: str, default: str) -> str:
    value = os.getenv(name)
    if value is None:
        return default
    stripped = value.strip()
    return stripped if stripped else default


def _get_cors_origins() -> list[str]:
    raw = _get_env("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    values = [item.strip() for item in raw.split(",") if item.strip()]
    return values or ["http://localhost:3000", "http://127.0.0.1:3000"]


def _is_bcrypt_hash(value: str) -> bool:
    return value.startswith("$2a$") or value.startswith("$2b$") or value.startswith("$2y$")


def _is_sha256_hex(value: str) -> bool:
    if len(value) != 64:
        return False
    return all(ch in "0123456789abcdefABCDEF" for ch in value)


def _verify_password(raw_password: str, stored_password: Optional[str]) -> bool:
    if stored_password is None:
        return False
    value = str(stored_password)
    if _is_bcrypt_hash(value):
        try:
            return pwd_context.verify(raw_password, value)
        except Exception:
            return False
    if _is_sha256_hex(value):
        candidate = hashlib.sha256(raw_password.encode("utf-8")).hexdigest()
        return candidate == value.lower()
    return raw_password == value


def _hash_password(raw_password: str) -> str:
    return hashlib.sha256(raw_password.encode("utf-8")).hexdigest()


def _create_token(user_id: str, role: str, email: str, token_type: str, expires_delta: timedelta) -> str:
    expires_at = datetime.now(timezone.utc) + expires_delta
    payload = {
        "sub": user_id,
        "role": role,
        "email": email,
        "token_type": token_type,
        "exp": expires_at,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _create_access_token(user_id: str, role: str, email: str) -> str:
    return _create_token(
        user_id=user_id,
        role=role,
        email=email,
        token_type="access",
        expires_delta=timedelta(minutes=JWT_EXPIRE_MINUTES),
    )


def _create_refresh_token(user_id: str, role: str, email: str) -> str:
    return _create_token(
        user_id=user_id,
        role=role,
        email=email,
        token_type="refresh",
        expires_delta=timedelta(days=JWT_REFRESH_EXPIRE_DAYS),
    )


def _decode_token(token: str, expected_type: str) -> dict[str, str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Token không hợp lệ hoặc đã hết hạn.") from exc

    user_id = str(payload.get("sub") or "").strip()
    role = str(payload.get("role") or "").strip().lower()
    email = str(payload.get("email") or "").strip().lower()
    token_type = str(payload.get("token_type") or "").strip().lower()

    if not user_id or role not in {"student", "teacher", "admin"}:
        raise HTTPException(status_code=401, detail="Token thiếu thông tin định danh.")

    if token_type != expected_type.lower():
        raise HTTPException(status_code=401, detail="Sai loại token.")

    return {"id": user_id, "role": role, "email": email, "token_type": token_type}


def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict[str, str]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Thiếu hoặc sai định dạng Authorization header.")

    token = authorization.split(" ", 1)[1].strip()
    decoded = _decode_token(token, expected_type="access")
    return {"id": decoded["id"], "role": decoded["role"], "email": decoded["email"]}


def _get_current_user_profile(current_user: dict[str, str]) -> dict[str, object]:
    role = current_user["role"]
    user_id = current_user["id"]

    if role == "admin":
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                SELECT COUNT(1)
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_NAME = 'QUANTRI'
                """
            )
            has_admin_table = int(cursor.fetchone()[0] or 0) > 0

            if has_admin_table:
                cursor.execute(
                    """
                    SELECT TOP 1 *
                    FROM QUANTRI
                    WHERE LOWER(LTRIM(RTRIM(Email))) = ?
                       OR LTRIM(RTRIM(MaQT)) = ?
                    """,
                    (current_user["email"], user_id),
                )
                row = cursor.fetchone()
                if row:
                    columns = [column[0] for column in cursor.description]
                    admin_row = dict(zip(columns, row))
                    admin_id = (
                        admin_row.get("MaQT")
                        or admin_row.get("MaAdmin")
                        or admin_row.get("ID")
                        or admin_row.get("Email")
                        or user_id
                    )
                    admin_name = (
                        admin_row.get("TenQT")
                        or admin_row.get("TenAdmin")
                        or admin_row.get("HoTen")
                        or admin_row.get("Ten")
                        or "Quản trị viên"
                    )
                    return {
                        "id": str(admin_id),
                        "email": str(admin_row.get("Email") or current_user["email"]),
                        "name": str(admin_name),
                        "role": "admin",
                        "dienThoai": str(admin_row.get("DienThoai") or "") or None,
                    }

            return {
                "id": user_id,
                "email": current_user["email"],
                "name": "Quản trị viên",
                "role": "admin",
            }
        finally:
            conn.close()

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if role == "student":
            cursor.execute(
                """
                SELECT TOP 1
                    SV.MaSV,
                    SV.TenSV,
                    SV.NamNhapHoc,
                    SV.ChuyenNganh,
                    SV.MaLop,
                    L.Khoa,
                    SV.Email,
                    SV.DienThoai
                FROM SINHVIEN SV
                LEFT JOIN LOPHOC L ON L.MaLop = SV.MaLop
                WHERE SV.MaSV = ?
                """,
                (user_id,),
            )
            student = cursor.fetchone()
            if not student:
                raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản sinh viên.")

            return {
                "id": str(student.MaSV),
                "email": str(student.Email or current_user["email"]),
                "name": str(student.TenSV or ""),
                "role": "student",
                "maSV": str(student.MaSV),
                "tenSV": str(student.TenSV or ""),
                "namNhapHoc": int(student.NamNhapHoc or 0),
                "maLop": str(student.MaLop or "") or None,
                "lop": str(student.MaLop or "") or None,
                "chuyenNganh": str(student.ChuyenNganh or "") or None,
                "khoa": str(student.Khoa or "") or None,
                "dienThoai": str(student.DienThoai or "") or None,
            }

        if role == "teacher":
            cursor.execute(
                """
                SELECT TOP 1
                    MaGV,
                    TenGV,
                    ChuyenNganh,
                    HocVi,
                    Khoa,
                    Email,
                    DienThoai
                FROM GIAOVIEN
                WHERE MaGV = ?
                """,
                (user_id,),
            )
            teacher = cursor.fetchone()
            if not teacher:
                raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản giảng viên.")

            return {
                "id": str(teacher.MaGV),
                "email": str(teacher.Email or current_user["email"]),
                "name": str(teacher.TenGV or ""),
                "role": "teacher",
                "maGV": str(teacher.MaGV),
                "tenGV": str(teacher.TenGV or ""),
                "chuyenNganh": str(teacher.ChuyenNganh or "") or None,
                "khoa": str(teacher.Khoa or "") or None,
                "hocVi": str(teacher.HocVi or "") or None,
                "dienThoai": str(teacher.DienThoai or "") or None,
                "khoaQuanLy": str(teacher.Khoa or "") or None,
            }

        raise HTTPException(status_code=401, detail="Vai trò tài khoản không hợp lệ.")
    finally:
        conn.close()


def _build_auth_response(user: dict[str, object], user_id: str, role: str, email: str) -> dict[str, object]:
    access_token = _create_access_token(user_id, role, email)
    refresh_token = _create_refresh_token(user_id, role, email)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": JWT_EXPIRE_MINUTES * 60,
        "refresh_expires_in": JWT_REFRESH_EXPIRE_DAYS * 24 * 60 * 60,
        "user": user,
    }


def require_roles(*roles: str):
    allowed_roles = {r.strip().lower() for r in roles if r.strip()}

    def dependency(current_user: dict[str, str] = Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Bạn không có quyền thực hiện thao tác này.")
        return current_user

    return dependency

app = FastAPI()
@app.get("/")
def read_root():
    return {"message": "Backend API Hệ Thống Quản Lý Đào Tạo đang chạy thành công! Hãy truy cập http://localhost:8000/docs để xem danh sách API."}

# Cấu hình CORS để Frontend (ví dụ chạy ở cổng 3000 hoặc 5500) gọi được Backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_no_store_headers_for_api_get(request: Request, call_next):
    response = await call_next(request)
    if request.method == "GET" and request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - started) * 1000
    logger.info(
        "%s %s -> %s (%.2fms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


_DATA_CHANGE_LOCK = threading.Lock()
_DATA_CHANGE_VERSION = 0
_DATA_CHANGE_EVENT = "init"
_DATA_CHANGE_AT = datetime.utcnow().isoformat()
_APP_STARTED_AT = time.time()
_RATE_LIMIT_LOCK = threading.Lock()
_RATE_LIMIT_BUCKETS: dict[str, list[float]] = {}


def _is_rate_limited(key: str, max_requests: int, window_seconds: int) -> bool:
    now = time.monotonic()
    with _RATE_LIMIT_LOCK:
        bucket = _RATE_LIMIT_BUCKETS.setdefault(key, [])
        threshold = now - window_seconds
        while bucket and bucket[0] < threshold:
            bucket.pop(0)

        if len(bucket) >= max_requests:
            return True

        bucket.append(now)
        return False


def mark_data_changed(event_name: str):
    global _DATA_CHANGE_VERSION, _DATA_CHANGE_EVENT, _DATA_CHANGE_AT
    with _DATA_CHANGE_LOCK:
        _DATA_CHANGE_VERSION += 1
        _DATA_CHANGE_EVENT = event_name
        _DATA_CHANGE_AT = datetime.utcnow().isoformat()


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "detail": exc.detail,
            "path": request.url.path,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error at %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error": True,
            "detail": "Lỗi hệ thống, vui lòng thử lại sau.",
            "path": request.url.path,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


def _get_data_change_state() -> dict[str, object]:
    with _DATA_CHANGE_LOCK:
        return {
            "version": _DATA_CHANGE_VERSION,
            "event": _DATA_CHANGE_EVENT,
            "updated_at": _DATA_CHANGE_AT,
        }


@app.get("/api/events/stream")
def stream_data_events():
    def event_generator():
        last_seen_version = -1
        last_ping = time.monotonic()

        while True:
            state = _get_data_change_state()
            current_version = int(state["version"])

            if current_version != last_seen_version:
                payload = json.dumps(state, ensure_ascii=False)
                yield f"event: data-change\ndata: {payload}\n\n"
                last_seen_version = current_version
                last_ping = time.monotonic()
            elif time.monotonic() - last_ping >= 15:
                yield "event: ping\ndata: {}\n\n"
                last_ping = time.monotonic()

            time.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

# --- CẤU HÌNH KẾT NỐI SQL SERVER ---
# Đổi tên SERVER và DRIVER cho khớp với máy của bạn (thường là .\SQLEXPRESS)
DB_CONFIG = (
    f"Driver={{{_get_env('DB_DRIVER', 'ODBC Driver 17 for SQL Server')}}};"
    f"Server={_get_env('DB_SERVER', '.\\SQLEXPRESS')};"
    f"Database={_get_env('DB_NAME', 'QuanLyDangKyTinChi')};"
    f"Trusted_Connection={_get_env('DB_TRUSTED_CONNECTION', 'yes')};"
)

BASE_DIR = Path(__file__).resolve().parent
DATABASE_DIR = BASE_DIR / "database"


class CsvImportRequest(BaseModel):
    clear_existing: bool = False
    files: Optional[list[str]] = None


class SinhVienPayload(BaseModel):
    MaSV: str
    TenSV: str
    NamNhapHoc: int
    ChuyenNganh: Optional[str] = None
    MaLop: Optional[str] = None
    Khoa: Optional[str] = None
    Email: str
    DienThoai: Optional[str] = None
    MatKhau: Optional[str] = None


class GiaoVienPayload(BaseModel):
    MaGV: str
    TenGV: str
    ChuyenNganh: Optional[str] = None
    HocVi: Optional[str] = None
    Khoa: Optional[str] = None
    Email: str
    DienThoai: Optional[str] = None
    MatKhau: Optional[str] = None


class MonHocPayload(BaseModel):
    MaMon: str
    TenMon: str
    SoTinChi: int
    Loai: str
    MoTa: Optional[str] = None
    DonGiaTinChi: Optional[float] = None


class TuitionSettingsPayload(BaseModel):
    DonGiaMacDinh: float


class CourseTuitionPayload(BaseModel):
    DonGiaTinChi: Optional[float] = None


class ChangePasswordPayload(BaseModel):
    user_id: str
    role: str
    current_password: str
    new_password: str


class LoginPayload(BaseModel):
    email: str
    password: str


class RefreshTokenPayload(BaseModel):
    refresh_token: str


class TeacherAssignPayload(BaseModel):
    MaGV: str


class TeacherUnassignPayload(BaseModel):
    MaGV: Optional[str] = None


class LopHocPhanPayload(BaseModel):
    MaLopHP: str
    MaMon: str
    MaGV: str
    SysoMax: int = 60
    MaDot: Optional[str] = None


class LopHocPhanWithMonHocPayload(BaseModel):
    MaLopHP: str
    MaMon: str
    TenMon: str
    SoTinChi: int
    Loai: str
    MoTa: Optional[str] = None
    MaGV: str
    SysoMax: int = 60
    MaDot: Optional[str] = None


class LichHocPayload(BaseModel):
    MaLopHP: str
    Thu: int
    TietBatDau: int
    SoTiet: int
    Phong: Optional[str] = None


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "lms-api", "time": datetime.utcnow().isoformat()}


@app.get("/api/monitor/uptime")
def monitor_uptime(current_user: dict[str, str] = Depends(require_roles("admin"))):
    uptime_seconds = max(0, int(time.time() - _APP_STARTED_AT))
    return {
        "service": "lms-api",
        "status": "ok",
        "uptime_seconds": uptime_seconds,
        "started_at": datetime.fromtimestamp(_APP_STARTED_AT, tz=timezone.utc).isoformat(),
        "data_change": _get_data_change_state(),
    }


@app.get("/api/tuition/settings")
def get_tuition_settings(current_user: dict[str, str] = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        default_price = _get_default_tuition_per_credit(cursor)
        return {
            "data": {
                "don_gia_mac_dinh": default_price,
            }
        }
    finally:
        conn.close()


@app.put("/api/admin/tuition/settings")
def update_tuition_settings(payload: TuitionSettingsPayload, current_user: dict[str, str] = Depends(require_roles("admin"))):
    don_gia_mac_dinh = _normalize_tuition_value(payload.DonGiaMacDinh, allow_none=False)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        _ensure_tuition_schema(cursor)
        cursor.execute(
            """
            UPDATE CAUHINH_HOCPHI
            SET DonGiaMacDinh = ?, UpdatedAt = SYSUTCDATETIME(), UpdatedBy = ?
            WHERE Id = 1
            """,
            (don_gia_mac_dinh, str(current_user.get("id") or "admin")),
        )
        _recalculate_hocphi(cursor)
        conn.commit()
        mark_data_changed("tuition-default-updated")
        return {
            "message": "Đã cập nhật đơn giá mặc định theo tín chỉ.",
            "data": {
                "don_gia_mac_dinh": don_gia_mac_dinh,
            },
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể cập nhật cấu hình học phí: {e}")
    finally:
        conn.close()


@app.get("/api/admin/reports/registration-summary")
def get_registration_summary_report(current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            """
            SELECT
                COUNT(1) AS TotalClasses,
                SUM(CASE WHEN X.RegisteredCount >= X.SysoMax THEN 1 ELSE 0 END) AS FullClasses,
                SUM(X.RegisteredCount) AS TotalRegistrations,
                SUM(X.SysoMax) AS TotalCapacity,
                (
                    SELECT COALESCE(SUM(CAST(HP.TongTien AS DECIMAL(18, 2))), 0)
                    FROM HOCPHI HP
                ) AS TotalTuitionAmount
            FROM (
                SELECT LHP.MaLopHP, LHP.SysoMax, COUNT(DK.MaSV) AS RegisteredCount
                FROM LOPHOCPHAN LHP
                LEFT JOIN DANGKY DK ON DK.MaLopHP = LHP.MaLopHP
                GROUP BY LHP.MaLopHP, LHP.SysoMax
            ) X
            """
        )
        row = cursor.fetchone()

        total_classes = int((row[0] if row else 0) or 0)
        full_classes = int((row[1] if row else 0) or 0)
        total_registrations = int((row[2] if row else 0) or 0)
        total_capacity = int((row[3] if row else 0) or 0)
        total_tuition_amount = float((row[4] if row else 0) or 0)
        fill_rate_percent = round((total_registrations / total_capacity) * 100, 2) if total_capacity > 0 else 0.0

        return {
            "data": {
                "total_classes": total_classes,
                "full_classes": full_classes,
                "total_registrations": total_registrations,
                "total_capacity": total_capacity,
                "total_tuition_amount": total_tuition_amount,
                "fill_rate_percent": fill_rate_percent,
            }
        }
    finally:
        conn.close()


@app.post("/api/auth/login")
def login(payload: LoginPayload):
    rate_key = f"login:{payload.email.strip().lower()}"
    if _is_rate_limited(rate_key, max_requests=10, window_seconds=60):
        raise HTTPException(status_code=429, detail="Bạn thao tác quá nhanh, vui lòng thử lại sau.")

    email = payload.email.strip().lower()
    password = payload.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="Vui lòng nhập email và mật khẩu.")

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            """
            SELECT COUNT(1)
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_NAME = 'QUANTRI'
            """
        )
        has_admin_table = int(cursor.fetchone()[0] or 0) > 0

        if has_admin_table:
            cursor.execute(
                """
                SELECT COUNT(1)
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'QUANTRI'
                  AND COLUMN_NAME IN ('Email', 'MatKhau')
                """
            )
            has_login_columns = int(cursor.fetchone()[0] or 0) == 2

            if has_login_columns:
                cursor.execute(
                    """
                    SELECT TOP 1 *
                    FROM QUANTRI
                    WHERE LOWER(LTRIM(RTRIM(Email))) = ?
                    """,
                    (email,),
                )
                admin = cursor.fetchone()
                if admin and _verify_password(password, getattr(admin, "MatKhau", None)):
                    columns = [column[0] for column in cursor.description]
                    admin_row = dict(zip(columns, admin))

                    admin_id = (
                        admin_row.get("MaQT")
                        or admin_row.get("MaAdmin")
                        or admin_row.get("ID")
                        or admin_row.get("Email")
                    )
                    admin_name = (
                        admin_row.get("TenQT")
                        or admin_row.get("TenAdmin")
                        or admin_row.get("HoTen")
                        or admin_row.get("Ten")
                        or "Quản trị viên"
                    )

                    return _build_auth_response(
                        user={
                            "id": str(admin_id),
                            "email": str(admin_row.get("Email") or ""),
                            "name": str(admin_name),
                            "role": "admin",
                            "dienThoai": str(admin_row.get("DienThoai") or "") or None,
                        },
                        user_id=str(admin_id),
                        role="admin",
                        email=str(admin_row.get("Email") or ""),
                    )

        cursor.execute(
            """
            SELECT TOP 1
                SV.MaSV,
                SV.TenSV,
                SV.NamNhapHoc,
                SV.ChuyenNganh,
                SV.MaLop,
                L.Khoa,
                SV.Email,
                SV.DienThoai,
                SV.MatKhau
            FROM SINHVIEN SV
            LEFT JOIN LOPHOC L ON L.MaLop = SV.MaLop
            WHERE LOWER(LTRIM(RTRIM(SV.Email))) = ?
            """,
            (email,),
        )
        student = cursor.fetchone()
        if student and _verify_password(password, getattr(student, "MatKhau", None)):
            return _build_auth_response(
                user={
                    "id": str(student.MaSV),
                    "email": str(student.Email or ""),
                    "name": str(student.TenSV or ""),
                    "role": "student",
                    "maSV": str(student.MaSV),
                    "tenSV": str(student.TenSV or ""),
                    "namNhapHoc": int(student.NamNhapHoc or 0),
                    "maLop": str(student.MaLop or "") or None,
                    "lop": str(student.MaLop or "") or None,
                    "chuyenNganh": str(student.ChuyenNganh or "") or None,
                    "khoa": str(student.Khoa or "") or None,
                    "dienThoai": str(student.DienThoai or "") or None,
                },
                user_id=str(student.MaSV),
                role="student",
                email=str(student.Email or ""),
            )

        cursor.execute(
            """
            SELECT TOP 1
                MaGV,
                TenGV,
                ChuyenNganh,
                HocVi,
                Khoa,
                Email,
                DienThoai,
                MatKhau
            FROM GIAOVIEN
            WHERE LOWER(LTRIM(RTRIM(Email))) = ?
            """,
            (email,),
        )
        teacher = cursor.fetchone()
        if teacher and _verify_password(password, getattr(teacher, "MatKhau", None)):
            return _build_auth_response(
                user={
                    "id": str(teacher.MaGV),
                    "email": str(teacher.Email or ""),
                    "name": str(teacher.TenGV or ""),
                    "role": "teacher",
                    "maGV": str(teacher.MaGV),
                    "tenGV": str(teacher.TenGV or ""),
                    "chuyenNganh": str(teacher.ChuyenNganh or "") or None,
                    "khoa": str(teacher.Khoa or "") or None,
                    "hocVi": str(teacher.HocVi or "") or None,
                    "dienThoai": str(teacher.DienThoai or "") or None,
                    "khoaQuanLy": str(teacher.Khoa or "") or None,
                },
                user_id=str(teacher.MaGV),
                role="teacher",
                email=str(teacher.Email or ""),
            )

        raise HTTPException(status_code=401, detail="Tài khoản hoặc mật khẩu không chính xác.")
    finally:
        conn.close()


@app.get("/api/auth/me")
def auth_me(current_user: dict[str, str] = Depends(get_current_user)):
    return {"user": _get_current_user_profile(current_user)}


@app.post("/api/auth/refresh")
def refresh_access_token(payload: RefreshTokenPayload):
    token = (payload.refresh_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Thiếu refresh token.")

    decoded = _decode_token(token, expected_type="refresh")
    new_access_token = _create_access_token(decoded["id"], decoded["role"], decoded["email"])
    rotated_refresh_token = _create_refresh_token(decoded["id"], decoded["role"], decoded["email"])

    return {
        "access_token": new_access_token,
        "refresh_token": rotated_refresh_token,
        "token_type": "bearer",
        "expires_in": JWT_EXPIRE_MINUTES * 60,
        "refresh_expires_in": JWT_REFRESH_EXPIRE_DAYS * 24 * 60 * 60,
    }


CSV_FILE_CONFIG = {
    "giaovien_CN_KT_Dien_DienTu.csv": {
        "dataset_key": "giaovien",
        "table": "GIAOVIEN",
    },
    "mon_hoc.csv": {
        "dataset_key": "monhoc",
        "table": "MONHOC",
    },
    "sinh_vien.csv": {
        "dataset_key": "sinhvien",
        "table": "SINHVIEN",
    },
}

def get_db_connection():
    try:
        conn = pyodbc.connect(DB_CONFIG)
        return conn
    except Exception as e:
        print("Lỗi kết nối CSDL:", e)
        raise HTTPException(status_code=500, detail="Không thể kết nối đến Database")


def _normalize_password_for_storage(raw_password: Optional[str], fallback: str) -> str:
    value = (raw_password or fallback or "").strip()
    if _is_bcrypt_hash(value):
        return value
    return _hash_password(value)


def _table_has_column(cursor, table_name: str, column_name: str) -> bool:
    cursor.execute(
        """
        SELECT 1
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = ? AND COLUMN_NAME = ?
        """,
        (table_name, column_name),
    )
    return cursor.fetchone() is not None


def _normalize_tuition_value(raw_value: Optional[float], *, allow_none: bool) -> Optional[float]:
    if raw_value is None:
        if allow_none:
            return None
        raise HTTPException(status_code=400, detail="Đơn giá không được để trống.")

    try:
        value = float(raw_value)
    except Exception:
        raise HTTPException(status_code=400, detail="Đơn giá không hợp lệ.")

    if value <= 0:
        raise HTTPException(status_code=400, detail="Đơn giá phải lớn hơn 0.")

    return value


def _ensure_tuition_schema(cursor):
    if not _table_has_column(cursor, "MONHOC", "DonGiaTinChi"):
        cursor.execute("ALTER TABLE MONHOC ADD DonGiaTinChi MONEY NULL")

    cursor.execute(
        """
        IF OBJECT_ID('CAUHINH_HOCPHI', 'U') IS NULL
        BEGIN
            CREATE TABLE CAUHINH_HOCPHI (
                Id INT NOT NULL PRIMARY KEY,
                DonGiaMacDinh MONEY NOT NULL,
                UpdatedAt DATETIME2 NULL,
                UpdatedBy NVARCHAR(50) NULL,
                CONSTRAINT CK_CAUHINH_HOCPHI_Id CHECK (Id = 1)
            );
        END
        """
    )

    cursor.execute(
        """
        IF NOT EXISTS (SELECT 1 FROM CAUHINH_HOCPHI WHERE Id = 1)
        BEGIN
            INSERT INTO CAUHINH_HOCPHI (Id, DonGiaMacDinh, UpdatedAt, UpdatedBy)
            VALUES (1, 700000, SYSUTCDATETIME(), N'system');
        END
        """
    )


def _get_default_tuition_per_credit(cursor) -> float:
    _ensure_tuition_schema(cursor)
    cursor.execute("SELECT TOP 1 DonGiaMacDinh FROM CAUHINH_HOCPHI WHERE Id = 1")
    row = cursor.fetchone()
    return float((row[0] if row else 700000) or 700000)


def _recalculate_hocphi(cursor):
    _ensure_tuition_schema(cursor)
    cursor.execute(
        """
        ;WITH TuitionConfig AS (
            SELECT CAST(COALESCE(MAX(DonGiaMacDinh), 700000) AS DECIMAL(18, 2)) AS DefaultDonGia
            FROM CAUHINH_HOCPHI
            WHERE Id = 1
        ),
        Computed AS (
            SELECT
                DK.MaSV,
                DD.HocKy,
                DD.NamHoc,
                SUM(COALESCE(MH.SoTinChi, 0)) AS SoTinChi,
                SUM(
                    COALESCE(MH.SoTinChi, 0)
                    * COALESCE(CAST(MH.DonGiaTinChi AS DECIMAL(18, 2)), TC.DefaultDonGia)
                ) AS TongTien,
                CASE
                    WHEN SUM(COALESCE(MH.SoTinChi, 0)) > 0 THEN
                        SUM(
                            COALESCE(MH.SoTinChi, 0)
                            * COALESCE(CAST(MH.DonGiaTinChi AS DECIMAL(18, 2)), TC.DefaultDonGia)
                        ) / SUM(COALESCE(MH.SoTinChi, 0))
                    ELSE TC.DefaultDonGia
                END AS DonGiaBinhQuan
            FROM DANGKY DK
            INNER JOIN LOPHOCPHAN LHP ON LHP.MaLopHP = DK.MaLopHP
            INNER JOIN DOTDANGKY DD ON DD.MaDot = LHP.MaDot
            INNER JOIN MONHOC MH ON MH.MaMon = LHP.MaMon
            CROSS JOIN TuitionConfig TC
            GROUP BY DK.MaSV, DD.HocKy, DD.NamHoc, TC.DefaultDonGia
        )
        MERGE HOCPHI AS target
        USING Computed AS source
            ON target.MaSV = source.MaSV
           AND target.HocKy = source.HocKy
           AND target.NamHoc = source.NamHoc
        WHEN MATCHED THEN
            UPDATE SET
                SoTinChi = source.SoTinChi,
                DonGia = source.DonGiaBinhQuan
        WHEN NOT MATCHED BY TARGET THEN
            INSERT (MaSV, HocKy, NamHoc, SoTinChi, DonGia)
            VALUES (source.MaSV, source.HocKy, source.NamHoc, source.SoTinChi, source.DonGiaBinhQuan);
        """
    )


@app.on_event("startup")
def ensure_runtime_tuition_schema():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        _ensure_tuition_schema(cursor)
        conn.commit()
    except Exception as exc:
        logger.warning("Khong the khoi tao schema hoc phi: %s", exc)
    finally:
        if conn is not None:
            conn.close()


def _soft_delete_by_id(
    cursor,
    table_name: str,
    id_column: str,
    id_value: str,
    deleted_by: Optional[str] = None,
) -> bool:
    if _table_has_column(cursor, table_name, "IsDeleted"):
        set_clauses = ["IsDeleted = 1"]
        params: list[object] = []

        if _table_has_column(cursor, table_name, "DeletedAt"):
            set_clauses.append("DeletedAt = SYSUTCDATETIME()")
        if _table_has_column(cursor, table_name, "DeletedBy"):
            set_clauses.append("DeletedBy = ?")
            params.append((deleted_by or "system").strip() or "system")

        params.append(id_value)
        sql = (
            f"UPDATE {table_name} "
            f"SET {', '.join(set_clauses)} "
            f"WHERE {id_column} = ? AND ISNULL(IsDeleted, 0) = 0"
        )
        cursor.execute(sql, tuple(params))
        return cursor.rowcount > 0

    cursor.execute(f"DELETE FROM {table_name} WHERE {id_column} = ?", (id_value,))
    return cursor.rowcount > 0


def _restore_soft_deleted_by_id(cursor, table_name: str, id_column: str, id_value: str) -> bool:
    if not _table_has_column(cursor, table_name, "IsDeleted"):
        raise HTTPException(
            status_code=400,
            detail=f"Bảng {table_name} chưa hỗ trợ soft delete nên không thể khôi phục.",
        )

    set_clauses = ["IsDeleted = 0"]
    if _table_has_column(cursor, table_name, "DeletedAt"):
        set_clauses.append("DeletedAt = NULL")
    if _table_has_column(cursor, table_name, "DeletedBy"):
        set_clauses.append("DeletedBy = NULL")

    sql = (
        f"UPDATE {table_name} "
        f"SET {', '.join(set_clauses)} "
        f"WHERE {id_column} = ? AND ISNULL(IsDeleted, 0) = 1"
    )
    cursor.execute(sql, (id_value,))
    return cursor.rowcount > 0


def _restore_entity_record(
    table_name: str,
    id_column: str,
    id_value: str,
    success_message: str,
    change_event: str,
) -> dict[str, str]:
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        restored = _restore_soft_deleted_by_id(cursor, table_name, id_column, id_value)
        if not restored:
            raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi đã xóa để khôi phục.")

        conn.commit()
        mark_data_changed(change_event)
        return {"message": success_message}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể khôi phục dữ liệu: {e}")
    finally:
        conn.close()


def _insert_or_update_giang_vien(cursor, row):
    stored_password = _normalize_password_for_storage(row.get("MatKhau"), row["MaGV"])
    sql = """
    IF EXISTS (SELECT 1 FROM GIAOVIEN WHERE MaGV = ?)
        UPDATE GIAOVIEN
        SET TenGV=?, ChuyenNganh=?, HocVi=?, Khoa=?, Email=?, DienThoai=?, MatKhau=?
        WHERE MaGV=?;
    ELSE
        INSERT INTO GIAOVIEN (MaGV, TenGV, ChuyenNganh, HocVi, Khoa, Email, DienThoai, MatKhau)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    """
    params = (
        row["MaGV"],
        row["TenGV"],
        row.get("ChuyenNganh"),
        row.get("HocVi"),
        row.get("Khoa"),
        row.get("Email"),
        row.get("DienThoai"),
        stored_password,
        row["MaGV"],
        row["MaGV"],
        row["TenGV"],
        row.get("ChuyenNganh"),
        row.get("HocVi"),
        row.get("Khoa"),
        row.get("Email"),
        row.get("DienThoai"),
        stored_password,
    )
    cursor.execute(sql, params)


def _insert_or_update_mon_hoc(cursor, row):
    _ensure_tuition_schema(cursor)
    sql = """
    IF EXISTS (SELECT 1 FROM MONHOC WHERE MaMon = ?)
        UPDATE MONHOC
        SET TenMon=?, SoTinChi=?, Loai=?, MoTa=?, DonGiaTinChi=COALESCE(?, DonGiaTinChi)
        WHERE MaMon=?;
    ELSE
        INSERT INTO MONHOC (MaMon, TenMon, SoTinChi, Loai, MoTa, DonGiaTinChi)
        VALUES (?, ?, ?, ?, ?, ?);
    """
    ma_mon = _normalize_ma_mon(row["MaMon"])
    so_tin_chi = int(row["SoTinChi"])
    don_gia_tin_chi = row.get("DonGiaTinChi")
    don_gia_value = float(don_gia_tin_chi) if don_gia_tin_chi not in (None, "") else None
    params = (
        ma_mon,
        row["TenMon"],
        so_tin_chi,
        row["Loai"],
        row.get("MoTa"),
        don_gia_value,
        ma_mon,
        ma_mon,
        row["TenMon"],
        so_tin_chi,
        row["Loai"],
        row.get("MoTa"),
        don_gia_value,
    )
    cursor.execute(sql, params)


def _ensure_lophoc_exists(cursor, ma_lop: str, nam_nhap_hoc: int, khoa: Optional[str] = None):
    if not ma_lop:
        return
    khoa_value = khoa or "KT Dien-Dien tu"
    sql = """
    IF NOT EXISTS (SELECT 1 FROM LOPHOC WHERE MaLop = ?)
        INSERT INTO LOPHOC (MaLop, TenLop, Khoa, MaGVChuNhiem, SySo, NamNhapHoc)
        VALUES (?, ?, ?, NULL, 60, ?);
    """
    cursor.execute(sql, (ma_lop, ma_lop, ma_lop, khoa_value, nam_nhap_hoc))


def _normalize_ma_lop(ma_lop: Optional[str]) -> Optional[str]:
    if not ma_lop:
        return ma_lop

    normalized = ma_lop.strip()
    if len(normalized) <= 10:
        return normalized

    # Dữ liệu CSV có thể có hậu tố như "-B" làm vượt giới hạn VARCHAR(10).
    compact = normalized.replace("-", "").replace(" ", "")
    if len(compact) <= 10:
        return compact

    return compact[:10]


def _normalize_ma_mon(ma_mon: str) -> str:
    normalized = ma_mon.strip()
    if len(normalized) <= 10:
        return normalized

    # Dữ liệu CSV có thể có ký tự phân tách như '_' hoặc '-' làm vượt VARCHAR(10).
    compact = normalized.replace("_", "").replace("-", "").replace(" ", "")
    if len(compact) <= 10:
        return compact

    return compact[:10]


def _insert_or_update_sinh_vien(cursor, row):
    nam_nhap_hoc = int(row["NamNhapHoc"])
    ma_lop = _normalize_ma_lop(row.get("MaLop"))
    stored_password = _normalize_password_for_storage(row.get("MatKhau"), row["MaSV"])
    _ensure_lophoc_exists(cursor, ma_lop, nam_nhap_hoc, row.get("Khoa"))

    sql = """
    IF EXISTS (SELECT 1 FROM SINHVIEN WHERE MaSV = ?)
        UPDATE SINHVIEN
        SET TenSV=?, NamNhapHoc=?, ChuyenNganh=?, MaLop=?, Email=?, DienThoai=?, MatKhau=?
        WHERE MaSV=?;
    ELSE
        INSERT INTO SINHVIEN (MaSV, TenSV, NamNhapHoc, ChuyenNganh, MaLop, Email, DienThoai, MatKhau)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    """
    params = (
        row["MaSV"],
        row["TenSV"],
        nam_nhap_hoc,
        row.get("ChuyenNganh"),
        ma_lop,
        row.get("Email"),
        row.get("DienThoai"),
        stored_password,
        row["MaSV"],
        row["MaSV"],
        row["TenSV"],
        nam_nhap_hoc,
        row.get("ChuyenNganh"),
        ma_lop,
        row.get("Email"),
        row.get("DienThoai"),
        stored_password,
    )
    cursor.execute(sql, params)


def _read_csv_rows(file_path: Path):
    with file_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            cleaned = {k: (v.strip() if isinstance(v, str) else v) for k, v in row.items()}
            yield cleaned


def _count_table_rows(cursor, table_name: str) -> int:
    cursor.execute(f"SELECT COUNT(1) FROM {table_name}")
    row = cursor.fetchone()
    return int(row[0]) if row else 0


def _get_monhoc_dependency_counts(cursor, ma_mon: str) -> dict[str, int]:
    sql = """
    SELECT
        CASE
            WHEN OBJECT_ID('LOPHOCPHAN', 'U') IS NULL THEN 0
            ELSE (SELECT COUNT(1) FROM LOPHOCPHAN WHERE MaMon = ?)
        END AS LopHocPhanCount,
        CASE
            WHEN OBJECT_ID('CTDT_MONHOC', 'U') IS NULL THEN 0
            ELSE (SELECT COUNT(1) FROM CTDT_MONHOC WHERE MaMon = ?)
        END AS ChuongTrinhDaoTaoCount,
        CASE
            WHEN OBJECT_ID('YEUCAU_TIENQUYET', 'U') IS NULL THEN 0
            ELSE (SELECT COUNT(1) FROM YEUCAU_TIENQUYET WHERE MonChinh = ? OR MonTienQuyet = ?)
        END AS TienQuyetCount,
        CASE
            WHEN OBJECT_ID('KETQUA_HOCTAP', 'U') IS NULL THEN 0
            ELSE (SELECT COUNT(1) FROM KETQUA_HOCTAP WHERE MaMon = ?)
        END AS KetQuaHocTapCount
    """
    cursor.execute(sql, (ma_mon, ma_mon, ma_mon, ma_mon, ma_mon))
    row = cursor.fetchone()
    if not row:
        return {
            "lop_hoc_phan": 0,
            "chuong_trinh_dao_tao": 0,
            "tien_quyet": 0,
            "ket_qua_hoc_tap": 0,
        }

    return {
        "lop_hoc_phan": int(row.LopHocPhanCount or 0),
        "chuong_trinh_dao_tao": int(row.ChuongTrinhDaoTaoCount or 0),
        "tien_quyet": int(row.TienQuyetCount or 0),
        "ket_qua_hoc_tap": int(row.KetQuaHocTapCount or 0),
    }


@app.get("/api/admin/csv-files")
def list_csv_files_for_import(current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = None
    cursor = None
    db_connected = True
    db_error = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
    except HTTPException as e:
        db_connected = False
        db_error = e.detail

    try:
        csv_files = sorted(DATABASE_DIR.glob("*.csv"))
        data = []

        for file_path in csv_files:
            config = CSV_FILE_CONFIG.get(file_path.name)
            imported = False
            row_count = 0
            dataset_key = None
            table_name = None

            if config:
                dataset_key = config["dataset_key"]
                table_name = config["table"]
                if cursor is not None:
                    row_count = _count_table_rows(cursor, table_name)
                    imported = row_count > 0

            stat = file_path.stat()
            data.append(
                {
                    "file_name": file_path.name,
                    "dataset_key": dataset_key,
                    "table": table_name,
                    "mapped": config is not None,
                    "imported": imported,
                    "row_count": row_count,
                    "size_bytes": stat.st_size,
                    "last_modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                }
            )

        return {
            "data": data,
            "db_connected": db_connected,
            "db_error": db_error,
        }
    finally:
        if conn is not None:
            conn.close()


@app.post("/api/admin/import-csv")
def import_csv_to_database(payload: CsvImportRequest, current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    selected_files = payload.files if payload.files else list(CSV_FILE_CONFIG.keys())
    invalid_files = [name for name in selected_files if name not in CSV_FILE_CONFIG]
    if invalid_files:
        raise HTTPException(status_code=400, detail=f"File CSV không hợp lệ: {', '.join(invalid_files)}")

    files_to_import = {}
    for file_name in selected_files:
        file_path = DATABASE_DIR / file_name
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"Không tìm thấy file CSV: {file_name}")
        files_to_import[file_name] = file_path

    try:
        if payload.clear_existing:
            tables_to_clear = {CSV_FILE_CONFIG[name]["table"] for name in files_to_import.keys()}
            for table_name in tables_to_clear:
                cursor.execute(f"DELETE FROM {table_name}")

        imported = {"giaovien": 0, "monhoc": 0, "sinhvien": 0}

        current_file_name = None
        for file_name, file_path in files_to_import.items():
            current_file_name = file_name
            dataset_key = CSV_FILE_CONFIG[file_name]["dataset_key"]
            for row in _read_csv_rows(file_path):
                if dataset_key == "giaovien":
                    _insert_or_update_giang_vien(cursor, row)
                elif dataset_key == "monhoc":
                    _insert_or_update_mon_hoc(cursor, row)
                elif dataset_key == "sinhvien":
                    _insert_or_update_sinh_vien(cursor, row)
                imported[dataset_key] += 1

        conn.commit()
        mark_data_changed("csv-imported")
        return {
            "message": "Đã import CSV vào SQL Server thành công.",
            "imported": imported,
            "clear_existing": payload.clear_existing,
            "imported_files": selected_files,
        }
    except Exception as e:
        conn.rollback()
        if 'current_file_name' in locals() and current_file_name:
            raise HTTPException(status_code=500, detail=f"Import CSV thất bại ở file {current_file_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Import CSV thất bại: {e}")
    finally:
        conn.close()


@app.get("/api/sinhvien")
def get_sinh_vien(limit: int = 300, include_inactive: bool = False):
    conn = get_db_connection()
    cursor = conn.cursor()

    where_clause = ""
    has_soft_delete = _table_has_column(cursor, "SINHVIEN", "IsDeleted")
    if not include_inactive and has_soft_delete:
        where_clause = "WHERE ISNULL(SV.IsDeleted, 0) = 0"

    is_deleted_expr = "CAST(ISNULL(SV.IsDeleted, 0) AS BIT)" if has_soft_delete else "CAST(0 AS BIT)"

    sql = """
    SELECT TOP (?)
        SV.MaSV,
        SV.TenSV,
        SV.NamNhapHoc,
        SV.ChuyenNganh,
        SV.MaLop,
        L.Khoa AS Khoa,
        SV.Email,
        SV.DienThoai,
        {is_deleted_expr} AS IsDeleted
    FROM SINHVIEN SV
    LEFT JOIN LOPHOC L ON SV.MaLop = L.MaLop
    {where_clause}
    ORDER BY SV.MaSV
    """.format(where_clause=where_clause, is_deleted_expr=is_deleted_expr)

    cursor.execute(sql, (limit,))
    columns = [column[0] for column in cursor.description]
    rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
    conn.close()
    return {"data": rows}


@app.post("/api/sinhvien")
def create_sinh_vien(payload: SinhVienPayload, current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT 1 FROM SINHVIEN WHERE MaSV = ?", (payload.MaSV,))
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Mã sinh viên đã tồn tại.")

        _ensure_lophoc_exists(cursor, payload.MaLop, payload.NamNhapHoc, payload.Khoa)

        sql = """
        INSERT INTO SINHVIEN (MaSV, TenSV, NamNhapHoc, ChuyenNganh, MaLop, Email, DienThoai, MatKhau)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        cursor.execute(
            sql,
            (
                payload.MaSV,
                payload.TenSV,
                payload.NamNhapHoc,
                payload.ChuyenNganh,
                payload.MaLop,
                payload.Email,
                payload.DienThoai,
                _normalize_password_for_storage(payload.MatKhau, payload.MaSV),
            ),
        )
        conn.commit()
        return {"message": "Thêm sinh viên thành công."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể thêm sinh viên: {e}")
    finally:
        conn.close()


@app.put("/api/sinhvien/{ma_sv}")
def update_sinh_vien(ma_sv: str, payload: SinhVienPayload, current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT 1 FROM SINHVIEN WHERE MaSV = ?", (ma_sv,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy sinh viên.")

        _ensure_lophoc_exists(cursor, payload.MaLop, payload.NamNhapHoc, payload.Khoa)

        sql = """
        UPDATE SINHVIEN
        SET TenSV=?, NamNhapHoc=?, ChuyenNganh=?, MaLop=?, Email=?, DienThoai=?, MatKhau=?
        WHERE MaSV=?
        """
        cursor.execute(
            sql,
            (
                payload.TenSV,
                payload.NamNhapHoc,
                payload.ChuyenNganh,
                payload.MaLop,
                payload.Email,
                payload.DienThoai,
                _normalize_password_for_storage(payload.MatKhau, ma_sv),
                ma_sv,
            ),
        )
        conn.commit()
        return {"message": "Cập nhật sinh viên thành công."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể cập nhật sinh viên: {e}")
    finally:
        conn.close()


@app.delete("/api/sinhvien/{ma_sv}")
def delete_sinh_vien(ma_sv: str, current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        deleted = _soft_delete_by_id(
            cursor,
            table_name="SINHVIEN",
            id_column="MaSV",
            id_value=ma_sv,
            deleted_by=current_user.get("id"),
        )
        if not deleted:
            raise HTTPException(status_code=404, detail="Không tìm thấy sinh viên.")
        conn.commit()
        mark_data_changed("student-deleted")
        return {"message": "Xóa sinh viên thành công (soft delete nếu schema hỗ trợ)."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể xóa sinh viên: {e}")
    finally:
        conn.close()


@app.put("/api/sinhvien/{ma_sv}/restore")
def restore_sinh_vien(ma_sv: str, current_user: dict[str, str] = Depends(require_roles("admin"))):
    return _restore_entity_record(
        table_name="SINHVIEN",
        id_column="MaSV",
        id_value=ma_sv,
        success_message="Khôi phục sinh viên thành công.",
        change_event="student-restored",
    )


@app.get("/api/giaovien")
def get_giao_vien(limit: int = 300, include_inactive: bool = False):
    conn = get_db_connection()
    cursor = conn.cursor()

    where_clause = ""
    has_soft_delete = _table_has_column(cursor, "GIAOVIEN", "IsDeleted")
    if not include_inactive and has_soft_delete:
        where_clause = "WHERE ISNULL(IsDeleted, 0) = 0"

    is_deleted_expr = "CAST(ISNULL(IsDeleted, 0) AS BIT)" if has_soft_delete else "CAST(0 AS BIT)"

    sql = """
    SELECT TOP (?)
        MaGV,
        TenGV,
        ChuyenNganh,
        HocVi,
        Khoa,
        Email,
        DienThoai,
        {is_deleted_expr} AS IsDeleted
    FROM GIAOVIEN
    {where_clause}
    ORDER BY MaGV
    """.format(where_clause=where_clause, is_deleted_expr=is_deleted_expr)

    cursor.execute(sql, (limit,))
    columns = [column[0] for column in cursor.description]
    rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
    conn.close()
    return {"data": rows}


@app.post("/api/giaovien")
def create_giao_vien(payload: GiaoVienPayload, current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT 1 FROM GIAOVIEN WHERE MaGV = ?", (payload.MaGV,))
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Mã giảng viên đã tồn tại.")

        sql = """
        INSERT INTO GIAOVIEN (MaGV, TenGV, ChuyenNganh, HocVi, Khoa, Email, DienThoai, MatKhau)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        cursor.execute(
            sql,
            (
                payload.MaGV,
                payload.TenGV,
                payload.ChuyenNganh,
                payload.HocVi,
                payload.Khoa,
                payload.Email,
                payload.DienThoai,
                _normalize_password_for_storage(payload.MatKhau, payload.MaGV),
            ),
        )
        conn.commit()
        return {"message": "Thêm giảng viên thành công."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể thêm giảng viên: {e}")
    finally:
        conn.close()


@app.put("/api/giaovien/{ma_gv}")
def update_giao_vien(ma_gv: str, payload: GiaoVienPayload, current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT 1 FROM GIAOVIEN WHERE MaGV = ?", (ma_gv,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy giảng viên.")

        sql = """
        UPDATE GIAOVIEN
        SET TenGV=?, ChuyenNganh=?, HocVi=?, Khoa=?, Email=?, DienThoai=?, MatKhau=?
        WHERE MaGV=?
        """
        cursor.execute(
            sql,
            (
                payload.TenGV,
                payload.ChuyenNganh,
                payload.HocVi,
                payload.Khoa,
                payload.Email,
                payload.DienThoai,
                _normalize_password_for_storage(payload.MatKhau, ma_gv),
                ma_gv,
            ),
        )
        conn.commit()
        return {"message": "Cập nhật giảng viên thành công."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể cập nhật giảng viên: {e}")
    finally:
        conn.close()


@app.delete("/api/giaovien/{ma_gv}")
def delete_giao_vien(ma_gv: str, current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        deleted = _soft_delete_by_id(
            cursor,
            table_name="GIAOVIEN",
            id_column="MaGV",
            id_value=ma_gv,
            deleted_by=current_user.get("id"),
        )
        if not deleted:
            raise HTTPException(status_code=404, detail="Không tìm thấy giảng viên.")
        conn.commit()
        mark_data_changed("teacher-deleted")
        return {"message": "Xóa giảng viên thành công (soft delete nếu schema hỗ trợ)."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể xóa giảng viên: {e}")
    finally:
        conn.close()


@app.put("/api/giaovien/{ma_gv}/restore")
def restore_giao_vien(ma_gv: str, current_user: dict[str, str] = Depends(require_roles("admin"))):
    return _restore_entity_record(
        table_name="GIAOVIEN",
        id_column="MaGV",
        id_value=ma_gv,
        success_message="Khôi phục giảng viên thành công.",
        change_event="teacher-restored",
    )


@app.get("/api/users")
def get_users(limit: int = 300, current_user: dict[str, str] = Depends(require_roles("admin"))):
    students_payload = get_sinh_vien(limit)
    teachers_payload = get_giao_vien(limit)

    students = [
        {
            **row,
            "role": "student",
        }
        for row in students_payload.get("data", [])
    ]

    teachers = [
        {
            **row,
            "role": "teacher",
        }
        for row in teachers_payload.get("data", [])
    ]

    return {"data": [*students, *teachers]}


@app.post("/api/account/change-password")
def change_account_password(payload: ChangePasswordPayload, current_user: dict[str, str] = Depends(get_current_user)):
    role = (payload.role or "").strip().lower()
    if role not in ("student", "teacher"):
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ đổi mật khẩu cho sinh viên và giảng viên.")

    if current_user["role"] != "admin":
        if current_user["role"] != role or current_user["id"] != payload.user_id:
            raise HTTPException(status_code=403, detail="Bạn chỉ được phép đổi mật khẩu của chính mình.")

    if len(payload.new_password or "") < 6:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải có ít nhất 6 ký tự.")

    table_name = "SINHVIEN" if role == "student" else "GIAOVIEN"
    id_column = "MaSV" if role == "student" else "MaGV"

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            f"SELECT MatKhau FROM {table_name} WHERE {id_column} = ?",
            (payload.user_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")

        current_password_in_db = str(row[0] or "")
        if not _verify_password(payload.current_password, current_password_in_db):
            raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không chính xác.")

        cursor.execute(
            f"UPDATE {table_name} SET MatKhau = ? WHERE {id_column} = ?",
            (_normalize_password_for_storage(payload.new_password, payload.user_id), payload.user_id),
        )
        conn.commit()

        return {"message": "Đổi mật khẩu thành công."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể đổi mật khẩu: {e}")
    finally:
        conn.close()


@app.get("/api/monhoc")
def get_mon_hoc(limit: int = 500, include_inactive: bool = False):
    conn = get_db_connection()
    cursor = conn.cursor()
    _ensure_tuition_schema(cursor)

    where_clause = ""
    has_soft_delete = _table_has_column(cursor, "MONHOC", "IsDeleted")
    if not include_inactive and has_soft_delete:
        where_clause = "WHERE ISNULL(IsDeleted, 0) = 0"

    is_deleted_expr = "CAST(ISNULL(IsDeleted, 0) AS BIT)" if has_soft_delete else "CAST(0 AS BIT)"

    sql = (
        "SELECT TOP (?) MaMon, TenMon, SoTinChi, Loai, MoTa, DonGiaTinChi, "
        f"{is_deleted_expr} AS IsDeleted "
        "FROM MONHOC "
        f"{where_clause} "
        "ORDER BY MaMon"
    )
    cursor.execute(sql, (limit,))
    columns = [column[0] for column in cursor.description]
    rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
    conn.close()
    return {"data": rows}


@app.get("/api/lophocphan")
def get_lop_hoc_phan(
    limit: int = 500,
    ma_dot: Optional[str] = None,
    only_open: bool = False,
    include_inactive: bool = False,
):
    conn = get_db_connection()
    cursor = conn.cursor()
    _ensure_tuition_schema(cursor)

    conditions: list[str] = []
    params: list[object] = [limit]
    if ma_dot:
        conditions.append("LHP.MaDot = ?")
        params.append(ma_dot)
    elif only_open:
        conditions.append("DD.TrangThai = N'Dang mo'")

    if not include_inactive:
        if _table_has_column(cursor, "LOPHOCPHAN", "IsDeleted"):
            conditions.append("ISNULL(LHP.IsDeleted, 0) = 0")
        if _table_has_column(cursor, "MONHOC", "IsDeleted"):
            conditions.append("ISNULL(MH.IsDeleted, 0) = 0")
        if _table_has_column(cursor, "GIAOVIEN", "IsDeleted"):
            conditions.append("(GV.MaGV IS NULL OR ISNULL(GV.IsDeleted, 0) = 0)")

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    has_soft_delete = _table_has_column(cursor, "LOPHOCPHAN", "IsDeleted")
    class_is_deleted_expr = "CAST(ISNULL(LHP.IsDeleted, 0) AS BIT)" if has_soft_delete else "CAST(0 AS BIT)"

    sql = f"""
    SELECT TOP (?)
        LHP.MaLopHP,
        LHP.MaMon,
        LHP.MaDot,
        MH.TenMon,
        MH.SoTinChi,
        MH.DonGiaTinChi,
        MH.Loai,
        GV.TenGV AS GiangVien,
        GV.MaGV AS GiangVienId,
        LHP.SysoMax,
        (SELECT COUNT(1) FROM DANGKY DK WHERE DK.MaLopHP = LHP.MaLopHP) AS DaDangKy,
        {class_is_deleted_expr} AS IsDeleted,
        COALESCE(LICH.ThoiGian, N'Chua xep lich') AS ThoiGian
    FROM LOPHOCPHAN LHP
    JOIN MONHOC MH ON MH.MaMon = LHP.MaMon
    JOIN DOTDANGKY DD ON DD.MaDot = LHP.MaDot
    LEFT JOIN GIAOVIEN GV ON GV.MaGV = LHP.MaGV
    OUTER APPLY (
        SELECT STRING_AGG(
            CONCAT(
                N'Thu ',
                Thu,
                N' Tiet ',
                TietBatDau,
                N'-',
                TietBatDau + SoTiet - 1,
                CASE
                    WHEN NULLIF(LTRIM(RTRIM(COALESCE(Phong, N''))), N'') IS NOT NULL THEN CONCAT(N', Phong ', LTRIM(RTRIM(Phong)))
                    ELSE N''
                END
            ),
            N' | '
        ) AS ThoiGian
        FROM LICHHOC
        WHERE MaLopHP = LHP.MaLopHP
    ) LICH
    {where_clause}
    ORDER BY LHP.MaLopHP
    """.format(class_is_deleted_expr=class_is_deleted_expr)

    cursor.execute(sql, tuple(params))
    columns = [column[0] for column in cursor.description]
    rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
    conn.close()

    normalized = []
    for row in rows:
        normalized.append(
            {
                "maLopHP": str(row.get("MaLopHP") or ""),
                "maMon": str(row.get("MaMon") or ""),
                "maDot": str(row.get("MaDot") or ""),
                "tenMon": str(row.get("TenMon") or ""),
                "soTinChi": int(row.get("SoTinChi") or 0),
                "donGiaTinChi": float(row.get("DonGiaTinChi")) if row.get("DonGiaTinChi") is not None else None,
                "loai": str(row.get("Loai") or "Bat buoc"),
                "giangVien": str(row.get("GiangVien") or ""),
                "giangVienId": str(row.get("GiangVienId") or "") or None,
                "sySoMax": int(row.get("SysoMax") or 0),
                "daDangKy": int(row.get("DaDangKy") or 0),
                "thoiGian": str(row.get("ThoiGian") or "Chua xep lich"),
                "tienQuyet": [],
            }
        )

    return {"data": normalized}


@app.get("/api/sinhvien/{ma_sv}/dangky")
def get_sinh_vien_registrations(ma_sv: str, current_user: dict[str, str] = Depends(get_current_user)):
    if current_user["role"] not in {"admin", "teacher"} and current_user["id"] != ma_sv:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem dữ liệu đăng ký của sinh viên khác.")

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT 1 FROM SINHVIEN WHERE MaSV = ?", (ma_sv,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy sinh viên.")

        sql = """
        SELECT DK.MaLopHP
        FROM DANGKY DK
        JOIN LOPHOCPHAN LHP ON LHP.MaLopHP = DK.MaLopHP
        WHERE DK.MaSV = ?
        ORDER BY DK.MaLopHP
        """
        cursor.execute(sql, (ma_sv,))
        data = [str(row[0]) for row in cursor.fetchall()]
        return {"data": data}
    finally:
        conn.close()


@app.get("/api/sinhvien/{ma_sv}/dangky-lichsu")
def get_sinh_vien_registration_history(ma_sv: str, current_user: dict[str, str] = Depends(get_current_user)):
    if current_user["role"] not in {"admin", "teacher"} and current_user["id"] != ma_sv:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem lịch sử đăng ký của sinh viên khác.")

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT 1 FROM SINHVIEN WHERE MaSV = ?", (ma_sv,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy sinh viên.")

        cursor.execute(
            """
            SELECT
                DD.HocKy,
                DD.NamHoc,
                DK.MaLopHP,
                MH.MaMon,
                MH.TenMon,
                MH.SoTinChi,
                ISNULL(GV.TenGV, N'Chưa phân công'),
                ISNULL(LHP.MaDot, N'')
            FROM DANGKY DK
            INNER JOIN LOPHOCPHAN LHP ON LHP.MaLopHP = DK.MaLopHP
            INNER JOIN MONHOC MH ON MH.MaMon = LHP.MaMon
            LEFT JOIN GIAOVIEN GV ON GV.MaGV = LHP.MaGV
            LEFT JOIN DOTDANGKY DD ON DD.MaDot = LHP.MaDot
            WHERE DK.MaSV = ?
            ORDER BY DD.NamHoc DESC, DD.HocKy DESC, DK.MaLopHP ASC
            """,
            (ma_sv,),
        )

        grouped: dict[str, dict[str, object]] = {}
        for row in cursor.fetchall():
            hoc_ky = int(row[0]) if row[0] is not None else 0
            nam_hoc = int(row[1]) if row[1] is not None else 0
            key = f"{nam_hoc}-{hoc_ky}"

            if key not in grouped:
                grouped[key] = {
                    "hoc_ky": hoc_ky,
                    "nam_hoc": nam_hoc,
                    "courses": [],
                    "total_credits": 0,
                }

            so_tin_chi = int(row[5] or 0)
            grouped[key]["courses"].append(
                {
                    "ma_lop_hp": str(row[2]),
                    "ma_mon": str(row[3]),
                    "ten_mon": str(row[4]),
                    "so_tin_chi": so_tin_chi,
                    "giang_vien": str(row[6]),
                    "ma_dot": str(row[7]),
                }
            )
            grouped[key]["total_credits"] = int(grouped[key]["total_credits"]) + so_tin_chi

        semesters = sorted(
            grouped.values(),
            key=lambda item: (int(item["nam_hoc"]), int(item["hoc_ky"])),
            reverse=True,
        )

        return {"data": semesters}
    finally:
        conn.close()


@app.get("/api/sinhvien/me/hoc-phi")
def get_my_tuition(current_user: dict[str, str] = Depends(require_roles("student", "admin"))):
    ma_sv = current_user["id"]

    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="Chỉ sinh viên mới có thể xem học phí cá nhân.")

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT 1 FROM SINHVIEN WHERE MaSV = ?", (ma_sv,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy sinh viên.")

        cursor.execute(
            """
            SELECT
                HP.HocKy,
                HP.NamHoc,
                HP.SoTinChi,
                HP.DonGia,
                CAST(HP.TongTien AS DECIMAL(18, 2)) AS TongTien,
                HP.TrangThai
            FROM HOCPHI HP
            WHERE HP.MaSV = ?
            ORDER BY HP.NamHoc DESC, HP.HocKy DESC
            """,
            (ma_sv,),
        )

        rows = []
        total_amount = 0.0
        paid_amount = 0.0

        for row in cursor.fetchall():
            hoc_ky = int(row[0] or 0)
            nam_hoc = int(row[1] or 0)
            so_tin_chi = int(row[2] or 0)
            don_gia = float(row[3] or 0)
            tong_tien = float(row[4] or 0)
            trang_thai = str(row[5] or "")

            total_amount += tong_tien
            if trang_thai.strip().lower() == "da thanh toan":
                paid_amount += tong_tien

            rows.append(
                {
                    "hoc_ky": hoc_ky,
                    "nam_hoc": nam_hoc,
                    "so_tin_chi": so_tin_chi,
                    "don_gia": don_gia,
                    "tong_tien": tong_tien,
                    "trang_thai": trang_thai,
                }
            )

        return {
            "data": rows,
            "summary": {
                "total_amount": total_amount,
                "paid_amount": paid_amount,
                "unpaid_amount": max(total_amount - paid_amount, 0.0),
            },
        }
    finally:
        conn.close()


def _get_active_ma_dot(cursor) -> Optional[str]:
    cursor.execute(
        """
        SELECT TOP 1 MaDot
        FROM DOTDANGKY
        WHERE TrangThai = N'Dang mo'
        ORDER BY NgayBD DESC
        """
    )
    row = cursor.fetchone()
    return str(row[0]) if row else None


def _upsert_mon_hoc(cursor, payload: LopHocPhanWithMonHocPayload):
    _ensure_tuition_schema(cursor)
    cursor.execute("SELECT 1 FROM MONHOC WHERE MaMon = ?", (payload.MaMon,))
    if cursor.fetchone():
        cursor.execute(
            "UPDATE MONHOC SET TenMon=?, SoTinChi=?, Loai=?, MoTa=? WHERE MaMon=?",
            (payload.TenMon, payload.SoTinChi, payload.Loai, payload.MoTa, payload.MaMon),
        )
    else:
        cursor.execute(
            "INSERT INTO MONHOC (MaMon, TenMon, SoTinChi, Loai, MoTa, DonGiaTinChi) VALUES (?, ?, ?, ?, ?, NULL)",
            (payload.MaMon, payload.TenMon, payload.SoTinChi, payload.Loai, payload.MoTa),
        )


def _ensure_teacher_can_manage_class_schedule(cursor, current_user: dict[str, str], ma_lop_hp: str):
    if current_user.get("role") != "teacher":
        return

    cursor.execute("SELECT MaGV FROM LOPHOCPHAN WHERE MaLopHP = ?", (ma_lop_hp,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp học phần.")

    assigned_teacher = str(row[0] or "")
    if assigned_teacher != current_user.get("id"):
        raise HTTPException(
            status_code=403,
            detail="Bạn chỉ được quản lý lịch dạy của lớp học phần do bạn phụ trách.",
        )


def _ensure_teacher_can_manage_course_tuition(cursor, current_user: dict[str, str], ma_mon: str):
    role = current_user.get("role")
    if role == "admin":
        return
    if role != "teacher":
        raise HTTPException(status_code=403, detail="Bạn không có quyền cập nhật đơn giá môn học.")

    cursor.execute(
        "SELECT TOP 1 1 FROM LOPHOCPHAN WHERE MaMon = ? AND MaGV = ?",
        (ma_mon, current_user.get("id")),
    )
    if not cursor.fetchone():
        raise HTTPException(
            status_code=403,
            detail="Bạn chỉ được cập nhật đơn giá cho môn học thuộc lớp bạn đang phụ trách.",
        )


@app.put("/api/teacher/monhoc/{ma_mon}/don-gia")
def update_course_tuition_by_teacher(
    ma_mon: str,
    payload: CourseTuitionPayload,
    current_user: dict[str, str] = Depends(require_roles("teacher", "admin")),
):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        _ensure_tuition_schema(cursor)
        cursor.execute("SELECT 1 FROM MONHOC WHERE MaMon = ?", (ma_mon,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy môn học.")

        _ensure_teacher_can_manage_course_tuition(cursor, current_user, ma_mon)

        don_gia_tin_chi = _normalize_tuition_value(payload.DonGiaTinChi, allow_none=True)
        cursor.execute(
            "UPDATE MONHOC SET DonGiaTinChi = ? WHERE MaMon = ?",
            (don_gia_tin_chi, ma_mon),
        )

        _recalculate_hocphi(cursor)
        conn.commit()
        mark_data_changed("course-tuition-updated")

        return {
            "message": "Đã cập nhật đơn giá môn học.",
            "data": {
                "ma_mon": ma_mon,
                "don_gia_tin_chi": don_gia_tin_chi,
            },
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể cập nhật đơn giá môn học: {e}")
    finally:
        conn.close()


@app.post("/api/lophocphan-with-monhoc")
def create_lop_hoc_phan_with_mon_hoc(payload: LopHocPhanWithMonHocPayload, current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT 1 FROM LOPHOCPHAN WHERE MaLopHP = ?", (payload.MaLopHP,))
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Mã lớp học phần đã tồn tại.")

        cursor.execute("SELECT 1 FROM GIAOVIEN WHERE MaGV = ?", (payload.MaGV,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy giảng viên tương ứng.")

        ma_dot = payload.MaDot
        if ma_dot:
            cursor.execute("SELECT 1 FROM DOTDANGKY WHERE MaDot = ?", (ma_dot,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Không tìm thấy đợt đăng ký tương ứng.")
        else:
            ma_dot = _get_active_ma_dot(cursor)
            if not ma_dot:
                raise HTTPException(status_code=400, detail="Hiện không có đợt đăng ký đang mở để tạo lớp học phần.")

        _upsert_mon_hoc(cursor, payload)

        cursor.execute(
            """
            INSERT INTO LOPHOCPHAN (MaLopHP, MaMon, MaGV, MaDot, SysoMax)
            VALUES (?, ?, ?, ?, ?)
            """,
            (payload.MaLopHP, payload.MaMon, payload.MaGV, ma_dot, payload.SysoMax),
        )
        conn.commit()
        mark_data_changed("class-with-course-created")
        return {"message": "Thêm lớp học phần thành công.", "ma_dot": ma_dot}
    except HTTPException:
        conn.rollback()
        raise
    except pyodbc.IntegrityError as e:
        conn.rollback()
        detail_text = str(e)
        if "UQ_LHP" in detail_text or "duplicate key" in detail_text.lower():
            raise HTTPException(
                status_code=409,
                detail=(
                    "Không thể tạo lớp học phần do trùng bộ (môn học, giảng viên, đợt đăng ký)."
                ),
            )
        raise HTTPException(status_code=500, detail=f"Không thể thêm lớp học phần: {e}")
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể thêm lớp học phần: {e}")
    finally:
        conn.close()


@app.put("/api/lophocphan/{ma_lop_hp}/with-monhoc")
def update_lop_hoc_phan_with_mon_hoc(ma_lop_hp: str, payload: LopHocPhanWithMonHocPayload, current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT MaDot FROM LOPHOCPHAN WHERE MaLopHP = ?", (ma_lop_hp,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy lớp học phần.")

        current_ma_dot = str(row[0]) if row and row[0] is not None else None

        cursor.execute("SELECT 1 FROM GIAOVIEN WHERE MaGV = ?", (payload.MaGV,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy giảng viên tương ứng.")

        ma_dot = payload.MaDot or current_ma_dot
        if not ma_dot:
            raise HTTPException(status_code=400, detail="Không xác định được đợt đăng ký cho lớp học phần.")

        cursor.execute("SELECT 1 FROM DOTDANGKY WHERE MaDot = ?", (ma_dot,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy đợt đăng ký tương ứng.")

        _upsert_mon_hoc(cursor, payload)

        cursor.execute(
            """
            UPDATE LOPHOCPHAN
            SET MaMon = ?, MaGV = ?, MaDot = ?, SysoMax = ?
            WHERE MaLopHP = ?
            """,
            (payload.MaMon, payload.MaGV, ma_dot, payload.SysoMax, ma_lop_hp),
        )
        conn.commit()
        mark_data_changed("class-with-course-updated")
        return {"message": "Cập nhật lớp học phần thành công.", "ma_dot": ma_dot}
    except HTTPException:
        conn.rollback()
        raise
    except pyodbc.IntegrityError as e:
        conn.rollback()
        detail_text = str(e)
        if "UQ_LHP" in detail_text or "duplicate key" in detail_text.lower():
            raise HTTPException(
                status_code=409,
                detail=(
                    "Không thể cập nhật lớp học phần do trùng bộ (môn học, giảng viên, đợt đăng ký)."
                ),
            )
        raise HTTPException(status_code=500, detail=f"Không thể cập nhật lớp học phần: {e}")
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể cập nhật lớp học phần: {e}")
    finally:
        conn.close()


@app.post("/api/lophocphan")
def create_lop_hoc_phan(payload: LopHocPhanPayload, current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT 1 FROM LOPHOCPHAN WHERE MaLopHP = ?", (payload.MaLopHP,))
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Mã lớp học phần đã tồn tại.")

        cursor.execute("SELECT 1 FROM MONHOC WHERE MaMon = ?", (payload.MaMon,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy môn học tương ứng.")

        cursor.execute("SELECT 1 FROM GIAOVIEN WHERE MaGV = ?", (payload.MaGV,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy giảng viên tương ứng.")

        ma_dot = payload.MaDot
        if ma_dot:
            cursor.execute("SELECT 1 FROM DOTDANGKY WHERE MaDot = ?", (ma_dot,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Không tìm thấy đợt đăng ký tương ứng.")
        else:
            ma_dot = _get_active_ma_dot(cursor)
            if not ma_dot:
                raise HTTPException(status_code=400, detail="Hiện không có đợt đăng ký đang mở để tạo lớp học phần.")

        cursor.execute(
            """
            INSERT INTO LOPHOCPHAN (MaLopHP, MaMon, MaGV, MaDot, SysoMax)
            VALUES (?, ?, ?, ?, ?)
            """,
            (payload.MaLopHP, payload.MaMon, payload.MaGV, ma_dot, payload.SysoMax),
        )
        conn.commit()
        mark_data_changed("class-created")
        return {"message": "Thêm lớp học phần thành công.", "ma_dot": ma_dot}
    except HTTPException:
        conn.rollback()
        raise
    except pyodbc.IntegrityError as e:
        conn.rollback()
        detail_text = str(e)
        if "UQ_LHP" in detail_text or "duplicate key" in detail_text.lower():
            raise HTTPException(
                status_code=409,
                detail=(
                    "Không thể tạo lớp học phần do trùng bộ (môn học, giảng viên, đợt đăng ký)."
                ),
            )
        raise HTTPException(status_code=500, detail=f"Không thể thêm lớp học phần: {e}")
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể thêm lớp học phần: {e}")
    finally:
        conn.close()


@app.put("/api/lophocphan/{ma_lop_hp}")
def update_lop_hoc_phan(ma_lop_hp: str, payload: LopHocPhanPayload, current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT 1 FROM LOPHOCPHAN WHERE MaLopHP = ?", (ma_lop_hp,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy lớp học phần.")

        cursor.execute("SELECT 1 FROM MONHOC WHERE MaMon = ?", (payload.MaMon,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy môn học tương ứng.")

        cursor.execute("SELECT 1 FROM GIAOVIEN WHERE MaGV = ?", (payload.MaGV,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy giảng viên tương ứng.")

        current_ma_dot = None
        cursor.execute("SELECT MaDot FROM LOPHOCPHAN WHERE MaLopHP = ?", (ma_lop_hp,))
        row = cursor.fetchone()
        if row:
            current_ma_dot = str(row[0])

        ma_dot = payload.MaDot or current_ma_dot
        if not ma_dot:
            raise HTTPException(status_code=400, detail="Không xác định được đợt đăng ký cho lớp học phần.")

        cursor.execute("SELECT 1 FROM DOTDANGKY WHERE MaDot = ?", (ma_dot,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy đợt đăng ký tương ứng.")

        cursor.execute(
            """
            UPDATE LOPHOCPHAN
            SET MaMon = ?, MaGV = ?, MaDot = ?, SysoMax = ?
            WHERE MaLopHP = ?
            """,
            (payload.MaMon, payload.MaGV, ma_dot, payload.SysoMax, ma_lop_hp),
        )
        conn.commit()
        mark_data_changed("class-updated")
        return {"message": "Cập nhật lớp học phần thành công.", "ma_dot": ma_dot}
    except HTTPException:
        conn.rollback()
        raise
    except pyodbc.IntegrityError as e:
        conn.rollback()
        detail_text = str(e)
        if "UQ_LHP" in detail_text or "duplicate key" in detail_text.lower():
            raise HTTPException(
                status_code=409,
                detail=(
                    "Không thể cập nhật lớp học phần do trùng bộ (môn học, giảng viên, đợt đăng ký)."
                ),
            )
        raise HTTPException(status_code=500, detail=f"Không thể cập nhật lớp học phần: {e}")
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể cập nhật lớp học phần: {e}")
    finally:
        conn.close()


@app.post("/api/lichhoc")
def create_lich_hoc(payload: LichHocPayload, current_user: dict[str, str] = Depends(require_roles("teacher", "admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        if payload.Thu < 2 or payload.Thu > 7:
            raise HTTPException(status_code=400, detail="Thứ phải trong khoảng 2 đến 7.")

        if payload.TietBatDau < 1 or payload.TietBatDau > 14:
            raise HTTPException(status_code=400, detail="Tiết bắt đầu phải trong khoảng 1 đến 14.")

        if payload.SoTiet < 1 or payload.SoTiet > 6:
            raise HTTPException(status_code=400, detail="Số tiết phải trong khoảng 1 đến 6.")

        if payload.TietBatDau + payload.SoTiet - 1 > 14:
            raise HTTPException(status_code=400, detail="Tiết kết thúc không được vượt quá 14.")

        cursor.execute("SELECT 1 FROM LOPHOCPHAN WHERE MaLopHP = ?", (payload.MaLopHP,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy lớp học phần.")

        _ensure_teacher_can_manage_class_schedule(cursor, current_user, payload.MaLopHP)

        cursor.execute(
            """
            INSERT INTO LICHHOC (MaLopHP, Thu, TietBatDau, SoTiet, Phong)
            VALUES (?, ?, ?, ?, ?)
            """,
            (payload.MaLopHP, payload.Thu, payload.TietBatDau, payload.SoTiet, payload.Phong),
        )
        conn.commit()
        mark_data_changed("schedule-created")
        return {"message": "Thêm lịch học thành công."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể thêm lịch học: {e}")
    finally:
        conn.close()


@app.get("/api/lophocphan/{ma_lop_hp}/lichhoc")
def get_lich_hoc_by_class(ma_lop_hp: str, current_user: dict[str, str] = Depends(require_roles("teacher", "admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT 1 FROM LOPHOCPHAN WHERE MaLopHP = ?", (ma_lop_hp,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy lớp học phần.")

        _ensure_teacher_can_manage_class_schedule(cursor, current_user, ma_lop_hp)

        cursor.execute(
            """
            SELECT MaLich, MaLopHP, Thu, TietBatDau, SoTiet, Phong
            FROM LICHHOC
            WHERE MaLopHP = ?
            ORDER BY MaLich ASC
            """,
            (ma_lop_hp,),
        )

        data = []
        for row in cursor.fetchall():
            data.append(
                {
                    "maLich": int(row[0]),
                    "maLopHP": str(row[1]),
                    "thu": int(row[2]),
                    "tietBatDau": int(row[3]),
                    "soTiet": int(row[4]),
                    "phong": str(row[5] or ""),
                }
            )

        return {"data": data}
    finally:
        conn.close()


@app.put("/api/lichhoc/{ma_lich}")
def update_lich_hoc(ma_lich: int, payload: LichHocPayload, current_user: dict[str, str] = Depends(require_roles("teacher", "admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        if payload.Thu < 2 or payload.Thu > 7:
            raise HTTPException(status_code=400, detail="Thứ phải trong khoảng 2 đến 7.")

        if payload.TietBatDau < 1 or payload.TietBatDau > 14:
            raise HTTPException(status_code=400, detail="Tiết bắt đầu phải trong khoảng 1 đến 14.")

        if payload.SoTiet < 1 or payload.SoTiet > 6:
            raise HTTPException(status_code=400, detail="Số tiết phải trong khoảng 1 đến 6.")

        if payload.TietBatDau + payload.SoTiet - 1 > 14:
            raise HTTPException(status_code=400, detail="Tiết kết thúc không được vượt quá 14.")

        cursor.execute("SELECT 1 FROM LICHHOC WHERE MaLich = ?", (ma_lich,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy lịch học.")

        cursor.execute("SELECT 1 FROM LOPHOCPHAN WHERE MaLopHP = ?", (payload.MaLopHP,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy lớp học phần.")

        _ensure_teacher_can_manage_class_schedule(cursor, current_user, payload.MaLopHP)

        cursor.execute(
            """
            UPDATE LICHHOC
            SET MaLopHP = ?, Thu = ?, TietBatDau = ?, SoTiet = ?, Phong = ?
            WHERE MaLich = ?
            """,
            (payload.MaLopHP, payload.Thu, payload.TietBatDau, payload.SoTiet, payload.Phong, ma_lich),
        )
        conn.commit()
        mark_data_changed("schedule-updated")
        return {"message": "Cập nhật lịch học thành công."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể cập nhật lịch học: {e}")
    finally:
        conn.close()


@app.delete("/api/lichhoc/{ma_lich}")
def delete_lich_hoc(ma_lich: int, current_user: dict[str, str] = Depends(require_roles("teacher", "admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT MaLopHP FROM LICHHOC WHERE MaLich = ?", (ma_lich,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy lịch học.")

        ma_lop_hp = str(row[0] or "")
        _ensure_teacher_can_manage_class_schedule(cursor, current_user, ma_lop_hp)

        cursor.execute("DELETE FROM LICHHOC WHERE MaLich = ?", (ma_lich,))
        conn.commit()
        mark_data_changed("schedule-deleted")
        return {"message": "Xóa lịch học thành công."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể xóa lịch học: {e}")
    finally:
        conn.close()


@app.post("/api/monhoc")
def create_mon_hoc(payload: MonHocPayload, current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        _ensure_tuition_schema(cursor)
        cursor.execute("SELECT 1 FROM MONHOC WHERE MaMon = ?", (payload.MaMon,))
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Mã môn học đã tồn tại.")

        don_gia_tin_chi = _normalize_tuition_value(payload.DonGiaTinChi, allow_none=True)

        cursor.execute(
            "INSERT INTO MONHOC (MaMon, TenMon, SoTinChi, Loai, MoTa, DonGiaTinChi) VALUES (?, ?, ?, ?, ?, ?)",
            (payload.MaMon, payload.TenMon, payload.SoTinChi, payload.Loai, payload.MoTa, don_gia_tin_chi),
        )
        _recalculate_hocphi(cursor)
        conn.commit()
        mark_data_changed("course-created")
        return {"message": "Thêm môn học thành công."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể thêm môn học: {e}")
    finally:
        conn.close()


@app.put("/api/monhoc/{ma_mon}")
def update_mon_hoc(ma_mon: str, payload: MonHocPayload, current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        _ensure_tuition_schema(cursor)
        cursor.execute("SELECT 1 FROM MONHOC WHERE MaMon = ?", (ma_mon,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy môn học.")

        don_gia_tin_chi = _normalize_tuition_value(payload.DonGiaTinChi, allow_none=True)

        cursor.execute(
            "UPDATE MONHOC SET TenMon=?, SoTinChi=?, Loai=?, MoTa=?, DonGiaTinChi=? WHERE MaMon=?",
            (payload.TenMon, payload.SoTinChi, payload.Loai, payload.MoTa, don_gia_tin_chi, ma_mon),
        )
        _recalculate_hocphi(cursor)
        conn.commit()
        mark_data_changed("course-updated")
        return {"message": "Cập nhật môn học thành công."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể cập nhật môn học: {e}")
    finally:
        conn.close()


@app.get("/api/monhoc/{ma_mon}/dependencies")
def get_mon_hoc_dependencies(ma_mon: str):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        monhoc_lookup = "SELECT 1 FROM MONHOC WHERE MaMon = ?"
        if _table_has_column(cursor, "MONHOC", "IsDeleted"):
            monhoc_lookup += " AND ISNULL(IsDeleted, 0) = 0"

        cursor.execute(monhoc_lookup, (ma_mon,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy môn học.")

        dependency_counts = _get_monhoc_dependency_counts(cursor, ma_mon)
        total_dependencies = sum(dependency_counts.values())
        return {
            "ma_mon": ma_mon,
            "has_dependencies": total_dependencies > 0,
            "dependencies": dependency_counts,
            "total": total_dependencies,
        }
    finally:
        conn.close()


@app.delete("/api/monhoc/{ma_mon}")
def delete_mon_hoc(ma_mon: str, current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        monhoc_lookup = "SELECT 1 FROM MONHOC WHERE MaMon = ?"
        if _table_has_column(cursor, "MONHOC", "IsDeleted"):
            monhoc_lookup += " AND ISNULL(IsDeleted, 0) = 0"

        cursor.execute(monhoc_lookup, (ma_mon,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy môn học.")

        dependency_counts = _get_monhoc_dependency_counts(cursor, ma_mon)
        total_dependencies = sum(dependency_counts.values())
        if total_dependencies > 0:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Không thể xóa môn học vì đang có dữ liệu liên quan. "
                    f"LOPHOCPHAN={dependency_counts['lop_hoc_phan']}, "
                    f"CTDT_MONHOC={dependency_counts['chuong_trinh_dao_tao']}, "
                    f"YEUCAU_TIENQUYET={dependency_counts['tien_quyet']}, "
                    f"KETQUA_HOCTAP={dependency_counts['ket_qua_hoc_tap']}"
                ),
            )

        deleted = _soft_delete_by_id(
            cursor,
            table_name="MONHOC",
            id_column="MaMon",
            id_value=ma_mon,
            deleted_by=current_user.get("id"),
        )
        if not deleted:
            raise HTTPException(status_code=404, detail="Không tìm thấy môn học.")

        conn.commit()
        mark_data_changed("course-deleted")
        return {"message": "Xóa môn học thành công (soft delete nếu schema hỗ trợ)."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể xóa môn học: {e}")
    finally:
        conn.close()


@app.put("/api/monhoc/{ma_mon}/restore")
def restore_mon_hoc(ma_mon: str, current_user: dict[str, str] = Depends(require_roles("admin"))):
    return _restore_entity_record(
        table_name="MONHOC",
        id_column="MaMon",
        id_value=ma_mon,
        success_message="Khôi phục môn học thành công.",
        change_event="course-restored",
    )

# --- MODEL DỮ LIỆU ĐẦU VÀO ---
class DangKyRequest(BaseModel):
    MaSV: str
    MaLopHP: str


def _ensure_registration_result_success(result: Optional[str]) -> str:
    message = (result or "Lỗi không xác định").strip()
    if message.upper().startswith("LOI"):
        raise HTTPException(status_code=400, detail=message)
    return message

# --- API 1: Lấy bảng điểm của Sinh viên (Sử dụng View V_BangDiem) ---
@app.get("/api/bangdiem/{masv}")
def get_bang_diem(masv: str, current_user: dict[str, str] = Depends(get_current_user)):
    if current_user["role"] not in {"admin", "teacher"} and current_user["id"] != masv:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem bảng điểm của sinh viên khác.")

    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Truy vấn từ View V_BangDiem
    cursor.execute("SELECT * FROM V_BangDiem WHERE MaSV = ?", (masv,))
    columns = [column[0] for column in cursor.description]
    results = []
    
    for row in cursor.fetchall():
        results.append(dict(zip(columns, row)))
        
    conn.close()
    return {"data": results}

# --- API 2: Sinh viên đăng ký tín chỉ (Gọi Stored Procedure SP_DangKyTinChi) ---
@app.post("/api/dangky")
def dang_ky_tin_chi(req: DangKyRequest, current_user: dict[str, str] = Depends(require_roles("student", "admin"))):
    rate_key = f"dangky:{current_user['id']}"
    if _is_rate_limited(rate_key, max_requests=20, window_seconds=60):
        raise HTTPException(status_code=429, detail="Bạn thao tác quá nhanh, vui lòng thử lại sau.")

    if current_user["role"] == "student" and current_user["id"] != req.MaSV:
        raise HTTPException(status_code=403, detail="Bạn chỉ được đăng ký cho chính mình.")

    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Gọi Stored Procedure có tham số OUTPUT
        sql_query = """
            DECLARE @KetQua NVARCHAR(200);
            EXEC SP_DangKyTinChi @MaSV=?, @MaLopHP=?, @KetQua=@KetQua OUTPUT;
            SELECT @KetQua AS KetQua;
        """
        cursor.execute(sql_query, (req.MaSV, req.MaLopHP))
        row = cursor.fetchone()
        
        # Commit thay đổi vào database
        conn.commit()
        mark_data_changed("registration-created")
        
        ket_qua = _ensure_registration_result_success(row.KetQua if row else None)

        return {"message": ket_qua}
        
    except pyodbc.Error as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/huy-dangky")
def huy_dang_ky_tin_chi(req: DangKyRequest, current_user: dict[str, str] = Depends(require_roles("student", "admin"))):
    rate_key = f"huydangky:{current_user['id']}"
    if _is_rate_limited(rate_key, max_requests=20, window_seconds=60):
        raise HTTPException(status_code=429, detail="Bạn thao tác quá nhanh, vui lòng thử lại sau.")

    if current_user["role"] == "student" and current_user["id"] != req.MaSV:
        raise HTTPException(status_code=403, detail="Bạn chỉ được hủy đăng ký của chính mình.")

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        sql_query = """
            DECLARE @KetQua NVARCHAR(200);
            EXEC SP_HuyDangKy @MaSV=?, @MaLopHP=?, @KetQua=@KetQua OUTPUT;
            SELECT @KetQua AS KetQua;
        """
        cursor.execute(sql_query, (req.MaSV, req.MaLopHP))
        row = cursor.fetchone()
        conn.commit()
        mark_data_changed("registration-cancelled")

        ket_qua = _ensure_registration_result_success(row.KetQua if row else None)

        return {"message": ket_qua}
    except pyodbc.Error as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.put("/api/lophocphan/{ma_lop_hp}/assign-teacher")
def assign_teacher_to_class(ma_lop_hp: str, payload: TeacherAssignPayload, current_user: dict[str, str] = Depends(require_roles("admin"))):

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT 1 FROM GIAOVIEN WHERE MaGV = ?", (payload.MaGV,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy giảng viên.")

        cursor.execute("SELECT 1 FROM LOPHOCPHAN WHERE MaLopHP = ?", (ma_lop_hp,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy lớp học phần.")

        cursor.execute("UPDATE LOPHOCPHAN SET MaGV = ? WHERE MaLopHP = ?", (payload.MaGV, ma_lop_hp))
        conn.commit()
        mark_data_changed("teacher-assigned")
        return {"message": "Đã phân công giảng viên cho lớp học phần."}
    except HTTPException:
        conn.rollback()
        raise
    except pyodbc.IntegrityError as e:
        conn.rollback()
        detail_text = str(e)
        if "UQ_LHP" in detail_text or "duplicate key" in detail_text.lower():
            raise HTTPException(
                status_code=409,
                detail=(
                    "Không thể phân công giảng viên vì vi phạm ràng buộc duy nhất "
                    "(môn học, giảng viên, đợt đăng ký)."
                ),
            )
        raise HTTPException(status_code=500, detail=f"Không thể phân công giảng viên: {e}")
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể phân công giảng viên: {e}")
    finally:
        conn.close()


@app.put("/api/lophocphan/{ma_lop_hp}/unassign-teacher")
def unassign_teacher_from_class(ma_lop_hp: str, payload: TeacherUnassignPayload, current_user: dict[str, str] = Depends(require_roles("admin"))):

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT MaGV FROM LOPHOCPHAN WHERE MaLopHP = ?", (ma_lop_hp,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy lớp học phần.")

        current_teacher = str(row[0] or "")
        if payload.MaGV and current_teacher and payload.MaGV != current_teacher:
            raise HTTPException(status_code=409, detail="Giảng viên hiện tại không khớp dữ liệu cần hủy.")

        cursor.execute(
            """
            SELECT IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'LOPHOCPHAN' AND COLUMN_NAME = 'MaGV'
            """
        )
        nullable_row = cursor.fetchone()
        is_nullable = str(nullable_row[0]).upper() == "YES" if nullable_row else False
        if not is_nullable:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Schema hiện tại không cho phép MaGV = NULL nên chưa thể hủy phân công. "
                    "Bạn có thể đổi nghiệp vụ sang phân công lại giảng viên khác hoặc chỉnh schema."
                ),
            )

        cursor.execute("UPDATE LOPHOCPHAN SET MaGV = NULL WHERE MaLopHP = ?", (ma_lop_hp,))
        conn.commit()
        mark_data_changed("teacher-unassigned")
        return {"message": "Đã hủy phân công giảng viên cho lớp học phần."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=500,
            detail=(
                "Không thể hủy phân công giảng viên. "
                "Kiểm tra lại schema LOPHOCPHAN (cột MaGV có thể đang NOT NULL). "
                f"Chi tiết: {e}"
            ),
        )
    finally:
        conn.close()


@app.delete("/api/lophocphan/{ma_lop_hp}")
def delete_lop_hoc_phan(ma_lop_hp: str, current_user: dict[str, str] = Depends(require_roles("admin"))):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        lhp_lookup = "SELECT 1 FROM LOPHOCPHAN WHERE MaLopHP = ?"
        if _table_has_column(cursor, "LOPHOCPHAN", "IsDeleted"):
            lhp_lookup += " AND ISNULL(IsDeleted, 0) = 0"

        cursor.execute(lhp_lookup, (ma_lop_hp,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy lớp học phần.")

        cursor.execute("SELECT COUNT(1) FROM DANGKY WHERE MaLopHP = ?", (ma_lop_hp,))
        row = cursor.fetchone()
        registration_count = int(row[0] or 0) if row else 0
        if registration_count > 0:
            raise HTTPException(
                status_code=409,
                detail=f"Không thể xóa lớp học phần vì còn {registration_count} sinh viên đã đăng ký.",
            )

        deleted = _soft_delete_by_id(
            cursor,
            table_name="LOPHOCPHAN",
            id_column="MaLopHP",
            id_value=ma_lop_hp,
            deleted_by=current_user.get("id"),
        )
        if not deleted:
            raise HTTPException(status_code=404, detail="Không tìm thấy lớp học phần.")

        conn.commit()
        mark_data_changed("class-deleted")
        return {"message": "Xóa lớp học phần thành công (soft delete nếu schema hỗ trợ)."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể xóa lớp học phần: {e}")
    finally:
        conn.close()


@app.put("/api/lophocphan/{ma_lop_hp}/restore")
def restore_lop_hoc_phan(ma_lop_hp: str, current_user: dict[str, str] = Depends(require_roles("admin"))):
    return _restore_entity_record(
        table_name="LOPHOCPHAN",
        id_column="MaLopHP",
        id_value=ma_lop_hp,
        success_message="Khôi phục lớp học phần thành công.",
        change_event="class-restored",
    )