import { loadToken } from '../../lib/authToken';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export async function getTflStatusSample(): Promise<{ summary: string }> {
  const token = await loadToken();
  if (!token) throw new Error('Not authenticated — log in first.');

  const response = await fetch(`${API_BASE_URL}/dev/transport/status?airport=heathrow`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`TfL request failed (${response.status}): ${body}`);
  }

  const data = await response.json() as {
    line_statuses: Array<{ line: string; status: string; severity: number }>;
    journey: {
      airport: string;
      duration_mins: number;
      legs: Array<{ mode: string; instruction: string; duration_mins: number }>;
    } | null;
  };

  const lines: string[] = ['Line statuses:'];
  for (const ls of data.line_statuses) {
    const ok = ls.severity >= 10;
    lines.push(`  ${ls.line}: ${ok ? '✓ ' : '⚠ '}${ls.status}`);
  }

  if (data.journey) {
    lines.push('');
    lines.push(`Journey from ${data.journey.airport} to central London: ${data.journey.duration_mins} min`);
    for (const leg of data.journey.legs) {
      lines.push(`  ${leg.mode}: ${leg.instruction} (${leg.duration_mins} min)`);
    }
  }

  return { summary: lines.join('\n') };
}
