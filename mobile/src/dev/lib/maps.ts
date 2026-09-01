import { loadToken } from '../../lib/authToken';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export async function getMapsRouteSample(): Promise<{ summary: string }> {
  const token = await loadToken();
  if (!token) throw new Error('Not authenticated — log in first.');

  const params = new URLSearchParams({
    origin: 'London Heathrow Airport',
    destination: 'London Bridge, London',
  });

  const response = await fetch(`${API_BASE_URL}/dev/maps/route?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Maps request failed (${response.status}): ${body}`);
  }

  const data = await response.json() as {
    origin: string;
    destination: string;
    routes: Array<{ mode: string; duration_mins: number; distance_km: number | null }>;
    nearby_places: Array<{ name: string; category: string; rating: number | null }>;
  };

  const lines: string[] = [
    `${data.origin} → ${data.destination}`,
    '',
  ];

  for (const r of data.routes) {
    const dist = r.distance_km != null ? ` · ${r.distance_km.toFixed(1)} km` : '';
    lines.push(`${r.mode}: ${r.duration_mins} min${dist}`);
  }

  if (data.nearby_places.length) {
    lines.push('');
    lines.push(`Nearby: ${data.nearby_places.slice(0, 3).map((p) => p.name).join(', ')}`);
  }

  return { summary: lines.join('\n') };
}
