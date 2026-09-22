const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export async function getTicketTailorOverviewSample(): Promise<{ summary: string }> {
  const response = await fetch(`${API_BASE_URL}/tickettailor/overview`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ticket Tailor overview request failed (${response.status}): ${body}`);
  }
  const data = await response.json() as { box_office_name: string; event_series_published: number };
  return {
    summary: `Connected to box office "${data.box_office_name}" — ${data.event_series_published} published event series.`,
  };
}
