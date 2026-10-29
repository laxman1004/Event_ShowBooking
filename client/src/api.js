const API_URL = import.meta.env.VITE_API_URL || '/api';

export async function api(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Cannot reach the EventShow API. Start the server with "npm run dev" in the server folder, then try again.');
    }
    throw error;
  }
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const requestError = new Error(payload?.message || 'Something went wrong. Please try again.');
    requestError.status = response.status;
    if (payload && typeof payload === 'object') Object.assign(requestError, payload);
    throw requestError;
  }
  return payload;
}

export const jsonBody = (value) => JSON.stringify(value);
