import * as Calendar from 'expo-calendar';

const LOOKAHEAD_DAYS = 30;

// Dev-only duplicate of lib/deviceCalendar.ts's Apple-calendar classification,
// kept intentionally separate so the integrations catalog never depends on
// production code paths. If a real feature needs this later, promote it to
// lib/ deliberately rather than importing this copy.
function isAppleCalendarSource(source: Calendar.Source | undefined): boolean {
  const type = (source?.type ?? '').toString().toLowerCase();
  const name = (source?.name ?? '').toLowerCase();

  if (type.includes('google') || name.includes('gmail.com') || name.includes('google')) {
    return false;
  }
  return (
    type === Calendar.SourceType.LOCAL ||
    type === Calendar.SourceType.MOBILEME ||
    type === Calendar.SourceType.CALDAV ||
    type === '' ||
    name.includes('icloud')
  );
}

export async function getAppleCalendarSample(): Promise<{ summary: string }> {
  let permission = await Calendar.getCalendarPermissionsAsync();
  if (permission.status !== Calendar.PermissionStatus.GRANTED) {
    permission = await Calendar.requestCalendarPermissionsAsync();
  }
  if (permission.status !== Calendar.PermissionStatus.GRANTED) {
    throw new Error('Calendar permission denied — enable it in Settings to test this integration.');
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const appleCalendars = calendars.filter((cal) => isAppleCalendarSource(cal.source));
  if (!appleCalendars.length) {
    return { summary: 'No Apple Calendar found on this device.' };
  }

  const now = new Date();
  const end = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  const events = await Calendar.getEventsAsync(
    appleCalendars.map((cal) => cal.id),
    now,
    end,
  );

  if (!events.length) {
    return {
      summary: `Found ${appleCalendars.length} Apple calendar(s), no events in the next ${LOOKAHEAD_DAYS} days.`,
    };
  }

  const upcoming = events
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 3)
    .map((event) => `${event.title || 'Untitled'} — ${new Date(event.startDate).toLocaleString()}`)
    .join('\n');

  return {
    summary: `${events.length} event(s) in the next ${LOOKAHEAD_DAYS} days from ${appleCalendars.length} Apple calendar(s):\n${upcoming}`,
  };
}
