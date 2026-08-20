import * as Calendar from 'expo-calendar';

import type { DeviceCalendarEvent, DeviceCalendarSource } from '../types';

// How far ahead to read. expo-calendar has no "upcoming" concept of its own --
// getEventsAsync needs an explicit window, and events don't need syncing once
// they're in the past anyway. Shared by DeviceCalendarScreen and the
// Dashboard's silent background sync so both look the same distance ahead.
export const LOOKAHEAD_DAYS = 180;

// Best-effort classification of which provider synced a given calendar to the
// device. There's no first-class "this is a Google calendar" flag -- iOS
// exposes Google accounts as generic CalDAV sources, so this matches on the
// source name (usually the account email or "Gmail"/"Google"), falling back
// to the Android-specific source type string.
export function classifyDeviceCalendarSource(source: Calendar.Source | undefined): DeviceCalendarSource {
  const type = (source?.type ?? '').toString().toLowerCase();
  const name = (source?.name ?? '').toLowerCase();

  if (type.includes('google') || name.includes('gmail.com') || name.includes('google')) {
    return 'google';
  }
  if (
    type === Calendar.SourceType.LOCAL ||
    type === Calendar.SourceType.MOBILEME ||
    type === Calendar.SourceType.CALDAV ||
    type === '' ||
    name.includes('icloud')
  ) {
    return 'apple';
  }
  return 'other';
}

// Reads every calendar the OS exposes (Apple Calendar plus any other account
// synced to the device -- Google, Outlook, etc., if the user added them under
// Settings > Calendar) and flattens them into the shape the backend expects,
// tagging each event with the source calendar it came from so callers can
// group/label a merged list instead of treating this as Apple-only.
export async function readDeviceCalendarEvents(): Promise<DeviceCalendarEvent[]> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const calendarMeta = new Map<string, { title: string; source: DeviceCalendarSource }>(
    calendars.map((cal) => [cal.id, { title: cal.title, source: classifyDeviceCalendarSource(cal.source) }]),
  );

  const now = new Date();
  const end = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  const rawEvents = await Calendar.getEventsAsync(
    calendars.map((cal) => cal.id),
    now,
    end,
  );

  return rawEvents
    .map((event) => {
      const meta = calendarMeta.get(event.calendarId) ?? { title: 'Unknown calendar', source: 'other' as const };
      return {
        device_event_id: event.id,
        title: event.title ?? '',
        location: event.location ?? '',
        notes: event.notes ?? '',
        start: new Date(event.startDate).toISOString(),
        end: new Date(event.endDate).toISOString(),
        calendarTitle: meta.title,
        source: meta.source,
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function countDeviceEventsBySource(
  events: DeviceCalendarEvent[],
): Record<DeviceCalendarSource, number> {
  const counts: Record<DeviceCalendarSource, number> = { google: 0, apple: 0, other: 0 };
  for (const event of events) {
    counts[event.source] += 1;
  }
  return counts;
}
