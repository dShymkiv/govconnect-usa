const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001';

export const AUTH_EXPIRED_EVENT = 'gc:auth-expired';

export function isUnauthorized(err) {
  return Boolean(
    err &&
      (err.status === 401 ||
        err.code === 'UNAUTHORIZED' ||
        /invalid or expired token/i.test(err.message || '')),
  );
}

function notifyAuthExpired() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error(
      `Cannot reach API at ${API_URL}. Is the backend running (npm run dev in backend/)?`,
    );
    err.code = 'NETWORK_ERROR';
    err.status = 0;
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.code = data.code;
    err.status = res.status;
    if (res.status === 401 && token) {
      notifyAuthExpired();
    }
    throw err;
  }
  return data;
}

export const api = {
  requestOtp: (phone, password) =>
    request('/api/v1/auth/otp/request', { method: 'POST', body: { phone, password } }),
  verifyOtp: (payload) => request('/api/v1/auth/otp/verify', { method: 'POST', body: payload }),
  me: (token) => request('/api/v1/auth/me', { token }),
  wallet: (token) => request('/api/v1/wallet', { token }),
  document: (token, id) => request(`/api/v1/wallet/${id}`, { token }),
  present: (token, documentId) =>
    request('/api/v1/wallet/present', { method: 'POST', body: { documentId }, token }),
  documentCatalog: (token) => request('/api/v1/document-requests/catalog', { token }),
  documentRequests: (token) => request('/api/v1/document-requests', { token }),
  submitDocumentRequest: (token, body) =>
    request('/api/v1/document-requests', { method: 'POST', body, token }),
  vehicles: (token) => request('/api/v1/vehicles', { token }),
  vehicleFines: (token, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/v1/vehicles/fines${q ? `?${q}` : ''}`, { token });
  },
  payFine: (token, fineId) =>
    request(`/api/v1/vehicles/fines/${fineId}/pay`, { method: 'POST', token }),
};

export { API_URL };
