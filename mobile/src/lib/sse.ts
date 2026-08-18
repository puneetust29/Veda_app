import { fetch as expoFetch } from 'expo/fetch';

// Transport-only Server-Sent-Events client. Knows nothing about the roaming
// agent or any particular event payload shape — it just turns an HTTP
// response body into parsed `{event, data, id}` frames.
//
// Uses `expo/fetch` (not RN's global `fetch`, which is used unmodified
// elsewhere in `api.ts`) because its `response.body` is a real ReadableStream
// fed incrementally by the native layer, which is required to observe SSE
// frames as they arrive rather than only once the connection closes.
//
// If `expo/fetch` streaming ever turns out not to work in a real Expo Go
// environment, swap the implementation of `streamSse` below for
// `react-native-sse` — every caller (the `useRoamingChat` hook via
// `api.streamRoamingConversation`) only depends on this function's signature.

export type SseFrame = { event?: string; data: string; id?: string };

export type StreamSseOptions = {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  onFrame: (frame: SseFrame) => void;
  onError?: (err: unknown) => void;
  onClose?: () => void; // fires exactly once: clean end, error, or abort
};

function parseFrame(rawFrame: string): SseFrame | null {
  const lines = rawFrame.split(/\r?\n/);
  let event: string | undefined;
  let id: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line === '' || line.startsWith(':')) {
      // Blank line (shouldn't occur inside a frame after splitting) or a
      // comment/heartbeat line (e.g. `: ping`) — comments are silently
      // discarded per the SSE spec; they carry no data for this frame.
      if (line.startsWith(':')) {
        // A frame that is ONLY a comment line has no data — treat as heartbeat.
      }
      continue;
    }
    const colonIndex = line.indexOf(':');
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? '' : line.slice(colonIndex + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
    else if (field === 'id') id = value;
    // other fields (e.g. `retry`) are ignored — not needed for this transport.
  }

  if (dataLines.length === 0) {
    // Heartbeat/comment-only frame (e.g. a bare `: ping`) — nothing to deliver.
    return null;
  }

  return { event, data: dataLines.join('\n'), id };
}

export async function streamSse(opts: StreamSseOptions): Promise<void> {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    opts.onClose?.();
  };

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  try {
    const response = await expoFetch(opts.url, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      body: opts.body,
      signal: opts.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${response.status} ${opts.url}: ${body}`);
    }

    if (!response.body) {
      throw new Error(`${opts.url}: response had no body to stream`);
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush any bytes the decoder is holding onto (e.g. a split multi-byte
        // UTF-8 character) — there's no more input coming.
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? '';
      for (const rawFrame of parts) {
        const frame = parseFrame(rawFrame);
        if (frame) opts.onFrame(frame);
      }
    }

    // Handle a trailing frame that never got a final blank-line terminator.
    if (buffer.trim().length > 0) {
      const frame = parseFrame(buffer);
      if (frame) opts.onFrame(frame);
    }

    close();
  } catch (err) {
    if (opts.signal?.aborted) {
      // Abort is a normal close, not an error.
      close();
      return;
    }
    opts.onError?.(err);
    close();
  } finally {
    reader?.releaseLock?.();
  }
}
