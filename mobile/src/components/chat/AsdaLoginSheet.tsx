import * as WebBrowser from 'expo-web-browser';
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
import { colors } from '../../theme/colors';
import { radii, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = {
  visible: boolean;
  onSuccess: () => void;
  onClose: () => void;
};

type Phase = 'prompt' | 'extracting';

// Injected after the hidden extraction WebView detects we are logged in.
// Uses window.__wk (saved before webkit is hidden) to post data back.
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
    if (window.__wk && window.__wk.messageHandlers && window.__wk.messageHandlers.reactNativeWebView) {
      window.__wk.messageHandlers.reactNativeWebView.postMessage(payload);
    } else if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(payload);
    }
  } catch(e) {
    try {
      var err = JSON.stringify({ type: 'error', message: String(e) });
      if (window.__wk) window.__wk.messageHandlers.reactNativeWebView.postMessage(err);
      else if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(err);
    } catch(e2) {}
  }
})();
true;
`;

// Hides window.webkit before any page script runs (used in extraction WebView too,
// as a precaution in case www.asda.com has Cloudflare on any sub-resource).
const STEALTH_JS = `
(function() {
  try {
    var _wk = window.webkit;
    if (_wk) {
      Object.defineProperty(window, 'webkit', {
        get: function() { return undefined; },
        configurable: true,
        enumerable: false,
      });
      window.__wk = _wk;
    }
  } catch(e) {}
})();
true;
`;

export default function AsdaLoginSheet({ visible, onSuccess, onClose }: Props) {
  const webviewRef = useRef<WebView>(null);
  const [phase, setPhase] = useState<Phase>('prompt');
  const extractedRef = useRef(false);

  async function handleSignIn() {
    // Open real SFSafariViewController — full Safari engine, Cloudflare passes,
    // cookies written to shared iOS cookie store.
    setPhase('extracting'); // show spinner immediately
    await WebBrowser.openBrowserAsync('https://www.asda.com/account', {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      dismissButtonStyle: 'done',
    });
    // Browser closed. The hidden WebView (sharedCookiesEnabled) will now load
    // www.asda.com/account and find itself already authenticated via shared cookies.
    // It fires onLoadEnd → we inject EXTRACT_SESSION_JS → onMessage → onSuccess.
    extractedRef.current = false; // allow extraction
  }

  function handleLoadEnd(event: any) {
    if (phase !== 'extracting' || extractedRef.current) return;
    const url: string = event.nativeEvent?.url ?? '';
    // Only extract when we're on www.asda.com (not login.asda.com — not authenticated yet)
    if (!url.includes('login.asda.com') && url.includes('asda.com')) {
      extractedRef.current = true;
      setTimeout(() => {
        webviewRef.current?.injectJavaScript(EXTRACT_SESSION_JS);
      }, 1500);
    }
  }

  async function handleMessage(event: any) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'session_data') {
        await api.saveAsdaSession({
          localStorage: data.localStorage ?? {},
          cookies: data.cookies ?? '',
        });
      }
    } catch (e) {
      console.warn('[AsdaLoginSheet] extraction error:', e);
    }
    // Always proceed — checkout will handle auth errors gracefully
    handleClose();
    onSuccess();
  }

  function handleClose() {
    setPhase('prompt');
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
            <Text style={styles.title}>Connect Asda</Text>
            <Pressable onPress={handleClose} style={styles.cancelBtn} hitSlop={12}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>

        {phase === 'prompt' && (
          <View style={styles.body}>
            <Text style={styles.asdaLogo}>🛒</Text>
            <Text style={styles.heading}>Sign in to Asda once</Text>
            <Text style={styles.description}>
              Veda will open Asda's sign-in page. After you sign in, come back and
              Veda will handle all future orders automatically — no passwords needed again.
            </Text>
            <Pressable style={styles.signInButton} onPress={handleSignIn}>
              <Text style={styles.signInText}>Open Asda sign-in →</Text>
            </Pressable>
          </View>
        )}

        {phase === 'extracting' && (
          <View style={styles.body}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={styles.savingText}>Saving your session…</Text>
            <Text style={styles.savingSubtext}>
              This only takes a moment.
            </Text>

            {/* Hidden WebView — shares cookies with SFSafariViewController via iOS cookie store.
                Navigates to www.asda.com/account which loads as authenticated, then we
                extract localStorage (SLAS tokens) + readable cookies. */}
            <View style={styles.hiddenWebView}>
              <WebView
                ref={webviewRef}
                source={{ uri: 'https://www.asda.com/account' }}
                injectedJavaScriptBeforeContentLoaded={STEALTH_JS}
                onLoadEnd={handleLoadEnd}
                onMessage={handleMessage}
                javaScriptEnabled
                domStorageEnabled
                sharedCookiesEnabled
                thirdPartyCookiesEnabled
              />
            </View>
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
  savingText: {
    ...typography.bodyBold,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  savingSubtext: {
    ...typography.caption,
    color: colors.textMuted,
  },
  hiddenWebView: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});
