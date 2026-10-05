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

export interface BusinessConfiguration {
  business: { id: string; name: string; logoUrl: string | null; type: string; currency: string; timezone: string };
  template: { id: string; key: string; name: string; category: string; itemTypes: Array<{ key: string; label: string }> };
  availableModules: string[];
  availablePaymentMethods: string[];
  availableDashboardWidgets: string[];
  terminology: Record<string, string>;
  enabledModules: string[];
  paymentMethods: string[];
  dashboardWidgets: string[];
  notificationTemplates: Record<string, unknown>;
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
    || typeof template.category !== 'string' || !Array.isArray(template.itemTypes)) {
    throw new Error('The server returned an invalid business configuration');
  }
  const terminology: Record<string, string> = {};
  for (const [key, label] of Object.entries(value.terminology)) {
    if (typeof label !== 'string') throw new Error('The server returned invalid business terminology');
    terminology[key] = label;
  }
  const itemTypes = template.itemTypes.map((item) => {
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
    template: {
      id: template.id,
      key: template.key,
      name: template.name,
      category: template.category,
      itemTypes,
    },
    availableModules: value.availableModules,
    availablePaymentMethods: value.availablePaymentMethods,
    availableDashboardWidgets: value.availableDashboardWidgets,
    terminology,
    enabledModules: value.enabledModules,
    paymentMethods: value.paymentMethods,
    dashboardWidgets: value.dashboardWidgets,
    notificationTemplates,
    fields,
    workflow: { stages, transitions },
    version: value.version,
    publishedAt: value.publishedAt,
  };
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
