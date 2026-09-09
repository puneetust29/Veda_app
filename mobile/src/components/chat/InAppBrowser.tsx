import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { clearOverlayContent, setOverlayContent } from '../../lib/overlayHost';
import { useEffect } from 'react';

type Props = {
  url: string;
  title?: string;
  onClose: () => void;
};

/**
 * Plain in-app WebView for manual browsing (no automation loop) — used
 * wherever we'd otherwise hand off to Linking.openURL or WebBrowser, both of
 * which are system-browser contexts that let iOS/Android intercept
 * Universal/App Links and redirect to an unrelated app or its store listing
 * (e.g. Pepesto's hosted checkout links). A plain WebView just loads the URL
 * as a page — no Universal Link handoff, so the user never leaves Veda.
 */
export default function InAppBrowser({ url, title = 'Browser', onClose }: Props) {
  useEffect(() => {
    setOverlayContent(
      <View style={styles.container} pointerEvents="auto">
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeButton}>✕</Text>
            </Pressable>
          </View>
          <WebView source={{ uri: url }} style={styles.webView} />
        </SafeAreaView>
      </View>,
    );
    return () => clearOverlayContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: colors.background,
    zIndex: 10,
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
    flex: 1,
  },
  closeButton: {
    fontSize: 18,
    color: colors.textMuted,
    padding: spacing.xs,
  },
  webView: {
    flex: 1,
  },
});
