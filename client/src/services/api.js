const authTokenKey = 'kenya-sports-predictor-auth-token';

const getAuthToken = () => {
  try {
    return localStorage.getItem(authTokenKey);
  } catch {
    return null;
  }
};

export const saveAuthToken = (token) => {
  try {
    if (token) localStorage.setItem(authTokenKey, token);
    else localStorage.removeItem(authTokenKey);
  } catch {
    // Auth still works for the current page session if storage is blocked.
  }
};

export const clearAuthToken = () => saveAuthToken('');

const parseJson = async (response) => {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed. Please try again.');
    error.status = response.status;
    error.details = data.details || {};
    throw error;
  }

  return data;
};

const request = async (url, options = {}) => {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.auth ? { Authorization: `Bearer ${getAuthToken() || ''}` } : {}),
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });

  return parseJson(response);
};

export const api = {
  trackEvent(eventName, sessionId, payload = {}) {
    return request('/api/analytics/events', {
      method: 'POST',
      keepalive: true,
      body: { eventName, sessionId, payload },
    });
  },
  getSourceStatus() {
    return request('/api/sources/status');
  },
  getCountries() {
    return request('/api/matches/countries');
  },
  getSports(country) {
    return request(`/api/matches/sports?country=${encodeURIComponent(country)}`);
  },
  getMatches({ country, sport, date }) {
    return request(
      `/api/matches?country=${encodeURIComponent(country)}&sport=${encodeURIComponent(sport)}&date=${encodeURIComponent(date)}`,
    );
  },
  getPrediction(payload) {
    return request('/api/predict', {
      method: 'POST',
      body: payload,
    });
  },
  getTodayPredictions({ date, sport = 'Football', limit = 12 } = {}) {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (sport) params.set('sport', sport);
    if (limit) params.set('limit', String(limit));
    return request(`/api/predictions/today?${params.toString()}`);
  },
  register(credentials) {
    return request('/api/auth/register', {
      method: 'POST',
      body: credentials,
    });
  },
  login(credentials) {
    return request('/api/auth/login', {
      method: 'POST',
      body: credentials,
    });
  },
  me() {
    return request('/api/auth/me', { auth: true });
  },
  getUserHistory() {
    return request('/api/user/history', { auth: true });
  },
  saveUserHistory(prediction) {
    return request('/api/user/history', {
      method: 'POST',
      auth: true,
      body: { prediction },
    });
  },
  deleteUserHistory(id) {
    return request(`/api/user/history/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      auth: true,
    });
  },
};
