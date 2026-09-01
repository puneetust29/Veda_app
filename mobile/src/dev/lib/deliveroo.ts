import { loadToken } from '../../lib/authToken';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export async function getDeliverooAuthSample(): Promise<{ summary: string }> {
  const token = await loadToken();
  if (!token) throw new Error('Not authenticated — log in first.');

  const response = await fetch(`${API_BASE_URL}/dev/deliveroo/auth`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Deliveroo auth check failed (${response.status}): ${body}`);
  }

  const data = await response.json() as {
    ok: boolean;
    env: string;
    client_id: string;
    cached: boolean;
    expires_in_seconds: number | null;
  };

  const expiresIn = data.expires_in_seconds != null
    ? `expires in ${Math.round(data.expires_in_seconds / 60)} min`
    : 'no expiry info';

  return {
    summary: `Deliveroo ${data.env} connected\nClient: ${data.client_id}\nToken: ${data.cached ? 'cached' : 'fresh'}, ${expiresIn}`,
  };
}
