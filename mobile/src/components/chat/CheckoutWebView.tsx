import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import ViewShot from 'react-native-view-shot';
import { api } from '../../lib/api';
import { log } from '../../lib/logger';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { clearOverlayContent, setOverlayContent } from '../../lib/overlayHost';

type Props = {
  visible: boolean;
  minimized?: boolean;
  sessionId: string;
  firstUrl: string;
  firstInstruction: Record<string, unknown>;
  onDone: (success: boolean, message: string) => void;
  onClose: () => void;
  onMinimize?: () => void;
  onStatus?: (text: string, done?: boolean) => void;
};

const MAX_ITERATIONS = 40;

function getHomepageUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return url;
  }
}

function isLoginUrl(url: string): boolean {
  return (
    url.includes('login.asda.com') ||
    url.includes('/account/login') ||
    url.includes('/auth/') ||
    url.includes('accounts.google.com')
  );
}

export default function CheckoutWebView({
  visible,
  minimized = false,
  sessionId,
  firstUrl,
  firstInstruction,
  onDone,
  onClose,
  onMinimize,
  onStatus,
}: Props) {
  const webViewRef = useRef<WebView>(null);
  const viewShotRef = useRef<ViewShot>(null);
  const [status, setStatus] = useState('Loading checkout…');
  const [iteration, setIteration] = useState(0);
  const [onLoginPage, setOnLoginPage] = useState(false);
  const iterationRef = useRef(0);
  const activeRef = useRef(true);
  const loopStartedRef = useRef(false);
  const pendingInstructionRef = useRef<Record<string, unknown> | null>(
    firstInstruction,
  );
  const sessionIdRef = useRef(sessionId);
  const currentUrlRef = useRef('');
  const loadErrorRef = useRef(false);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const onMinimizeRef = useRef(onMinimize);
  onMinimizeRef.current = onMinimize;
  const lastSnackbarRef = useRef('');
  const loggedLoginRef = useRef(false);
  const loggedSignedInRef = useRef(false);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    log.info('CHECKOUT_WV', 'minimized prop changed', { minimized });
  }, [minimized]);

  useEffect(() => {
    activeRef.current = visible;
    if (visible) {
      log.start('CHECKOUT_WV', 'opened', {
        session_id: sessionId,
        first_url: firstUrl,
        first_instruction_type: firstInstruction ? Object.keys(firstInstruction)[0] ?? 'empty' : 'none',
      });
      iterationRef.current = 0;
      setIteration(0);
      loopStartedRef.current = false;
      loadErrorRef.current = false;
      pendingInstructionRef.current = firstInstruction;
      setOnLoginPage(false);
    } else {
      log.info('CHECKOUT_WV', 'hidden/closed');
    }
    return () => {
      activeRef.current = false;
    };
  }, [visible, firstInstruction, firstUrl, sessionId]);

  const executeInstruction = useCallback(
    async (instruction: Record<string, unknown>): Promise<{ result: string; error: string }> => {
      const instrType = Object.keys(instruction)[0] ?? 'Unknown';
      const instrDone = log.timer('CHECKOUT_WV', `instruction:${instrType}`);
      log.info('CHECKOUT_WV', `execute instruction`, { type: instrType });

      if ('LoadPage' in instruction) {
        const spec = instruction.LoadPage as { url?: string; max_wait_msec?: number };
        const url = spec.url || '';
        const waitMs = Math.min(spec.max_wait_msec || 3000, 8000);
        log.info('CHECKOUT_WV', 'LoadPage', { url, wait_ms: waitMs });
        setStatus(`Navigating…`);
        webViewRef.current?.injectJavaScript(
          `window.location.href = ${JSON.stringify(url)}; true;`,
        );
        await new Promise((r) => setTimeout(r, waitMs));
        instrDone({ result: 'loaded' });
        return { result: `Loaded ${url}`, error: '' };
      }

      if ('RunJs' in instruction) {
        const spec = instruction.RunJs as {
          js?: string;
          func?: string;
          max_execute_time_msec?: number;
        };
        const js = spec.js || '';
        const func = spec.func || '';
        if (!js || !func) {
          instrDone({ error: 'missing js or func' });
          return { result: '', error: 'RunJs: missing js or func' };
        }

        log.info('CHECKOUT_WV', 'RunJs', { func, js_size: js.length, timeout_ms: spec.max_execute_time_msec });
        setStatus(`Running ${func}…`);
        return new Promise((resolve) => {
          const timeout = setTimeout(
            () => {
              log.warn('CHECKOUT_WV', 'RunJs timeout', { func });
              instrDone({ result: 'timeout' });
              resolve({ result: 'timeout', error: '' });
            },
            Math.min(spec.max_execute_time_msec || 5000, 10000),
          );

          const handler = (e: WebViewMessageEvent) => {
            try {
              const msg = JSON.parse(e.nativeEvent.data);
              if (msg.type === 'js_result') {
                clearTimeout(timeout);
                const result = typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result);
                if (msg.error) {
                  log.warn('CHECKOUT_WV', 'RunJs JS error', { func, error: msg.error });
                } else {
                  log.info('CHECKOUT_WV', 'RunJs result FULL', { func, result_len: result.length, result });
                }
                instrDone({ func, result_len: result.length, error: msg.error || '' });
                resolve({ result, error: msg.error || '' });
              }
            } catch {}
          };

          messageHandlerRef.current = handler;

          const wrappedJs = `
            (async function() {
              try {
                ${js}
                const __result = await ${func}();
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'js_result',
                  result: typeof __result === 'string' ? __result : JSON.stringify(__result),
                }));
              } catch(e) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'js_result',
                  result: '',
                  error: e.message || String(e),
                }));
              }
            })();
            true;
          `;
          webViewRef.current?.injectJavaScript(wrappedJs);
        });
      }

      if ('AwaitJsOutChange' in instruction) {
        const spec = instruction.AwaitJsOutChange as {
          spec?: { js?: string; func?: string };
          current_content?: string;
          check_interval_msec?: number;
        };
        const jsSpec = spec.spec || {};
        const js = jsSpec.js || '';
        const func = jsSpec.func || 'extract';
        const currentContent = spec.current_content || '';
        const interval = spec.check_interval_msec || 1400;

        log.info('CHECKOUT_WV', 'AwaitJsOutChange FULL spec', {
          func,
          js_len: js.length,
          current_content_full: currentContent,
          check_interval_msec: interval,
        });

        setStatus('Waiting for page update…');
        const deadline = Date.now() + 20000;
        let lastResult = currentContent;
        let pollCount = 0;

        while (Date.now() < deadline && activeRef.current) {
          const { result } = await new Promise<{ result: string; error: string }>((resolve) => {
            const to = setTimeout(() => resolve({ result: '', error: 'timeout' }), 5000);
            messageHandlerRef.current = (e: WebViewMessageEvent) => {
              try {
                const msg = JSON.parse(e.nativeEvent.data);
                if (msg.type === 'js_result') {
                  clearTimeout(to);
                  resolve({ result: msg.result || '', error: '' });
                }
              } catch {}
            };
            const wrappedJs = `
              (async function() {
                try {
                  ${js}
                  const __result = await ${func}();
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'js_result',
                    result: typeof __result === 'string' ? __result : JSON.stringify(__result),
                  }));
                } catch(e) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'js_result', result: '', error: e.message,
                  }));
                }
              })();
              true;
            `;
            webViewRef.current?.injectJavaScript(wrappedJs);
          });

          pollCount += 1;
          const changed = !!result && result !== currentContent && result !== 'unknown';
          log.info('CHECKOUT_WV', `AwaitJsOutChange poll #${pollCount}`, {
            changed,
            result_len: result.length,
            result_full: result,
          });

          if (changed) {
            return { result, error: '' };
          }
          lastResult = result || lastResult;
          await new Promise((r) => setTimeout(r, interval));
        }
        log.warn('CHECKOUT_WV', 'AwaitJsOutChange deadline reached without change', { polls: pollCount });
        return { result: lastResult, error: '' };
      }

      if ('SleepInstruction' in instruction) {
        const spec = instruction.SleepInstruction as { msec?: number; sleep_msec?: number };
        const ms = Math.min((spec.msec || spec.sleep_msec || 2000), 10000);
        log.info('CHECKOUT_WV', 'SleepInstruction', { ms });
        setStatus('Waiting…');
        await new Promise((r) => setTimeout(r, ms));
        instrDone({ ms });
        return { result: 'slept', error: '' };
      }

      if ('Wait' in instruction) {
        const ms = Math.min(((instruction.Wait as any)?.msec || 2000), 10000);
        log.info('CHECKOUT_WV', 'Wait', { ms });
        await new Promise((r) => setTimeout(r, ms));
        instrDone({ ms });
        return { result: `Waited ${ms}ms`, error: '' };
      }

      for (const doneKey of ['Done', 'Complete', 'Success', 'OrderPlaced', 'Finished']) {
        if (doneKey in instruction) {
          instrDone({ terminal: doneKey });
          log.ok('CHECKOUT_WV', `terminal instruction: ${doneKey}`);
          return { result: '__DONE__', error: '' };
        }
      }

      for (const errKey of ['Error', 'Failure', 'Failed']) {
        if (errKey in instruction) {
          const msg = instruction[errKey];
          const errMsg = typeof msg === 'string' ? msg : String(msg);
          instrDone({ terminal: errKey, error: errMsg });
          log.fail('CHECKOUT_WV', `terminal instruction: ${errKey}`, { message: errMsg });
          return { result: '', error: errMsg };
        }
      }

      log.warn('CHECKOUT_WV', 'unknown instruction type', { type: instrType, keys: Object.keys(instruction) });
      instrDone({ unknown: true });
      return { result: `Unknown: ${Object.keys(instruction).join(',')}`, error: '' };
    },
    [],
  );

  const captureScreenshot = useCallback(async (): Promise<string> => {
    try {
      if (!viewShotRef.current) return '';
      const uri = await (viewShotRef.current as any).capture();
      if (!uri) return '';
      const response = await fetch(uri);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string)?.split(',')[1] || '';
          log.info('CHECKOUT_WV', 'screenshot captured', { size: base64.length });
          resolve(base64);
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      log.warn('CHECKOUT_WV', 'screenshot capture failed', { error: String(e) });
      return '';
    }
  }, []);

  const messageHandlerRef = useRef<((e: WebViewMessageEvent) => void) | null>(null);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    if (messageHandlerRef.current) {
      messageHandlerRef.current(e);
    }
  }, []);

  const runCheckoutLoop = useCallback(async () => {
    if (!activeRef.current || !sessionIdRef.current) return;
    if (loopStartedRef.current) return;
    loopStartedRef.current = true;

    log.start('CHECKOUT_WV', 'checkout loop started', { session_id: sessionIdRef.current });
    const loopDone = log.timer('CHECKOUT_WV', 'checkout loop total');

    let prevResult = '';
    let prevError = '';

    const firstInstr = pendingInstructionRef.current;
    if (firstInstr && Object.keys(firstInstr).length > 0) {
      log.info('CHECKOUT_WV', 'executing first instruction', {
        type: Object.keys(firstInstr)[0],
      });
      const { result, error } = await executeInstruction(firstInstr);
      if (result === '__DONE__') {
        loopDone({ iterations: 0, outcome: 'done_first_instruction' });
        log.ok('CHECKOUT_WV', 'done on first instruction');
        onDone(true, 'Added to basket');
        return;
      }
      prevResult = result;
      prevError = error;
      pendingInstructionRef.current = null;
    }

    for (let i = 0; i < MAX_ITERATIONS && activeRef.current; i++) {
      iterationRef.current = i + 1;
      setIteration(i + 1);
      setStatus(`Step ${i + 1}: checking with Pepesto…`);

      log.info('CHECKOUT_WV', `step ${i + 1}/${MAX_ITERATIONS}`, {
        prev_result_len: prevResult.length,
        prev_error: prevError || 'none',
        current_url: currentUrlRef.current,
      });
      const stepDone = log.timer('CHECKOUT_WV', `step ${i + 1} round-trip`);

      try {
        // Capture screenshot so Pepesto can see the page state
        const screenshot = await captureScreenshot();

        const response = await api.checkoutStep({
          session_id: sessionIdRef.current,
          prev_result: prevResult,
          prev_error: prevError,
          screenshot_b64: screenshot,
        });

        const instrType = response.instruction ? Object.keys(response.instruction)[0] ?? 'empty' : 'none';
        stepDone({ done: response.done, success: response.success, instruction: instrType });
        log.info('CHECKOUT_WV', `step ${i + 1} response FULL`, {
          done: response.done,
          success: response.success,
          message: response.message,
          instruction_type: instrType,
          instruction_full: JSON.stringify(response.instruction),
        });

        const snackbarMsg = response.status_snackbar?.localized_message;
        if (snackbarMsg && snackbarMsg !== lastSnackbarRef.current) {
          lastSnackbarRef.current = snackbarMsg;
          onStatusRef.current?.(snackbarMsg);
        }

        if (response.done) {
          loopDone({ iterations: i + 1, outcome: response.success ? 'success' : 'failed', message: response.message });
          if (response.success) {
            log.ok('CHECKOUT_WV', 'checkout complete — order placed', { iterations: i + 1 });
          } else {
            log.fail('CHECKOUT_WV', 'checkout complete — failed', { message: response.message, iterations: i + 1 });
          }
          onDone(!!response.success, response.message || 'Checkout complete');
          return;
        }

        if (!response.instruction || Object.keys(response.instruction).length === 0) {
          loopDone({ iterations: i + 1, outcome: 'no_instruction' });
          log.fail('CHECKOUT_WV', 'no instruction received — aborting loop');
          onDone(false, 'No instruction received');
          return;
        }

        const { result, error } = await executeInstruction(response.instruction);
        if (result === '__DONE__') {
          loopDone({ iterations: i + 1, outcome: 'done_instruction' });
          log.ok('CHECKOUT_WV', 'done via instruction', { iterations: i + 1 });
          onDone(true, 'Added to basket');
          return;
        }
        if (error) {
          log.warn('CHECKOUT_WV', `step ${i + 1} instruction error (will send to Pepesto)`, { error });
        }
        prevResult = result;
        prevError = error;
      } catch (err) {
        stepDone({ error: String(err) });
        log.fail('CHECKOUT_WV', `step ${i + 1} network error`, { error: String(err) });
        setStatus('Connection error — retrying…');
        await new Promise((r) => setTimeout(r, 3000));
        prevResult = '';
        prevError = String(err);
      }
    }

    loopDone({ iterations: MAX_ITERATIONS, outcome: 'max_iterations' });
    log.fail('CHECKOUT_WV', 'max iterations reached without completion', { max: MAX_ITERATIONS });
    onDone(false, 'Max iterations reached');
  }, [captureScreenshot, executeInstruction, onDone]);

  const handleNavigationChange = useCallback(
    (nav: WebViewNavigation) => {
      const prevUrl = currentUrlRef.current;
      currentUrlRef.current = nav.url;

      log.info('CHECKOUT_WV', 'navigation', {
        url: nav.url,
        loading: nav.loading,
        prev_url: prevUrl !== nav.url ? prevUrl : undefined,
      });

      if (nav.url.startsWith('veda://')) {
        log.ok('CHECKOUT_WV', 'deep link detected — checkout complete', { url: nav.url });
        onDone(true, 'Checkout complete');
        return;
      }

      const loginDetected = isLoginUrl(nav.url);
      setOnLoginPage(loginDetected);

      if (loginDetected) {
        log.warn('CHECKOUT_WV', 'login page detected — Cloudflare Turnstile may block', { url: nav.url });
        setStatus('Please sign in to continue');
        if (!loggedLoginRef.current) {
          loggedLoginRef.current = true;
          onStatusRef.current?.('Please sign in to Asda to continue…');
        }
      }

      if (!loginDetected && !nav.loading && loopStartedRef.current === false) {
        log.info('CHECKOUT_WV', 'non-login navigation — scheduling loop start (2s)');
        setStatus('Login detected — starting checkout…');
        if (!loggedSignedInRef.current) {
          loggedSignedInRef.current = true;
          onStatusRef.current?.('Signed in — starting checkout…');
          // Signed in — nothing left for the user to do interactively, so get
          // the browser out of the way and let the loop run in the background.
          // (Confirmed via testing: minimizing was NOT the cause of the
          // add-to-basket failures — a visible run failed identically.)
          log.info('CHECKOUT_WV', 'auto-minimizing after sign-in');
          onMinimizeRef.current?.();
        }
        setTimeout(runCheckoutLoop, 2000);
      }
    },
    [onDone, runCheckoutLoop],
  );

  const handleLoadEnd = useCallback(() => {
    const url = currentUrlRef.current;
    log.info('CHECKOUT_WV', 'loadEnd', {
      url,
      is_login: isLoginUrl(url),
      iteration: iterationRef.current,
      loop_started: loopStartedRef.current,
      has_error: loadErrorRef.current,
    });
    if (loadErrorRef.current) return;
    if (iterationRef.current === 0 && !loopStartedRef.current && !isLoginUrl(url)) {
      log.info('CHECKOUT_WV', 'scheduling loop start after initial load (1.5s)');
      setTimeout(runCheckoutLoop, 1500);
    }
  }, [runCheckoutLoop]);

  const retryCountRef = useRef(0);
  const handleError = useCallback((syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    log.fail('CHECKOUT_WV', 'WebView load error', {
      code: nativeEvent.code,
      description: nativeEvent.description,
      url: nativeEvent.url,
      retry: retryCountRef.current,
    });
    loadErrorRef.current = true;
    if (retryCountRef.current < 3) {
      retryCountRef.current += 1;
      const delay = retryCountRef.current * 2000;
      log.info('CHECKOUT_WV', `scheduling retry ${retryCountRef.current}/3 in ${delay}ms`);
      setStatus(`Retrying (${retryCountRef.current}/3) in ${delay / 1000}s…`);
      setTimeout(() => {
        loadErrorRef.current = false;
        webViewRef.current?.reload();
      }, delay);
    } else {
      log.fail('CHECKOUT_WV', 'all retries exhausted — giving up');
      setStatus('Failed to load — close and try again');
    }
  }, []);

  const content = (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Checkout</Text>
        <View style={styles.headerActions}>
          {onMinimize && (
            <Pressable
              onPress={() => {
                log.info('CHECKOUT_WV', 'minimize button pressed');
                onMinimize();
              }}
              hitSlop={12}
            >
              <Text style={styles.minimizeButton}>⌄</Text>
            </Pressable>
          )}
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.closeButton}>✕</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.statusBar}>
        {onLoginPage ? (
          <Text style={styles.loginPrompt}>
            Sign in to Asda, then checkout will continue automatically
          </Text>
        ) : (
          <>
            <ActivityIndicator size="small" color={colors.brand} />
            <Text style={styles.statusText} numberOfLines={1}>
              {status}
            </Text>
            {iteration > 0 && (
              <Text style={styles.stepCount}>Step {iteration}</Text>
            )}
          </>
        )}
      </View>

      <ViewShot ref={viewShotRef} style={{ flex: 1 }} options={{ format: 'jpg', quality: 0.5 }}>
        <WebView
          ref={webViewRef}
          source={{ html: '<html><body style="background:#fff"></body></html>', baseUrl: getHomepageUrl(firstUrl) }}
          style={styles.webView}
          onLoadEnd={handleLoadEnd}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsInlineMediaPlayback
          originWhitelist={['*']}
          onNavigationStateChange={handleNavigationChange}
          onError={handleError}
        />
      </ViewShot>
    </SafeAreaView>
  );

  // Pushed into the app-root OverlayHost instead of rendered via <Modal> here.
  // Critically, this is the SAME element type (a plain View) whether visible
  // or minimized — only its style/pointerEvents change — so React never
  // unmounts+remounts the WebView when toggling between the two. Swapping
  // between <Modal> and <View> (the old approach) reloaded the WebView from
  // scratch on every minimize/restore, which could corrupt an in-progress
  // checkout if it happened mid-loop.
  useEffect(() => {
    if (!visible) {
      clearOverlayContent();
      return;
    }
    setOverlayContent(
      <View
        style={minimized ? styles.hiddenContainer : styles.visibleContainer}
        pointerEvents={minimized ? 'none' : 'auto'}
      >
        {content}
      </View>,
    );
  });

  useEffect(() => {
    return () => {
      clearOverlayContent();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.bodyBold,
    color: colors.textPrimary,
    fontSize: 17,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  minimizeButton: {
    fontSize: 22,
    color: colors.textMuted,
    padding: spacing.xs,
  },
  closeButton: {
    fontSize: 18,
    color: colors.textMuted,
    padding: spacing.xs,
  },
  hiddenContainer: {
    // Full size of OverlayHost's own already-full-screen box (not the tiny
    // chat card CheckoutWebView happens to be declared inside) — the page's
    // window.innerWidth/innerHeight needs real dimensions or the
    // extraction/click scripts find nothing. Just invisible and
    // click-through, behind everything else.
    width: '100%',
    height: '100%',
    opacity: 0,
    zIndex: -1,
  },
  visibleContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.background,
    zIndex: 10,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  statusText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  loginPrompt: {
    ...typography.caption,
    color: colors.brand,
    flex: 1,
    textAlign: 'center',
  },
  stepCount: {
    ...typography.small,
    color: colors.textMuted,
  },
  webView: {
    flex: 1,
  },
});
