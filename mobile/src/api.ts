import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL = 'https://tailorapp.on.shiper.app/backend';
const SESSION_KEY = 'tailorapp.session.v1';
const ACCESS_TOKEN_LIFETIME_MS = 15 * 60 * 1000;

export interface Session {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  user: { id: string; name: string; email: string };
  business: { id: string; name: string };
  permissions: string[];
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function storeSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function readSession(): Promise<Session | null> {
  const serialized = await SecureStore.getItemAsync(SESSION_KEY);
  if (!serialized) return null;
  const session: unknown = JSON.parse(serialized);
  if (!session || typeof session !== 'object'
    || !('refreshToken' in session) || typeof session.refreshToken !== 'string'
    || !('accessToken' in session) || typeof session.accessToken !== 'string'
    || !('business' in session) || typeof session.business !== 'object') {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return null;
  }
  return session as Session;
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('The server returned an invalid response');
  }
  if (!body || typeof body !== 'object') throw new Error('The server returned an invalid response');
  return body as Record<string, unknown>;
}

function responseError(body: Record<string, unknown>, status: number): ApiError {
  const error = body.error && typeof body.error === 'object'
    ? body.error as Record<string, unknown>
    : {};
  return new ApiError(
    typeof error.message === 'string' ? error.message : 'The request could not be completed',
    status,
    typeof error.code === 'string' ? error.code : undefined,
  );
}

async function rotate(session: Session): Promise<Session> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  const body = await responseBody(response);
  const data = body.data as Record<string, unknown> | undefined;
  if (!response.ok || typeof data?.accessToken !== 'string' || typeof data.refreshToken !== 'string') {
    throw responseError(body, response.status);
  }
  const nextSession = {
    ...session,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    accessExpiresAt: Date.now() + ACCESS_TOKEN_LIFETIME_MS,
  };
  await storeSession(nextSession);
  return nextSession;
}

export async function apiRequest<T = unknown>(
  session: Session,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
  onSessionUpdate?: (session: Session) => void,
): Promise<T> {
  let currentSession = session;
  if (currentSession.accessExpiresAt <= Date.now() + 15_000) {
    currentSession = await rotate(currentSession);
    onSessionUpdate?.(currentSession);
  }

  const send = (active: Session) => fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${active.accessToken}`,
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  let response = await send(currentSession);
  if (response.status === 401) {
    currentSession = await rotate(currentSession);
    onSessionUpdate?.(currentSession);
    response = await send(currentSession);
  }
  const body = await responseBody(response);
  if (!response.ok) throw responseError(body, response.status);
  return body as T;
}

export async function signIn(
  email: string,
  password: string,
  businessId?: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      scope: 'business',
      ...(businessId ? { businessId } : {}),
    }),
  });
  const body = await responseBody(response);
  if (!response.ok) throw responseError(body, response.status);
  return (body.data ?? {}) as Record<string, unknown>;
}

export async function createSession(
  data: Record<string, unknown>,
): Promise<Session> {
  const user = data.user as Session['user'] | undefined;
  const business = data.business as Session['business'] | undefined;
  if (typeof data.accessToken !== 'string' || typeof data.refreshToken !== 'string'
    || !user || !business || typeof business.id !== 'string') {
    throw new Error('The server did not return a business session');
  }
  const session: Session = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    accessExpiresAt: Date.now() + ACCESS_TOKEN_LIFETIME_MS,
    user,
    business,
    permissions: [],
  };
  const profile = await apiRequest<{ data?: { context?: { permissions?: string[] } } }>(
    session,
    '/api/v1/auth/me',
  );
  session.permissions = profile.data?.context?.permissions ?? [];
  await storeSession(session);
  return session;
}
