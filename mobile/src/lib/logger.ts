/**
 * Structured logging for the Veda grocery checkout flow.
 *
 * Every log line is prefixed [VEDA:<MODULE>] so you can filter the full
 * chat-to-order trace with a single grep:
 *
 *   adb logcat | grep VEDA          # Android
 *   idevicesyslog | grep VEDA       # iOS device
 *   npx react-native log-ios        # Metro
 *
 * Modules:
 *   API          — all HTTP calls (authedFetch / rawFetch)
 *   BASKET       — GroceryBasketCard state + user actions
 *   CHECKOUT_WV  — CheckoutWebView instruction loop
 *   ASDA_LOGIN   — AsdaLoginSheet session capture
 *   CHAT_STREAM  — SSE events from /conversation
 */

export type LogModule =
  | 'API'
  | 'BASKET'
  | 'CHECKOUT_WV'
  | 'ASDA_LOGIN'
  | 'CHAT_STREAM';

type Level = 'INFO' | 'WARN' | 'ERROR';

function tag(module: LogModule, icon: string): string {
  return `[VEDA:${module}] ${icon}`;
}

const MAX_LOG_LEN = 4000;

function serialize(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'string') return v.length > MAX_LOG_LEN ? v.slice(0, MAX_LOG_LEN) + '…' : v;
  try {
    const s = JSON.stringify(v);
    return s.length > MAX_LOG_LEN ? s.slice(0, MAX_LOG_LEN) + '…' : s;
  } catch {
    return String(v);
  }
}

function kvStr(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([k, v]) => `${k}=${serialize(v)}`)
    .join(' | ');
}

function emit(level: Level, module: LogModule, icon: string, event: string, data?: Record<string, unknown>) {
  const line = data
    ? `${tag(module, icon)} ${event} | ${kvStr(data)}`
    : `${tag(module, icon)} ${event}`;
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);
}

export const log = {
  /** General info — ongoing step */
  info(module: LogModule, event: string, data?: Record<string, unknown>) {
    emit('INFO', module, '→', event, data);
  },

  /** Operation started */
  start(module: LogModule, event: string, data?: Record<string, unknown>) {
    emit('INFO', module, '▶', event, data);
  },

  /** Operation completed successfully */
  ok(module: LogModule, event: string, data?: Record<string, unknown>) {
    emit('INFO', module, '✅', event, data);
  },

  /** Non-fatal warning */
  warn(module: LogModule, event: string, data?: Record<string, unknown>) {
    emit('WARN', module, '⚠️', event, data);
  },

  /** Error / failure */
  fail(module: LogModule, event: string, data?: Record<string, unknown>) {
    emit('ERROR', module, '❌', event, data);
  },

  /**
   * Start a timer. Call the returned function when the operation ends —
   * it logs elapsed ms and returns the duration.
   *
   *   const done = log.timer('API', 'POST /grocery/checkout-step');
   *   ...
   *   done({ status: 200 });
   */
  timer(module: LogModule, label: string): (extra?: Record<string, unknown>) => number {
    const t0 = Date.now();
    return (extra?: Record<string, unknown>) => {
      const ms = Date.now() - t0;
      emit('INFO', module, '⏱', label, { ms, ...extra });
      return ms;
    };
  },
};
