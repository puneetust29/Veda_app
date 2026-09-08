import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { api } from '../../lib/api';
import { log } from '../../lib/logger';
import { colors } from '../../theme/colors';
import { radii, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = {
  visible: boolean;
  onSuccess: () => void;
  onClose: () => void;
};

const EXTRACT_SESSION_JS = `
(function() {
  try {
    var ls = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      ls[k] = localStorage.getItem(k);
    }
    var payload = JSON.stringify({
      type: 'session_data',
      localStorage: ls,
      cookies: document.cookie
    });
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(payload);
    }
  } catch(e) {
    try {
      var err = JSON.stringify({ type: 'error', message: String(e) });
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(err);
    } catch(e2) {}
  }
})();
true;
`;

// Mask WKWebView fingerprints so Cloudflare Turnstile sees a normal Safari browser
const STEALTH_JS = `
(function() {
  try {
    // Hide the WKWebView message handler bridge
    if (window.webkit) {
      Object.defineProperty(window, 'webkit', {
        get: function() { return undefined; },
        configurable: true,
        enumerable: false,
      });
    }
    // Ensure webdriver flag is absent
    Object.defineProperty(navigator, 'webdriver', {
      get: function() { return undefined; },
      configurable: true,
    });
    // Spoof plugins to look like real Safari
    Object.defineProperty(navigator, 'plugins', {
      get: function() {
        return { length: 0, refresh: function() {} };
      },
      configurable: true,
    });
    // Remove automation-related properties
    delete window.__playwright;
    delete window.__selenium;
    delete window.callPhantom;
    delete window._phantom;
  } catch(e) {}
})();
true;
`;

const SAFARI_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

export default function AsdaLoginSheet({ visible, onSuccess, onClose }: Props) {
  const webviewRef = useRef<WebView>(null);
  const [showWebView, setShowWebView] = useState(false);
  const [saving, setSaving] = useState(false);
  const extractedRef = useRef(false);

  function handleStartLogin() {
    log.start('ASDA_LOGIN', 'user tapped Continue — opening Asda WebView');
    extractedRef.current = false;
    setSaving(false);
    setShowWebView(true);
  }

  function handleNavigationChange(event: any) {
    const url: string = event.nativeEvent?.url ?? '';
    log.info('ASDA_LOGIN', 'navigation', {
      url,
      extracted: extractedRef.current,
      saving,
      show_webview: showWebView,
    });

    if (extractedRef.current || saving) return;

    if (
      showWebView &&
      url.includes('www.asda.com') &&
      !url.includes('login.asda.com')
    ) {
      log.ok('ASDA_LOGIN', 'login redirect detected — Asda main site reached', { url });
      extractedRef.current = true;
      setSaving(true);
      log.info('ASDA_LOGIN', 'waiting 2s for SPA to settle before extracting session');
      setTimeout(() => {
        log.info('ASDA_LOGIN', 'injecting EXTRACT_SESSION_JS');
        webviewRef.current?.injectJavaScript(EXTRACT_SESSION_JS);
      }, 2000);
    } else if (url.includes('login.asda.com')) {
      log.warn('ASDA_LOGIN', 'on Asda login page — Cloudflare Turnstile may appear', { url });
    }
  }

  async function handleMessage(event: any) {
    let sessionSaved = false;
    try {
      const data = JSON.parse(event.nativeEvent.data);
      log.info('ASDA_LOGIN', 'WebView message received', { type: data.type });

      if (data.type === 'session_data') {
        const lsKeys = Object.keys(data.localStorage ?? {});
        const cookieCount = (data.cookies ?? '').split(';').filter(Boolean).length;
        log.info('ASDA_LOGIN', 'session data extracted', {
          localStorage_keys: lsKeys.length,
          localStorage_names: lsKeys.slice(0, 10).join(', '),
          cookie_count: cookieCount,
          has_slas_token: lsKeys.some((k) => k.includes('SLAS') || k.includes('slas')),
        });

        const saveDone = log.timer('ASDA_LOGIN', 'saveAsdaSession API call');
        await api.saveAsdaSession({
          localStorage: data.localStorage ?? {},
          cookies: data.cookies ?? '',
        });
        saveDone({ ls_keys: lsKeys.length, cookies: cookieCount });
        log.ok('ASDA_LOGIN', 'session saved to backend asda_auth.json');
        sessionSaved = true;
      } else if (data.type === 'error') {
        log.fail('ASDA_LOGIN', 'session extraction JS error', { message: data.message });
      } else {
        log.warn('ASDA_LOGIN', 'unexpected message type', { type: data.type });
      }
    } catch (e) {
      log.fail('ASDA_LOGIN', 'handleMessage error', { error: String(e) });
    }

    if (sessionSaved) {
      handleClose();
      onSuccess();
    } else {
      log.warn('ASDA_LOGIN', 'session not saved — calling onClose without onSuccess');
      handleClose();
    }
  }

  function handleClose() {
    log.info('ASDA_LOGIN', 'sheet closing');
    setShowWebView(false);
    setSaving(false);
    extractedRef.current = false;
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.handleBar} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>
              {showWebView ? 'Sign in to Asda' : 'Connect Asda'}
            </Text>
            <Pressable onPress={handleClose} style={styles.cancelBtn} hitSlop={12}>
              <Text style={styles.cancelText}>
                {showWebView ? 'Done' : 'Cancel'}
              </Text>
            </Pressable>
          </View>
        </View>

        {!showWebView && (
          <View style={styles.body}>
            <Text style={styles.asdaLogo}>🛒</Text>
            <Text style={styles.heading}>Sign in to Asda</Text>
            <Text style={styles.description}>
              Sign in to your Asda account below. Veda will then handle your
              grocery orders automatically.
            </Text>
            <Pressable style={styles.signInButton} onPress={handleStartLogin}>
              <Text style={styles.signInText}>Continue →</Text>
            </Pressable>
          </View>
        )}

        {showWebView && (
          <View style={styles.webviewContainer}>
            <WebView
              ref={webviewRef}
              source={{ uri: 'https://www.asda.com/account' }}
              userAgent={SAFARI_USER_AGENT}
              injectedJavaScriptBeforeContentLoaded={STEALTH_JS}
              onNavigationStateChange={handleNavigationChange}
              onMessage={handleMessage}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              style={styles.webview}
            />
            {saving && (
              <View style={styles.savingOverlay}>
                <ActivityIndicator size="large" color={colors.brand} />
                <Text style={styles.savingText}>Saving your session…</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.bodyBold,
    color: colors.textPrimary,
    fontSize: 17,
  },
  cancelBtn: {
    padding: spacing.xs,
  },
  cancelText: {
    ...typography.body,
    color: colors.brand,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  asdaLogo: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  heading: {
    ...typography.bodyBold,
    fontSize: 20,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  signInButton: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    marginTop: spacing.sm,
  },
  signInText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  webviewContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  savingText: {
    ...typography.bodyBold,
    color: colors.textPrimary,
  },
});
