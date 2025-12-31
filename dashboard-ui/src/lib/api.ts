// API Client for CT LK Futevôlei Dashboard

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

// Get auth header from localStorage
function getAuthHeader(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('authHeader') || '';
}

// Set auth header
export function setAuthHeader(header: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('authHeader', header);
  }
}

// Check if authenticated
export function isAuthenticated(): boolean {
  return !!getAuthHeader();
}

// Logout
export function logout(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('authHeader');
  }
}

// Generic fetch wrapper
async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const authHeader = getAuthHeader();

  const response = await fetch(`${API_BASE}/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
      ...options.headers,
    },
  });

  if (response.status === 401) {
    logout();
    throw new Error('Não autorizado');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(error.error || 'Erro na requisição');
  }

  return response.json();
}

// ============= Types =============

export interface BotStatus {
  whatsapp: {
    connected: boolean;
    state: string;
    user: { id: string; name: string } | null;
    uptime: number;
    uptimeFormatted: string;
  };
  system: {
    uptime: number;
    uptimeFormatted: string;
    memory: { heapUsed: number; heapTotal: number; rss: number; percentUsed: number };
    platform: string;
    nodeVersion: string;
  };
  bot: {
    isPaused: boolean;
    pauseReason: string | null;
    pausedAt: string | null;
    pausedBy: string | null;
  };
}

export interface Unit {
  id: number;
  slug: string;
  name: string;
  address: string;
  phone: string;
  maxBookingsPerSlot: number;
}

export interface Booking {
  id: number;
  date: string;
  time: string;
  unitId: number;
  unitName?: string;
  name: string;
  phone: string;
  status: 'confirmed' | 'pending' | 'cancelled';
  source: string;
  createdAt: string;
}

// Backend PollSchedule format
export interface PollScheduleBackend {
  id: number;
  name: string;
  description?: string;
  targetGroup: string;
  customGroupId?: string;
  dayOfWeek: string;
  pollOptions: string[];
  scheduleHour: number;
  scheduleMinute: number;
  scheduleDays: number[];
  isActive: boolean;
  lastExecutedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Frontend PollSchedule format (more user-friendly)
export interface PollSchedule {
  id: number;
  name: string;
  targetGroup: string;
  customGroupId?: string;
  time: string;
  dayOfWeek: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  pollOptions: string[];
  enabled: boolean;
  lastExecuted?: string;
}

// Convert backend format to frontend format
const convertToFrontendFormat = (backend: PollScheduleBackend): PollSchedule => {
  const hour = String(backend.scheduleHour).padStart(2, '0');
  const minute = String(backend.scheduleMinute).padStart(2, '0');
  const days = backend.scheduleDays || [];

  return {
    id: backend.id,
    name: backend.name,
    targetGroup: backend.targetGroup,
    customGroupId: backend.customGroupId,
    time: `${hour}:${minute}`,
    dayOfWeek: backend.dayOfWeek,
    sunday: days.includes(0),
    monday: days.includes(1),
    tuesday: days.includes(2),
    wednesday: days.includes(3),
    thursday: days.includes(4),
    friday: days.includes(5),
    saturday: days.includes(6),
    pollOptions: backend.pollOptions || [],
    enabled: backend.isActive,
    lastExecuted: backend.lastExecutedAt,
  };
};

// Convert frontend format to backend format
const convertToBackendFormat = (frontend: Omit<PollSchedule, 'id'>): Omit<PollScheduleBackend, 'id' | 'createdAt' | 'updatedAt' | 'lastExecutedAt'> => {
  const [hour, minute] = frontend.time.split(':').map(Number);
  const scheduleDays: number[] = [];
  if (frontend.sunday) scheduleDays.push(0);
  if (frontend.monday) scheduleDays.push(1);
  if (frontend.tuesday) scheduleDays.push(2);
  if (frontend.wednesday) scheduleDays.push(3);
  if (frontend.thursday) scheduleDays.push(4);
  if (frontend.friday) scheduleDays.push(5);
  if (frontend.saturday) scheduleDays.push(6);

  return {
    name: frontend.name,
    targetGroup: frontend.targetGroup,
    customGroupId: frontend.customGroupId,
    dayOfWeek: frontend.dayOfWeek,
    pollOptions: frontend.pollOptions,
    scheduleHour: hour || 8,
    scheduleMinute: minute || 0,
    scheduleDays,
    isActive: frontend.enabled,
  };
};

export interface Student {
  id: number;
  name: string;
  phone: string;
  email?: string;
  unit: 'recreio' | 'bangu';
  plan: string;
  planValue: number;
  dueDay: number;
  startDate: string;
  status: 'active' | 'inactive' | 'suspended';
  notes?: string;
  createdAt: string;
  updatedAt: string;
  lastPayment?: Payment;
  isOverdue?: boolean;
  daysOverdue?: number;
}

export interface Payment {
  id: number;
  studentId: number;
  studentName?: string;
  amount: number;
  referenceMonth: string;
  paymentDate: string;
  paymentMethod: 'pix' | 'dinheiro' | 'cartao' | 'transferencia' | 'outro';
  notes?: string;
  createdAt: string;
}

export interface BillingConfig {
  enabled: boolean;
  time: string;
  daysOfWeek: number[];
  message: string;
  pixKey: string;
  pixName: string;
  nextExecution?: string;
}

export interface Settings {
  botPaused: boolean;
  pauseReason: string;
  pausedAt: string;
  pausedBy: string;
  workingHoursEnabled: boolean;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingDays: number[];
  outsideHoursMessage: string;
  pausedMessage: string;
}

export interface MonthlyReport {
  month: string;
  totalStudents: number;
  totalPaid: number;
  totalPending: number;
  totalRevenue: number;
  payments: Payment[];
}

// ============= API Functions =============

// Status
export const getStatus = () => fetchApi<BotStatus>('/status');
export const getQRCode = () => fetchApi<{ qr: string | null }>('/qr');

// Units
export const getUnits = () => fetchApi<Unit[]>('/units');

// Bookings
export const getBookings = (params?: { date?: string; unitId?: number }) => {
  const query = new URLSearchParams();
  if (params?.date) query.set('date', params.date);
  if (params?.unitId) query.set('unitId', String(params.unitId));
  return fetchApi<Booking[]>(`/bookings?${query}`);
};

export const getBookingsToday = () => fetchApi<{
  date: string;
  recreio: { total: number; bookings: Booking[] };
  bangu: { total: number; bookings: Booking[] };
  totalGeral: number;
}>('/bookings/today');

export interface WeekDay {
  date: string;
  dayName: string;
  recreio: number;
  bangu: number;
  total: number;
}

export const getBookingsWeek = () => fetchApi<{
  startDate: string;
  endDate: string;
  days: WeekDay[];
  totalSemana: number;
}>('/bookings/week');

export const searchBookings = (query: string, unit?: string) => {
  const params = new URLSearchParams({ query });
  if (unit) params.set('unit', unit);
  return fetchApi<{ query: string; total: number; bookings: Booking[] }>(`/bookings/search?${params}`);
};

export const exportBookingsCSV = (startDate: string, endDate: string, unit?: string) => {
  const params = new URLSearchParams({ startDate, endDate });
  if (unit) params.set('unit', unit);
  const authHeader = typeof window !== 'undefined' ? localStorage.getItem('authHeader') || '' : '';
  return `${API_BASE}/api/bookings/export?${params}&auth=${encodeURIComponent(authHeader)}`;
};

export const createBooking = (data: Omit<Booking, 'id' | 'createdAt'>) =>
  fetchApi<Booking>('/bookings', { method: 'POST', body: JSON.stringify(data) });

export const updateBooking = (id: number, data: Partial<Booking>) =>
  fetchApi<Booking>(`/bookings/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteBooking = (id: number) =>
  fetchApi<void>(`/bookings/${id}`, { method: 'DELETE' });

// Poll Schedules
export const getPollSchedules = async (): Promise<PollSchedule[]> => {
  const response = await fetchApi<{ schedules: PollScheduleBackend[] } | PollScheduleBackend[]>('/poll-schedules');
  let schedules: PollScheduleBackend[] = [];

  if (Array.isArray(response)) {
    schedules = response;
  } else if (response && typeof response === 'object' && 'schedules' in response) {
    schedules = response.schedules || [];
  }

  return schedules.map(convertToFrontendFormat);
};

export const createPollSchedule = async (data: Omit<PollSchedule, 'id'>): Promise<PollSchedule> => {
  const backendData = convertToBackendFormat(data);
  const response = await fetchApi<PollScheduleBackend>('/poll-schedules', {
    method: 'POST',
    body: JSON.stringify(backendData),
  });
  return convertToFrontendFormat(response);
};

export const updatePollSchedule = async (id: number, data: Partial<PollSchedule>): Promise<PollSchedule | void> => {
  // For partial updates, we need to convert the fields that are being updated
  const backendData: Record<string, unknown> = {};

  if (data.enabled !== undefined) backendData.isActive = data.enabled;
  if (data.name !== undefined) backendData.name = data.name;
  if (data.targetGroup !== undefined) backendData.targetGroup = data.targetGroup;
  if (data.customGroupId !== undefined) backendData.customGroupId = data.customGroupId;
  if (data.dayOfWeek !== undefined) backendData.dayOfWeek = data.dayOfWeek;
  if (data.pollOptions !== undefined) backendData.pollOptions = data.pollOptions;
  if (data.time !== undefined) {
    const [hour, minute] = data.time.split(':').map(Number);
    backendData.scheduleHour = hour;
    backendData.scheduleMinute = minute;
  }

  // Handle day updates
  const dayFields = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
  const hasAnyDayField = dayFields.some(d => data[d] !== undefined);
  if (hasAnyDayField) {
    const scheduleDays: number[] = [];
    if (data.sunday) scheduleDays.push(0);
    if (data.monday) scheduleDays.push(1);
    if (data.tuesday) scheduleDays.push(2);
    if (data.wednesday) scheduleDays.push(3);
    if (data.thursday) scheduleDays.push(4);
    if (data.friday) scheduleDays.push(5);
    if (data.saturday) scheduleDays.push(6);
    backendData.scheduleDays = scheduleDays;
  }

  await fetchApi(`/poll-schedules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(backendData),
  });
};

export const deletePollSchedule = (id: number) =>
  fetchApi<void>(`/poll-schedules/${id}`, { method: 'DELETE' });

export const executePollSchedule = (id: number) =>
  fetchApi<{ success: boolean; message: string }>(`/poll-schedules/${id}/execute`, { method: 'POST' });

// Students - Handle both array and object responses
const extractStudents = (response: { students: Student[] } | Student[]): Student[] => {
  if (Array.isArray(response)) return response;
  if (response && typeof response === 'object' && 'students' in response) {
    return response.students || [];
  }
  return [];
};

export const getStudents = async (params?: { unit?: string; status?: string }): Promise<Student[]> => {
  const query = new URLSearchParams();
  if (params?.unit) query.set('unit', params.unit);
  if (params?.status) query.set('status', params.status);
  const response = await fetchApi<{ students: Student[] } | Student[]>(`/students?${query}`);
  return extractStudents(response);
};

export const getStudentsWithStatus = async (): Promise<Student[]> => {
  const response = await fetchApi<{ students: Student[] } | Student[]>('/students/with-status');
  return extractStudents(response);
};

export const getOverdueStudents = async (): Promise<Student[]> => {
  const response = await fetchApi<{ students: Student[] } | Student[]>('/students/overdue');
  return extractStudents(response);
};

export const getStudentsDueToday = async (): Promise<Student[]> => {
  const response = await fetchApi<{ students: Student[] } | Student[]>('/students/due-today');
  return extractStudents(response);
};

export const createStudent = (data: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>) =>
  fetchApi<Student>('/students', { method: 'POST', body: JSON.stringify(data) });

export const updateStudent = (id: number, data: Partial<Student>) =>
  fetchApi<Student>(`/students/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteStudent = (id: number) =>
  fetchApi<void>(`/students/${id}`, { method: 'DELETE' });

// Payments
export const getPayments = (params?: { month?: string; studentId?: number }) => {
  const query = new URLSearchParams();
  if (params?.month) query.set('month', params.month);
  if (params?.studentId) query.set('studentId', String(params.studentId));
  return fetchApi<Payment[]>(`/payments?${query}`);
};

export const getMonthlyReport = (month: string) =>
  fetchApi<MonthlyReport>(`/payments/report/${month}`);

export const createPayment = (data: Omit<Payment, 'id' | 'createdAt'>) =>
  fetchApi<Payment>('/payments', { method: 'POST', body: JSON.stringify(data) });

export const deletePayment = (id: number) =>
  fetchApi<void>(`/payments/${id}`, { method: 'DELETE' });

// Billing
export const getBillingConfig = () => fetchApi<BillingConfig>('/billing/config');

export const updateBillingConfig = (data: Partial<BillingConfig>) =>
  fetchApi<{ success: boolean; config: BillingConfig }>('/billing/config', {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const sendBillingReminder = (studentId: number) =>
  fetchApi<{ success: boolean }>(`/billing/send-reminder/${studentId}`, { method: 'POST' });

export const sendBulkReminders = () =>
  fetchApi<{ total: number; sent: number; failed: number }>('/billing/send-bulk-reminders', {
    method: 'POST',
  });

export const executeBillingNow = () =>
  fetchApi<{ success: boolean }>('/billing/execute-now', { method: 'POST' });

// Settings
export const getSettings = () => fetchApi<Settings>('/settings');

export const updateSettings = (data: Partial<Settings>) =>
  fetchApi<{ success: boolean }>('/settings', { method: 'PUT', body: JSON.stringify(data) });

// Bot Control
export const pauseBot = (reason: string) =>
  fetchApi<{ success: boolean }>('/settings/pause', { method: 'POST', body: JSON.stringify({ reason }) });

export const resumeBot = () =>
  fetchApi<{ success: boolean }>('/settings/resume', { method: 'POST' });

export const reconnectBot = () =>
  fetchApi<{ success: boolean }>('/bot/reconnect', { method: 'POST' });
