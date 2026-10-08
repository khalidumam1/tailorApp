import * as SecureStore from 'expo-secure-store';
import { applicationBrandingSchema, type ApplicationBranding } from '@tailor/shared';

// `mobile/.env.example` documents EXPO_PUBLIC_API_BASE_URL, but this value used to be
// hardcoded, so the setting had no effect and the app could only ever talk to one hosted
// backend — local development, staging and self-hosted deployments were impossible.
// Expo inlines EXPO_PUBLIC_* variables at build time. The previous literal stays as the
// fallback so existing builds keep working when nothing is configured.
const DEFAULT_API_BASE_URL = 'https://tailorapp.on.shiper.app/backend';

function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!configured) return DEFAULT_API_BASE_URL;
  try {
    const parsed = new URL(configured);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
      || parsed.search || parsed.hash) return DEFAULT_API_BASE_URL;
  } catch {
    return DEFAULT_API_BASE_URL;
  }
  // A trailing slash would produce `//api/v1/...` once a route is appended.
  return configured.replace(/\/+$/, '');
}

export const API_BASE_URL = resolveApiBaseUrl();
const SESSION_KEY = 'tailorapp.session.v1';
const ACCESS_TOKEN_LIFETIME_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;
const APPLICATION_BRANDING_ROUTE = '/api/v1/public/application-branding';
let sessionGeneration = 0;
let sessionPersistenceQueue: Promise<void> = Promise.resolve();
let persistedRefreshToken: string | undefined;
const invalidatedRefreshTokens = new Set<string>();

function serializeSessionStorage<T>(operation: () => Promise<T>): Promise<T> {
  const result = sessionPersistenceQueue.then(operation, operation);
  sessionPersistenceQueue = result.then(() => undefined, () => undefined);
  return result;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  user: { id: string; name: string; email: string };
  business: { id: string; name: string };
  permissions: string[];
}

export interface BusinessChoice {
  id: string;
  name: string;
}

export type LoginResponse =
  | { requiresBusinessSelection: true; requiresScopeSelection?: false; businesses: BusinessChoice[] }
  | { requiresBusinessSelection?: false; requiresScopeSelection: true; canAccessPlatform: boolean; businesses: BusinessChoice[] }
  | {
    requiresBusinessSelection?: false;
    requiresScopeSelection?: false;
    accessToken: string;
    refreshToken: string;
    user: { id: string; name: string; email: string; platformRole?: string };
    business: { id: string; name: string };
  };

export interface BusinessConfiguration {
  business: { id: string; name: string; logoUrl: string | null; type: string; currency: string; timezone: string };
  template: { id: string; key: string; name: string; category: string };
  itemTypes: Array<{ key: string; label: string }>;
  availableModules: string[];
  availablePaymentMethods: string[];
  availableDashboardWidgets: string[];
  terminology: Record<string, string>;
  enabledModules: string[];
  paymentMethods: string[];
  dashboardWidgets: string[];
  notificationTemplates: Record<string, unknown>;
  contactPhone: string | null;
  fields: Array<{
    id: string;
    module: string;
    screen: string;
    key: string;
    label: string;
    type: string;
    required: boolean;
    defaultValue: unknown;
    validation: unknown;
    options: unknown;
    visibility: unknown;
    sortOrder: number;
  }>;
  workflow: {
    stages: Array<{ id: string; key: string; label: string; sortOrder: number; isInitial: boolean; isTerminal: boolean }>;
    transitions: Array<{ id: string; fromStageId: string; toStageId: string; allowedRoleKeys: string[] }>;
  };
  version: number;
  publishedAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function parseBusinessConfiguration(value: unknown): BusinessConfiguration {
  if (!isRecord(value) || !isRecord(value.business) || !isRecord(value.template)
    || !isRecord(value.workflow) || !isRecord(value.terminology)
    || !Array.isArray(value.fields) || !Array.isArray(value.workflow.stages)
    || !Array.isArray(value.workflow.transitions)
    || !stringArray(value.availableModules) || !stringArray(value.availablePaymentMethods)
    || !stringArray(value.availableDashboardWidgets) || !stringArray(value.enabledModules) || !stringArray(value.paymentMethods)
    || !stringArray(value.dashboardWidgets) || typeof value.version !== 'number'
    || (!Array.isArray(value.itemTypes) && !Array.isArray(value.template.itemTypes))
    || !(value.contactPhone === null || typeof value.contactPhone === 'string')
    || (value.publishedAt !== null && typeof value.publishedAt !== 'string')) {
    throw new Error('The server returned an invalid business configuration');
  }
  const business = value.business;
  const template = value.template;
  if (typeof business.id !== 'string' || typeof business.name !== 'string'
    || !(business.logoUrl === null || typeof business.logoUrl === 'string')
    || typeof business.type !== 'string' || typeof business.currency !== 'string'
    || typeof business.timezone !== 'string' || typeof template.id !== 'string'
    || typeof template.key !== 'string' || typeof template.name !== 'string'
    || typeof template.category !== 'string') {
    throw new Error('The server returned an invalid business configuration');
  }
  const terminology: Record<string, string> = {};
  for (const [key, label] of Object.entries(value.terminology)) {
    if (typeof label !== 'string') throw new Error('The server returned invalid business terminology');
    terminology[key] = label;
  }
  const rawItemTypes = Array.isArray(value.itemTypes) ? value.itemTypes : template.itemTypes as unknown[];
  const itemTypes = rawItemTypes.map((item) => {
    if (!isRecord(item) || typeof item.key !== 'string' || typeof item.label !== 'string') {
      throw new Error('The server returned invalid business item types');
    }
    return { key: item.key, label: item.label };
  });
  const fields = value.fields.map((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.module !== 'string'
      || typeof item.screen !== 'string' || typeof item.key !== 'string' || typeof item.label !== 'string'
      || typeof item.type !== 'string' || typeof item.required !== 'boolean') {
      throw new Error('The server returned invalid business fields');
    }
    return {
      id: item.id,
      module: item.module,
      screen: item.screen,
      key: item.key,
      label: item.label,
      type: item.type,
      required: item.required,
      defaultValue: item.defaultValue ?? null,
      validation: item.validation ?? null,
      options: item.options ?? null,
      visibility: item.visibility ?? null,
      sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : 0,
    };
  });
  const stages = value.workflow.stages.map((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.key !== 'string'
      || typeof item.label !== 'string' || typeof item.sortOrder !== 'number'
      || typeof item.isInitial !== 'boolean' || typeof item.isTerminal !== 'boolean') {
      throw new Error('The server returned invalid workflow stages');
    }
    return {
      id: item.id,
      key: item.key,
      label: item.label,
      sortOrder: item.sortOrder,
      isInitial: item.isInitial,
      isTerminal: item.isTerminal,
    };
  });
  const transitions = value.workflow.transitions.map((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.fromStageId !== 'string'
      || typeof item.toStageId !== 'string' || !stringArray(item.allowedRoleKeys)) {
      throw new Error('The server returned invalid workflow transitions');
    }
    return {
      id: item.id,
      fromStageId: item.fromStageId,
      toStageId: item.toStageId,
      allowedRoleKeys: item.allowedRoleKeys,
    };
  });
  const notificationTemplates = isRecord(value.notificationTemplates) ? value.notificationTemplates : {};
  return {
    business: {
      id: business.id,
      name: business.name,
      logoUrl: business.logoUrl,
      type: business.type,
      currency: business.currency,
      timezone: business.timezone,
    },
    template: { id: template.id, key: template.key, name: template.name, category: template.category },
    itemTypes,
    availableModules: value.availableModules,
    availablePaymentMethods: value.availablePaymentMethods,
    availableDashboardWidgets: value.availableDashboardWidgets,
    terminology,
    enabledModules: value.enabledModules,
    paymentMethods: value.paymentMethods,
    dashboardWidgets: value.dashboardWidgets,
    notificationTemplates,
    contactPhone: typeof value.contactPhone === 'string' ? value.contactPhone : null,
    fields,
    workflow: { stages, transitions },
    version: value.version,
    publishedAt: value.publishedAt,
  };
}

export class ApiError extends Error {
  status: number;
  code?: string;
  retryAfterMs?: number;
  requestId?: string;

  constructor(message: string, status: number, code?: string, retryAfterMs?: number, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
    this.requestId = requestId;
  }
}

const sessionExpiredListeners = new Set<() => void>();

export function subscribeToSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

function notifySessionExpired(): void {
  for (const listener of sessionExpiredListeners) listener();
}

function errorRequestId(body: Record<string, unknown>): string | undefined {
  if (typeof body.requestId === 'string' && body.requestId) return body.requestId;
  const meta = body.meta;
  return isRecord(meta) && typeof meta.requestId === 'string' && meta.requestId
    ? meta.requestId
    : undefined;
}

async function fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    const aborted = cause && typeof cause === 'object' && 'name' in cause && cause.name === 'AbortError';
    throw new ApiError(
      aborted ? 'The request timed out. Check your connection and try again.' : 'Could not reach the service. Check your connection and try again.',
      aborted ? 408 : 0,
      aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function writeSession(session: Session, generation: number): Promise<boolean> {
  return serializeSessionStorage(async () => {
    if (generation !== sessionGeneration) return false;
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    if (generation !== sessionGeneration) return false;
    persistedRefreshToken = session.refreshToken;
    invalidatedRefreshTokens.delete(session.refreshToken);
    return true;
  });
}

export async function storeSession(session: Session): Promise<void> {
  await writeSession(session, sessionGeneration);
}

export async function readSession(): Promise<Session | null> {
  const generation = sessionGeneration;
  const serialized = await serializeSessionStorage(() => SecureStore.getItemAsync(SESSION_KEY));
  if (generation !== sessionGeneration || !serialized) return null;
  let session: unknown;
  try {
    session = JSON.parse(serialized) as unknown;
  } catch {
    await serializeSessionStorage(() => SecureStore.deleteItemAsync(SESSION_KEY));
    return null;
  }
  const valid = isRecord(session)
    && typeof session.accessToken === 'string' && session.accessToken.length > 0
    && typeof session.refreshToken === 'string' && session.refreshToken.length > 0
    && typeof session.accessExpiresAt === 'number' && Number.isFinite(session.accessExpiresAt)
    && isRecord(session.user) && typeof session.user.id === 'string'
    && typeof session.user.name === 'string' && typeof session.user.email === 'string'
    && isRecord(session.business) && typeof session.business.id === 'string'
    && typeof session.business.name === 'string'
    && stringArray(session.permissions);
  if (!valid) {
    await serializeSessionStorage(() => SecureStore.deleteItemAsync(SESSION_KEY));
    persistedRefreshToken = undefined;
    return null;
  }
  const restored = session as unknown as Session;
  persistedRefreshToken = restored.refreshToken;
  invalidatedRefreshTokens.delete(restored.refreshToken);
  return restored;
}

export async function clearSession(): Promise<void> {
  sessionGeneration += 1;
  const refreshTokens = new Set<string>([
    ...(persistedRefreshToken ? [persistedRefreshToken] : []),
    ...refreshInFlight.keys(),
    ...refreshedSessions.keys(),
    ...[...refreshedSessions.values()].map((session) => session.refreshToken),
  ]);
  for (const token of refreshTokens) invalidatedRefreshTokens.add(token);
  while (invalidatedRefreshTokens.size > 64) {
    const oldest = invalidatedRefreshTokens.values().next().value as string | undefined;
    if (oldest === undefined) break;
    invalidatedRefreshTokens.delete(oldest);
  }
  persistedRefreshToken = undefined;
  clearRefreshState();
  const generation = sessionGeneration;
  await serializeSessionStorage(async () => {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    if (generation === sessionGeneration) persistedRefreshToken = undefined;
  });
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    const requestId = response.headers.get('x-request-id') ?? undefined;
    throw new ApiError(
      requestId ? `The server returned an invalid response (Reference ${requestId})` : 'The server returned an invalid response',
      response.status,
      'INVALID_RESPONSE',
      undefined,
      requestId,
    );
  }
  if (!isRecord(body)) {
    const requestId = response.headers.get('x-request-id') ?? undefined;
    throw new ApiError(
      requestId ? `The server returned an invalid response (Reference ${requestId})` : 'The server returned an invalid response',
      response.status,
      'INVALID_RESPONSE',
      undefined,
      requestId,
    );
  }
  return body;
}

function retryAfterMilliseconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function responseError(body: Record<string, unknown>, response: Response): ApiError {
  const error = body.error && typeof body.error === 'object'
    ? body.error as Record<string, unknown>
    : {};
  const requestId = errorRequestId(body);
  const message = typeof error.message === 'string' ? error.message : 'The request could not be completed';
  return new ApiError(
    requestId ? `${message} (Reference ${requestId})` : message,
    response.status,
    typeof error.code === 'string' ? error.code : undefined,
    retryAfterMilliseconds(response.headers.get('retry-after')),
    requestId,
  );
}

const refreshInFlight = new Map<string, Promise<Session>>();
const refreshedSessions = new Map<string, Session>();
const MAX_REFRESH_ALIASES = 24;

function clearRefreshState(): void {
  refreshInFlight.clear();
  refreshedSessions.clear();
}

function rememberRotation(previousToken: string, nextSession: Session): void {
  for (const [token, session] of refreshedSessions) {
    if (session.refreshToken === previousToken) refreshedSessions.set(token, nextSession);
  }
  refreshedSessions.set(previousToken, nextSession);
  while (refreshedSessions.size > MAX_REFRESH_ALIASES) {
    const oldest = refreshedSessions.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    refreshedSessions.delete(oldest);
  }
}

async function rotate(session: Session): Promise<Session> {
  const previousToken = session.refreshToken;
  if (invalidatedRefreshTokens.has(previousToken)) {
    throw new ApiError('This session is no longer active.', 401, 'SESSION_ENDED');
  }
  const knownRotation = refreshedSessions.get(previousToken);
  if (knownRotation) return knownRotation;
  const pendingRotation = refreshInFlight.get(previousToken);
  if (pendingRotation) return pendingRotation;

  const generation = sessionGeneration;
  const rotation = (async () => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: previousToken }),
    });
    const body = await responseBody(response);
    const data = isRecord(body.data) ? body.data : undefined;
    if (!response.ok || typeof data?.accessToken !== 'string' || typeof data.refreshToken !== 'string') {
      throw responseError(body, response);
    }
    const nextSession: Session = {
      ...session,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      accessExpiresAt: Date.now() + ACCESS_TOKEN_LIFETIME_MS,
    };
    if (generation === sessionGeneration && !invalidatedRefreshTokens.has(previousToken)) {
      const persisted = await writeSession(nextSession, generation);
      if (persisted && generation === sessionGeneration) rememberRotation(previousToken, nextSession);
    }
    // Return the rotated credential to an explicit sign-out request that was already
    // waiting for this refresh. Normal API callers compare generations before retrying.
    return nextSession;
  })().finally(() => refreshInFlight.delete(previousToken));
  refreshInFlight.set(previousToken, rotation);
  return rotation;
}

function inactiveSessionError(): ApiError {
  return new ApiError('This session is no longer active. Please sign in again.', 401, 'SESSION_ENDED');
}

function expiredSessionError(cause?: unknown): ApiError {
  const requestId = cause instanceof ApiError ? cause.requestId : undefined;
  notifySessionExpired();
  void clearSession().catch(() => undefined);
  return new ApiError('Your session has expired. Please sign in again.', 401, 'SESSION_EXPIRED', undefined, requestId);
}

async function refreshForRequest(
  session: Session,
  generation: number,
  onSessionUpdate?: (session: Session) => void,
): Promise<Session> {
  try {
    const renewed = await rotate(session);
    if (generation !== sessionGeneration || invalidatedRefreshTokens.has(session.refreshToken)) {
      throw inactiveSessionError();
    }
    onSessionUpdate?.(renewed);
    return renewed;
  } catch (cause) {
    if (generation !== sessionGeneration || invalidatedRefreshTokens.has(session.refreshToken)) {
      throw inactiveSessionError();
    }
    if (cause instanceof ApiError && cause.status === 401 && cause.code !== 'SESSION_ENDED') {
      throw expiredSessionError(cause);
    }
    throw cause;
  }
}

async function latestRefreshToken(token: string): Promise<string> {
  let latest = refreshedSessions.get(token);
  const initialRotation = refreshInFlight.get(token);
  if (initialRotation) {
    try {
      latest = await initialRotation;
    } catch {
      latest = refreshedSessions.get(token) ?? latest;
    }
  }
  const visited = new Set<string>([token]);
  for (let hop = 0; latest && hop < MAX_REFRESH_ALIASES; hop += 1) {
    const currentToken = latest.refreshToken;
    if (visited.has(currentToken)) break;
    visited.add(currentToken);
    const alias = refreshedSessions.get(currentToken);
    if (alias) {
      latest = alias;
      continue;
    }
    const pending = refreshInFlight.get(currentToken);
    if (!pending) break;
    try {
      latest = await pending;
    } catch {
      break;
    }
  }
  return latest?.refreshToken ?? token;
}

export async function revokeSession(refreshToken: string): Promise<void> {
  const currentRefreshToken = await latestRefreshToken(refreshToken);
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/logout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: currentRefreshToken }),
  });
  const body = await responseBody(response);
  if (!response.ok) throw responseError(body, response);
}

export async function apiRequest<T = unknown>(
  session: Session,
  path: string,
  options: {
    method?: string;
    body?: unknown | ((activeSession: Session) => unknown);
    headers?: Record<string, string>;
  } = {},
  onSessionUpdate?: (session: Session) => void,
): Promise<T> {
  if (!path.startsWith('/api/v1/') || path.startsWith('//') || path.includes('\\')) {
    throw new Error('API requests must use a safe, same-origin versioned path');
  }
  const generation = sessionGeneration;
  if (invalidatedRefreshTokens.has(session.refreshToken)) throw inactiveSessionError();
  let currentSession = session;
  if (currentSession.accessExpiresAt <= Date.now() + 15_000) {
    currentSession = await refreshForRequest(currentSession, generation, onSessionUpdate);
  }
  if (generation !== sessionGeneration || invalidatedRefreshTokens.has(session.refreshToken)) {
    throw inactiveSessionError();
  }

  const send = (active: Session) => {
    const requestBody = typeof options.body === 'function' ? options.body(active) : options.body;
    return fetchWithTimeout(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...options.headers,
        ...(requestBody !== undefined ? { 'content-type': 'application/json' } : {}),
        authorization: `Bearer ${active.accessToken}`,
      },
      ...(requestBody !== undefined ? { body: JSON.stringify(requestBody) } : {}),
    });
  };
  let response = await send(currentSession);
  if (generation !== sessionGeneration) throw inactiveSessionError();
  if (response.status === 401) {
    currentSession = await refreshForRequest(currentSession, generation, onSessionUpdate);
    if (generation !== sessionGeneration) throw inactiveSessionError();
    response = await send(currentSession);
    if (generation !== sessionGeneration) throw inactiveSessionError();
    if (response.status === 401) {
      const expiredBody = await responseBody(response);
      throw expiredSessionError(responseError(expiredBody, response));
    }
  }
  const body = await responseBody(response);
  if (generation !== sessionGeneration) throw inactiveSessionError();
  if (!response.ok) {
    const failure = responseError(body, response);
    if (['MEMBERSHIP_INACTIVE', 'BUSINESS_ACCESS_DENIED', 'PERMISSION_DENIED'].includes(failure.code ?? '')) {
      notifySessionExpired();
      void clearSession().catch(() => undefined);
    }
    throw failure;
  }
  return body as T;
}

export async function fetchApplicationBranding(): Promise<ApplicationBranding> {
  const response = await fetchWithTimeout(`${API_BASE_URL}${APPLICATION_BRANDING_ROUTE}`);
  const body = await responseBody(response);
  if (!response.ok) throw responseError(body, response);
  const parsed = applicationBrandingSchema.safeParse(body.data);
  if (!parsed.success) {
    throw new ApiError('The server returned invalid application branding.', 502, 'INVALID_RESPONSE', undefined, errorRequestId(body));
  }
  return parsed.data;
}

export async function signIn(
  email: string,
  password: string,
  businessId?: string,
): Promise<LoginResponse> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/login`, {
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
  if (!response.ok) throw responseError(body, response);
  const data = body.data;
  const invalidResponse = () => {
    const requestId = errorRequestId(body) ?? response.headers.get('x-request-id') ?? undefined;
    return new ApiError(
      requestId ? `The server returned an invalid sign-in response (Reference ${requestId})` : 'The server returned an invalid sign-in response',
      502,
      'INVALID_RESPONSE',
      undefined,
      requestId,
    );
  };
  if (!isRecord(data)) throw invalidResponse();
  const parseBusinesses = (value: unknown): BusinessChoice[] => {
    if (!Array.isArray(value) || value.some((item) => !isRecord(item)
      || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string')) {
      throw invalidResponse();
    }
    return value.map((item) => ({ id: (item as Record<string, unknown>).id as string, name: (item as Record<string, unknown>).name as string }));
  };
  if (data.requiresBusinessSelection === true) {
    return { requiresBusinessSelection: true, businesses: parseBusinesses(data.businesses) };
  }
  if (data.requiresScopeSelection === true) {
    if (typeof data.canAccessPlatform !== 'boolean') throw invalidResponse();
    return {
      requiresScopeSelection: true,
      canAccessPlatform: data.canAccessPlatform,
      businesses: parseBusinesses(data.businesses),
    };
  }
  const user = data.user;
  const business = data.business;
  if (typeof data.accessToken !== 'string' || !data.accessToken
    || typeof data.refreshToken !== 'string' || !data.refreshToken
    || !isRecord(user) || typeof user.id !== 'string' || !user.id
    || typeof user.name !== 'string' || typeof user.email !== 'string'
    || !isRecord(business) || typeof business.id !== 'string' || !business.id
    || typeof business.name !== 'string') {
    throw invalidResponse();
  }
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      ...(typeof user.platformRole === 'string' ? { platformRole: user.platformRole } : {}),
    },
    business: { id: business.id, name: business.name },
  };
}

export async function createSession(data: unknown): Promise<Session> {
  if (!isRecord(data)) throw new Error('The server did not return a valid business session');
  const user = data.user;
  const business = data.business;
  if (typeof data.accessToken !== 'string' || !data.accessToken
    || typeof data.refreshToken !== 'string' || !data.refreshToken
    || !isRecord(user) || typeof user.id !== 'string' || typeof user.name !== 'string'
    || typeof user.email !== 'string' || !isRecord(business)
    || typeof business.id !== 'string' || typeof business.name !== 'string') {
    throw new Error('The server did not return a valid business session');
  }
  const session: Session = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    accessExpiresAt: Date.now() + ACCESS_TOKEN_LIFETIME_MS,
    user: { id: user.id, name: user.name, email: user.email },
    business: { id: business.id, name: business.name },
    permissions: [],
  };
  const profile = await apiRequest<unknown>(session, '/api/v1/auth/me');
  const envelope = isRecord(profile) && isRecord(profile.data) ? profile.data : undefined;
  const context = envelope && isRecord(envelope.context) ? envelope.context : undefined;
  if (!context || !stringArray(context.permissions)) {
    throw new Error('The server returned an invalid access profile');
  }
  session.permissions = context.permissions;
  await storeSession(session);
  return session;
}
