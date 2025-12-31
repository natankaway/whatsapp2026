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

export const getBookingsToday = () => fetchApi<Booking[]>('/bookings/today');
export const getBookingsWeek = () => fetchApi<Booking[]>('/bookings/week');

export const createBooking = (data: Omit<Booking, 'id' | 'createdAt'>) =>
  fetchApi<Booking>('/bookings', { method: 'POST', body: JSON.stringify(data) });

export const updateBooking = (id: number, data: Partial<Booking>) =>
  fetchApi<Booking>(`/bookings/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteBooking = (id: number) =>
  fetchApi<void>(`/bookings/${id}`, { method: 'DELETE' });

// Poll Schedules
export const getPollSchedules = () => fetchApi<PollSchedule[]>('/poll-schedules');

export const createPollSchedule = (data: Omit<PollSchedule, 'id'>) =>
  fetchApi<PollSchedule>('/poll-schedules', { method: 'POST', body: JSON.stringify(data) });

export const updatePollSchedule = (id: number, data: Partial<PollSchedule>) =>
  fetchApi<PollSchedule>(`/poll-schedules/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deletePollSchedule = (id: number) =>
  fetchApi<void>(`/poll-schedules/${id}`, { method: 'DELETE' });

// Students
export const getStudents = (params?: { unit?: string; status?: string }) => {
  const query = new URLSearchParams();
  if (params?.unit) query.set('unit', params.unit);
  if (params?.status) query.set('status', params.status);
  return fetchApi<Student[]>(`/students?${query}`);
};

export const getStudentsWithStatus = () => fetchApi<Student[]>('/students/with-status');
export const getOverdueStudents = () => fetchApi<Student[]>('/students/overdue');
export const getStudentsDueToday = () => fetchApi<Student[]>('/students/due-today');

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
  fetchApi<{ success: boolean }>('/bot/pause', { method: 'POST', body: JSON.stringify({ reason }) });

export const resumeBot = () =>
  fetchApi<{ success: boolean }>('/bot/resume', { method: 'POST' });

export const reconnectBot = () =>
  fetchApi<{ success: boolean }>('/bot/reconnect', { method: 'POST' });
