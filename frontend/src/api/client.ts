import type { Application, ApplicationForm, AuthUser, Card, History, LimitRequest } from '../types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const TOKEN_KEY = 'ccm.token';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Fired when the API rejects our token mid-session; AuthProvider listens and signs the user out. */
export const UNAUTHORIZED_EVENT = 'ccm:unauthorized';

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (t: string): void => localStorage.setItem(TOKEN_KEY, t),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data: unknown = await res.json().catch(() => null);
  if (res.status === 401 && token) {
    // Expired/revoked token or deleted user: drop it so the UI returns to the login screen.
    tokenStore.clear();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

const get = <T>(p: string) => request<T>('GET', p);
const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {});

interface AuthResult {
  token: string;
  user: AuthUser;
}

export function toApplicationPayload(f: ApplicationForm): Record<string, unknown> {
  return {
    ...f,
    monthlyIncome: Number(f.monthlyIncome),
    requestedCreditLimit: Number(f.requestedCreditLimit),
    employerName: f.employerName || undefined,
  };
}

export const api = {
  login: (email: string, password: string) => post<AuthResult>('/auth/login', { email, password }),
  register: (b: { email: string; password: string; firstName: string; lastName: string }) =>
    post<AuthResult>('/auth/register', b),
  me: () => get<AuthUser>('/auth/me'),

  applications: () => get<Application[]>('/applications'),
  application: (id: string) => get<Application>(`/applications/${id}`),
  createApplication: (f: ApplicationForm) => post<Application>('/applications', toApplicationPayload(f)),
  submitApplication: (id: string) => post<Application>(`/applications/${id}/submit`),

  cards: () => get<Card[]>('/cards'),
  activateCard: (id: string) => post<Card>(`/cards/${id}/activate`),
  requestLimit: (cardId: string, requestedLimit: number, reason?: string) =>
    post<LimitRequest>(`/cards/${cardId}/limit-requests`, { requestedLimit, reason: reason || undefined }),
  limitRequests: () => get<LimitRequest[]>('/limit-requests'),
  cancelLimitRequest: (id: string) => post<LimitRequest>(`/limit-requests/${id}/cancel`),

  officerApplications: (status?: string) =>
    get<Application[]>(`/officer/applications${status ? `?status=${status}` : ''}`),
  officerApplication: (id: string) => get<Application>(`/officer/applications/${id}`),
  decideApplication: (
    id: string,
    body: { decision: 'APPROVED'; approvedLimit: number; comment?: string } | { decision: 'REJECTED'; comment: string },
  ) => post<Application>(`/officer/applications/${id}/decision`, body),
  officerLimitRequests: (status?: string) =>
    get<LimitRequest[]>(`/officer/limit-requests${status ? `?status=${status}` : ''}`),
  decideLimitRequest: (id: string, decision: 'APPROVED' | 'REJECTED', comment?: string) =>
    post<LimitRequest>(`/officer/limit-requests/${id}/decision`, { decision, comment: comment || undefined }),
  history: () => get<History>('/officer/history'),
};
