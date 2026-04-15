import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Calendar, 
  CheckCircle2, 
  GraduationCap, 
  LayoutDashboard, 
  Search, 
  AlertCircle,
  Trash2,
  Info,
  Clock,
  Award,
  BookMarked,
  User,
  LogOut,
  Menu,
  Eye,
  EyeOff,
  Pencil,
  RotateCcw,
  X,
  Key,
  Wallet
} from 'lucide-react';
import { toApiUrl } from './api';

// --- Mock Data ---
type Role = 'student' | 'teacher' | 'admin';

type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  maSV?: string;
  maGV?: string;
  tenSV?: string;
  tenGV?: string;
  namNhapHoc?: number;
  maLop?: string;
  lop?: string;
  chuyenNganh?: string;
  khoa?: string;
  hocVi?: string;
  dienThoai?: string;
  matKhau?: string;
  khoaQuanLy?: string;
  isDeleted?: boolean;
};

const mockPeriod = {
  maDot: 'DOT202301',
  hocKy: 1,
  namHoc: '2023-2024',
  trangThai: 'Đang mở',
};

type ClassItem = {
  maLopHP: string;
  maMon: string;
  maDot?: string;
  tenMon: string;
  soTinChi: number;
  donGiaTinChi?: number | null;
  giangVien: string;
  giangVienId?: string;
  sySoMax: number;
  daDangKy: number;
  thoiGian: string;
  tienQuyet: string[];
  loai: string;
  isDeleted?: boolean;
};

type MonHocItem = {
  MaMon: string;
  TenMon: string;
  SoTinChi: number;
  DonGiaTinChi?: number | null;
  Loai: string;
  MoTa?: string | null;
  IsDeleted?: boolean;
};

type ClassScheduleForm = {
  thu: number;
  tietBatDau: number;
  soTiet: number;
  phong: string;
};

type TeacherClassSchedule = {
  maLich: number;
  maLopHP: string;
  thu: number;
  tietBatDau: number;
  soTiet: number;
  phong: string;
};

type MonHocDependencyInfo = {
  ma_mon: string;
  has_dependencies: boolean;
  dependencies: {
    lop_hoc_phan: number;
    chuong_trinh_dao_tao: number;
    tien_quyet: number;
    ket_qua_hoc_tap: number;
  };
  total: number;
};

type CsvFileStatus = {
  file_name: string;
  dataset_key?: string | null;
  table?: string | null;
  mapped: boolean;
  imported: boolean;
  row_count: number;
  size_bytes: number;
  last_modified?: string;
};

type BangDiemItem = {
  MaSV: string;
  TenSV: string;
  TenLop?: string;
  MaMon: string;
  TenMon: string;
  SoTinChi: number;
  GiaoVienDay?: string;
  HocKy: number;
  NamHoc: number;
  LanHoc?: number;
  Diem?: number | null;
  TrangThai?: string;
};

type AdminRegistrationReport = {
  total_classes: number;
  full_classes: number;
  total_registrations: number;
  total_capacity: number;
  total_tuition_amount: number;
  fill_rate_percent: number;
};

type RegistrationHistorySemester = {
  hoc_ky: number;
  nam_hoc: number;
  total_credits: number;
  courses: Array<{
    ma_lop_hp: string;
    ma_mon: string;
    ten_mon: string;
    so_tin_chi: number;
    giang_vien: string;
    ma_dot: string;
  }>;
};

type StudentTuitionItem = {
  hoc_ky: number;
  nam_hoc: number;
  so_tin_chi: number;
  don_gia: number;
  tong_tien: number;
  trang_thai: string;
};

type StudentTuitionSummary = {
  total_amount: number;
  paid_amount: number;
  unpaid_amount: number;
};

export default function App() {
  const ITEMS_PER_PAGE = 10;
  const defaultClassScheduleForm: ClassScheduleForm = {
    thu: 2,
    tietBatDau: 1,
    soTiet: 3,
    phong: '',
  };
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem('lms_access_token'));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem('lms_refresh_token'));
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [currentView, setCurrentView] = useState<'dashboard' | 'registration' | 'results' | 'timetable' | 'manage-students' | 'manage-teachers' | 'manage-classes' | 'manage-courses' | 'teacher-schedule' | 'teacher-classes' | 'account-info'>('dashboard');
  const [activeTab, setActiveTab] = useState<'register' | 'registered'>('register');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [registered, setRegistered] = useState<string[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [bangDiemData, setBangDiemData] = useState<BangDiemItem[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<{id: number, message: string, type: 'success'|'error'}[]>([]);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showAccountPasswords, setShowAccountPasswords] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [addUserRole, setAddUserRole] = useState<'student' | 'teacher'>('student');
  const [newUserForm, setNewUserForm] = useState<Partial<User>>({});
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const [isAddClassModalOpen, setIsAddClassModalOpen] = useState(false);
  const [newClassForm, setNewClassForm] = useState<Partial<ClassItem>>({});
  const [newClassScheduleForm, setNewClassScheduleForm] = useState<ClassScheduleForm>(defaultClassScheduleForm);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [isMonHocModalOpen, setIsMonHocModalOpen] = useState(false);
  const [editingMonHocId, setEditingMonHocId] = useState<string | null>(null);
  const [monHocForm, setMonHocForm] = useState<Partial<MonHocItem>>({});
  const [monHocList, setMonHocList] = useState<MonHocItem[]>([]);
  const [isDeleteMonHocModalOpen, setIsDeleteMonHocModalOpen] = useState(false);
  const [deletingMonHoc, setDeletingMonHoc] = useState<MonHocItem | null>(null);
  const [monHocDependencyModalMode, setMonHocDependencyModalMode] = useState<'view' | 'delete'>('view');
  const [monHocDependencyInfo, setMonHocDependencyInfo] = useState<MonHocDependencyInfo | null>(null);
  const [isLoadingMonHocDependencies, setIsLoadingMonHocDependencies] = useState(false);
  const [isDeletingMonHoc, setIsDeletingMonHoc] = useState(false);
  const [registeringClassId, setRegisteringClassId] = useState<string | null>(null);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [isCsvImportModalOpen, setIsCsvImportModalOpen] = useState(false);
  const [isLoadingCsvFiles, setIsLoadingCsvFiles] = useState(false);
  const [csvFiles, setCsvFiles] = useState<CsvFileStatus[]>([]);
  const [selectedCsvFiles, setSelectedCsvFiles] = useState<string[]>([]);
  const [csvFilesError, setCsvFilesError] = useState<string | null>(null);
  const [adminReport, setAdminReport] = useState<AdminRegistrationReport | null>(null);
  const [isLoadingAdminReport, setIsLoadingAdminReport] = useState(false);
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [isLoadingRegistered, setIsLoadingRegistered] = useState(false);
  const [isLoadingBangDiem, setIsLoadingBangDiem] = useState(false);
  const [registrationHistory, setRegistrationHistory] = useState<RegistrationHistorySemester[]>([]);
  const [isLoadingRegistrationHistory, setIsLoadingRegistrationHistory] = useState(false);
  const [tuitionData, setTuitionData] = useState<StudentTuitionItem[]>([]);
  const [tuitionSummary, setTuitionSummary] = useState<StudentTuitionSummary>({
    total_amount: 0,
    paid_amount: 0,
    unpaid_amount: 0,
  });
  const [isLoadingTuition, setIsLoadingTuition] = useState(false);
  const [manageStudentsPage, setManageStudentsPage] = useState(1);
  const [manageTeachersPage, setManageTeachersPage] = useState(1);
  const [manageCoursesPage, setManageCoursesPage] = useState(1);
  const [selectedTeacherClassId, setSelectedTeacherClassId] = useState<string>('');
  const [teacherSchedules, setTeacherSchedules] = useState<TeacherClassSchedule[]>([]);
  const [teacherScheduleForm, setTeacherScheduleForm] = useState<ClassScheduleForm>(defaultClassScheduleForm);
  const [teacherScheduleId, setTeacherScheduleId] = useState<number | null>(null);
  const [isLoadingTeacherSchedule, setIsLoadingTeacherSchedule] = useState(false);
  const [isSavingTeacherSchedule, setIsSavingTeacherSchedule] = useState(false);
  const [defaultTuitionPerCredit, setDefaultTuitionPerCredit] = useState<number>(700000);
  const [defaultTuitionDraft, setDefaultTuitionDraft] = useState<string>('700000');
  const [isSavingDefaultTuition, setIsSavingDefaultTuition] = useState(false);
  const [teacherCourseTuitionDraft, setTeacherCourseTuitionDraft] = useState<string>('');
  const [isSavingTeacherCourseTuition, setIsSavingTeacherCourseTuition] = useState(false);
  const [teacherTimetableDayFilter, setTeacherTimetableDayFilter] = useState<number | 'all'>('all');
  const [teacherTimetableClassFilter, setTeacherTimetableClassFilter] = useState<string>('all');
  const [showInactiveRecords, setShowInactiveRecords] = useState(false);
  const isRefreshingViewDataRef = useRef(false);
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null);
  const authTokenRef = useRef<string | null>(authToken);
  const refreshTokenRef = useRef<string | null>(refreshToken);

  useEffect(() => {
    authTokenRef.current = authToken;
  }, [authToken]);

  useEffect(() => {
    refreshTokenRef.current = refreshToken;
  }, [refreshToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search.trim().toLowerCase());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    const studentCount = usersList.filter((u) => u.role === 'student').length;
    const teacherCount = usersList.filter((u) => u.role === 'teacher').length;
    const maxStudentPage = Math.max(1, Math.ceil(studentCount / ITEMS_PER_PAGE));
    const maxTeacherPage = Math.max(1, Math.ceil(teacherCount / ITEMS_PER_PAGE));
    const maxCoursePage = Math.max(1, Math.ceil(monHocList.length / ITEMS_PER_PAGE));

    setManageStudentsPage((prev) => Math.min(prev, maxStudentPage));
    setManageTeachersPage((prev) => Math.min(prev, maxTeacherPage));
    setManageCoursesPage((prev) => Math.min(prev, maxCoursePage));
  }, [usersList, monHocList, ITEMS_PER_PAGE]);

  const clearAuthSession = useCallback(() => {
    localStorage.removeItem('lms_access_token');
    localStorage.removeItem('lms_refresh_token');
    authTokenRef.current = null;
    refreshTokenRef.current = null;
    setAuthToken(null);
    setRefreshToken(null);
    setIsAuthenticated(false);
    setCurrentUser(null);
    setUserRole(null);
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const currentRefreshToken = refreshTokenRef.current;

    if (!currentRefreshToken) {
      clearAuthSession();
      return null;
    }

    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const refreshPromise = (async () => {
      try {
        const response = await fetch(toApiUrl('/api/auth/refresh'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh_token: currentRefreshToken }),
        });

        if (!response.ok) {
          if (refreshTokenRef.current === currentRefreshToken) {
            clearAuthSession();
          }
          return null;
        }

        const payload = await response.json();
        const nextAccessToken = typeof payload?.access_token === 'string' ? payload.access_token : '';
        const nextRefreshToken = typeof payload?.refresh_token === 'string' ? payload.refresh_token : '';

        if (!nextAccessToken) {
          if (refreshTokenRef.current === currentRefreshToken) {
            clearAuthSession();
          }
          return null;
        }

        localStorage.setItem('lms_access_token', nextAccessToken);
        authTokenRef.current = nextAccessToken;
        setAuthToken(nextAccessToken);

        if (nextRefreshToken) {
          localStorage.setItem('lms_refresh_token', nextRefreshToken);
          refreshTokenRef.current = nextRefreshToken;
          setRefreshToken(nextRefreshToken);
        }

        return nextAccessToken;
      } catch (error) {
        if (refreshTokenRef.current === currentRefreshToken) {
          clearAuthSession();
        }
        return null;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = refreshPromise;
    return refreshPromise;
  }, [clearAuthSession]);

  const apiFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers || {});
    const currentAccessToken = authTokenRef.current;
    if (currentAccessToken) {
      headers.set('Authorization', `Bearer ${currentAccessToken}`);
    }

    const url = typeof input === 'string' ? toApiUrl(input) : input;

    let response = await fetch(url, {
      ...init,
      headers,
    });

    if (response.status === 401 && authTokenRef.current) {
      const nextAccessToken = await refreshAccessToken();
      if (nextAccessToken) {
        const retryHeaders = new Headers(init?.headers || {});
        retryHeaders.set('Authorization', `Bearer ${nextAccessToken}`);
        response = await fetch(url, {
          ...init,
          headers: retryHeaders,
        });
      }
    }

    return response;
  }, [refreshAccessToken]);

  useEffect(() => {
    let cancelled = false;

    const bootstrapAuth = async () => {
      if (!authToken) {
        setAuthReady(true);
        return;
      }

      try {
        const response = await fetch(toApiUrl('/api/auth/me'), {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
          cache: 'no-store',
        });

        if (!response.ok) {
          const nextAccessToken = await refreshAccessToken();
          if (cancelled) {
            return;
          }
          if (!nextAccessToken) {
            setAuthReady(true);
            return;
          }

          const retryResponse = await fetch(toApiUrl('/api/auth/me'), {
            headers: {
              Authorization: `Bearer ${nextAccessToken}`,
            },
            cache: 'no-store',
          });

          if (!retryResponse.ok) {
            if (!cancelled) {
              clearAuthSession();
            }
            setAuthReady(true);
            return;
          }

          const retryPayload = await retryResponse.json();
          if (cancelled) {
            return;
          }
          const retryRole = retryPayload?.user?.role as Role | undefined;
          if (!retryPayload?.user?.id || !retryRole) {
            if (!cancelled) {
              clearAuthSession();
            }
            setAuthReady(true);
            return;
          }

          setCurrentUser(retryPayload.user as User);
          setUserRole(retryRole);
          setIsAuthenticated(true);
          setAuthReady(true);
          return;
        }

        const payload = await response.json();
        if (cancelled) {
          return;
        }
        const role = payload?.user?.role as Role | undefined;
        if (!payload?.user?.id || !role) {
          if (!cancelled) {
            clearAuthSession();
          }
          setAuthReady(true);
          return;
        }

        setCurrentUser(payload.user as User);
        setUserRole(role);
        setIsAuthenticated(true);
      } catch (error) {
        if (!cancelled) {
          clearAuthSession();
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    };

    void bootstrapAuth();

    return () => {
      cancelled = true;
    };
  }, [authToken, clearAuthSession, refreshAccessToken]);

  const loadUsersFromBackend = async (options?: { includeInactive?: boolean }) => {
    try {
      const query = options?.includeInactive ? '?include_inactive=true' : '';
      const [studentsRes, teachersRes] = await Promise.all([
        apiFetch(`/api/sinhvien${query}`, { cache: 'no-store' }),
        apiFetch(`/api/giaovien${query}`, { cache: 'no-store' }),
      ]);

      if (!studentsRes.ok || !teachersRes.ok) {
        return;
      }

      const studentsPayload = await studentsRes.json();
      const teachersPayload = await teachersRes.json();
      const studentsFromApi = Array.isArray(studentsPayload?.data) ? studentsPayload.data : [];
      const teachersFromApi = Array.isArray(teachersPayload?.data) ? teachersPayload.data : [];

      const students: User[] = studentsFromApi
        .filter((u: any) => u?.MaSV && u?.TenSV && u?.Email)
        .map((u: any) => ({
          id: String(u.MaSV),
          email: String(u.Email),
          name: String(u.TenSV),
          role: 'student',
          maSV: String(u.MaSV),
          tenSV: String(u.TenSV),
          namNhapHoc: Number.isFinite(Number(u?.NamNhapHoc)) ? Number(u.NamNhapHoc) : undefined,
          maLop: u?.MaLop ? String(u.MaLop) : undefined,
          lop: u?.MaLop ? String(u.MaLop) : undefined,
          chuyenNganh: u?.ChuyenNganh ? String(u.ChuyenNganh) : undefined,
          khoa: u?.Khoa ? String(u.Khoa) : undefined,
          dienThoai: u?.DienThoai ? String(u.DienThoai) : undefined,
          matKhau: u?.MatKhau ? String(u.MatKhau) : undefined,
          isDeleted: Boolean(u?.IsDeleted),
        }));

      const teachers: User[] = teachersFromApi
        .filter((u: any) => u?.MaGV && u?.TenGV && u?.Email)
        .map((u: any) => ({
          id: String(u.MaGV),
          email: String(u.Email),
          name: String(u.TenGV),
          role: 'teacher',
          maGV: String(u.MaGV),
          tenGV: String(u.TenGV),
          chuyenNganh: u?.ChuyenNganh ? String(u.ChuyenNganh) : undefined,
          khoa: u?.Khoa ? String(u.Khoa) : undefined,
          hocVi: u?.HocVi ? String(u.HocVi) : undefined,
          dienThoai: u?.DienThoai ? String(u.DienThoai) : undefined,
          matKhau: u?.MatKhau ? String(u.MatKhau) : undefined,
          khoaQuanLy: u?.Khoa ? String(u.Khoa) : undefined,
          isDeleted: Boolean(u?.IsDeleted),
        }));

      const normalized: User[] = [...students, ...teachers];

      setUsersList(normalized);
    } catch (error) {
      console.error('Không tải được danh sách người dùng từ backend:', error);
    }
  };

  const loadMonHocFromBackend = async (options?: { includeInactive?: boolean }) => {
    try {
      const query = options?.includeInactive ? '?include_inactive=true' : '';
      const response = await apiFetch(`/api/monhoc${query}`, { cache: 'no-store' });
      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      const fromApi = Array.isArray(payload?.data) ? payload.data : [];
      const normalized: MonHocItem[] = fromApi
        .filter((m: any) => m?.MaMon && m?.TenMon)
        .map((m: any) => ({
          MaMon: String(m.MaMon),
          TenMon: String(m.TenMon),
          SoTinChi: Number(m.SoTinChi) || 0,
          DonGiaTinChi: m?.DonGiaTinChi === null || m?.DonGiaTinChi === undefined ? null : Number(m.DonGiaTinChi),
          Loai: String(m.Loai || 'Bat buoc'),
          MoTa: m?.MoTa ? String(m.MoTa) : null,
          IsDeleted: Boolean(m?.IsDeleted),
        }));

      setMonHocList(normalized);
    } catch (error) {
      console.error('Không tải được danh sách môn học từ backend:', error);
    }
  };

  const loadClassesFromBackend = async (options?: { onlyOpen?: boolean; includeInactive?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.onlyOpen) {
      params.set('only_open', 'true');
    }
    if (options?.includeInactive) {
      params.set('include_inactive', 'true');
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    setIsLoadingClasses(true);
    try {
      const response = await apiFetch(`/api/lophocphan${query}`, { cache: 'no-store' });
      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      const fromApi = Array.isArray(payload?.data) ? payload.data : [];
      const normalized: ClassItem[] = fromApi
        .filter((c: any) => c?.maLopHP && c?.maMon)
        .map((c: any) => ({
          maLopHP: String(c.maLopHP),
          maMon: String(c.maMon),
          maDot: c?.maDot ? String(c.maDot) : undefined,
          tenMon: String(c.tenMon || c.maMon),
          soTinChi: Number(c.soTinChi) || 0,
          donGiaTinChi: c?.donGiaTinChi === null || c?.donGiaTinChi === undefined ? null : Number(c.donGiaTinChi),
          giangVien: c?.giangVien ? String(c.giangVien) : '',
          giangVienId: c?.giangVienId ? String(c.giangVienId) : undefined,
          sySoMax: Number(c.sySoMax) || 0,
          daDangKy: Number(c.daDangKy) || 0,
          thoiGian: c?.thoiGian ? String(c.thoiGian) : 'Chua xep lich',
          tienQuyet: Array.isArray(c?.tienQuyet) ? c.tienQuyet.map((item: any) => String(item)) : [],
          loai: c?.loai ? String(c.loai) : 'Bat buoc',
          isDeleted: Boolean(c?.isDeleted),
        }));

      setClasses(normalized);
    } catch (error) {
      console.error('Không tải được danh sách lớp học phần từ backend:', error);
    } finally {
      setIsLoadingClasses(false);
    }
  };

  const loadRegisteredFromBackend = async (maSv: string) => {
    setIsLoadingRegistered(true);
    try {
      const response = await apiFetch(`/api/sinhvien/${encodeURIComponent(maSv)}/dangky`, { cache: 'no-store' });
      if (!response.ok) {
        setRegistered([]);
        return;
      }

      const payload = await response.json();
      const fromApi = Array.isArray(payload?.data) ? payload.data : [];
      setRegistered(fromApi.map((value: any) => String(value)));
    } catch (error) {
      console.error('Không tải được danh sách lớp đã đăng ký:', error);
      setRegistered([]);
    } finally {
      setIsLoadingRegistered(false);
    }
  };

  const loadBangDiemFromBackend = async (maSv: string) => {
    setIsLoadingBangDiem(true);
    try {
      const response = await apiFetch(`/api/bangdiem/${encodeURIComponent(maSv)}`, { cache: 'no-store' });
      if (!response.ok) {
        setBangDiemData([]);
        return;
      }

      const payload = await response.json();
      const fromApi = Array.isArray(payload?.data) ? payload.data : [];
      const normalized: BangDiemItem[] = fromApi.map((row: any) => ({
        MaSV: String(row?.MaSV || maSv),
        TenSV: String(row?.TenSV || ''),
        TenLop: row?.TenLop ? String(row.TenLop) : undefined,
        MaMon: String(row?.MaMon || ''),
        TenMon: String(row?.TenMon || ''),
        SoTinChi: Number(row?.SoTinChi) || 0,
        GiaoVienDay: row?.GiaoVienDay ? String(row.GiaoVienDay) : undefined,
        HocKy: Number(row?.HocKy) || 0,
        NamHoc: Number(row?.NamHoc) || 0,
        LanHoc: Number(row?.LanHoc) || 1,
        Diem: row?.Diem === null || row?.Diem === undefined ? null : Number(row.Diem),
        TrangThai: row?.TrangThai ? String(row.TrangThai) : undefined,
      }));
      setBangDiemData(normalized);
    } catch (error) {
      console.error('Không tải được bảng điểm từ backend:', error);
      setBangDiemData([]);
    } finally {
      setIsLoadingBangDiem(false);
    }
  };

  const loadRegistrationHistoryFromBackend = async (maSv: string) => {
    setIsLoadingRegistrationHistory(true);
    try {
      const response = await apiFetch(`/api/sinhvien/${encodeURIComponent(maSv)}/dangky-lichsu`, { cache: 'no-store' });
      if (!response.ok) {
        setRegistrationHistory([]);
        return;
      }

      const payload = await response.json();
      const fromApi = Array.isArray(payload?.data) ? payload.data : [];
      const normalized: RegistrationHistorySemester[] = fromApi.map((semester: any) => ({
        hoc_ky: Number(semester?.hoc_ky) || 0,
        nam_hoc: Number(semester?.nam_hoc) || 0,
        total_credits: Number(semester?.total_credits) || 0,
        courses: Array.isArray(semester?.courses)
          ? semester.courses.map((course: any) => ({
              ma_lop_hp: String(course?.ma_lop_hp || ''),
              ma_mon: String(course?.ma_mon || ''),
              ten_mon: String(course?.ten_mon || ''),
              so_tin_chi: Number(course?.so_tin_chi) || 0,
              giang_vien: String(course?.giang_vien || ''),
              ma_dot: String(course?.ma_dot || ''),
            }))
          : [],
      }));

      setRegistrationHistory(normalized);
    } catch (error) {
      console.error('Không tải được lịch sử đăng ký:', error);
      setRegistrationHistory([]);
    } finally {
      setIsLoadingRegistrationHistory(false);
    }
  };

  const loadTuitionFromBackend = async () => {
    if (userRole !== 'student') {
      setTuitionData([]);
      setTuitionSummary({ total_amount: 0, paid_amount: 0, unpaid_amount: 0 });
      return;
    }

    setIsLoadingTuition(true);
    try {
      const response = await apiFetch('/api/sinhvien/me/hoc-phi', { cache: 'no-store' });
      if (!response.ok) {
        setTuitionData([]);
        setTuitionSummary({ total_amount: 0, paid_amount: 0, unpaid_amount: 0 });
        return;
      }

      const payload = await response.json();
      const list = Array.isArray(payload?.data) ? payload.data : [];
      const normalized: StudentTuitionItem[] = list.map((item: any) => ({
        hoc_ky: Number(item?.hoc_ky) || 0,
        nam_hoc: Number(item?.nam_hoc) || 0,
        so_tin_chi: Number(item?.so_tin_chi) || 0,
        don_gia: Number(item?.don_gia) || 0,
        tong_tien: Number(item?.tong_tien) || 0,
        trang_thai: String(item?.trang_thai || ''),
      }));

      const summary = payload?.summary || {};
      setTuitionData(normalized);
      setTuitionSummary({
        total_amount: Number(summary?.total_amount) || 0,
        paid_amount: Number(summary?.paid_amount) || 0,
        unpaid_amount: Number(summary?.unpaid_amount) || 0,
      });
    } catch (error) {
      console.error('Không tải được học phí từ backend:', error);
      setTuitionData([]);
      setTuitionSummary({ total_amount: 0, paid_amount: 0, unpaid_amount: 0 });
    } finally {
      setIsLoadingTuition(false);
    }
  };

  const loadCsvFilesStatus = async () => {
    setIsLoadingCsvFiles(true);
    setCsvFilesError(null);
    try {
      const response = await apiFetch('/api/admin/csv-files', { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok) {
        const detail = typeof payload?.detail === 'string' ? payload.detail : 'Không tải được danh sách file CSV.';
        setCsvFilesError(detail);
        showNotification(detail, 'error');
        return;
      }

      const files = Array.isArray(payload?.data) ? payload.data as CsvFileStatus[] : [];
      setCsvFiles(files);
      setSelectedCsvFiles(files.filter(file => file.mapped && !file.imported).map(file => file.file_name));

      if (payload?.db_connected === false) {
        const dbDetail = typeof payload?.db_error === 'string' ? payload.db_error : 'Không thể kết nối SQL Server.';
        setCsvFilesError(`Đã đọc được file CSV nhưng chưa kiểm tra được trạng thái import: ${dbDetail}`);
      }
    } catch (error) {
      console.error('Lỗi lấy danh sách CSV:', error);
      setCsvFilesError('Không thể kết nối backend. Vui lòng đảm bảo backend đang chạy ở cổng 8000.');
      showNotification('Không thể kết nối backend để lấy danh sách CSV.', 'error');
    } finally {
      setIsLoadingCsvFiles(false);
    }
  };

  const loadAdminRegistrationReport = async () => {
    if (userRole !== 'admin') {
      setAdminReport(null);
      return;
    }

    setIsLoadingAdminReport(true);
    try {
      const response = await apiFetch('/api/admin/reports/registration-summary', { cache: 'no-store' });
      if (!response.ok) {
        setAdminReport(null);
        return;
      }

      const payload = await response.json();
      const data = payload?.data;
      if (!data) {
        setAdminReport(null);
        return;
      }

      setAdminReport({
        total_classes: Number(data.total_classes) || 0,
        full_classes: Number(data.full_classes) || 0,
        total_registrations: Number(data.total_registrations) || 0,
        total_capacity: Number(data.total_capacity) || 0,
        total_tuition_amount: Number(data.total_tuition_amount) || 0,
        fill_rate_percent: Number(data.fill_rate_percent) || 0,
      });
    } catch (error) {
      setAdminReport(null);
    } finally {
      setIsLoadingAdminReport(false);
    }
  };

  const loadTuitionSettingsFromBackend = async () => {
    if (!userRole) {
      return;
    }

    try {
      const response = await apiFetch('/api/tuition/settings', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      const value = Number(payload?.data?.don_gia_mac_dinh) || 700000;
      setDefaultTuitionPerCredit(value);
      setDefaultTuitionDraft(String(Math.round(value)));
    } catch (error) {
      console.error('Không tải được cấu hình học phí:', error);
    }
  };

  const handleSaveDefaultTuition = async () => {
    if (userRole !== 'admin') {
      return;
    }

    const value = Number(defaultTuitionDraft);
    if (!Number.isFinite(value) || value <= 0) {
      showNotification('Đơn giá mặc định phải lớn hơn 0.', 'error');
      return;
    }

    setIsSavingDefaultTuition(true);
    try {
      const response = await apiFetch('/api/admin/tuition/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ DonGiaMacDinh: value }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof result?.detail === 'string' ? result.detail : 'Không thể cập nhật đơn giá mặc định.';
        showNotification(detail, 'error');
        return;
      }

      setDefaultTuitionPerCredit(value);
      setDefaultTuitionDraft(String(Math.round(value)));
      await loadAdminRegistrationReport();
      showNotification('Đã cập nhật đơn giá mặc định theo tín chỉ.', 'success');
    } catch (error) {
      console.error('Lỗi cập nhật đơn giá mặc định:', error);
      showNotification('Không thể kết nối backend để cập nhật đơn giá mặc định.', 'error');
    } finally {
      setIsSavingDefaultTuition(false);
    }
  };

  const handleSaveTeacherCourseTuition = async () => {
    if (userRole !== 'teacher') {
      return;
    }

    const selectedClass = classes.find((cls) => cls.maLopHP === selectedTeacherClassId);
    if (!selectedClass) {
      showNotification('Vui lòng chọn lớp học phần để cập nhật đơn giá.', 'error');
      return;
    }

    const raw = teacherCourseTuitionDraft.trim();
    const value = raw.length === 0 ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      showNotification('Đơn giá môn học phải lớn hơn 0.', 'error');
      return;
    }

    setIsSavingTeacherCourseTuition(true);
    try {
      const response = await apiFetch(`/api/teacher/monhoc/${encodeURIComponent(selectedClass.maMon)}/don-gia`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ DonGiaTinChi: value }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof result?.detail === 'string' ? result.detail : 'Không thể cập nhật đơn giá môn học.';
        showNotification(detail, 'error');
        return;
      }

      await loadClassesFromBackend();
      showNotification('Đã cập nhật đơn giá môn học.', 'success');
    } catch (error) {
      console.error('Lỗi cập nhật đơn giá môn học:', error);
      showNotification('Không thể kết nối backend để cập nhật đơn giá môn học.', 'error');
    } finally {
      setIsSavingTeacherCourseTuition(false);
    }
  };

  const handleImportCsv = async () => {
    if (isImportingCsv || isLoadingCsvFiles) {
      return;
    }

    setIsCsvImportModalOpen(true);
    await loadCsvFilesStatus();
  };

  const toggleCsvSelection = (fileName: string) => {
    setSelectedCsvFiles(prev => {
      if (prev.includes(fileName)) {
        return prev.filter(name => name !== fileName);
      }
      return [...prev, fileName];
    });
  };

  const handleImportSelectedCsv = async () => {
    if (isImportingCsv || selectedCsvFiles.length === 0) {
      return;
    }

    setIsImportingCsv(true);
    try {
      const response = await apiFetch('/api/admin/import-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clear_existing: false, files: selectedCsvFiles }),
      });

      const payload = await response.json();
      if (!response.ok) {
        const detail = typeof payload?.detail === 'string' ? payload.detail : 'Import CSV thất bại.';
        showNotification(detail, 'error');
        return;
      }

      const imported = payload?.imported ?? {};
      showNotification(
        `Import thành công - GV: ${imported.giaovien ?? 0}, MH: ${imported.monhoc ?? 0}, SV: ${imported.sinhvien ?? 0}`,
        'success'
      );
      await loadUsersFromBackend();
      await loadMonHocFromBackend();
      await loadClassesFromBackend();
      await loadCsvFilesStatus();
    } catch (error) {
      console.error('Lỗi import CSV:', error);
      showNotification('Không thể kết nối backend để import CSV.', 'error');
    } finally {
      setIsImportingCsv(false);
    }
  };

  const refreshDataForCurrentView = useCallback(async () => {
    if (!isAuthenticated || !currentUser || !userRole) {
      return;
    }

    if (isRefreshingViewDataRef.current) {
      return;
    }

    isRefreshingViewDataRef.current = true;

    try {
      if (currentView === 'registration') {
        await Promise.all([
          loadClassesFromBackend({ onlyOpen: true }),
          loadRegisteredFromBackend(currentUser.id),
          loadRegistrationHistoryFromBackend(currentUser.id),
        ]);
        return;
      }

      if (currentView === 'results') {
        await loadBangDiemFromBackend(currentUser.id);
        return;
      }

      if (currentView === 'timetable') {
        if (userRole === 'student') {
          await Promise.all([
            loadClassesFromBackend({ onlyOpen: true }),
            loadRegisteredFromBackend(currentUser.id),
          ]);
        } else {
          await loadClassesFromBackend();
        }
        return;
      }

      if (currentView === 'teacher-schedule' || currentView === 'teacher-classes') {
        await Promise.all([
          loadClassesFromBackend(),
          loadTuitionSettingsFromBackend(),
        ]);
        return;
      }

      if (currentView === 'manage-students' || currentView === 'manage-teachers') {
        await loadUsersFromBackend({ includeInactive: showInactiveRecords });
        return;
      }

      if (currentView === 'manage-classes') {
        await Promise.all([
          loadClassesFromBackend(),
          loadMonHocFromBackend({ includeInactive: showInactiveRecords }),
          loadUsersFromBackend({ includeInactive: showInactiveRecords }),
        ]);
        return;
      }

      if (currentView === 'manage-courses') {
        await Promise.all([
          loadMonHocFromBackend({ includeInactive: showInactiveRecords }),
          loadClassesFromBackend({ includeInactive: showInactiveRecords }),
          loadTuitionSettingsFromBackend(),
        ]);
        return;
      }

      if (currentView === 'account-info') {
        await loadUsersFromBackend();
        return;
      }

      if (currentView === 'dashboard') {
        if (userRole === 'student') {
          await Promise.all([
            loadClassesFromBackend({ onlyOpen: true }),
            loadRegisteredFromBackend(currentUser.id),
            loadBangDiemFromBackend(currentUser.id),
            loadRegistrationHistoryFromBackend(currentUser.id),
            loadTuitionFromBackend(),
          ]);
        } else {
          const promises = [
            loadClassesFromBackend(),
            loadUsersFromBackend(),
            loadMonHocFromBackend(),
          ];
          if (userRole === 'admin') {
            promises.push(loadAdminRegistrationReport());
          }
          await Promise.all(promises);
        }
      }
    } catch (error) {
      console.error('Lỗi làm mới dữ liệu theo màn hình:', error);
    } finally {
      isRefreshingViewDataRef.current = false;
    }
  }, [isAuthenticated, currentUser, userRole, currentView, showInactiveRecords]);

  useEffect(() => {
    void refreshDataForCurrentView();
  }, [refreshDataForCurrentView]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser || !userRole) {
      return;
    }

    const refreshIntervalMs = (() => {
      // Poll nhanh hơn cho các màn hình có dữ liệu biến động cao.
      if (currentView === 'registration' || currentView === 'teacher-classes') {
        return 5000;
      }

      if (currentView === 'dashboard' && userRole === 'student') {
        return 5000;
      }

      if (currentView === 'timetable' || currentView === 'teacher-schedule' || currentView === 'manage-classes') {
        return 10000;
      }

      return 20000;
    })();

    const intervalId = window.setInterval(() => {
      void refreshDataForCurrentView();
    }, refreshIntervalMs);

    const handleWindowFocus = () => {
      void refreshDataForCurrentView();
    };

    const handleNetworkOnline = () => {
      void refreshDataForCurrentView();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshDataForCurrentView();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('online', handleNetworkOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('online', handleNetworkOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, currentUser, userRole, currentView, refreshDataForCurrentView]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser || !userRole) {
      return;
    }

    const eventSource = new EventSource(toApiUrl('/api/events/stream'));

    const handleDataChange = () => {
      void refreshDataForCurrentView();
    };

    eventSource.addEventListener('data-change', handleDataChange);
    eventSource.onerror = () => {
      // EventSource tự reconnect, giữ onerror im lặng để tránh spam log.
    };

    return () => {
      eventSource.removeEventListener('data-change', handleDataChange);
      eventSource.close();
    };
  }, [isAuthenticated, currentUser, userRole, refreshDataForCurrentView]);

  const showNotification = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailInput = loginEmail.trim().toLowerCase();
    const passwordInput = loginPassword.trim();
    if (!emailInput || !passwordInput) {
      setLoginError('Vui lòng nhập email và mật khẩu.');
      return;
    }

    try {
      const response = await fetch(toApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: emailInput,
          password: passwordInput,
        }),
      });

      if (response.ok) {
        const payload = await response.json();
        const accessToken = typeof payload?.access_token === 'string' ? payload.access_token : '';
        const nextRefreshToken = typeof payload?.refresh_token === 'string' ? payload.refresh_token : '';
        const user = payload?.user as User | undefined;
        if (!accessToken || !user?.id || !user?.role) {
          setLoginError('Dữ liệu đăng nhập từ server không hợp lệ.');
          return;
        }

        localStorage.setItem('lms_access_token', accessToken);
        authTokenRef.current = accessToken;
        if (nextRefreshToken) {
          localStorage.setItem('lms_refresh_token', nextRefreshToken);
          refreshTokenRef.current = nextRefreshToken;
          setRefreshToken(nextRefreshToken);
        } else {
          localStorage.removeItem('lms_refresh_token');
          refreshTokenRef.current = null;
          setRefreshToken(null);
        }
        setAuthToken(accessToken);
        setCurrentUser(user);
        setUserRole(user.role);
        setIsAuthenticated(true);
        setLoginError('');
        setCurrentView('dashboard');

        if (user.role === 'student') {
          await Promise.all([
            loadClassesFromBackend({ onlyOpen: true }),
            loadRegisteredFromBackend(user.id),
            loadBangDiemFromBackend(user.id),
            loadRegistrationHistoryFromBackend(user.id),
          ]);
        } else {
          setRegistered([]);
          setBangDiemData([]);
          setRegistrationHistory([]);
          await loadClassesFromBackend();
        }
        return;
      }

      const result = await response.json().catch(() => ({}));
      const detail = typeof result?.detail === 'string' ? result.detail : 'Tài khoản hoặc mật khẩu không chính xác.';
      setLoginError(detail);
    } catch (error) {
      console.error('Lỗi đăng nhập:', error);
      setLoginError('Không thể kết nối backend để đăng nhập.');
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    setLoginEmail('');
    setLoginPassword('');
    setRegistered([]);
    setBangDiemData([]);
    setRegistrationHistory([]);
    setCurrentView('dashboard');
  };

  const handleEditUser = (user: User) => {
    if (user.role === 'admin') {
      return;
    }

    setAddUserRole(user.role);
    setEditingUserId(user.id);
    setNewUserForm({
      id: user.id,
      name: user.name,
      email: user.email,
      namNhapHoc: user.namNhapHoc,
      maLop: user.maLop || user.lop,
      chuyenNganh: user.chuyenNganh,
      khoa: user.khoa,
      hocVi: user.hocVi,
      dienThoai: user.dienThoai,
      matKhau: user.matKhau,
      khoaQuanLy: user.khoaQuanLy,
    });
    setIsAddUserModalOpen(true);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEditing = editingUserId !== null;

    if (!newUserForm.id || !newUserForm.name || !newUserForm.email) {
      showNotification('Vui lòng điền đầy đủ thông tin bắt buộc', 'error');
      return;
    }
    
    if (!isEditing && usersList.some(u => u.id === newUserForm.id)) {
      showNotification('Mã số đã tồn tại', 'error');
      return;
    }

    try {
      const endpoint = addUserRole === 'student'
        ? (isEditing ? `/api/sinhvien/${encodeURIComponent(editingUserId || newUserForm.id)}` : '/api/sinhvien')
        : (isEditing ? `/api/giaovien/${encodeURIComponent(editingUserId || newUserForm.id)}` : '/api/giaovien');

      const payload = addUserRole === 'student'
        ? {
            MaSV: editingUserId || newUserForm.id,
            TenSV: newUserForm.name,
            NamNhapHoc: newUserForm.namNhapHoc || new Date().getFullYear(),
            ChuyenNganh: newUserForm.chuyenNganh || null,
            MaLop: newUserForm.maLop || null,
            Khoa: newUserForm.khoa || null,
            Email: newUserForm.email,
            DienThoai: newUserForm.dienThoai || null,
            MatKhau: newUserForm.matKhau || newUserForm.id,
          }
        : {
            MaGV: editingUserId || newUserForm.id,
            TenGV: newUserForm.name,
            ChuyenNganh: newUserForm.chuyenNganh || null,
            HocVi: newUserForm.hocVi || null,
            Khoa: newUserForm.khoa || newUserForm.khoaQuanLy || null,
            Email: newUserForm.email,
            DienThoai: newUserForm.dienThoai || null,
            MatKhau: newUserForm.matKhau || newUserForm.id,
          };

      const response = await apiFetch(endpoint, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        const detail = typeof result?.detail === 'string' ? result.detail : 'Không thể thêm người dùng.';
        showNotification(detail, 'error');
        return;
      }

      await loadUsersFromBackend();
      setIsAddUserModalOpen(false);
      setNewUserForm({});
      setEditingUserId(null);
      showNotification(`${isEditing ? 'Đã cập nhật' : 'Đã thêm'} ${addUserRole === 'student' ? 'sinh viên' : 'giảng viên'} thành công`, 'success');
    } catch (error) {
      console.error('Lỗi thêm người dùng:', error);
      showNotification('Không thể kết nối backend để thêm người dùng.', 'error');
    }
  };

  const handleEditClass = (cls: ClassItem) => {
    const firstScheduleMatch = cls.thoiGian.match(/(?:Thứ|Thu)\s*(\d)\s*(?:Tiết|Tiet)\s*(\d+)-(\d+)/i);
    if (firstScheduleMatch) {
      const parsedThu = Number(firstScheduleMatch[1]);
      const parsedTietBatDau = Number(firstScheduleMatch[2]);
      const parsedTietKetThuc = Number(firstScheduleMatch[3]);
      setNewClassScheduleForm({
        thu: parsedThu,
        tietBatDau: parsedTietBatDau,
        soTiet: Math.max(1, parsedTietKetThuc - parsedTietBatDau + 1),
        phong: '',
      });
    } else {
      setNewClassScheduleForm(defaultClassScheduleForm);
    }

    setEditingClassId(cls.maLopHP);
    setNewClassForm({
      ...cls,
      tienQuyet: cls.tienQuyet.join(', ') as unknown as string[],
    });
    setIsAddClassModalOpen(true);
  };

  const handleClassMaMonChange = (rawValue: string) => {
    const value = rawValue.trim();
    const matchedMonHoc = monHocList.find(monHoc => monHoc.MaMon.toLowerCase() === value.toLowerCase());

    setNewClassForm(prev => ({
      ...prev,
      maMon: rawValue,
      tenMon: matchedMonHoc ? matchedMonHoc.TenMon : prev.tenMon,
      soTinChi: matchedMonHoc ? matchedMonHoc.SoTinChi : prev.soTinChi,
      loai: matchedMonHoc ? matchedMonHoc.Loai : prev.loai,
    }));
  };

  const handleClassTeacherIdChange = (rawValue: string) => {
    const value = rawValue.trim();
    const matchedTeacher = usersList.find(
      user => user.role === 'teacher' && user.id.toLowerCase() === value.toLowerCase()
    );

    setNewClassForm(prev => ({
      ...prev,
      giangVienId: rawValue,
      giangVien: matchedTeacher ? matchedTeacher.name : prev.giangVien,
    }));
  };

  const handleClassTeacherNameChange = (rawValue: string) => {
    const value = rawValue.trim();
    const matchedTeacher = usersList.find(
      user => user.role === 'teacher' && user.name.toLowerCase() === value.toLowerCase()
    );

    setNewClassForm(prev => ({
      ...prev,
      giangVien: rawValue,
      giangVienId: matchedTeacher ? matchedTeacher.id : prev.giangVienId,
    }));
  };

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEditing = editingClassId !== null;

    if (!newClassForm.maLopHP || !newClassForm.maMon || !newClassForm.tenMon) {
      showNotification('Vui lòng điền đầy đủ thông tin bắt buộc', 'error');
      return;
    }

    if (!newClassForm.giangVienId) {
      showNotification('Vui lòng nhập Mã GV hợp lệ để lưu lớp học phần vào hệ thống.', 'error');
      return;
    }

    if (!isEditing && classes.some(c => c.maLopHP === newClassForm.maLopHP)) {
      showNotification('Mã lớp học phần đã tồn tại', 'error');
      return;
    }

    const thu = Number(newClassScheduleForm.thu);
    const tietBatDau = Number(newClassScheduleForm.tietBatDau);
    const soTiet = Number(newClassScheduleForm.soTiet);

    if (!isEditing) {
      if (thu < 2 || thu > 7) {
        showNotification('Thứ phải trong khoảng 2 đến 7.', 'error');
        return;
      }

      if (tietBatDau < 1 || tietBatDau > 14) {
        showNotification('Tiết bắt đầu phải trong khoảng 1 đến 14.', 'error');
        return;
      }

      if (soTiet < 1 || soTiet > 6) {
        showNotification('Số tiết phải trong khoảng 1 đến 6.', 'error');
        return;
      }

      if (tietBatDau + soTiet - 1 > 14) {
        showNotification('Tiết kết thúc không được vượt quá 14.', 'error');
        return;
      }
    }

    const newClass: ClassItem = {
      maLopHP: newClassForm.maLopHP,
      maMon: newClassForm.maMon,
      tenMon: newClassForm.tenMon,
      soTinChi: Number(newClassForm.soTinChi) || 3,
      giangVien: newClassForm.giangVien || '',
      giangVienId: newClassForm.giangVienId || '',
      sySoMax: Number(newClassForm.sySoMax) || 60,
      daDangKy: Number(newClassForm.daDangKy) || 0,
      thoiGian: `Thu ${thu} Tiet ${tietBatDau}-${tietBatDau + soTiet - 1}`,
      tienQuyet: newClassForm.tienQuyet ? (newClassForm.tienQuyet as unknown as string).split(',').map(s => s.trim()).filter(Boolean) : [],
      loai: newClassForm.loai || 'Bat buoc'
    };

    try {
      const lopHocPhanWithMonHocPayload = {
        MaLopHP: isEditing ? (editingClassId || newClass.maLopHP) : newClass.maLopHP,
        MaMon: newClass.maMon,
        TenMon: newClass.tenMon,
        SoTinChi: newClass.soTinChi,
        Loai: newClass.loai,
        MoTa: null,
        MaGV: newClass.giangVienId,
        SysoMax: newClass.sySoMax,
      };

      const endpoint = isEditing
        ? `/api/lophocphan/${encodeURIComponent(editingClassId || newClass.maLopHP)}/with-monhoc`
        : '/api/lophocphan-with-monhoc';

      const response = await apiFetch(endpoint, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(lopHocPhanWithMonHocPayload),
      });
      const result = await response.json();
      if (!response.ok) {
        const detail = typeof result?.detail === 'string' ? result.detail : 'Không thể lưu lớp học phần vào cơ sở dữ liệu.';
        showNotification(detail, 'error');
        return;
      }

      if (!isEditing) {
        const scheduleResponse = await apiFetch('/api/lichhoc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            MaLopHP: newClass.maLopHP,
            Thu: thu,
            TietBatDau: tietBatDau,
            SoTiet: soTiet,
            Phong: newClassScheduleForm.phong?.trim() || null,
          }),
        });

        if (!scheduleResponse.ok) {
          const scheduleResult = await scheduleResponse.json().catch(() => ({}));
          const detail = typeof scheduleResult?.detail === 'string'
            ? scheduleResult.detail
            : 'Lớp học phần đã tạo nhưng lưu lịch học thất bại.';
          await loadClassesFromBackend();
          showNotification(detail, 'error');
          return;
        }
      }

      await loadMonHocFromBackend();
      await loadClassesFromBackend();
      setIsAddClassModalOpen(false);
      setNewClassForm({});
      setNewClassScheduleForm(defaultClassScheduleForm);
      setEditingClassId(null);
      showNotification(isEditing ? 'Đã cập nhật lớp học phần thành công.' : 'Đã thêm lớp học phần thành công.', 'success');
    } catch (error) {
      console.error('Lỗi thêm lớp/môn học:', error);
      showNotification('Không thể kết nối backend để lưu lớp học phần.', 'error');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (id === currentUser?.id) {
      showNotification('Không thể xóa tài khoản đang đăng nhập.', 'error');
      return;
    }

    const target = usersList.find(u => u.id === id);
    if (!target || target.role === 'admin') {
      showNotification('Không thể xóa tài khoản này.', 'error');
      return;
    }

    const endpoint = target.role === 'student'
      ? `/api/sinhvien/${encodeURIComponent(id)}`
      : `/api/giaovien/${encodeURIComponent(id)}`;

    try {
      const response = await apiFetch(endpoint, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) {
        const detail = typeof result?.detail === 'string' ? result.detail : 'Không thể xóa người dùng.';
        showNotification(detail, 'error');
        return;
      }

      await loadUsersFromBackend({ includeInactive: showInactiveRecords });
      showNotification('Đã xóa người dùng thành công.', 'success');
    } catch (error) {
      console.error('Lỗi xóa người dùng:', error);
      showNotification('Không thể kết nối backend để xóa người dùng.', 'error');
    }
  };

  const handleDeleteClass = async (cls: ClassItem) => {
    try {
      const response = await apiFetch(`/api/lophocphan/${encodeURIComponent(cls.maLopHP)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) {
        const detail = typeof result?.detail === 'string' ? result.detail : 'Không thể xóa lớp học phần.';
        showNotification(detail, 'error');
        return;
      }

      await loadClassesFromBackend({ includeInactive: showInactiveRecords });
      showNotification('Đã xóa lớp học phần thành công.', 'success');
    } catch (error) {
      console.error('Lỗi xóa lớp học phần:', error);
      showNotification('Không thể kết nối backend để xóa lớp học phần.', 'error');
    }
  };

  const handleEditMonHoc = (monHoc: MonHocItem) => {
    setEditingMonHocId(monHoc.MaMon);
    setMonHocForm({ ...monHoc });
    setIsMonHocModalOpen(true);
  };

  const handleSaveMonHoc = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEditing = editingMonHocId !== null;

    if (!monHocForm.MaMon || !monHocForm.TenMon || !monHocForm.SoTinChi || !monHocForm.Loai) {
      showNotification('Vui lòng điền đầy đủ thông tin môn học bắt buộc.', 'error');
      return;
    }

    try {
      const donGiaTinChi = monHocForm.DonGiaTinChi === null || monHocForm.DonGiaTinChi === undefined || monHocForm.DonGiaTinChi === ''
        ? null
        : Number(monHocForm.DonGiaTinChi);

      if (donGiaTinChi !== null && (!Number.isFinite(donGiaTinChi) || donGiaTinChi <= 0)) {
        showNotification('Đơn giá môn học phải lớn hơn 0.', 'error');
        return;
      }

      const payload = {
        MaMon: monHocForm.MaMon,
        TenMon: monHocForm.TenMon,
        SoTinChi: Number(monHocForm.SoTinChi),
        Loai: monHocForm.Loai,
        MoTa: monHocForm.MoTa || null,
        DonGiaTinChi: donGiaTinChi,
      };

      const endpoint = isEditing
        ? `/api/monhoc/${encodeURIComponent(editingMonHocId || monHocForm.MaMon)}`
        : '/api/monhoc';

      const response = await apiFetch(endpoint, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        const detail = typeof result?.detail === 'string' ? result.detail : 'Không thể lưu môn học.';
        showNotification(detail, 'error');
        return;
      }

      await loadMonHocFromBackend();
      setIsMonHocModalOpen(false);
      setEditingMonHocId(null);
      setMonHocForm({});
      showNotification(isEditing ? 'Đã cập nhật môn học thành công.' : 'Đã thêm môn học thành công.', 'success');
    } catch (error) {
      console.error('Lỗi lưu môn học:', error);
      showNotification('Không thể kết nối backend để lưu môn học.', 'error');
    }
  };

  const handleOpenMonHocDependenciesModal = async (monHoc: MonHocItem, mode: 'view' | 'delete') => {
    setMonHocDependencyModalMode(mode);
    setDeletingMonHoc(monHoc);
    setMonHocDependencyInfo(null);
    setIsDeleteMonHocModalOpen(true);
    setIsLoadingMonHocDependencies(true);

    try {
      const response = await apiFetch(`/api/monhoc/${encodeURIComponent(monHoc.MaMon)}/dependencies`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) {
        const detail = typeof result?.detail === 'string' ? result.detail : 'Không thể kiểm tra phụ thuộc môn học.';
        showNotification(detail, 'error');
        return;
      }

      setMonHocDependencyInfo(result as MonHocDependencyInfo);
    } catch (error) {
      console.error('Lỗi kiểm tra phụ thuộc môn học:', error);
      showNotification('Không thể kết nối backend để kiểm tra phụ thuộc môn học.', 'error');
    } finally {
      setIsLoadingMonHocDependencies(false);
    }
  };

  const handleCloseDeleteMonHocModal = () => {
    if (isDeletingMonHoc) {
      return;
    }
    setIsDeleteMonHocModalOpen(false);
    setDeletingMonHoc(null);
    setMonHocDependencyModalMode('view');
    setMonHocDependencyInfo(null);
    setIsLoadingMonHocDependencies(false);
  };

  const handleDeleteMonHoc = async () => {
    if (!deletingMonHoc) {
      return;
    }

    if (monHocDependencyModalMode !== 'delete') {
      return;
    }

    if (monHocDependencyInfo?.has_dependencies) {
      showNotification('Không thể xóa môn học vì vẫn còn dữ liệu phụ thuộc.', 'error');
      return;
    }

    setIsDeletingMonHoc(true);
    try {
      const response = await apiFetch(`/api/monhoc/${encodeURIComponent(deletingMonHoc.MaMon)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) {
        const detail = typeof result?.detail === 'string' ? result.detail : 'Không thể xóa môn học.';
        showNotification(detail, 'error');
        return;
      }

      await loadMonHocFromBackend({ includeInactive: showInactiveRecords });
      handleCloseDeleteMonHocModal();
      showNotification('Đã xóa môn học thành công.', 'success');
    } catch (error) {
      console.error('Lỗi xóa môn học:', error);
      showNotification('Không thể kết nối backend để xóa môn học.', 'error');
    } finally {
      setIsDeletingMonHoc(false);
    }
  };

  const handleRestoreUser = async (user: User) => {
    if (user.role === 'admin') {
      return;
    }

    const endpoint = user.role === 'student'
      ? `/api/sinhvien/${encodeURIComponent(user.id)}/restore`
      : `/api/giaovien/${encodeURIComponent(user.id)}/restore`;

    try {
      const response = await apiFetch(endpoint, { method: 'PUT' });
      const result = await response.json();
      if (!response.ok) {
        const detail = typeof result?.detail === 'string' ? result.detail : 'Không thể khôi phục người dùng.';
        showNotification(detail, 'error');
        return;
      }

      await loadUsersFromBackend({ includeInactive: showInactiveRecords });
      showNotification('Đã khôi phục người dùng thành công.', 'success');
    } catch (error) {
      console.error('Lỗi khôi phục người dùng:', error);
      showNotification('Không thể kết nối backend để khôi phục người dùng.', 'error');
    }
  };

  const handleRestoreClass = async (cls: ClassItem) => {
    try {
      const response = await apiFetch(`/api/lophocphan/${encodeURIComponent(cls.maLopHP)}/restore`, { method: 'PUT' });
      const result = await response.json();
      if (!response.ok) {
        const detail = typeof result?.detail === 'string' ? result.detail : 'Không thể khôi phục lớp học phần.';
        showNotification(detail, 'error');
        return;
      }

      await loadClassesFromBackend({ includeInactive: showInactiveRecords });
      showNotification('Đã khôi phục lớp học phần thành công.', 'success');
    } catch (error) {
      console.error('Lỗi khôi phục lớp học phần:', error);
      showNotification('Không thể kết nối backend để khôi phục lớp học phần.', 'error');
    }
  };

  const handleRestoreMonHoc = async (monHoc: MonHocItem) => {
    try {
      const response = await apiFetch(`/api/monhoc/${encodeURIComponent(monHoc.MaMon)}/restore`, { method: 'PUT' });
      const result = await response.json();
      if (!response.ok) {
        const detail = typeof result?.detail === 'string' ? result.detail : 'Không thể khôi phục môn học.';
        showNotification(detail, 'error');
        return;
      }

      await loadMonHocFromBackend({ includeInactive: showInactiveRecords });
      showNotification('Đã khôi phục môn học thành công.', 'success');
    } catch (error) {
      console.error('Lỗi khôi phục môn học:', error);
      showNotification('Không thể kết nối backend để khôi phục môn học.', 'error');
    }
  };

  const loadTeacherScheduleByClass = async (maLopHP: string) => {
    if (!maLopHP) {
      setTeacherSchedules([]);
      setTeacherScheduleId(null);
      setTeacherScheduleForm(defaultClassScheduleForm);
      return;
    }

    setIsLoadingTeacherSchedule(true);
    try {
      const response = await apiFetch(`/api/lophocphan/${encodeURIComponent(maLopHP)}/lichhoc`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof result?.detail === 'string' ? result.detail : 'Không thể tải lịch học của lớp.';
        showNotification(detail, 'error');
        setTeacherSchedules([]);
        setTeacherScheduleId(null);
        setTeacherScheduleForm(defaultClassScheduleForm);
        return;
      }

      const schedules = Array.isArray(result?.data) ? (result.data as TeacherClassSchedule[]) : [];
      setTeacherSchedules(schedules);
      setTeacherScheduleId(null);
      setTeacherScheduleForm(defaultClassScheduleForm);
    } catch (error) {
      console.error('Lỗi tải lịch dạy theo lớp:', error);
      showNotification('Không thể kết nối backend để tải lịch dạy.', 'error');
    } finally {
      setIsLoadingTeacherSchedule(false);
    }
  };

  const handleSelectTeacherClass = async (cls: ClassItem) => {
    setSelectedTeacherClassId(cls.maLopHP);
    await loadTeacherScheduleByClass(cls.maLopHP);
  };

  useEffect(() => {
    if (userRole !== 'teacher' || !currentUser?.id) {
      return;
    }

    const assignedClasses = classes.filter((c) => c.giangVienId === currentUser.id);

    if (assignedClasses.length === 0) {
      if (selectedTeacherClassId || teacherSchedules.length > 0 || teacherScheduleId !== null) {
        setSelectedTeacherClassId('');
        setTeacherSchedules([]);
        setTeacherScheduleId(null);
        setTeacherScheduleForm(defaultClassScheduleForm);
      }
      return;
    }

    const isSelectedClassStillAssigned = assignedClasses.some((c) => c.maLopHP === selectedTeacherClassId);
    if (isSelectedClassStillAssigned) {
      return;
    }

    const firstClass = assignedClasses[0];
    setSelectedTeacherClassId(firstClass.maLopHP);
    void loadTeacherScheduleByClass(firstClass.maLopHP);
  }, [
    userRole,
    currentUser?.id,
    classes,
    selectedTeacherClassId,
    teacherSchedules.length,
    teacherScheduleId,
    loadTeacherScheduleByClass,
  ]);

  useEffect(() => {
    if (userRole !== 'teacher') {
      return;
    }

    const selectedClass = classes.find((c) => c.maLopHP === selectedTeacherClassId);
    if (!selectedClass) {
      setTeacherCourseTuitionDraft('');
      return;
    }

    if (selectedClass.donGiaTinChi === null || selectedClass.donGiaTinChi === undefined) {
      setTeacherCourseTuitionDraft('');
      return;
    }

    setTeacherCourseTuitionDraft(String(Math.round(Number(selectedClass.donGiaTinChi) || 0)));
  }, [userRole, classes, selectedTeacherClassId]);

  useEffect(() => {
    if (userRole !== 'teacher' || !currentUser?.id) {
      setTeacherTimetableClassFilter('all');
      return;
    }

    const assignedClassIds = classes
      .filter((c) => c.giangVienId === currentUser.id)
      .map((c) => c.maLopHP);

    if (assignedClassIds.length === 0) {
      if (teacherTimetableClassFilter !== 'all') {
        setTeacherTimetableClassFilter('all');
      }
      return;
    }

    if (teacherTimetableClassFilter !== 'all' && !assignedClassIds.includes(teacherTimetableClassFilter)) {
      setTeacherTimetableClassFilter('all');
    }
  }, [userRole, currentUser?.id, classes, teacherTimetableClassFilter]);

  const handleEditTeacherSchedule = (schedule: TeacherClassSchedule) => {
    setTeacherScheduleId(Number(schedule.maLich));
    setTeacherScheduleForm({
      thu: Number(schedule.thu) || 2,
      tietBatDau: Number(schedule.tietBatDau) || 1,
      soTiet: Number(schedule.soTiet) || 3,
      phong: String(schedule.phong || ''),
    });
  };

  const handleCreateNewTeacherSchedule = () => {
    setTeacherScheduleId(null);
    setTeacherScheduleForm(defaultClassScheduleForm);
  };

  const getTeacherScheduleWarnings = () => {
    if (!selectedTeacherClassId || !currentUser?.id) {
      return [] as string[];
    }

    const thu = Number(teacherScheduleForm.thu);
    const start = Number(teacherScheduleForm.tietBatDau);
    const end = start + Number(teacherScheduleForm.soTiet) - 1;
    const warnings: string[] = [];

    const isOverlap = (s1: number, e1: number, s2: number, e2: number) => !(e1 < s2 || e2 < s1);

    // Check against existing slots in the same class (excluding the slot being edited).
    teacherSchedules.forEach((slot) => {
      if (teacherScheduleId !== null && Number(slot.maLich) === teacherScheduleId) {
        return;
      }
      const slotStart = Number(slot.tietBatDau);
      const slotEnd = slotStart + Number(slot.soTiet) - 1;
      if (Number(slot.thu) === thu && isOverlap(start, end, slotStart, slotEnd)) {
        warnings.push(
          `Trùng với ca hiện có của cùng lớp (Mã lịch ${slot.maLich}: Thứ ${slot.thu}, Tiết ${slotStart}-${slotEnd}).`
        );
      }
    });

    // Check against other classes the teacher is assigned to.
    const parseScheduleRanges = (text: string) => {
      const ranges: Array<{ thu: number; start: number; end: number }> = [];
      const regex = /(?:Thứ|Thu)\s*(\d)\s*(?:Tiết|Tiet)\s*(\d+)-(\d+)/gi;
      let match: RegExpExecArray | null = null;
      while ((match = regex.exec(text)) !== null) {
        ranges.push({
          thu: Number(match[1]),
          start: Number(match[2]),
          end: Number(match[3]),
        });
      }
      return ranges;
    };

    classes
      .filter((c) => c.giangVienId === currentUser.id && c.maLopHP !== selectedTeacherClassId)
      .forEach((c) => {
        const ranges = parseScheduleRanges(c.thoiGian || '');
        ranges.forEach((r) => {
          if (r.thu === thu && isOverlap(start, end, r.start, r.end)) {
            warnings.push(`Trùng với lớp ${c.maLopHP} (${c.tenMon}) đang có lịch Thứ ${r.thu}, Tiết ${r.start}-${r.end}.`);
          }
        });
      });

    return warnings;
  };

  const handleTeacherScheduleSave = async () => {
    if (!selectedTeacherClassId) {
      showNotification('Vui lòng chọn lớp học phần để thiết lập lịch dạy.', 'error');
      return;
    }

    const thu = Number(teacherScheduleForm.thu);
    const tietBatDau = Number(teacherScheduleForm.tietBatDau);
    const soTiet = Number(teacherScheduleForm.soTiet);

    if (thu < 2 || thu > 7) {
      showNotification('Thứ phải trong khoảng 2 đến 7.', 'error');
      return;
    }

    if (tietBatDau < 1 || tietBatDau > 14) {
      showNotification('Tiết bắt đầu phải trong khoảng 1 đến 14.', 'error');
      return;
    }

    if (soTiet < 1 || soTiet > 6) {
      showNotification('Số tiết phải trong khoảng 1 đến 6.', 'error');
      return;
    }

    if (tietBatDau + soTiet - 1 > 14) {
      showNotification('Tiết kết thúc không được vượt quá 14.', 'error');
      return;
    }

    setIsSavingTeacherSchedule(true);
    try {
      const payload = {
        MaLopHP: selectedTeacherClassId,
        Thu: thu,
        TietBatDau: tietBatDau,
        SoTiet: soTiet,
        Phong: teacherScheduleForm.phong.trim() || null,
      };

      const endpoint = teacherScheduleId !== null
        ? `/api/lichhoc/${teacherScheduleId}`
        : '/api/lichhoc';
      const method = teacherScheduleId !== null ? 'PUT' : 'POST';

      const response = await apiFetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof result?.detail === 'string' ? result.detail : 'Không thể lưu lịch dạy.';
        showNotification(detail, 'error');
        return;
      }

      await loadClassesFromBackend();
      await loadTeacherScheduleByClass(selectedTeacherClassId);
      setTeacherScheduleId(null);
      setTeacherScheduleForm(defaultClassScheduleForm);
      showNotification('Đã lưu lịch dạy thành công.', 'success');
    } catch (error) {
      console.error('Lỗi lưu lịch dạy:', error);
      showNotification('Không thể kết nối backend để lưu lịch dạy.', 'error');
    } finally {
      setIsSavingTeacherSchedule(false);
    }
  };

  const handleTeacherScheduleDelete = async (scheduleId?: number) => {
    const targetId = typeof scheduleId === 'number' ? scheduleId : teacherScheduleId;
    if (targetId === null || !selectedTeacherClassId) {
      showNotification('Lớp học phần này chưa có lịch để xóa.', 'error');
      return;
    }

    const targetSlot = teacherSchedules.find((slot) => Number(slot.maLich) === Number(targetId));
    const slotStart = targetSlot ? Number(targetSlot.tietBatDau) : null;
    const slotEnd = targetSlot ? slotStart! + Number(targetSlot.soTiet) - 1 : null;
    const slotLabel = targetSlot
      ? `Thứ ${targetSlot.thu}, Tiết ${slotStart}-${slotEnd}${targetSlot.phong ? `, Phòng ${targetSlot.phong}` : ''}`
      : `Mã lịch ${targetId}`;

    const confirmed = window.confirm(`Bạn có chắc muốn xóa ca lịch này?\n${slotLabel}`);
    if (!confirmed) {
      return;
    }

    setIsSavingTeacherSchedule(true);
    try {
      const response = await apiFetch(`/api/lichhoc/${targetId}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof result?.detail === 'string' ? result.detail : 'Không thể xóa lịch dạy.';
        showNotification(detail, 'error');
        return;
      }

      setTeacherScheduleId(null);
      setTeacherScheduleForm(defaultClassScheduleForm);
      await loadClassesFromBackend();
      await loadTeacherScheduleByClass(selectedTeacherClassId);
      showNotification('Đã xóa lịch dạy thành công.', 'success');
    } catch (error) {
      console.error('Lỗi xóa lịch dạy:', error);
      showNotification('Không thể kết nối backend để xóa lịch dạy.', 'error');
    } finally {
      setIsSavingTeacherSchedule(false);
    }
  };

  const registeredClassesData = classes.filter(c => registered.includes(c.maLopHP));
  const currentCredits = registeredClassesData.reduce((sum, c) => sum + c.soTinChi, 0);

  // --- Registration Logic ---
  const handleRegister = async (cls: ClassItem) => {
    if (!currentUser?.id) {
      showNotification('Không xác định được mã sinh viên.', 'error');
      return;
    }

    if (registeringClassId) {
      return;
    }

    setRegisteringClassId(cls.maLopHP);
    try {
      const response = await apiFetch('/api/dangky', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          MaSV: currentUser.id,
          MaLopHP: cls.maLopHP,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        await Promise.all([
          loadClassesFromBackend(),
          loadRegisteredFromBackend(currentUser.id),
        ]);
        showNotification(`Thành công: ${data.message ?? `Đăng ký thành công ${cls.tenMon}`}`, 'success');
      } else {
        const detail = typeof data?.detail === 'string' ? data.detail : 'Đăng ký thất bại.';
        showNotification(`Đăng ký thất bại: ${detail}`, 'error');
      }
    } catch (error) {
      console.error('Lỗi kết nối Backend:', error);
      showNotification('Lỗi kết nối Backend.', 'error');
    } finally {
      setRegisteringClassId(null);
    }
  };

  const handleCancel = async (cls: ClassItem) => {
    if (!currentUser?.id) {
      showNotification('Không xác định được mã sinh viên.', 'error');
      return;
    }

    const confirmed = window.confirm(`Bạn có chắc muốn hủy đăng ký lớp ${cls.tenMon} (${cls.maLopHP})?`);
    if (!confirmed) {
      return;
    }

    try {
      const response = await apiFetch('/api/huy-dangky', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          MaSV: currentUser.id,
          MaLopHP: cls.maLopHP,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : 'Hủy đăng ký thất bại.';
        showNotification(`Hủy đăng ký thất bại: ${detail}`, 'error');
        return;
      }

      await Promise.all([
        loadClassesFromBackend(),
        loadRegisteredFromBackend(currentUser.id),
      ]);
      showNotification(`Đã hủy đăng ký: ${cls.tenMon}`, 'success');
    } catch (error) {
      console.error('Lỗi hủy đăng ký học phần:', error);
      showNotification('Không thể kết nối backend để hủy đăng ký.', 'error');
    }
  };

  const exportRegisteredClassesToCsv = () => {
    if (registeredClassesData.length === 0) {
      showNotification('Chưa có dữ liệu để xuất.', 'error');
      return;
    }

    const header = ['MaLopHP', 'MaMon', 'TenMon', 'SoTinChi', 'GiangVien', 'ThoiGian'];
    const rows = registeredClassesData.map(cls => [
      cls.maLopHP,
      cls.maMon,
      cls.tenMon,
      String(cls.soTinChi),
      cls.giangVien,
      cls.thoiGian,
    ]);

    const escapeCsv = (value: string) => {
      const normalized = value.replaceAll('"', '""');
      return `"${normalized}"`;
    };

    const csvContent = [header, ...rows]
      .map(row => row.map(cell => escapeCsv(cell)).join(','))
      .join('\n');

    const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dang-ky-tin-chi-${currentUser?.id || 'sinh-vien'}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showNotification('Đã xuất danh sách đăng ký ra file CSV.', 'success');
  };

  const filteredClasses = classes.filter(c => 
    c.tenMon.toLowerCase().includes(debouncedSearch) || 
    c.maMon.toLowerCase().includes(debouncedSearch) ||
    c.maLopHP.toLowerCase().includes(debouncedSearch)
  );

  const parseScheduleRanges = (text: string) => {
    const ranges: Array<{ thu: number; start: number; end: number; phong: string }> = [];
    const regex = /(?:Thứ|Thu)\s*(\d)\s*(?:Tiết|Tiet)\s*(\d+)-(\d+)(?:\s*,\s*(?:Phòng|Phong)\s*([^|]+))?/gi;
    let match: RegExpExecArray | null = null;

    while ((match = regex.exec(text)) !== null) {
      ranges.push({
        thu: Number(match[1]),
        start: Number(match[2]),
        end: Number(match[3]),
        phong: String(match[4] || '').trim(),
      });
    }

    return ranges;
  };

  const getScheduleLabels = (rawSchedule: string) => {
    const normalized = (rawSchedule || '').trim();
    if (!normalized) {
      return ['Chua xep lich'];
    }

    const parsed = parseScheduleRanges(normalized);
    if (parsed.length > 0) {
      return parsed.map((item) => `Thứ ${item.thu} Tiết ${item.start}-${item.end}${item.phong ? `, Phòng ${item.phong}` : ''}`);
    }

    return normalized.split('|').map((part) => part.trim()).filter(Boolean);
  };

  const renderScheduleCell = (rawSchedule: string) => {
    const labels = getScheduleLabels(rawSchedule);
    return (
      <div className="space-y-1">
        {labels.map((label, index) => (
          <div key={`${label}-${index}`}>{label}</div>
        ))}
      </div>
    );
  };

  // --- Results Logic ---
  const gradedBangDiem = bangDiemData.filter(r => r.Diem !== null && r.Diem !== undefined && Number.isFinite(Number(r.Diem)));
  const totalAccumulatedCredits = gradedBangDiem.reduce((sum, r) => sum + r.SoTinChi, 0);
  const gpa10 = totalAccumulatedCredits > 0
    ? gradedBangDiem.reduce((sum, r) => sum + (Number(r.Diem) * r.SoTinChi), 0) / totalAccumulatedCredits
    : 0;
  const gpa4 = (gpa10 / 10) * 4;
  
  const getGradeLetter = (diem: number) => {
    if (diem >= 8.5) return 'A';
    if (diem >= 7.0) return 'B';
    if (diem >= 5.5) return 'C';
    if (diem >= 4.0) return 'D';
    return 'F';
  };

  // --- Timetable Logic ---
  const timetableDays = [2, 3, 4, 5, 6, 7];
  const timetablePeriods = Array.from({length: 10}, (_, i) => i + 1);
  
  const getClassesForSlot = (day: number, period: number, sourceClasses?: ClassItem[]) => {
    const relevantClasses = sourceClasses || (userRole === 'teacher'
      ? classes.filter(c => c.giangVienId === currentUser?.id)
      : registeredClassesData);

    return relevantClasses.flatMap((cls) => {
      const ranges = parseScheduleRanges(cls.thoiGian || '');
      return ranges
        .filter((range) => range.thu === day && period >= range.start && period <= range.end)
        .map((range) => ({
          cls,
          range,
          key: `${cls.maLopHP}-${range.thu}-${range.start}-${range.end}`,
        }));
    });
  };

  // --- Render Helpers ---
  const renderDashboard = () => {
    if (userRole === 'admin') {
      const studentCount = usersList.filter(u => u.role === 'student').length;
      const teacherCount = usersList.filter(u => u.role === 'teacher').length;
      const fillRate = adminReport?.fill_rate_percent ?? 0;
      const fullClasses = adminReport?.full_classes ?? 0;
      const totalTuitionAmount = adminReport?.total_tuition_amount ?? 0;
      const formattedTotalTuition = `${Math.round(totalTuitionAmount).toLocaleString('vi-VN')} đ`;

      return (
        <div className="p-6 space-y-6 h-full overflow-auto">
          <div className="bg-white border-l-4 border-[#b30b0b] p-5 shadow-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-2">Xin chào, {currentUser?.name}!</h2>
            <p className="text-gray-600 text-sm">Chào mừng bạn đến với trang Quản trị hệ thống.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => { void handleImportCsv(); }}
                disabled={isImportingCsv || isLoadingCsvFiles}
                className={`px-4 py-2 text-sm font-bold border transition-colors ${isImportingCsv || isLoadingCsvFiles ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-[#b30b0b] text-white border-[#8a0808] hover:bg-[#8a0808]'}`}
              >
                {isImportingCsv ? 'ĐANG IMPORT CSV...' : isLoadingCsvFiles ? 'ĐANG TẢI DANH SÁCH CSV...' : 'IMPORT CSV VÀO SQL'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 border border-gray-200 shadow-sm flex items-center">
              <div className="w-12 h-12 bg-red-50 text-[#b30b0b] flex items-center justify-center mr-4 border border-red-100">
                <User className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Tổng số sinh viên</p>
                <p className="text-xl font-bold text-[#b30b0b]">{studentCount}</p>
              </div>
            </div>
            <div className="bg-white p-5 border border-gray-200 shadow-sm flex items-center">
              <div className="w-12 h-12 bg-red-50 text-[#b30b0b] flex items-center justify-center mr-4 border border-red-100">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Tổng số giảng viên</p>
                <p className="text-xl font-bold text-[#b30b0b]">{teacherCount}</p>
              </div>
            </div>
            <div className="bg-white p-5 border border-gray-200 shadow-sm flex items-center">
              <div className="w-12 h-12 bg-red-50 text-[#b30b0b] flex items-center justify-center mr-4 border border-red-100">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Lớp học phần</p>
                <p className="text-xl font-bold text-[#b30b0b]">{classes.length}</p>
              </div>
            </div>
            <div className="bg-white p-5 border border-gray-200 shadow-sm flex items-center">
              <div className="w-12 h-12 bg-red-50 text-[#b30b0b] flex items-center justify-center mr-4 border border-red-100">
                <BookMarked className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Tổng môn học</p>
                <p className="text-xl font-bold text-[#b30b0b]">{monHocList.length}</p>
              </div>
            </div>
            <div className="bg-white p-5 border border-gray-200 shadow-sm flex items-center">
              <div className="w-12 h-12 bg-red-50 text-[#b30b0b] flex items-center justify-center mr-4 border border-red-100">
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Tổng học phí</p>
                <p className="text-xl font-bold text-[#b30b0b]">{isLoadingAdminReport ? '...' : formattedTotalTuition}</p>
              </div>
            </div>
            <div className="bg-white p-5 border border-gray-200 shadow-sm flex items-center">
              <div className="w-12 h-12 bg-red-50 text-[#b30b0b] flex items-center justify-center mr-4 border border-red-100">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Tỷ lệ lấp đầy</p>
                <p className="text-xl font-bold text-[#b30b0b]">{isLoadingAdminReport ? '...' : `${fillRate.toFixed(2)}%`}</p>
              </div>
            </div>
            <div className="bg-white p-5 border border-gray-200 shadow-sm flex items-center">
              <div className="w-12 h-12 bg-red-50 text-[#b30b0b] flex items-center justify-center mr-4 border border-red-100">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Lớp đã đầy</p>
                <p className="text-xl font-bold text-[#b30b0b]">{isLoadingAdminReport ? '...' : fullClasses}</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (userRole === 'teacher') {
      return (
        <div className="p-6 space-y-6 h-full overflow-auto">
          <div className="bg-white border-l-4 border-[#b30b0b] p-5 shadow-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-2">Xin chào Giảng viên, {currentUser?.name}!</h2>
            <p className="text-gray-600 text-sm">Khoa: {currentUser?.khoaQuanLy}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-5 border border-gray-200 shadow-sm flex items-center">
              <div className="w-12 h-12 bg-red-50 text-[#b30b0b] flex items-center justify-center mr-4 border border-red-100">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Lớp đang phụ trách</p>
                <p className="text-xl font-bold text-[#b30b0b]">
                  {classes.filter(c => c.giangVienId === currentUser?.id).length}
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 space-y-6 h-full overflow-auto">
        <div className="bg-white border-l-4 border-[#b30b0b] p-5 shadow-sm">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Xin chào, {currentUser?.name} ({currentUser?.id})!</h2>
          <p className="text-gray-600 text-sm">Chào mừng bạn đến với Cổng thông tin đào tạo - Học viện Công nghệ Bưu chính Viễn thông.</p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center">
              <span className="font-semibold text-gray-700 w-28">Lớp:</span>
              <span className="text-gray-900">{currentUser?.lop}</span>
            </div>
            <div className="flex items-center">
              <span className="font-semibold text-gray-700 w-28">Khoa:</span>
              <span className="text-gray-900">{currentUser?.khoa}</span>
            </div>
            <div className="flex items-center">
              <span className="font-semibold text-gray-700 w-28">Chuyên ngành:</span>
              <span className="text-gray-900">{currentUser?.chuyenNganh}</span>
            </div>
          </div>
        </div>

        <motion.div 
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: { staggerChildren: 0.1 }
            }
          }}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-4 gap-4"
        >
          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="bg-white p-5 border border-gray-200 shadow-sm flex items-center">
            <div className="w-12 h-12 bg-red-50 text-[#b30b0b] flex items-center justify-center mr-4 border border-red-100">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Điểm TBC Tích lũy</p>
              <p className="text-xl font-bold text-[#b30b0b]">{gpa10.toFixed(2)} <span className="text-sm font-normal text-gray-500">/ 10</span></p>
            </div>
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="bg-white p-5 border border-gray-200 shadow-sm flex items-center">
            <div className="w-12 h-12 bg-red-50 text-[#b30b0b] flex items-center justify-center mr-4 border border-red-100">
              <BookMarked className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Tín chỉ tích lũy</p>
              <p className="text-xl font-bold text-[#b30b0b]">{totalAccumulatedCredits}</p>
            </div>
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="bg-white p-5 border border-gray-200 shadow-sm flex items-center">
            <div className="w-12 h-12 bg-red-50 text-[#b30b0b] flex items-center justify-center mr-4 border border-red-100">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Đợt đăng ký hiện tại</p>
              <p className="text-base font-bold text-gray-800">HK {mockPeriod.hocKy} ({mockPeriod.namHoc})</p>
              <p className="text-xs text-green-600 font-semibold mt-0.5">{mockPeriod.trangThai}</p>
            </div>
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="bg-white p-5 border border-gray-200 shadow-sm flex items-center">
            <div className="w-12 h-12 bg-red-50 text-[#b30b0b] flex items-center justify-center mr-4 border border-red-100">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Học phí còn nợ</p>
              <p className="text-xl font-bold text-[#b30b0b]">{isLoadingTuition ? '...' : `${Math.round(tuitionSummary.unpaid_amount).toLocaleString('vi-VN')} đ`}</p>
            </div>
          </motion.div>
        </motion.div>

        <div className="bg-white border border-gray-200 shadow-sm">
          <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
            <h3 className="text-sm font-bold text-[#b30b0b] uppercase">Hoạt động đăng ký gần đây</h3>
          </div>
          <div className="p-4">
            {registeredClassesData.length > 0 ? (
              <ul className="space-y-3">
                {registeredClassesData.map(cls => (
                  <li key={cls.maLopHP} className="flex items-start text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-600 mr-2 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-gray-800">Đã đăng ký thành công lớp <strong>{cls.tenMon}</strong> ({cls.maLopHP})</span>
                      <span className="text-gray-500 ml-2">- {cls.soTinChi} TC</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 italic">Chưa có hoạt động đăng ký nào trong học kỳ này.</p>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 shadow-sm">
          <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#b30b0b] uppercase">Học phí theo học kỳ</h3>
            <span className="text-xs text-gray-600">Tổng: {isLoadingTuition ? '...' : `${Math.round(tuitionSummary.total_amount).toLocaleString('vi-VN')} đ`}</span>
          </div>
          <div className="p-4">
            {isLoadingTuition ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={`tuition-loading-${idx}`} className="h-5 w-full animate-pulse bg-gray-100" />
                ))}
              </div>
            ) : tuitionData.length === 0 ? (
              <p className="text-sm text-gray-500 italic">Chưa có dữ liệu học phí.</p>
            ) : (
              <div className="overflow-auto border border-gray-300">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-[#e9ecef]">
                    <tr className="text-gray-800">
                      <th className="border border-gray-300 px-3 py-2 font-bold">Học kỳ</th>
                      <th className="border border-gray-300 px-3 py-2 font-bold text-center">Tín chỉ</th>
                      <th className="border border-gray-300 px-3 py-2 font-bold text-right">Đơn giá</th>
                      <th className="border border-gray-300 px-3 py-2 font-bold text-right">Tổng tiền</th>
                      <th className="border border-gray-300 px-3 py-2 font-bold text-center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tuitionData.map((item) => {
                      const status = item.trang_thai.trim().toLowerCase();
                      const isPaid = status === 'da thanh toan';
                      return (
                        <tr key={`${item.nam_hoc}-${item.hoc_ky}`} className="hover:bg-yellow-50 transition-colors">
                          <td className="border border-gray-300 px-3 py-2 text-gray-800">HK {item.hoc_ky} - NH {item.nam_hoc}</td>
                          <td className="border border-gray-300 px-3 py-2 text-center text-gray-800">{item.so_tin_chi}</td>
                          <td className="border border-gray-300 px-3 py-2 text-right text-gray-800">{Math.round(item.don_gia).toLocaleString('vi-VN')} đ</td>
                          <td className="border border-gray-300 px-3 py-2 text-right font-semibold text-[#b30b0b]">{Math.round(item.tong_tien).toLocaleString('vi-VN')} đ</td>
                          <td className="border border-gray-300 px-3 py-2 text-center">
                            <span className={`text-xs font-bold ${isPaid ? 'text-green-600' : 'text-orange-600'}`}>{item.trang_thai}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderRegistration = () => (
    <div className="p-6 flex flex-col h-full">
      <div className="bg-white border border-gray-200 shadow-sm mb-4">
        <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-sm font-bold text-[#b30b0b] uppercase">Thông tin đăng ký</h3>
          <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 border border-green-200">{mockPeriod.trangThai}</span>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Tín chỉ đã đăng ký: </span>
            <span className="font-bold text-[#b30b0b]">{currentCredits}</span>
            <span className="text-gray-500"> / 25 TC</span>
          </div>
          <div>
            <span className="text-gray-600">Số môn học: </span>
            <span className="font-bold text-gray-900">{registered.length}</span>
          </div>
          <div>
            <span className="text-gray-600">Học kỳ: </span>
            <span className="font-bold text-gray-900">{mockPeriod.hocKy} ({mockPeriod.namHoc})</span>
          </div>
        </div>
      </div>

      <div className="bg-white shadow-sm border border-gray-200 flex flex-col flex-1 min-h-0">
        <div className="flex border-b border-gray-200 bg-gray-50 shrink-0 relative">
          <button 
            className={`relative px-4 py-2.5 text-sm font-bold transition-colors border-r border-gray-200 ${activeTab === 'register' ? 'text-[#b30b0b] bg-white' : 'text-gray-600 hover:bg-gray-100'}`}
            onClick={() => setActiveTab('register')}
          >
            {activeTab === 'register' && (
              <motion.div layoutId="activeTab" className="absolute top-0 left-0 right-0 h-0.5 bg-[#b30b0b]" />
            )}
            LỚP HỌC PHẦN MỞ ĐĂNG KÝ
          </button>
          <button 
            className={`relative px-4 py-2.5 text-sm font-bold transition-colors border-r border-gray-200 ${activeTab === 'registered' ? 'text-[#b30b0b] bg-white' : 'text-gray-600 hover:bg-gray-100'}`}
            onClick={() => setActiveTab('registered')}
          >
            {activeTab === 'registered' && (
              <motion.div layoutId="activeTab" className="absolute top-0 left-0 right-0 h-0.5 bg-[#b30b0b]" />
            )}
            LỚP HỌC PHẦN ĐÃ ĐĂNG KÝ ({registered.length})
          </button>
        </div>

        <div className="p-4 flex-1 flex flex-col min-h-0 relative overflow-hidden">
          <AnimatePresence mode="wait">
            {activeTab === 'register' ? (
              <motion.div 
                key="register"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-4 flex flex-col min-h-0"
              >
                <div className="mb-4 flex items-center shrink-0">
                  <div className="relative w-full max-w-md">
                    <input 
                      type="text" 
                      placeholder="Lọc theo mã môn, tên môn, mã LHP..." 
                      className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:border-[#b30b0b] focus:ring-1 focus:ring-[#b30b0b]"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                    <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2" />
                  </div>
                </div>
                <div className="flex-1 overflow-auto border border-gray-300 relative">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead className="bg-[#e9ecef] sticky top-0 z-10 shadow-sm">
                      <tr className="text-gray-800">
                        <th className="border border-gray-300 px-2 py-2 font-bold text-center w-12">STT</th>
                        <th className="border border-gray-300 px-3 py-2 font-bold">Mã LHP</th>
                        <th className="border border-gray-300 px-3 py-2 font-bold">Tên môn học</th>
                        <th className="border border-gray-300 px-2 py-2 font-bold text-center">TC</th>
                        <th className="border border-gray-300 px-3 py-2 font-bold">Giảng viên</th>
                        <th className="border border-gray-300 px-2 py-2 font-bold text-center">Sĩ số</th>
                        <th className="border border-gray-300 px-3 py-2 font-bold">Thời gian</th>
                        <th className="border border-gray-300 px-3 py-2 font-bold text-center">Đăng ký</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      <AnimatePresence>
                      {isLoadingClasses ? (
                        Array.from({ length: 6 }).map((_, idx) => (
                          <tr key={`loading-open-${idx}`}>
                            <td className="border border-gray-300 px-2 py-2" colSpan={8}>
                              <div className="h-5 w-full animate-pulse bg-gray-100" />
                            </td>
                          </tr>
                        ))
                      ) : filteredClasses.length === 0 ? (
                        <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} key="empty"><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Không tìm thấy lớp học phần nào.</td></motion.tr>
                      ) : (
                        filteredClasses.map((cls, index) => {
                          const isRegistered = registered.includes(cls.maLopHP);
                          const isFull = cls.daDangKy >= cls.sySoMax;
                          const isSubmitting = registeringClassId === cls.maLopHP;
                          return (
                            <motion.tr 
                              layout
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.2 }}
                              key={cls.maLopHP} 
                              className="hover:bg-yellow-50 transition-colors"
                            >
                              <td className="border border-gray-300 px-2 py-2 text-center text-gray-600">{index + 1}</td>
                              <td className="border border-gray-300 px-3 py-2 font-mono text-[#b30b0b] font-semibold">{cls.maLopHP}</td>
                              <td className="border border-gray-300 px-3 py-2 text-gray-800">
                                <div className="font-medium">{cls.tenMon}</div>
                                {cls.tienQuyet.length > 0 && (
                                  <div className="text-[11px] text-gray-500 mt-0.5">
                                    Tiên quyết: {cls.tienQuyet.join(', ')}
                                  </div>
                                )}
                              </td>
                              <td className="border border-gray-300 px-2 py-2 text-center text-gray-800">{cls.soTinChi}</td>
                              <td className="border border-gray-300 px-3 py-2 text-gray-800">{cls.giangVien}</td>
                              <td className="border border-gray-300 px-2 py-2 text-center">
                                <span className={isFull ? 'text-red-600 font-bold' : 'text-gray-800'}>{cls.daDangKy}</span>
                                <span className="text-gray-500">/{cls.sySoMax}</span>
                              </td>
                              <td className="border border-gray-300 px-3 py-2 text-gray-800">{renderScheduleCell(cls.thoiGian)}</td>
                              <td className="border border-gray-300 px-3 py-2 text-center">
                                {isRegistered ? (
                                  <span className="inline-flex items-center text-green-600 text-xs font-bold">
                                    <CheckCircle2 className="w-4 h-4 mr-1" /> ĐÃ ĐK
                                  </span>
                                ) : (
                                  <button 
                                    onClick={() => { void handleRegister(cls); }}
                                    disabled={isFull || isSubmitting || Boolean(registeringClassId)}
                                    className={`px-3 py-1 text-xs font-bold border transition-all ${(isFull || isSubmitting || Boolean(registeringClassId)) ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-[#b30b0b] text-white border-[#8a0808] hover:bg-[#8a0808] active:scale-95'}`}
                                  >
                                    {isSubmitting ? 'ĐANG GỬI...' : 'ĐĂNG KÝ'}
                                  </button>
                                )}
                              </td>
                            </motion.tr>
                          )
                        })
                      )}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="registered"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-4 flex flex-col min-h-0"
              >
                <div className="mb-3 flex justify-end shrink-0">
                  <button
                    onClick={exportRegisteredClassesToCsv}
                    className="px-3 py-1.5 text-xs font-bold border border-[#8a0808] bg-[#b30b0b] text-white hover:bg-[#8a0808] transition-colors"
                  >
                    XUẤT CSV
                  </button>
                </div>
                <div className="flex-1 overflow-auto border border-gray-300 relative">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead className="bg-[#e9ecef] sticky top-0 z-10 shadow-sm">
                      <tr className="text-gray-800">
                        <th className="border border-gray-300 px-2 py-2 font-bold text-center w-12">STT</th>
                        <th className="border border-gray-300 px-3 py-2 font-bold">Mã LHP</th>
                        <th className="border border-gray-300 px-3 py-2 font-bold">Tên môn học</th>
                        <th className="border border-gray-300 px-2 py-2 font-bold text-center">TC</th>
                        <th className="border border-gray-300 px-3 py-2 font-bold">Giảng viên</th>
                        <th className="border border-gray-300 px-3 py-2 font-bold">Thời gian</th>
                        <th className="border border-gray-300 px-3 py-2 font-bold text-center">Hủy ĐK</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      <AnimatePresence>
                      {isLoadingRegistered ? (
                        Array.from({ length: 4 }).map((_, idx) => (
                          <tr key={`loading-registered-${idx}`}>
                            <td className="border border-gray-300 px-2 py-2" colSpan={7}>
                              <div className="h-5 w-full animate-pulse bg-gray-100" />
                            </td>
                          </tr>
                        ))
                      ) : registeredClassesData.length === 0 ? (
                        <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} key="empty">
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                            Bạn chưa đăng ký lớp học phần nào.
                          </td>
                        </motion.tr>
                      ) : (
                        registeredClassesData.map((cls, index) => (
                          <motion.tr 
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            key={cls.maLopHP} 
                            className="hover:bg-yellow-50 transition-colors"
                          >
                            <td className="border border-gray-300 px-2 py-2 text-center text-gray-600">{index + 1}</td>
                            <td className="border border-gray-300 px-3 py-2 font-mono text-[#b30b0b] font-semibold">{cls.maLopHP}</td>
                            <td className="border border-gray-300 px-3 py-2 text-gray-800 font-medium">{cls.tenMon}</td>
                            <td className="border border-gray-300 px-2 py-2 text-center text-gray-800">{cls.soTinChi}</td>
                            <td className="border border-gray-300 px-3 py-2 text-gray-800">{cls.giangVien}</td>
                            <td className="border border-gray-300 px-3 py-2 text-gray-800">{renderScheduleCell(cls.thoiGian)}</td>
                            <td className="border border-gray-300 px-3 py-2 text-center">
                              <button 
                                onClick={() => handleCancel(cls)} 
                                className="inline-flex items-center justify-center p-1 text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                                title="Hủy đăng ký"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </motion.tr>
                        ))
                      )}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 shrink-0 border border-gray-300 bg-white">
                  <div className="px-3 py-2 bg-gray-100 border-b border-gray-300 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase text-[#b30b0b]">Lịch sử đăng ký theo học kỳ</h4>
                    <span className="text-xs text-gray-600">{registrationHistory.length} kỳ học</span>
                  </div>

                  <div className="max-h-52 overflow-auto p-3 text-sm">
                    {isLoadingRegistrationHistory ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, idx) => (
                          <div key={`history-loading-${idx}`} className="h-5 w-full animate-pulse bg-gray-100" />
                        ))}
                      </div>
                    ) : registrationHistory.length === 0 ? (
                      <p className="text-gray-500 italic">Chưa có dữ liệu lịch sử đăng ký.</p>
                    ) : (
                      <div className="space-y-3">
                        {registrationHistory.map((semester) => (
                          <div key={`${semester.nam_hoc}-${semester.hoc_ky}`} className="border border-gray-200 p-2">
                            <div className="flex items-center justify-between text-xs mb-2">
                              <span className="font-semibold text-gray-700">HK {semester.hoc_ky} - NH {semester.nam_hoc}</span>
                              <span className="text-[#b30b0b] font-bold">{semester.total_credits} tín chỉ</span>
                            </div>
                            <div className="text-xs text-gray-600">
                              {semester.courses.map((course) => `${course.ma_lop_hp} (${course.so_tin_chi}TC)`).join(', ')}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  const renderResults = () => (
    <div className="p-6 space-y-6 h-full flex flex-col">
      <div className="bg-white border border-gray-200 shadow-sm shrink-0">
        <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
          <h3 className="text-sm font-bold text-[#b30b0b] uppercase">Tổng hợp kết quả học tập</h3>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="flex justify-between border-b border-gray-200 pb-2">
            <span className="text-gray-600 font-semibold">Điểm TBC Tích lũy (Hệ 10):</span>
            <span className="font-bold text-[#b30b0b]">{gpa10.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-b border-gray-200 pb-2">
            <span className="text-gray-600 font-semibold">Điểm TBC Tích lũy (Hệ 4):</span>
            <span className="font-bold text-[#b30b0b]">{gpa4.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-b border-gray-200 pb-2">
            <span className="text-gray-600 font-semibold">Tổng số tín chỉ tích lũy:</span>
            <span className="font-bold text-gray-900">{totalAccumulatedCredits}</span>
          </div>
        </div>
      </div>

      <div className="bg-white shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-gray-200 bg-gray-100 shrink-0">
          <h3 className="text-sm font-bold text-[#b30b0b] uppercase">Chi tiết bảng điểm</h3>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {isLoadingBangDiem ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={`grades-loading-${idx}`} className="h-8 w-full animate-pulse bg-gray-100" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {Array.from(new Set<string>(bangDiemData.map(r => `${r.HocKy}-${r.NamHoc}`)))
              .map((key: string) => {
                const [hocKyText, namHocText] = key.split('-');
                return {
                  hocKy: Number(hocKyText),
                  namHoc: Number(namHocText),
                };
              })
              .sort((a, b) => (a.namHoc - b.namHoc) || (a.hocKy - b.hocKy))
              .map(({ hocKy, namHoc }) => {
              const semesterResults = bangDiemData.filter(r => r.HocKy === hocKy && r.NamHoc === namHoc && r.Diem !== null && r.Diem !== undefined);
              if (semesterResults.length === 0) return null;
              
              const semCredits = semesterResults.reduce((sum, r) => sum + r.SoTinChi, 0);
              const semGpa = semCredits > 0
                ? semesterResults.reduce((sum, r) => sum + (Number(r.Diem) * r.SoTinChi), 0) / semCredits
                : 0;

              return (
                <div key={`${hocKy}-${namHoc}`} className="border border-gray-300">
                  <div className="bg-[#e9ecef] px-3 py-2 flex justify-between items-center border-b border-gray-300">
                    <h4 className="font-bold text-gray-800 text-sm">Học kỳ {hocKy} - Năm học {namHoc}</h4>
                    <div className="text-xs text-gray-700 font-semibold">
                      <span className="mr-4">Số TC đạt: <span className="text-[#b30b0b]">{semCredits}</span></span>
                      <span>ĐTB Học kỳ: <span className="text-[#b30b0b]">{semGpa.toFixed(2)}</span></span>
                    </div>
                  </div>
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-gray-50">
                      <tr className="text-gray-700">
                        <th className="border border-gray-300 px-3 py-1.5 font-bold w-12 text-center">STT</th>
                        <th className="border border-gray-300 px-3 py-1.5 font-bold">Mã môn</th>
                        <th className="border border-gray-300 px-3 py-1.5 font-bold">Tên môn học</th>
                        <th className="border border-gray-300 px-3 py-1.5 font-bold text-center">TC</th>
                        <th className="border border-gray-300 px-3 py-1.5 font-bold text-center">Điểm (10)</th>
                        <th className="border border-gray-300 px-3 py-1.5 font-bold text-center">Điểm chữ</th>
                      </tr>
                    </thead>
                    <motion.tbody 
                      variants={{
                        hidden: { opacity: 0 },
                        show: { opacity: 1, transition: { staggerChildren: 0.05 } }
                      }}
                      initial="hidden"
                      animate="show"
                      className="bg-white"
                    >
                      {semesterResults.map((r, idx) => (
                        <motion.tr variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }} key={`${r.MaMon}-${r.LanHoc ?? 1}-${idx}`} className="hover:bg-yellow-50">
                          <td className="border border-gray-300 px-3 py-1.5 text-center text-gray-600">{idx + 1}</td>
                          <td className="border border-gray-300 px-3 py-1.5 font-mono text-gray-800">{r.MaMon}</td>
                          <td className="border border-gray-300 px-3 py-1.5 text-gray-800">{r.TenMon}</td>
                          <td className="border border-gray-300 px-3 py-1.5 text-center text-gray-800">{r.SoTinChi}</td>
                          <td className="border border-gray-300 px-3 py-1.5 text-center font-bold text-gray-900">{Number(r.Diem).toFixed(1)}</td>
                          <td className="border border-gray-300 px-3 py-1.5 text-center font-bold text-[#b30b0b]">{getGradeLetter(Number(r.Diem))}</td>
                        </motion.tr>
                      ))}
                    </motion.tbody>
                  </table>
                </div>
              );
            })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderTimetable = () => {
    const isTeacherTimetable = userRole === 'teacher';
    const assignedTeacherClasses = isTeacherTimetable
      ? classes.filter((c) => c.giangVienId === currentUser?.id)
      : [];

    const filteredTeacherClasses = isTeacherTimetable
      ? assignedTeacherClasses.filter((cls) => {
          const matchesClass = teacherTimetableClassFilter === 'all' || cls.maLopHP === teacherTimetableClassFilter;
          if (!matchesClass) {
            return false;
          }

          if (teacherTimetableDayFilter === 'all') {
            return true;
          }

          const ranges = parseScheduleRanges(cls.thoiGian || '');
          return ranges.some((range) => range.thu === teacherTimetableDayFilter);
        })
      : [];

    const activeClassesForTimetable = isTeacherTimetable ? filteredTeacherClasses : registeredClassesData;
    const visibleDays = isTeacherTimetable && teacherTimetableDayFilter !== 'all'
      ? [teacherTimetableDayFilter]
      : timetableDays;
    const gridClassName = visibleDays.length === 1 ? 'grid-cols-2' : 'grid-cols-7';

    return (
      <div className="p-6 h-full flex flex-col">
        <div className="bg-white shadow-sm border border-gray-200 flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-200 bg-gray-100 flex justify-between items-center shrink-0">
            <h3 className="text-sm font-bold text-[#b30b0b] uppercase">
              {isTeacherTimetable ? 'Thời khóa biểu giảng dạy' : `Thời khóa biểu - Học kỳ ${mockPeriod.hocKy} (${mockPeriod.namHoc})`}
            </h3>
            <div className="flex items-center space-x-2 text-xs text-gray-600 font-medium">
              <span className="w-3 h-3 bg-blue-100 border border-blue-300 inline-block"></span>
              <span>{isTeacherTimetable ? 'Lịch dạy lý thuyết' : 'Lịch học lý thuyết'}</span>
            </div>
          </div>

          {isTeacherTimetable && (
            <div className="px-4 py-3 border-b border-gray-200 bg-white grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Lọc theo lớp phụ trách</label>
                <select
                  value={teacherTimetableClassFilter}
                  onChange={(e) => setTeacherTimetableClassFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 bg-white"
                >
                  <option value="all">Tất cả lớp được phân công</option>
                  {assignedTeacherClasses.map((cls) => (
                    <option key={cls.maLopHP} value={cls.maLopHP}>
                      {cls.maLopHP} - {cls.tenMon}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Lọc theo thứ</label>
                <select
                  value={String(teacherTimetableDayFilter)}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setTeacherTimetableDayFilter(nextValue === 'all' ? 'all' : Number(nextValue));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 bg-white"
                >
                  <option value="all">Tất cả các thứ</option>
                  {timetableDays.map((day) => (
                    <option key={day} value={day}>Thứ {day}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => setCurrentView('teacher-classes')}
                  className="w-full px-3 py-2 text-xs font-bold border border-[#8a0808] bg-[#b30b0b] text-white hover:bg-[#8a0808] transition-colors"
                >
                  Chỉnh lịch theo từng lớp
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-auto p-4 bg-white space-y-4">
            {activeClassesForTimetable.length === 0 ? (
              <div className="border border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-600 text-center">
                {isTeacherTimetable
                  ? 'Chưa có lớp nào phù hợp bộ lọc hoặc chưa được phân công lịch dạy.'
                  : 'Bạn chưa đăng ký lớp học phần nào để hiển thị thời khóa biểu.'}
              </div>
            ) : (
              <div className={`min-w-[800px] border border-gray-300 bg-white overflow-hidden ${visibleDays.length === 1 ? 'min-w-[420px]' : ''}`}>
                {/* Header */}
                <div className={`grid ${gridClassName} border-b border-gray-300 bg-[#e9ecef] text-sm font-bold text-gray-800 text-center`}>
                  <div className="p-2 border-r border-gray-300">Ca học</div>
                  {visibleDays.map(day => (
                    <div key={day} className="p-2 border-r border-gray-300 last:border-0">Thứ {day}</div>
                  ))}
                </div>

                {/* Body */}
                <div className="divide-y divide-gray-300">
                  {timetablePeriods.map(period => (
                    <div key={period} className={`grid ${gridClassName} text-xs`}>
                      <div className="p-2 text-center border-r border-gray-300 bg-gray-50 font-bold text-gray-600 flex flex-col justify-center">
                        Tiết {period}
                      </div>
                      {visibleDays.map(day => {
                        const classesInSlot = getClassesForSlot(day, period, activeClassesForTimetable);
                        const isStart = classesInSlot.some((item) => item.range.start === period);

                        return (
                          <div key={`${day}-${period}`} className="border-r border-gray-300 last:border-0 p-0.5 relative min-h-[50px]">
                            {classesInSlot.map((item) => {
                              const { cls, range, key } = item;
                              if (!isStart) {
                                return <div key={`bg-${key}`} className="absolute inset-0 bg-[#e3f2fd] border-x border-[#90caf9] -mt-[1px] z-0"></div>;
                              }

                              if (range.start !== period) {
                                return null;
                              }

                              const span = range.end - range.start + 1;

                              return (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ duration: 0.2, delay: (day + period) * 0.02 }}
                                  key={key}
                                  className="absolute top-0.5 left-0.5 right-0.5 bg-[#e3f2fd] border border-[#90caf9] p-1.5 z-10 overflow-hidden text-center flex flex-col justify-center"
                                  style={{ height: `calc(${span * 100}% - 4px)` }}
                                >
                                  <p className="font-bold text-[#0d47a1] leading-tight mb-0.5">{cls.tenMon}</p>
                                  <p className="text-[#1565c0] font-mono">{cls.maLopHP}</p>
                                  <p className="text-[#0d47a1] font-medium">{range.phong ? `Phòng ${range.phong}` : 'Chưa có phòng'}</p>
                                  <p className="text-gray-600 mt-0.5 truncate">
                                    {isTeacherTimetable ? `${cls.daDangKy}/${cls.sySoMax} sinh viên` : cls.giangVien}
                                  </p>
                                </motion.div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isTeacherTimetable && assignedTeacherClasses.length > 0 && (
              <div className="border border-gray-300 bg-white overflow-hidden">
                <div className="px-3 py-2 bg-[#e9ecef] border-b border-gray-300 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#b30b0b] uppercase">Danh sách lớp đang phụ trách</h4>
                  <span className="text-xs text-gray-600">{filteredTeacherClasses.length}/{assignedTeacherClasses.length} lớp đang hiển thị</span>
                </div>
                <div className="max-h-44 overflow-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr className="text-gray-700">
                        <th className="border border-gray-300 px-2 py-1.5 font-bold">Mã LHP</th>
                        <th className="border border-gray-300 px-2 py-1.5 font-bold">Môn học</th>
                        <th className="border border-gray-300 px-2 py-1.5 font-bold text-center">Sĩ số</th>
                        <th className="border border-gray-300 px-2 py-1.5 font-bold">Lịch hiện tại</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeacherClasses.map((cls) => (
                        <tr key={`teacher-row-${cls.maLopHP}`} className="hover:bg-yellow-50">
                          <td className="border border-gray-300 px-2 py-1.5 font-mono text-[#b30b0b] font-semibold">{cls.maLopHP}</td>
                          <td className="border border-gray-300 px-2 py-1.5 text-gray-800">{cls.tenMon}</td>
                          <td className="border border-gray-300 px-2 py-1.5 text-center text-gray-700">{cls.daDangKy}/{cls.sySoMax}</td>
                          <td className="border border-gray-300 px-2 py-1.5 text-gray-700">{renderScheduleCell(cls.thoiGian)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderManageUsersByRole = (role: 'student' | 'teacher') => {
    const filteredUsers = usersList.filter(u => u.role === role);
    const currentPage = role === 'student' ? manageStudentsPage : manageTeachersPage;
    const setCurrentPage = role === 'student' ? setManageStudentsPage : setManageTeachersPage;
    const totalPages = Math.max(1, Math.ceil(filteredUsers.length / ITEMS_PER_PAGE));
    const page = Math.min(currentPage, totalPages);
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const pagedUsers = filteredUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    const title = role === 'student' ? 'Danh sách Sinh viên' : 'Danh sách Giảng viên';
    const addButtonText = role === 'student' ? '+ Thêm sinh viên' : '+ Thêm giảng viên';

    return (
      <div className="p-6 h-full flex flex-col">
        <div className="bg-white shadow-sm border border-gray-200 flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-100 flex justify-between items-center shrink-0">
            <h3 className="text-sm font-bold text-[#b30b0b] uppercase">{title}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowInactiveRecords((prev) => !prev)}
                className={`px-3 py-1.5 text-xs font-bold border transition-colors ${showInactiveRecords ? 'border-amber-600 text-amber-700 bg-amber-50' : 'border-gray-300 text-gray-700 bg-white'}`}
              >
                {showInactiveRecords ? 'ĐANG HIỆN ĐÃ XÓA' : 'CHỈ HIỆN ĐANG HOẠT ĐỘNG'}
              </button>
              <button 
                onClick={() => {
                  setAddUserRole(role);
                  setEditingUserId(null);
                  setNewUserForm({});
                  setIsAddUserModalOpen(true);
                }}
                className="bg-[#b30b0b] text-white px-3 py-1.5 text-sm font-bold hover:bg-[#8a0808] transition-colors"
              >
                {addButtonText}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-[#e9ecef] sticky top-0 z-10 shadow-sm">
                <tr className="text-gray-800">
                  <th className="border border-gray-300 px-3 py-2 font-bold w-12 text-center">STT</th>
                  <th className="border border-gray-300 px-3 py-2 font-bold">Mã/ID</th>
                  <th className="border border-gray-300 px-3 py-2 font-bold">Họ tên</th>
                  <th className="border border-gray-300 px-3 py-2 font-bold">Email</th>
                  <th className="border border-gray-300 px-3 py-2 font-bold text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {pagedUsers.map((u, idx) => (
                  <tr key={u.id} className={`hover:bg-gray-50 ${u.isDeleted ? 'bg-amber-50/40' : ''}`}>
                    <td className="border border-gray-300 px-3 py-2 text-center text-gray-600">{startIndex + idx + 1}</td>
                    <td className="border border-gray-300 px-3 py-2 font-mono font-semibold text-[#b30b0b]">{u.id}</td>
                    <td className="border border-gray-300 px-3 py-2 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{u.name}</span>
                        {u.isDeleted ? <span className="text-[10px] px-2 py-0.5 border border-amber-500 text-amber-700 bg-amber-100">ĐÃ XÓA MỀM</span> : null}
                      </div>
                    </td>
                    <td className="border border-gray-300 px-3 py-2">{u.email}</td>
                    <td className="border border-gray-300 px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setViewingUser(u)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition-colors" title={`Xem thông tin ${role === 'student' ? 'sinh viên' : 'giảng viên'}`}>
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleEditUser(u)} disabled={Boolean(u.isDeleted)} className="text-amber-600 hover:bg-amber-50 p-1.5 rounded transition-colors disabled:opacity-40" title={`Sửa ${role === 'student' ? 'sinh viên' : 'giảng viên'}`}>
                          <Pencil className="w-4 h-4" />
                        </button>
                        {u.isDeleted ? (
                          <button onClick={() => { void handleRestoreUser(u); }} className="text-emerald-700 hover:bg-emerald-50 p-1.5 rounded transition-colors" title={`Khôi phục ${role === 'student' ? 'sinh viên' : 'giảng viên'}`}>
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        ) : (
                          <button onClick={() => { void handleDeleteUser(u.id); }} className="text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors" title={`Xóa ${role === 'student' ? 'sinh viên' : 'giảng viên'}`}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <span>
                Hiển thị {filteredUsers.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredUsers.length)} / {filteredUsers.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40"
                >
                  Trước
                </button>
                <span>Trang {page}/{totalPages}</span>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40"
                >
                  Sau
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderManageClasses = () => {
    return (
      <div className="p-6 h-full flex flex-col">
        <div className="bg-white shadow-sm border border-gray-200 flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-100 flex justify-between items-center shrink-0">
            <h3 className="text-sm font-bold text-[#b30b0b] uppercase">Danh sách Lớp học phần</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowInactiveRecords((prev) => !prev)}
                className={`px-3 py-1.5 text-xs font-bold border transition-colors ${showInactiveRecords ? 'border-amber-600 text-amber-700 bg-amber-50' : 'border-gray-300 text-gray-700 bg-white'}`}
              >
                {showInactiveRecords ? 'ĐANG HIỆN ĐÃ XÓA' : 'CHỈ HIỆN ĐANG HOẠT ĐỘNG'}
              </button>
              <button 
                onClick={() => {
                  setEditingClassId(null);
                  setNewClassForm({});
                  setNewClassScheduleForm(defaultClassScheduleForm);
                  setIsAddClassModalOpen(true);
                }}
                className="bg-[#b30b0b] text-white px-3 py-1.5 text-sm font-bold hover:bg-[#8a0808] transition-colors"
              >
                + Thêm lớp học phần
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-[#e9ecef] sticky top-0 z-10 shadow-sm">
                <tr className="text-gray-800">
                  <th className="border border-gray-300 px-2 py-2 font-bold text-center w-12">STT</th>
                  <th className="border border-gray-300 px-3 py-2 font-bold">Mã LHP</th>
                  <th className="border border-gray-300 px-3 py-2 font-bold">Tên môn học</th>
                  <th className="border border-gray-300 px-2 py-2 font-bold text-center">TC</th>
                  <th className="border border-gray-300 px-3 py-2 font-bold">Giảng viên</th>
                  <th className="border border-gray-300 px-2 py-2 font-bold text-center">Sĩ số</th>
                  <th className="border border-gray-300 px-3 py-2 font-bold">Thời gian</th>
                  <th className="border border-gray-300 px-3 py-2 font-bold text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {classes.map((cls, index) => (
                  <tr key={cls.maLopHP} className={`hover:bg-gray-50 ${cls.isDeleted ? 'bg-amber-50/40' : ''}`}>
                    <td className="border border-gray-300 px-2 py-2 text-center text-gray-600">{index + 1}</td>
                    <td className="border border-gray-300 px-3 py-2 font-mono text-[#b30b0b] font-semibold">{cls.maLopHP}</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-800 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{cls.tenMon}</span>
                        {cls.isDeleted ? <span className="text-[10px] px-2 py-0.5 border border-amber-500 text-amber-700 bg-amber-100">ĐÃ XÓA MỀM</span> : null}
                      </div>
                    </td>
                    <td className="border border-gray-300 px-2 py-2 text-center text-gray-800">{cls.soTinChi}</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-800">{cls.giangVien || <span className="text-gray-400 italic">Chưa phân công</span>}</td>
                    <td className="border border-gray-300 px-2 py-2 text-center">
                      <span className="text-gray-800">{cls.daDangKy}</span>
                      <span className="text-gray-500">/{cls.sySoMax}</span>
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-800">{cls.thoiGian}</td>
                    <td className="border border-gray-300 px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleEditClass(cls)} disabled={Boolean(cls.isDeleted)} className="text-amber-600 hover:bg-amber-50 p-1.5 rounded transition-colors disabled:opacity-40" title="Sửa lớp">
                          <Pencil className="w-4 h-4" />
                        </button>
                        {cls.isDeleted ? (
                          <button onClick={() => { void handleRestoreClass(cls); }} className="text-emerald-700 hover:bg-emerald-50 p-1.5 rounded transition-colors" title="Khôi phục lớp">
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        ) : (
                          <button onClick={() => { void handleDeleteClass(cls); }} className="text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors" title="Xóa lớp">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderManageCourses = () => {
    const totalPages = Math.max(1, Math.ceil(monHocList.length / ITEMS_PER_PAGE));
    const page = Math.min(manageCoursesPage, totalPages);
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const pagedCourses = monHocList.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return (
      <div className="p-6 h-full flex flex-col">
        <div className="bg-white shadow-sm border border-gray-200 flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-100 flex justify-between items-center shrink-0">
            <h3 className="text-sm font-bold text-[#b30b0b] uppercase">Danh sách Môn học (MONHOC)</h3>
            <div className="flex items-center gap-2">
              {userRole === 'admin' && (
                <div className="flex items-center gap-2 bg-white border border-gray-300 px-2 py-1">
                  <span className="text-xs text-gray-600">Đơn giá mặc định/TC</span>
                  <input
                    type="number"
                    min="1"
                    value={defaultTuitionDraft}
                    onChange={e => setDefaultTuitionDraft(e.target.value)}
                    className="w-28 px-2 py-1 text-xs border border-gray-300"
                  />
                  <button
                    onClick={() => { void handleSaveDefaultTuition(); }}
                    disabled={isSavingDefaultTuition}
                    className="px-2 py-1 text-xs font-bold border border-[#8a0808] bg-[#b30b0b] text-white hover:bg-[#8a0808] disabled:opacity-50"
                  >
                    {isSavingDefaultTuition ? 'Đang lưu...' : 'Lưu'}
                  </button>
                </div>
              )}
              <button
                onClick={() => setShowInactiveRecords((prev) => !prev)}
                className={`px-3 py-1.5 text-xs font-bold border transition-colors ${showInactiveRecords ? 'border-amber-600 text-amber-700 bg-amber-50' : 'border-gray-300 text-gray-700 bg-white'}`}
              >
                {showInactiveRecords ? 'ĐANG HIỆN ĐÃ XÓA' : 'CHỈ HIỆN ĐANG HOẠT ĐỘNG'}
              </button>
              <button
                onClick={() => {
                  setEditingMonHocId(null);
                  setMonHocForm({});
                  setIsMonHocModalOpen(true);
                }}
                className="bg-[#b30b0b] text-white px-3 py-1.5 text-sm font-bold hover:bg-[#8a0808] transition-colors"
              >
                + Thêm môn học
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-[#e9ecef] sticky top-0 z-10 shadow-sm">
                <tr className="text-gray-800">
                  <th className="border border-gray-300 px-2 py-2 font-bold text-center w-12">STT</th>
                  <th className="border border-gray-300 px-3 py-2 font-bold">Mã môn</th>
                  <th className="border border-gray-300 px-3 py-2 font-bold">Tên môn học</th>
                  <th className="border border-gray-300 px-2 py-2 font-bold text-center">TC</th>
                  <th className="border border-gray-300 px-3 py-2 font-bold text-right">Đơn giá/TC</th>
                  <th className="border border-gray-300 px-3 py-2 font-bold">Loại</th>
                  <th className="border border-gray-300 px-3 py-2 font-bold">Mô tả</th>
                  <th className="border border-gray-300 px-3 py-2 font-bold text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {pagedCourses.map((monHoc, index) => (
                  <tr key={monHoc.MaMon} className={`hover:bg-gray-50 ${monHoc.IsDeleted ? 'bg-amber-50/40' : ''}`}>
                    <td className="border border-gray-300 px-2 py-2 text-center text-gray-600">{startIndex + index + 1}</td>
                    <td className="border border-gray-300 px-3 py-2 font-mono text-[#b30b0b] font-semibold">{monHoc.MaMon}</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-800 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{monHoc.TenMon}</span>
                        {monHoc.IsDeleted ? <span className="text-[10px] px-2 py-0.5 border border-amber-500 text-amber-700 bg-amber-100">ĐÃ XÓA MỀM</span> : null}
                      </div>
                    </td>
                    <td className="border border-gray-300 px-2 py-2 text-center text-gray-800">{monHoc.SoTinChi}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right text-gray-800">
                      {monHoc.DonGiaTinChi === null || monHoc.DonGiaTinChi === undefined
                        ? <span className="text-gray-500 italic">Mặc định ({Math.round(defaultTuitionPerCredit).toLocaleString('vi-VN')} đ)</span>
                        : `${Math.round(Number(monHoc.DonGiaTinChi)).toLocaleString('vi-VN')} đ`}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-800">{monHoc.Loai}</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-700 max-w-[320px] truncate" title={monHoc.MoTa || ''}>
                      {monHoc.MoTa || <span className="text-gray-400 italic">Không có</span>}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleEditMonHoc(monHoc)} disabled={Boolean(monHoc.IsDeleted)} className="text-amber-600 hover:bg-amber-50 p-1.5 rounded transition-colors disabled:opacity-40" title="Sửa môn học">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => { void handleOpenMonHocDependenciesModal(monHoc, 'view'); }} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition-colors" title="Xem phụ thuộc">
                          <Info className="w-4 h-4" />
                        </button>
                        {monHoc.IsDeleted ? (
                          <button onClick={() => { void handleRestoreMonHoc(monHoc); }} className="text-emerald-700 hover:bg-emerald-50 p-1.5 rounded transition-colors" title="Khôi phục môn học">
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        ) : (
                          <button onClick={() => { void handleOpenMonHocDependenciesModal(monHoc, 'delete'); }} className="text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors" title="Xóa môn học">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <span>
                Hiển thị {monHocList.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, monHocList.length)} / {monHocList.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setManageCoursesPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40"
                >
                  Trước
                </button>
                <span>Trang {page}/{totalPages}</span>
                <button
                  onClick={() => setManageCoursesPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40"
                >
                  Sau
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTeacherClasses = () => {
    const assignedClasses = classes.filter(c => c.giangVienId === currentUser?.id);
    const teacherScheduleWarnings = getTeacherScheduleWarnings();

    return (
      <div className="p-6 h-full flex flex-col">
        <div className="bg-white shadow-sm border border-gray-200 flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-100 flex justify-between items-center shrink-0">
            <h3 className="text-sm font-bold text-[#b30b0b] uppercase">Quản lý lịch dạy theo lớp được phân công</h3>
          </div>
          <div className="flex-1 overflow-auto p-4 grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 border border-gray-300 overflow-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-[#e9ecef] sticky top-0 z-10 shadow-sm">
                  <tr className="text-gray-800">
                    <th className="border border-gray-300 px-2 py-2 font-bold text-center w-12">STT</th>
                    <th className="border border-gray-300 px-3 py-2 font-bold">Mã LHP</th>
                    <th className="border border-gray-300 px-3 py-2 font-bold">Tên môn học</th>
                    <th className="border border-gray-300 px-2 py-2 font-bold text-center">TC</th>
                    <th className="border border-gray-300 px-3 py-2 font-bold text-right">Đơn giá/TC</th>
                    <th className="border border-gray-300 px-3 py-2 font-bold">Lịch hiện tại</th>
                    <th className="border border-gray-300 px-3 py-2 font-bold text-center">Chọn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {assignedClasses.length === 0 ? (
                    <tr>
                      <td className="border border-gray-300 px-3 py-6 text-center text-gray-500" colSpan={7}>
                        Bạn chưa được admin phân công lớp học phần nào.
                      </td>
                    </tr>
                  ) : (
                    assignedClasses.map((cls, index) => {
                      const isSelected = selectedTeacherClassId === cls.maLopHP;
                      return (
                        <tr key={cls.maLopHP} className={`hover:bg-gray-50 ${isSelected ? 'bg-amber-50' : ''}`}>
                          <td className="border border-gray-300 px-2 py-2 text-center text-gray-600">{index + 1}</td>
                          <td className="border border-gray-300 px-3 py-2 font-mono text-[#b30b0b] font-semibold">{cls.maLopHP}</td>
                          <td className="border border-gray-300 px-3 py-2 text-gray-800 font-medium">{cls.tenMon}</td>
                          <td className="border border-gray-300 px-2 py-2 text-center text-gray-800">{cls.soTinChi}</td>
                          <td className="border border-gray-300 px-3 py-2 text-right text-gray-800">
                            {cls.donGiaTinChi === null || cls.donGiaTinChi === undefined
                              ? <span className="text-gray-500 italic">Mặc định</span>
                              : `${Math.round(Number(cls.donGiaTinChi)).toLocaleString('vi-VN')} đ`}
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-gray-800">{cls.thoiGian}</td>
                          <td className="border border-gray-300 px-3 py-2 text-center">
                            <button
                              onClick={() => { void handleSelectTeacherClass(cls); }}
                              className={`px-2 py-1 text-xs font-bold border transition-colors ${isSelected ? 'bg-[#b30b0b] text-white border-[#8a0808]' : 'bg-white text-[#b30b0b] border-[#b30b0b] hover:bg-red-50'}`}
                            >
                              {isSelected ? 'Đang chọn' : 'Chọn lớp'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="lg:col-span-2 border border-gray-300 bg-gray-50 p-4">
              <h4 className="text-sm font-bold text-[#b30b0b] mb-3 uppercase">Thiết lập lịch dạy</h4>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-gray-600">Các ca đã lưu</label>
                    <button
                      onClick={handleCreateNewTeacherSchedule}
                      disabled={!selectedTeacherClassId || isLoadingTeacherSchedule || isSavingTeacherSchedule}
                      className="px-2 py-1 text-[11px] font-bold border border-[#b30b0b] text-[#b30b0b] bg-white hover:bg-red-50 disabled:opacity-50"
                    >
                      + Ca mới
                    </button>
                  </div>
                  <div className="border border-gray-300 bg-white max-h-36 overflow-auto">
                    {teacherSchedules.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-500 italic">Chưa có ca nào cho lớp này.</div>
                    ) : (
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          {teacherSchedules.map((slot) => {
                            const slotStart = Number(slot.tietBatDau);
                            const slotEnd = slotStart + Number(slot.soTiet) - 1;
                            const isEditing = teacherScheduleId === Number(slot.maLich);
                            return (
                              <tr key={slot.maLich} className={isEditing ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                                <td className="border border-gray-200 px-2 py-1">#{slot.maLich}</td>
                                <td className="border border-gray-200 px-2 py-1">Thứ {slot.thu}, Tiết {slotStart}-{slotEnd}</td>
                                <td className="border border-gray-200 px-2 py-1">{slot.phong || '-'}</td>
                                <td className="border border-gray-200 px-2 py-1 text-right">
                                  <button
                                    onClick={() => handleEditTeacherSchedule(slot)}
                                    className="mr-1 px-1.5 py-0.5 border border-amber-300 text-amber-700 hover:bg-amber-50"
                                  >
                                    Sửa
                                  </button>
                                  <button
                                    onClick={() => { void handleTeacherScheduleDelete(Number(slot.maLich)); }}
                                    className="px-1.5 py-0.5 border border-red-300 text-red-700 hover:bg-red-50"
                                  >
                                    Xóa
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Đơn giá/TC cho môn đang chọn</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="1"
                      value={teacherCourseTuitionDraft}
                      onChange={e => setTeacherCourseTuitionDraft(e.target.value)}
                      disabled={!selectedTeacherClassId || isSavingTeacherCourseTuition}
                      placeholder={`Để trống dùng mặc định ${Math.round(defaultTuitionPerCredit).toLocaleString('vi-VN')} đ`}
                      className="w-full px-3 py-2 border border-gray-300 bg-white"
                    />
                    <button
                      onClick={() => { void handleSaveTeacherCourseTuition(); }}
                      disabled={!selectedTeacherClassId || isSavingTeacherCourseTuition}
                      className="px-3 py-2 text-xs font-bold bg-[#b30b0b] text-white border border-[#8a0808] hover:bg-[#8a0808] disabled:opacity-50"
                    >
                      {isSavingTeacherCourseTuition ? 'Đang lưu...' : 'Lưu giá'}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">Giảng viên chỉ cập nhật được đơn giá cho môn học thuộc lớp mình phụ trách.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Lớp đang chọn</label>
                  <input
                    type="text"
                    value={selectedTeacherClassId || 'Chưa chọn lớp'}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 bg-white text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Thứ</label>
                  <select
                    value={teacherScheduleForm.thu}
                    onChange={e => setTeacherScheduleForm({ ...teacherScheduleForm, thu: Number(e.target.value) })}
                    disabled={!selectedTeacherClassId || isLoadingTeacherSchedule || isSavingTeacherSchedule}
                    className="w-full px-3 py-2 border border-gray-300 bg-white"
                  >
                    <option value={2}>Thứ 2</option>
                    <option value={3}>Thứ 3</option>
                    <option value={4}>Thứ 4</option>
                    <option value={5}>Thứ 5</option>
                    <option value={6}>Thứ 6</option>
                    <option value={7}>Thứ 7</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Tiết bắt đầu</label>
                  <input
                    type="number" min="1" max="14"
                    value={teacherScheduleForm.tietBatDau}
                    onChange={e => setTeacherScheduleForm({ ...teacherScheduleForm, tietBatDau: Number(e.target.value) })}
                    disabled={!selectedTeacherClassId || isLoadingTeacherSchedule || isSavingTeacherSchedule}
                    className="w-full px-3 py-2 border border-gray-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Số tiết</label>
                  <input
                    type="number" min="1" max="6"
                    value={teacherScheduleForm.soTiet}
                    onChange={e => setTeacherScheduleForm({ ...teacherScheduleForm, soTiet: Number(e.target.value) })}
                    disabled={!selectedTeacherClassId || isLoadingTeacherSchedule || isSavingTeacherSchedule}
                    className="w-full px-3 py-2 border border-gray-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Phòng</label>
                  <input
                    type="text"
                    value={teacherScheduleForm.phong}
                    onChange={e => setTeacherScheduleForm({ ...teacherScheduleForm, phong: e.target.value })}
                    disabled={!selectedTeacherClassId || isLoadingTeacherSchedule || isSavingTeacherSchedule}
                    placeholder="VD: A101"
                    className="w-full px-3 py-2 border border-gray-300 bg-white"
                  />
                </div>

                {teacherScheduleWarnings.length > 0 && selectedTeacherClassId && (
                  <div className="border border-amber-300 bg-amber-50 px-3 py-2">
                    <p className="text-xs font-semibold text-amber-700 mb-1">Cảnh báo trùng giờ</p>
                    <ul className="text-xs text-amber-800 list-disc pl-4 space-y-1">
                      {teacherScheduleWarnings.map((warning, idx) => (
                        <li key={`${idx}-${warning}`}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => { void handleTeacherScheduleSave(); }}
                    disabled={!selectedTeacherClassId || isLoadingTeacherSchedule || isSavingTeacherSchedule}
                    className="px-3 py-2 text-xs font-bold bg-[#b30b0b] text-white border border-[#8a0808] hover:bg-[#8a0808] disabled:opacity-50"
                  >
                    {isSavingTeacherSchedule ? 'Đang lưu...' : teacherScheduleId !== null ? 'Cập nhật ca' : 'Lưu ca'}
                  </button>
                  <button
                    onClick={() => { void handleTeacherScheduleDelete(); }}
                    disabled={!selectedTeacherClassId || teacherScheduleId === null || isLoadingTeacherSchedule || isSavingTeacherSchedule}
                    className="px-3 py-2 text-xs font-bold bg-white text-red-600 border border-red-300 hover:bg-red-50 disabled:opacity-50"
                  >
                    Xóa ca đang sửa
                  </button>
                </div>

                <p className="text-xs text-gray-500">
                  Admin phân công giảng viên cho lớp học phần, sau đó giảng viên tự thiết lập lịch dạy cho lớp được phân công.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAddUserModal = () => {
    if (!isAddUserModalOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col"
        >
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
            <h3 className="text-lg font-bold text-[#b30b0b]">
              {editingUserId ? 'Sửa' : 'Thêm'} {addUserRole === 'student' ? 'Sinh viên' : 'Giảng viên'}
            </h3>
            <button onClick={() => { setIsAddUserModalOpen(false); setEditingUserId(null); }} className="text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto">
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mã số *</label>
                <input 
                  type="text" required
                  value={newUserForm.id || ''}
                  onChange={e => setNewUserForm({...newUserForm, id: e.target.value})}
                  disabled={editingUserId !== null}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên *</label>
                <input 
                  type="text" required
                  value={newUserForm.name || ''}
                  onChange={e => setNewUserForm({...newUserForm, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input 
                  type="email" required
                  value={newUserForm.email || ''}
                  onChange={e => setNewUserForm({...newUserForm, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                />
              </div>
              {addUserRole === 'student' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mã lớp (MaLop)</label>
                    <input 
                      type="text"
                      value={newUserForm.maLop || ''}
                      onChange={e => setNewUserForm({...newUserForm, maLop: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Năm nhập học (NamNhapHoc)</label>
                    <input 
                      type="number"
                      min="2000"
                      max="2100"
                      value={newUserForm.namNhapHoc || ''}
                      onChange={e => setNewUserForm({...newUserForm, namNhapHoc: Number(e.target.value) || undefined})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Chuyên ngành</label>
                    <input 
                      type="text"
                      value={newUserForm.chuyenNganh || ''}
                      onChange={e => setNewUserForm({...newUserForm, chuyenNganh: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Khoa</label>
                    <input 
                      type="text"
                      value={newUserForm.khoa || ''}
                      onChange={e => setNewUserForm({...newUserForm, khoa: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Điện thoại (DienThoai)</label>
                    <input 
                      type="text"
                      value={newUserForm.dienThoai || ''}
                      onChange={e => setNewUserForm({...newUserForm, dienThoai: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                    />
                  </div>
                </>
              )}
              {addUserRole === 'teacher' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Học vị (HocVi)</label>
                    <select
                      value={newUserForm.hocVi || ''}
                      onChange={e => setNewUserForm({...newUserForm, hocVi: e.target.value || undefined})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                    >
                      <option value="">Chọn học vị</option>
                      <option value="Cu nhan">Cu nhan</option>
                      <option value="Thac si">Thac si</option>
                      <option value="Tien si">Tien si</option>
                      <option value="GS">GS</option>
                      <option value="PGS">PGS</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Khoa (Khoa)</label>
                    <input 
                      type="text"
                      value={newUserForm.khoa || ''}
                      onChange={e => setNewUserForm({...newUserForm, khoa: e.target.value, khoaQuanLy: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Điện thoại (DienThoai)</label>
                    <input 
                      type="text"
                      value={newUserForm.dienThoai || ''}
                      onChange={e => setNewUserForm({...newUserForm, dienThoai: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                    />
                  </div>
                </>
              )}
              <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-6">
                <button 
                  type="button"
                  onClick={() => { setIsAddUserModalOpen(false); setEditingUserId(null); }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded font-medium hover:bg-gray-50 transition-colors"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-[#b30b0b] text-white rounded font-medium hover:bg-[#8a0808] transition-colors"
                >
                  {editingUserId ? 'Lưu thay đổi' : 'Thêm mới'}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    );
  };

  const renderAddClassModal = () => {
    if (!isAddClassModalOpen) return null;

    const teacherOptions = usersList.filter(user => user.role === 'teacher');
    const maMonInput = String(newClassForm.maMon || '').trim();
    const maMonExists = maMonInput.length === 0 || monHocList.some(monHoc => monHoc.MaMon.toLowerCase() === maMonInput.toLowerCase());
    const maGVInput = String(newClassForm.giangVienId || '').trim();
    const maGVExists = maGVInput.length === 0 || teacherOptions.some(teacher => teacher.id.toLowerCase() === maGVInput.toLowerCase());

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col"
        >
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
            <h3 className="text-lg font-bold text-[#b30b0b]">{editingClassId ? 'Sửa' : 'Thêm'} Lớp học phần</h3>
            <button onClick={() => { setIsAddClassModalOpen(false); setEditingClassId(null); }} className="text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto">
            <form onSubmit={handleAddClass} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mã LHP *</label>
                  <input 
                    type="text" required
                    value={newClassForm.maLopHP || ''}
                    onChange={e => setNewClassForm({...newClassForm, maLopHP: e.target.value})}
                    disabled={editingClassId !== null}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mã môn *</label>
                  <input 
                    type="text" required
                    list="class-monhoc-suggestions"
                    value={newClassForm.maMon || ''}
                    onChange={e => handleClassMaMonChange(e.target.value)}
                    disabled={editingClassId !== null}
                    className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b] ${!maMonExists ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`}
                  />
                  <datalist id="class-monhoc-suggestions">
                    {monHocList.map(monHoc => (
                      <option key={monHoc.MaMon} value={monHoc.MaMon} label={`${monHoc.TenMon} - ${monHoc.SoTinChi} TC`} />
                    ))}
                  </datalist>
                  {!maMonExists && (
                    <p className="mt-1 text-xs text-amber-700">
                      Mã môn chưa tồn tại trong danh mục môn học. Hãy kiểm tra lại hoặc chọn từ gợi ý.
                    </p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tên môn học *</label>
                  <input 
                    type="text" required
                    value={newClassForm.tenMon || ''}
                    onChange={e => setNewClassForm({...newClassForm, tenMon: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Số tín chỉ</label>
                  <input 
                    type="number" min="1" max="10"
                    value={newClassForm.soTinChi || 3}
                    onChange={e => setNewClassForm({...newClassForm, soTinChi: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sĩ số tối đa</label>
                  <input 
                    type="number" min="1" max="200"
                    value={newClassForm.sySoMax || 60}
                    onChange={e => setNewClassForm({...newClassForm, sySoMax: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giảng viên</label>
                  <input 
                    type="text"
                    list="class-teacher-name-suggestions"
                    value={newClassForm.giangVien || ''}
                    onChange={e => handleClassTeacherNameChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                  />
                  <datalist id="class-teacher-name-suggestions">
                    {teacherOptions.map(teacher => (
                      <option key={teacher.id} value={teacher.name} label={teacher.id} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mã GV</label>
                  <input 
                    type="text"
                    list="class-teacher-id-suggestions"
                    value={newClassForm.giangVienId || ''}
                    onChange={e => handleClassTeacherIdChange(e.target.value)}
                    className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b] ${!maGVExists ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`}
                  />
                  <datalist id="class-teacher-id-suggestions">
                    {teacherOptions.map(teacher => (
                      <option key={teacher.id} value={teacher.id} label={teacher.name} />
                    ))}
                  </datalist>
                  {!maGVExists && (
                    <p className="mt-1 text-xs text-amber-700">
                      Mã giảng viên chưa có trong danh sách hiện tại. Hãy kiểm tra lại hoặc chọn từ gợi ý.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thứ</label>
                  <select
                    value={newClassScheduleForm.thu}
                    onChange={e => setNewClassScheduleForm({ ...newClassScheduleForm, thu: Number(e.target.value) })}
                    disabled={Boolean(editingClassId)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b] disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value={2}>Thứ 2</option>
                    <option value={3}>Thứ 3</option>
                    <option value={4}>Thứ 4</option>
                    <option value={5}>Thứ 5</option>
                    <option value={6}>Thứ 6</option>
                    <option value={7}>Thứ 7</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tiết bắt đầu</label>
                  <input
                    type="number" min="1" max="14"
                    value={newClassScheduleForm.tietBatDau}
                    onChange={e => setNewClassScheduleForm({ ...newClassScheduleForm, tietBatDau: Number(e.target.value) })}
                    disabled={Boolean(editingClassId)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b] disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Số tiết</label>
                  <input
                    type="number" min="1" max="6"
                    value={newClassScheduleForm.soTiet}
                    onChange={e => setNewClassScheduleForm({ ...newClassScheduleForm, soTiet: Number(e.target.value) })}
                    disabled={Boolean(editingClassId)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b] disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phòng</label>
                  <input
                    type="text" placeholder="VD: A101"
                    value={newClassScheduleForm.phong}
                    onChange={e => setNewClassScheduleForm({ ...newClassScheduleForm, phong: e.target.value })}
                    disabled={Boolean(editingClassId)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b] disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Loại</label>
                  <select 
                    value={newClassForm.loai || 'Bat buoc'}
                    onChange={e => setNewClassForm({...newClassForm, loai: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                  >
                    <option value="Bat buoc">Bat buoc</option>
                    <option value="Tu chon">Tu chon</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Môn tiên quyết (cách nhau bằng dấu phẩy)</label>
                  <input 
                    type="text" placeholder="VD: BAS1201, ELE1319"
                    value={(newClassForm.tienQuyet as unknown as string) || ''}
                    onChange={e => setNewClassForm({...newClassForm, tienQuyet: e.target.value as any})}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                  />
                </div>
                {editingClassId && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-500">
                      Trường lịch học chỉ áp dụng khi thêm mới lớp học phần. Khi sửa lớp hiện có, hệ thống giữ nguyên lịch hiện tại.
                    </p>
                  </div>
                )}
              </div>
              <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-6">
                <button 
                  type="button"
                  onClick={() => {
                    setIsAddClassModalOpen(false);
                    setEditingClassId(null);
                    setNewClassScheduleForm(defaultClassScheduleForm);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded font-medium hover:bg-gray-50 transition-colors"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-[#b30b0b] text-white rounded font-medium hover:bg-[#8a0808] transition-colors"
                >
                  {editingClassId ? 'Lưu thay đổi' : 'Thêm mới'}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    );
  };

  const renderUserModal = () => {
    if (!viewingUser) return null;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h3 className="text-lg font-bold text-[#b30b0b]">
              Thông tin {viewingUser.role === 'student' ? 'Sinh viên' : viewingUser.role === 'teacher' ? 'Giảng viên' : 'Quản trị viên'}
            </h3>
            <button onClick={() => setViewingUser(null)} className="text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center text-gray-500">
                <User className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-gray-900">{viewingUser.name}</h4>
                <p className="text-sm text-gray-500 font-mono">{viewingUser.id}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-y-3 text-sm">
              <div className="text-gray-500 font-medium">Email:</div>
              <div className="col-span-2 text-gray-900">{viewingUser.email}</div>
              
              <div className="text-gray-500 font-medium">Vai trò:</div>
              <div className="col-span-2 text-gray-900">
                <span className={`px-2 py-0.5 text-xs font-bold rounded ${viewingUser.role === 'admin' ? 'bg-red-100 text-red-800' : viewingUser.role === 'teacher' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                  {viewingUser.role === 'admin' ? 'Quản trị viên' : viewingUser.role === 'teacher' ? 'Giảng viên' : 'Sinh viên'}
                </span>
              </div>

              {viewingUser.role === 'student' && (
                <>
                  <div className="text-gray-500 font-medium">Mã lớp (MaLop):</div>
                  <div className="col-span-2 text-gray-900">{viewingUser.maLop || viewingUser.lop || 'Chưa cập nhật'}</div>
                  
                  <div className="text-gray-500 font-medium">Năm nhập học:</div>
                  <div className="col-span-2 text-gray-900">{viewingUser.namNhapHoc ?? 'Chưa cập nhật'}</div>
                  
                  <div className="text-gray-500 font-medium">Chuyên ngành:</div>
                  <div className="col-span-2 text-gray-900">{viewingUser.chuyenNganh || 'Chưa cập nhật'}</div>

                  <div className="text-gray-500 font-medium">Điện thoại:</div>
                  <div className="col-span-2 text-gray-900">{viewingUser.dienThoai || 'Chưa cập nhật'}</div>
                  
                  <div className="text-gray-500 font-medium">Khoa:</div>
                  <div className="col-span-2 text-gray-900">{viewingUser.khoa || 'Chưa cập nhật'}</div>
                </>
              )}

              {viewingUser.role === 'teacher' && (
                <>
                  <div className="text-gray-500 font-medium">Học vị:</div>
                  <div className="col-span-2 text-gray-900">{viewingUser.hocVi || 'Chưa cập nhật'}</div>

                  <div className="text-gray-500 font-medium">Khoa:</div>
                  <div className="col-span-2 text-gray-900">{viewingUser.khoaQuanLy || 'Chưa cập nhật'}</div>

                  <div className="text-gray-500 font-medium">Điện thoại:</div>
                  <div className="col-span-2 text-gray-900">{viewingUser.dienThoai || 'Chưa cập nhật'}</div>
                </>
              )}
            </div>
          </div>
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
            <button 
              onClick={() => setViewingUser(null)}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded text-sm font-bold hover:bg-gray-300 transition-colors"
            >
              Đóng
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  const renderMonHocModal = () => {
    if (!isMonHocModalOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col"
        >
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
            <h3 className="text-lg font-bold text-[#b30b0b]">{editingMonHocId ? 'Sửa' : 'Thêm'} Môn học</h3>
            <button onClick={() => { setIsMonHocModalOpen(false); setEditingMonHocId(null); }} className="text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto">
            <form onSubmit={handleSaveMonHoc} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mã môn *</label>
                  <input
                    type="text"
                    required
                    disabled={editingMonHocId !== null}
                    value={monHocForm.MaMon || ''}
                    onChange={e => setMonHocForm({ ...monHocForm, MaMon: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Số tín chỉ *</label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    required
                    value={monHocForm.SoTinChi || ''}
                    onChange={e => setMonHocForm({ ...monHocForm, SoTinChi: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tên môn học *</label>
                  <input
                    type="text"
                    required
                    value={monHocForm.TenMon || ''}
                    onChange={e => setMonHocForm({ ...monHocForm, TenMon: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Loại *</label>
                  <select
                    required
                    value={monHocForm.Loai || 'Bat buoc'}
                    onChange={e => setMonHocForm({ ...monHocForm, Loai: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                  >
                    <option value="Bat buoc">Bat buoc</option>
                    <option value="Tu chon">Tu chon</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đơn giá/TC (tùy chọn)</label>
                  <input
                    type="number"
                    min="1"
                    value={monHocForm.DonGiaTinChi === null || monHocForm.DonGiaTinChi === undefined ? '' : monHocForm.DonGiaTinChi}
                    onChange={e => setMonHocForm({ ...monHocForm, DonGiaTinChi: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder={`Để trống để dùng mặc định (${Math.round(defaultTuitionPerCredit).toLocaleString('vi-VN')} đ)`}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                  <textarea
                    rows={4}
                    value={monHocForm.MoTa || ''}
                    onChange={e => setMonHocForm({ ...monHocForm, MoTa: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                  />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-6">
                <button
                  type="button"
                  onClick={() => { setIsMonHocModalOpen(false); setEditingMonHocId(null); }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded font-medium hover:bg-gray-50 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#b30b0b] text-white rounded font-medium hover:bg-[#8a0808] transition-colors"
                >
                  {editingMonHocId ? 'Lưu thay đổi' : 'Thêm mới'}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    );
  };

  const renderDeleteMonHocModal = () => {
    if (!isDeleteMonHocModalOpen || !deletingMonHoc) return null;

    const dependency = monHocDependencyInfo?.dependencies;
    const hasDependencies = monHocDependencyInfo?.has_dependencies ?? false;
    const isDeleteMode = monHocDependencyModalMode === 'delete';

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-lg shadow-xl w-full max-w-xl overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h3 className="text-lg font-bold text-[#b30b0b]">{isDeleteMode ? 'Xác nhận xóa môn học' : 'Chi tiết phụ thuộc môn học'}</h3>
            <button onClick={handleCloseDeleteMonHocModal} className="text-gray-500 hover:text-gray-700" disabled={isDeletingMonHoc}>
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="text-sm text-gray-700">
              {isDeleteMode ? 'Bạn đang chuẩn bị xóa môn:' : 'Thông tin phụ thuộc của môn:'} <span className="font-bold text-[#b30b0b]">{deletingMonHoc.MaMon}</span> - <span className="font-semibold">{deletingMonHoc.TenMon}</span>
            </div>

            {isLoadingMonHocDependencies ? (
              <div className="text-sm text-gray-500">Đang kiểm tra dữ liệu phụ thuộc...</div>
            ) : (
              <div className="border border-gray-200 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left px-3 py-2 border-b border-gray-200">Bảng phụ thuộc</th>
                      <th className="text-right px-3 py-2 border-b border-gray-200">Số bản ghi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    <tr>
                      <td className="px-3 py-2">LOPHOCPHAN</td>
                      <td className="px-3 py-2 text-right font-semibold">{dependency?.lop_hoc_phan ?? 0}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">CTDT_MONHOC</td>
                      <td className="px-3 py-2 text-right font-semibold">{dependency?.chuong_trinh_dao_tao ?? 0}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">YEUCAU_TIENQUYET</td>
                      <td className="px-3 py-2 text-right font-semibold">{dependency?.tien_quyet ?? 0}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">KETQUA_HOCTAP</td>
                      <td className="px-3 py-2 text-right font-semibold">{dependency?.ket_qua_hoc_tap ?? 0}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {!isLoadingMonHocDependencies && hasDependencies && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded">
                {isDeleteMode
                  ? 'Không thể xóa môn học này vì đang có dữ liệu phụ thuộc. Vui lòng xử lý dữ liệu liên quan trước.'
                  : 'Môn học đang có dữ liệu phụ thuộc trong các bảng liên quan.'}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCloseDeleteMonHocModal}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded font-medium hover:bg-gray-100 transition-colors"
              disabled={isDeletingMonHoc}
            >
              Đóng
            </button>
            {isDeleteMode && (
              <button
                type="button"
                onClick={() => { void handleDeleteMonHoc(); }}
                disabled={isDeletingMonHoc || isLoadingMonHocDependencies || hasDependencies}
                className={`px-4 py-2 rounded font-bold transition-colors ${isDeletingMonHoc || isLoadingMonHocDependencies || hasDependencies ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-[#b30b0b] text-white hover:bg-[#8a0808]'}`}
              >
                {isDeletingMonHoc ? 'Đang xóa...' : 'Xóa môn học'}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    );
  };

  const renderCsvImportModal = () => {
    if (!isCsvImportModalOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-lg shadow-xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col"
        >
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
            <h3 className="text-lg font-bold text-[#b30b0b]">Import CSV vào SQL Server</h3>
            <button
              onClick={() => setIsCsvImportModalOpen(false)}
              className="text-gray-500 hover:text-gray-700"
              disabled={isImportingCsv}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-auto space-y-4">
            <div className="flex items-start gap-2 text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded p-3">
              <Info className="w-4 h-4 mt-0.5 text-blue-600 shrink-0" />
              <p>Danh sách dưới đây lấy từ thư mục database. Trạng thái Đã import dựa trên dữ liệu hiện có trong bảng SQL tương ứng.</p>
            </div>

            {isLoadingCsvFiles ? (
              <div className="text-sm text-gray-500">Đang tải danh sách file CSV...</div>
            ) : csvFilesError ? (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{csvFilesError}</div>
            ) : csvFiles.length === 0 ? (
              <div className="text-sm text-gray-500">Không tìm thấy file CSV nào trong thư mục database.</div>
            ) : (
              <div className="border border-gray-200 rounded overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      <th className="px-3 py-2 border-b border-gray-200 w-12 text-center">Chọn</th>
                      <th className="px-3 py-2 border-b border-gray-200">Tên file</th>
                      <th className="px-3 py-2 border-b border-gray-200">Bảng SQL</th>
                      <th className="px-3 py-2 border-b border-gray-200">Trạng thái</th>
                      <th className="px-3 py-2 border-b border-gray-200 text-right">Số dòng hiện có</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {csvFiles.map(file => {
                      const disabled = !file.mapped || isImportingCsv;
                      const checked = selectedCsvFiles.includes(file.file_name);

                      return (
                        <tr key={file.file_name} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleCsvSelection(file.file_name)}
                              className="h-4 w-4 accent-[#b30b0b]"
                            />
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-800">{file.file_name}</td>
                          <td className="px-3 py-2 text-gray-600">{file.table || 'Chưa ánh xạ'}</td>
                          <td className="px-3 py-2">
                            {!file.mapped ? (
                              <span className="px-2 py-0.5 text-xs font-bold rounded bg-gray-100 text-gray-600">Không hỗ trợ import</span>
                            ) : file.imported ? (
                              <span className="px-2 py-0.5 text-xs font-bold rounded bg-green-100 text-green-700">Đã import</span>
                            ) : (
                              <span className="px-2 py-0.5 text-xs font-bold rounded bg-amber-100 text-amber-700">Chưa import</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700">{file.row_count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
            <div className="text-sm text-gray-600">Đã chọn: <span className="font-bold text-[#b30b0b]">{selectedCsvFiles.length}</span> file</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsCsvImportModalOpen(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded font-medium hover:bg-gray-100 transition-colors"
                disabled={isImportingCsv}
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => { void handleImportSelectedCsv(); }}
                disabled={isImportingCsv || selectedCsvFiles.length === 0}
                className={`px-4 py-2 rounded font-bold transition-colors ${isImportingCsv || selectedCsvFiles.length === 0 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-[#b30b0b] text-white hover:bg-[#8a0808]'}`}
              >
                {isImportingCsv ? 'Đang import...' : 'Import file đã chọn'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser) {
      showNotification('Không xác định được tài khoản hiện tại.', 'error');
      return;
    }

    if (currentUser.role === 'admin') {
      showNotification('Tài khoản admin mặc định chưa hỗ trợ đổi mật khẩu.', 'error');
      return;
    }

    if (passwordForm.currentPassword.trim().length === 0) {
      showNotification('Vui lòng nhập mật khẩu hiện tại.', 'error');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showNotification('Mật khẩu mới không khớp!', 'error');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      showNotification('Mật khẩu mới phải có ít nhất 6 ký tự!', 'error');
      return;
    }

    try {
      const response = await apiFetch('/api/account/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          role: currentUser.role,
          current_password: passwordForm.currentPassword,
          new_password: passwordForm.newPassword,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        const detail = typeof result?.detail === 'string' ? result.detail : 'Không thể đổi mật khẩu.';
        showNotification(detail, 'error');
        return;
      }

      showNotification('Đổi mật khẩu thành công!', 'success');
      const updatedPassword = passwordForm.newPassword;

      setCurrentUser(prev => prev ? { ...prev, matKhau: updatedPassword } : prev);
      setUsersList(prev => prev.map(user => {
        if (user.id === currentUser.id && user.role === currentUser.role) {
          return { ...user, matKhau: updatedPassword };
        }
        return user;
      }));

      await loadUsersFromBackend();
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowAccountPasswords({ current: false, next: false, confirm: false });
    } catch (error) {
      console.error('Lỗi đổi mật khẩu:', error);
      showNotification('Không thể kết nối backend để đổi mật khẩu.', 'error');
    }
  };

  const renderAccountInfo = () => {
    if (!currentUser) return null;
    
    return (
      <div className="max-w-5xl mx-auto mt-8 p-4 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        {/* Account Info Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-fit">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <User className="w-5 h-5 text-[#b30b0b]" />
              Thông tin tài khoản
            </h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 border-b border-gray-100 pb-3">
                <div className="text-gray-500 font-medium">Họ và tên:</div>
                <div className="col-span-2 text-gray-900 font-medium">{currentUser.name}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-gray-100 pb-3">
                <div className="text-gray-500 font-medium">Mã số:</div>
                <div className="col-span-2 text-gray-900">{currentUser.id}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-gray-100 pb-3">
                <div className="text-gray-500 font-medium">Email:</div>
                <div className="col-span-2 text-gray-900">{currentUser.email}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-gray-100 pb-3">
                <div className="text-gray-500 font-medium">Vai trò:</div>
                <div className="col-span-2 text-gray-900">
                  {currentUser.role === 'student' ? 'Sinh viên' : currentUser.role === 'teacher' ? 'Giảng viên' : 'Quản trị viên'}
                </div>
              </div>
              
              {currentUser.role === 'student' && (
                <>
                  <div className="grid grid-cols-3 gap-2 border-b border-gray-100 pb-3">
                    <div className="text-gray-500 font-medium">Mã lớp (MaLop):</div>
                    <div className="col-span-2 text-gray-900">{currentUser.maLop || currentUser.lop || 'Chưa cập nhật'}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-gray-100 pb-3">
                    <div className="text-gray-500 font-medium">Năm nhập học:</div>
                    <div className="col-span-2 text-gray-900">{currentUser.namNhapHoc ?? 'Chưa cập nhật'}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-gray-100 pb-3">
                    <div className="text-gray-500 font-medium">Chuyên ngành:</div>
                    <div className="col-span-2 text-gray-900">{currentUser.chuyenNganh || 'Chưa cập nhật'}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-gray-100 pb-3">
                    <div className="text-gray-500 font-medium">Điện thoại:</div>
                    <div className="col-span-2 text-gray-900">{currentUser.dienThoai || 'Chưa cập nhật'}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pb-1">
                    <div className="text-gray-500 font-medium">Khoa:</div>
                    <div className="col-span-2 text-gray-900">{currentUser.khoa || 'Chưa cập nhật'}</div>
                  </div>
                </>
              )}

              {currentUser.role === 'teacher' && (
                <>
                  <div className="grid grid-cols-3 gap-2 border-b border-gray-100 pb-3">
                    <div className="text-gray-500 font-medium">Học vị:</div>
                    <div className="col-span-2 text-gray-900">{currentUser.hocVi || 'Chưa cập nhật'}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-gray-100 pb-3">
                    <div className="text-gray-500 font-medium">Khoa:</div>
                    <div className="col-span-2 text-gray-900">{currentUser.khoaQuanLy || 'Chưa cập nhật'}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pb-1">
                    <div className="text-gray-500 font-medium">Điện thoại:</div>
                    <div className="col-span-2 text-gray-900">{currentUser.dienThoai || 'Chưa cập nhật'}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Change Password Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-fit">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Key className="w-5 h-5 text-[#b30b0b]" />
              Đổi mật khẩu
            </h2>
          </div>
          <div className="p-6">
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu hiện tại</label>
                <div className="relative">
                  <input 
                    type={showAccountPasswords.current ? 'text' : 'password'}
                    required
                    value={passwordForm.currentPassword}
                    onChange={e => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAccountPasswords(prev => ({ ...prev, current: !prev.current }))}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-[#b30b0b]"
                    aria-label={showAccountPasswords.current ? 'Ẩn mật khẩu hiện tại' : 'Hiển thị mật khẩu hiện tại'}
                    title={showAccountPasswords.current ? 'Ẩn mật khẩu hiện tại' : 'Hiển thị mật khẩu hiện tại'}
                  >
                    {showAccountPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu mới</label>
                <div className="relative">
                  <input 
                    type={showAccountPasswords.next ? 'text' : 'password'}
                    required
                    value={passwordForm.newPassword}
                    onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAccountPasswords(prev => ({ ...prev, next: !prev.next }))}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-[#b30b0b]"
                    aria-label={showAccountPasswords.next ? 'Ẩn mật khẩu mới' : 'Hiển thị mật khẩu mới'}
                    title={showAccountPasswords.next ? 'Ẩn mật khẩu mới' : 'Hiển thị mật khẩu mới'}
                  >
                    {showAccountPasswords.next ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Xác nhận mật khẩu mới</label>
                <div className="relative">
                  <input 
                    type={showAccountPasswords.confirm ? 'text' : 'password'}
                    required
                    value={passwordForm.confirmPassword}
                    onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#b30b0b]/50 focus:border-[#b30b0b]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAccountPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-[#b30b0b]"
                    aria-label={showAccountPasswords.confirm ? 'Ẩn xác nhận mật khẩu mới' : 'Hiển thị xác nhận mật khẩu mới'}
                    title={showAccountPasswords.confirm ? 'Ẩn xác nhận mật khẩu mới' : 'Hiển thị xác nhận mật khẩu mới'}
                  >
                    {showAccountPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="pt-4">
                <button 
                  type="submit"
                  className="w-full bg-[#b30b0b] text-white py-2 rounded font-bold hover:bg-[#8a0808] transition-colors"
                >
                  Cập nhật mật khẩu
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence mode="wait">
      {!isAuthenticated ? (
        <motion.div 
          key="login"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3 }}
          className="min-h-screen bg-[#f4f6f9] flex items-center justify-center p-4 font-sans"
        >
          <div className="max-w-md w-full bg-white shadow-lg overflow-hidden border border-gray-200">
            <div className="bg-[#b30b0b] p-6 text-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                <BookOpen className="w-8 h-8 text-[#b30b0b]" />
              </div>
              <h2 className="text-lg font-bold text-white tracking-wide">HỌC VIỆN CÔNG NGHỆ BƯU CHÍNH VIỄN THÔNG</h2>
              <p className="text-red-100 text-xs mt-1 uppercase tracking-wider">Cổng thông tin quản lý đào tạo</p>
            </div>
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">ĐĂNG NHẬP HỆ THỐNG</h3>
              <AnimatePresence>
              {loginError && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="bg-red-50 text-red-600 p-3 text-sm border border-red-200 flex items-center overflow-hidden"
                >
                  <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
                  {loginError}
                </motion.div>
              )}
              </AnimatePresence>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Email đăng nhập</label>
                  <input 
                    type="email" 
                    required
                    className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-[#b30b0b] focus:ring-1 focus:ring-[#b30b0b]"
                    placeholder="Ví dụ: tuan.nv22@sv.ptit.edu.vn"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Mật khẩu</label>
                  <div className="relative">
                    <input 
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      className="w-full border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:border-[#b30b0b] focus:ring-1 focus:ring-[#b30b0b]"
                      placeholder="Nhập mật khẩu (cột MatKhau trong dữ liệu import)"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-[#b30b0b]"
                      aria-label={showLoginPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
                      title={showLoginPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button 
                  type="submit" 
                  className="w-full bg-[#b30b0b] text-white font-bold py-2.5 px-4 hover:bg-[#8a0808] transition-colors mt-2"
                >
                  ĐĂNG NHẬP
                </button>
              </form>
              <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-500 text-center bg-gray-50 p-3">
                <p className="font-semibold mb-2 text-gray-700">Tài khoản thử nghiệm:</p>
                <div className="grid grid-cols-1 gap-2 text-left max-w-[250px] mx-auto">
                  <div className="bg-white p-2 border border-gray-200 rounded">
                    <p className="font-bold text-[#b30b0b] mb-1">Sinh viên</p>
                    <p>Email: tuan.nv22@sv.ptit.edu.vn</p>
                    <p>Mật khẩu: B22DCDT001</p>
                  </div>
                  <div className="bg-white p-2 border border-gray-200 rounded">
                    <p className="font-bold text-[#b30b0b] mb-1">Giảng viên</p>
                    <p>Email: hung.nd@ptit.edu.vn</p>
                    <p>Mật khẩu: GV001</p>
                  </div>
                  <div className="bg-white p-2 border border-gray-200 rounded">
                    <p className="font-bold text-[#b30b0b] mb-1">Quản trị viên</p>
                    <p>Email: admin@ptit.edu.vn</p>
                    <p>Mật khẩu: ADMIN001</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div 
          key="app"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col h-screen bg-[#f4f6f9] font-sans text-gray-900"
        >
          {/* Top Header PTIT Style */}
          <header className="bg-[#b30b0b] text-white h-14 flex items-center justify-between px-4 shadow-md z-30 shrink-0">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center mr-3">
                <BookOpen className="w-5 h-5 text-[#b30b0b]" />
              </div>
              <div>
                <h1 className="font-bold text-sm md:text-base tracking-wide">HỌC VIỆN CÔNG NGHỆ BƯU CHÍNH VIỄN THÔNG</h1>
                <p className="text-[10px] md:text-xs text-red-100 uppercase tracking-wider">Cổng thông tin quản lý đào tạo</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div 
                className="hidden md:flex items-center text-sm cursor-pointer hover:text-gray-200 transition-colors"
                onClick={() => setCurrentView('account-info')}
                title="Xem thông tin tài khoản"
              >
                <User className="w-4 h-4 mr-1.5" />
                <span className="font-medium">{currentUser?.name} ({currentUser?.id})</span>
              </div>
              <button onClick={handleLogout} className="p-1.5 hover:bg-red-800 rounded transition-colors" title="Đăng xuất">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>

          <div className="flex flex-1 overflow-hidden">
            {/* Left Sidebar Classic Style */}
            <aside className="w-64 bg-white border-r border-gray-300 flex flex-col shrink-0 z-20 shadow-sm">
              <div className="p-3 bg-gray-100 border-b border-gray-300 flex items-center text-sm font-bold text-gray-700 uppercase">
                <Menu className="w-4 h-4 mr-2" />
                Menu Chức năng
              </div>
              <nav className="flex-1 py-2">
                <NavItem 
                  icon={<LayoutDashboard className="w-4 h-4" />} 
                  label="Bảng điều khiển" 
                  active={currentView === 'dashboard'} 
                  onClick={() => setCurrentView('dashboard')} 
                />
                {userRole === 'student' && (
                  <>
                    <NavItem 
                      icon={<CheckCircle2 className="w-4 h-4" />} 
                      label="Đăng ký môn học" 
                      active={currentView === 'registration'} 
                      onClick={() => setCurrentView('registration')} 
                    />
                    <NavItem 
                      icon={<GraduationCap className="w-4 h-4" />} 
                      label="Kết quả học tập" 
                      active={currentView === 'results'} 
                      onClick={() => setCurrentView('results')} 
                    />
                    <NavItem 
                      icon={<Calendar className="w-4 h-4" />} 
                      label="Thời khóa biểu" 
                      active={currentView === 'timetable'} 
                      onClick={() => setCurrentView('timetable')} 
                    />
                  </>
                )}
                {userRole === 'teacher' && (
                  <>
                    <NavItem 
                      icon={<Calendar className="w-4 h-4" />} 
                      label="Lịch dạy của tôi" 
                      active={currentView === 'teacher-schedule'} 
                      onClick={() => setCurrentView('teacher-schedule')} 
                    />
                    <NavItem 
                      icon={<BookOpen className="w-4 h-4" />} 
                      label="Quản lý lịch dạy" 
                      active={currentView === 'teacher-classes'} 
                      onClick={() => setCurrentView('teacher-classes')} 
                    />
                  </>
                )}
                {userRole === 'admin' && (
                  <>
                    <NavItem 
                      icon={<User className="w-4 h-4" />} 
                      label="Quản lý Sinh viên" 
                      active={currentView === 'manage-students'} 
                      onClick={() => setCurrentView('manage-students')} 
                    />
                    <NavItem 
                      icon={<User className="w-4 h-4" />} 
                      label="Quản lý Giảng viên" 
                      active={currentView === 'manage-teachers'} 
                      onClick={() => setCurrentView('manage-teachers')} 
                    />
                    <NavItem 
                      icon={<BookOpen className="w-4 h-4" />} 
                      label="Quản lý Lớp học phần" 
                      active={currentView === 'manage-classes'} 
                      onClick={() => setCurrentView('manage-classes')} 
                    />
                    <NavItem 
                      icon={<BookMarked className="w-4 h-4" />} 
                      label="Quản lý Môn học" 
                      active={currentView === 'manage-courses'} 
                      onClick={() => setCurrentView('manage-courses')} 
                    />
                  </>
                )}
                <div className="my-2 border-t border-gray-200"></div>
                <NavItem 
                  icon={<User className="w-4 h-4" />} 
                  label="Thông tin tài khoản" 
                  active={currentView === 'account-info'} 
                  onClick={() => setCurrentView('account-info')} 
                />
              </nav>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col overflow-hidden relative bg-[#f4f6f9]">
              <div className="px-6 py-3 bg-white border-b border-gray-200 flex items-center shadow-sm shrink-0 z-10 relative">
                <h2 className="text-lg font-bold text-[#b30b0b] uppercase">
                  {currentView === 'dashboard' && 'Bảng điều khiển'}
                  {currentView === 'registration' && 'Đăng ký môn học'}
                  {currentView === 'results' && 'Kết quả học tập'}
                  {currentView === 'timetable' && 'Thời khóa biểu'}
                  {currentView === 'manage-students' && 'Quản lý Sinh viên'}
                  {currentView === 'manage-teachers' && 'Quản lý Giảng viên'}
                  {currentView === 'manage-classes' && 'Quản lý Lớp học phần'}
                  {currentView === 'manage-courses' && 'Quản lý Môn học'}
                  {currentView === 'teacher-schedule' && 'Lịch dạy của tôi'}
                  {currentView === 'teacher-classes' && 'Quản lý lịch dạy'}
                  {currentView === 'account-info' && 'Thông tin tài khoản'}
                </h2>
              </div>

              <div className="flex-1 overflow-hidden relative">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentView}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 flex flex-col"
                  >
                    {currentView === 'dashboard' && renderDashboard()}
                    {currentView === 'registration' && renderRegistration()}
                    {currentView === 'results' && renderResults()}
                    {currentView === 'timetable' && renderTimetable()}
                    {currentView === 'manage-students' && renderManageUsersByRole('student')}
                    {currentView === 'manage-teachers' && renderManageUsersByRole('teacher')}
                    {currentView === 'manage-classes' && renderManageClasses()}
                    {currentView === 'manage-courses' && renderManageCourses()}
                    {currentView === 'teacher-schedule' && renderTimetable()}
                    {currentView === 'teacher-classes' && renderTeacherClasses()}
                    {currentView === 'account-info' && renderAccountInfo()}
                  </motion.div>
                </AnimatePresence>
              </div>
            </main>
          </div>

          {/* Toast Notifications */}
          <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
            <AnimatePresence>
              {notifications.map(n => (
                <motion.div 
                  key={n.id} 
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className={`flex items-center p-3 border shadow-md text-sm font-medium min-w-[300px] pointer-events-auto ${n.type === 'success' ? 'bg-[#d4edda] text-[#155724] border-[#c3e6cb]' : 'bg-[#f8d7da] text-[#721c24] border-[#f5c6cb]'}`}
                >
                  {n.type === 'success' ? <CheckCircle2 className="w-4 h-4 mr-2 shrink-0" /> : <AlertCircle className="w-4 h-4 mr-2 shrink-0" />}
                  {n.message}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* User Details Modal */}
          <AnimatePresence>
            {viewingUser && renderUserModal()}
            {isAddUserModalOpen && renderAddUserModal()}
            {isAddClassModalOpen && renderAddClassModal()}
            {isMonHocModalOpen && renderMonHocModal()}
            {isDeleteMonHocModalOpen && renderDeleteMonHocModal()}
            {isCsvImportModalOpen && renderCsvImportModal()}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      className={`w-full flex items-center px-4 py-2.5 text-sm font-medium transition-colors relative ${active ? 'bg-red-50 text-[#b30b0b]' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'}`}
      onClick={onClick}
    >
      {active && (
        <motion.div layoutId="activeNav" className="absolute left-0 top-0 bottom-0 w-1 bg-[#b30b0b]" />
      )}
      <span className={`mr-3 ${active ? 'text-[#b30b0b]' : 'text-gray-500'}`}>
        {icon}
      </span>
      {label}
    </button>
  );
}
