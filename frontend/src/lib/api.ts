import { storage } from './storage';
import { Platform } from 'react-native';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const API = `${BASE}/api`;

export type Role = 'cliente' | 'lojista' | 'admin' | 'entregador';

export type User = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  active_role: Role;
  cpf?: string;
};

let onLogout: (() => void) | null = null;
export const setOnLogout = (fn: () => void) => { onLogout = fn; };

async function refreshTokens(): Promise<string | null> {
  const rtok = await storage.get('refresh_token');
  if (!rtok) return null;
  try {
    const r = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rtok }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    await storage.set('access_token', data.access_token);
    await storage.set('refresh_token', data.refresh_token);
    return data.access_token as string;
  } catch {
    return null;
  }
}

export async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<T> {
  const token = await storage.get('access_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as any),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (res.status === 401 && attempt === 0) {
    const newTok = await refreshTokens();
    if (newTok) return apiFetch<T>(path, init, 1);
    if (onLogout) onLogout();
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    let msg = 'Erro na requisição';
    try {
      const j = await res.json();
      msg = j.detail || j.message || msg;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null as any;
  return res.json();
}

export const api = {
  register: (body: any) =>
    apiFetch<{ access_token: string; refresh_token: string; user: User }>(
      '/auth/register',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  login: (email: string, password: string) =>
    apiFetch<{ access_token: string; refresh_token: string; user: User }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    ),
  me: () => apiFetch<User>('/auth/me'),
  switchRole: (active_role: Role) =>
    apiFetch<User>('/auth/switch-role', {
      method: 'POST',
      body: JSON.stringify({ active_role }),
    }),
  stores: (q?: string, category?: string) => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (category) qs.set('category', category);
    const s = qs.toString();
    return apiFetch<any[]>(`/stores${s ? '?' + s : ''}`);
  },
  categories: () => apiFetch<string[]>('/stores/categories'),
  storeDetail: (id: string) => apiFetch<any>(`/stores/${id}`),
  myStore: () => apiFetch<any>('/my/store'),
  saveStore: (body: any) =>
    apiFetch<any>('/my/store', { method: 'POST', body: JSON.stringify(body) }),
  storeStatus: (status: string) =>
    apiFetch<any>('/my/store/status', {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  myProducts: () => apiFetch<any[]>('/my/products'),
  createProduct: (body: any) =>
    apiFetch<any>('/my/products', { method: 'POST', body: JSON.stringify(body) }),
  updateProduct: (id: string, body: any) =>
    apiFetch<any>(`/my/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteProduct: (id: string) =>
    apiFetch<any>(`/my/products/${id}`, { method: 'DELETE' }),
  createOrder: (body: any) =>
    apiFetch<any>('/orders', { method: 'POST', body: JSON.stringify(body) }),
  myOrders: () => apiFetch<any[]>('/orders'),
  order: (id: string) => apiFetch<any>(`/orders/${id}`),
  storeOrders: () => apiFetch<any[]>('/my/store/orders'),
  updateOrderStatus: (id: string, status: string) =>
    apiFetch<any>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  rateOrder: (id: string, stars: number, comment?: string) =>
    apiFetch<any>(`/orders/${id}/rating`, {
      method: 'POST',
      body: JSON.stringify({ stars, comment: comment || '' }),
    }),
  listChat: (oid: string) => apiFetch<any[]>(`/orders/${oid}/chat`),
  sendChat: (oid: string, text: string) =>
    apiFetch<any>(`/orders/${oid}/chat`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  dashboard: () => apiFetch<any>('/my/dashboard'),
  // addresses
  addresses: () => apiFetch<any[]>('/addresses'),
  createAddress: (body: any) =>
    apiFetch<any>('/addresses', { method: 'POST', body: JSON.stringify(body) }),
  setDefaultAddress: (id: string) =>
    apiFetch<any>(`/addresses/${id}/default`, { method: 'PATCH' }),
  deleteAddress: (id: string) =>
    apiFetch<any>(`/addresses/${id}`, { method: 'DELETE' }),
  // loyalty
  loyalty: () => apiFetch<{ points: number; value_brl: number; rate: string }>('/loyalty'),
  // favorites
  favoriteIds: () => apiFetch<{ ids: string[] }>('/favorites/ids'),
  favorites: () => apiFetch<any[]>('/favorites'),
  toggleFavorite: (product_id: string) =>
    apiFetch<{ favorited: boolean; count: number }>('/favorites/toggle', {
      method: 'POST',
      body: JSON.stringify({ product_id }),
    }),
  // delivery fee by distance
  deliveryQuote: (store_id: string, address_id?: string, subtotal = 0, lat?: number, lng?: number) =>
    apiFetch<{ distance_km: number | null; fee: number; deliverable: boolean; eta_min: number; reason: string | null; max_radius_km: number }>(
      '/delivery/quote',
      { method: 'POST', body: JSON.stringify({ store_id, address_id, subtotal, lat, lng }) },
    ),
  // notifications
  notifications: () => apiFetch<any[]>('/notifications'),
  unreadCount: () => apiFetch<{ count: number }>('/notifications/unread_count'),
  readAllNotifications: () => apiFetch<any>('/notifications/read_all', { method: 'POST' }),
  readNotification: (id: string) => apiFetch<any>(`/notifications/${id}/read`, { method: 'POST' }),
  // couriers (lojista)
  couriers: () => apiFetch<any[]>('/my/couriers'),
  createCourier: (body: any) => apiFetch<any>('/my/couriers', { method: 'POST', body: JSON.stringify(body) }),
  updateCourier: (id: string, body: any) => apiFetch<any>(`/my/couriers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCourier: (id: string) => apiFetch<any>(`/my/couriers/${id}`, { method: 'DELETE' }),
  assignCourier: (oid: string, courier_id: string) => apiFetch<any>(`/orders/${oid}/assign-courier`, { method: 'PATCH', body: JSON.stringify({ courier_id }) }),
  courierReport: (date?: string) => apiFetch<any>(`/my/couriers/report${date ? `?date=${date}` : ''}`),
  finance: (date?: string) => apiFetch<any>(`/my/finance${date ? `?date=${date}` : ''}`),
  inviteCourier: (courier_code: string) => apiFetch<any>('/my/couriers/invite', { method: 'POST', body: JSON.stringify({ courier_code }) }),
  removeCourierLink: (courier_id: string) => apiFetch<any>(`/my/couriers/${courier_id}`, { method: 'DELETE' }),
  // entregador (autenticado)
  courierMyOrders: () => apiFetch<any[]>('/courier/me/orders'),
  courierMyOrder: (code: string) => apiFetch<any>(`/courier/me/order/${code}`),
  courierMyEarnings: () => apiFetch<any>('/courier/me/earnings'),
  courierInvites: () => apiFetch<any[]>('/courier/me/invites'),
  respondInvite: (link_id: string, accept: boolean) => apiFetch<any>(`/courier/me/invites/${link_id}/respond`, { method: 'POST', body: JSON.stringify({ accept }) }),
  courierOffers: () => apiFetch<any[]>('/courier/me/offers'),
  respondOffer: (oid: string, accept: boolean) => apiFetch<any>(`/orders/${oid}/offer-response`, { method: 'POST', body: JSON.stringify({ accept }) }),
};

export async function courierRegister(payload: { name: string; cpf: string; plate: string; renavam: string }) {
  const res = await fetch(`${API}/courier/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || 'Falha no cadastro');
  return data as { access_token: string; refresh_token: string; user: User };
}

export async function courierLoginApi(cpf: string, password: string) {
  const res = await fetch(`${API}/auth/courier-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || 'CPF ou senha inválidos');
  return data as { access_token: string; refresh_token: string; user: User };
}

export async function uploadImage(uri: string, name = 'photo.jpg', type = 'image/jpeg'): Promise<string> {
  const token = await storage.get('access_token');
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob, name);
  } else {
    form.append('file', { uri, name, type } as any);
  }
  const res = await fetch(`${API}/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    let msg = 'Falha ao enviar imagem';
    try { const j = await res.json(); msg = j.detail || msg; } catch {}
    throw new Error(msg);
  }
  const d = await res.json();
  return `${BASE}${d.url}`;
}

// CEP lookup (BrasilAPI v2 gives coordinates; falls back to ViaCEP)
export async function lookupCep(cep: string) {
  const clean = cep.replace(/\D/g, '');
  if (clean.length !== 8) throw new Error('CEP inválido');
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${clean}`);
    if (r.ok) {
      const d = await r.json();
      const coords = d.location?.coordinates || {};
      return {
        street: d.street || '',
        neighborhood: d.neighborhood || '',
        city: d.city || '',
        state: d.state || '',
        zip: clean,
        lat: coords.latitude ? parseFloat(coords.latitude) : null,
        lng: coords.longitude ? parseFloat(coords.longitude) : null,
      };
    }
  } catch {}
  const r2 = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
  const data = await r2.json();
  if (data.erro) throw new Error('CEP não encontrado');
  return {
    street: data.logradouro || '',
    neighborhood: data.bairro || '',
    city: data.localidade || '',
    state: data.uf || '',
    zip: clean,
    lat: null as number | null,
    lng: null as number | null,
  };
}
