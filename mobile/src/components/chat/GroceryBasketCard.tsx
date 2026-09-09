import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { GroceryBasketPayload } from '../../types';
import { api } from '../../lib/api';
import { log } from '../../lib/logger';
import { colors } from '../../theme/colors';
import { radii, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import CheckoutWebView from './CheckoutWebView';
import InAppBrowser from './InAppBrowser';

type CheckoutSession = {
  sessionId: string;
  firstUrl: string;
  instruction: Record<string, unknown>;
};

type Props = {
  basket: GroceryBasketPayload;
  onStatus?: (text: string, done?: boolean) => void;
};

type CheckoutState = 'idle' | 'opening' | 'auto_ordering';
type AutoOrderStatus = { text: string; done: boolean; success: boolean };

const SUPERMARKET_EMOJI: Record<string, string> = {
  'tesco.com': '🛒',
  'sainsburys.co.uk': '🛒',
  'asda.com': '🛒',
  'waitrose.com': '🛒',
  'morrisons.com': '🛒',
  'ocado.com': '🛒',
};

export default function GroceryBasketCard({ basket, onStatus }: Props) {
  const icon = SUPERMARKET_EMOJI[basket.supermarket] ?? '🛒';
  const hasProducts = basket.items.length > 0;
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('idle');
  const [autoStatus, setAutoStatus] = useState<AutoOrderStatus | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession | null>(null);
  const [checkoutMinimized, setCheckoutMinimized] = useState(false);
  const [inAppBrowserUrl, setInAppBrowserUrl] = useState<string | null>(null);

  useEffect(() => {
    log.info('BASKET', 'card rendered', {
      supermarket: basket.supermarket,
      mode: basket.checkout_mode,
      items: basket.items.length,
      missing: basket.missing_items.length,
      total: basket.total_formatted,
      has_skus: !!(basket.auto_checkout_skus?.length),
      checkout_url: basket.checkout_url?.slice(0, 80),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleOrderForMe() {
    log.start('BASKET', 'handleOrderForMe', {
      mode: basket.checkout_mode,
      supermarket: basket.supermarket,
      skus: basket.auto_checkout_skus?.length ?? 0,
    });

    if (basket.checkout_mode === 'automated' && basket.auto_checkout_skus?.length) {
      log.info('BASKET', 'routing → startAutoOrder (automated/server-side)');
      startAutoOrder();
      return;
    }
    if (basket.checkout_mode === 'mcheckout' && basket.auto_checkout_skus?.length) {
      log.info('BASKET', 'routing → mcheckout WebView');
      setCheckoutState('opening');
      const done = log.timer('BASKET', 'createCheckoutSession');
      try {
        const resp = await api.createCheckoutSession(
          basket.supermarket,
          basket.auto_checkout_skus,
        );
        if (resp.error) {
          log.fail('BASKET', 'createCheckoutSession error', { error: resp.error });
          setAutoStatus({ text: resp.error, done: true, success: false });
          setCheckoutState('idle');
          return;
        }
        done({ session_id: resp.session_id, first_url: resp.first_url });
        log.ok('BASKET', 'checkout session created', {
          session_id: resp.session_id,
          first_url: resp.first_url,
          instruction_type: resp.instruction ? Object.keys(resp.instruction)[0] : 'none',
        });
        setCheckoutSession({
          sessionId: resp.session_id,
          firstUrl: resp.first_url,
          instruction: resp.instruction,
        });
        setCheckoutMinimized(false);
        onStatus?.(`Opening ${basket.supermarket_name} checkout…`);
      } catch (e) {
        done({ error: String(e) });
        log.fail('BASKET', 'createCheckoutSession threw', { error: String(e) });
        setAutoStatus({ text: 'Failed to start checkout', done: true, success: false });
      } finally {
        setCheckoutState('idle');
      }
      return;
    }
    if (basket.supermarket === 'asda.com' && basket.checkout_url) {
      log.info('BASKET', 'routing → in-app browser fallback (Asda checkout URL)', {
        url: basket.checkout_url.slice(0, 80),
      });
      setInAppBrowserUrl(basket.checkout_url);
      return;
    }
    log.info('BASKET', 'routing → startAutoOrder (default)');
    startAutoOrder();
  }

  async function startAutoOrder() {
    if (!basket.auto_checkout_skus?.length) {
      log.warn('BASKET', 'startAutoOrder called with no skus');
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setCheckoutState('auto_ordering');
    setAutoStatus({ text: `Connecting to ${basket.supermarket_name}…`, done: false, success: false });

    log.start('BASKET', 'auto-order stream', {
      supermarket: basket.supermarket,
      skus: basket.auto_checkout_skus.length,
      mode: basket.checkout_mode,
    });
    const streamDone = log.timer('BASKET', 'auto-order total duration');

    try {
      await api.streamGroceryAutoCheckout({
        supermarketDomain: basket.supermarket,
        skus: basket.auto_checkout_skus,
        signal: ctrl.signal,
        onEvent: (event) => {
          if (event.kind === 'status' && event.text) {
            log.info('BASKET', 'auto-order status update', { text: event.text });
            setAutoStatus({ text: event.text, done: false, success: false });
          } else if (event.kind === 'done') {
            streamDone({ success: event.success, message: event.message });
            if (event.success) {
              log.ok('BASKET', 'auto-order complete — added to basket');
            } else {
              log.fail('BASKET', 'auto-order complete — failed', { message: event.message });
            }
            setAutoStatus({
              text: event.success
                ? `✓ Added to your ${basket.supermarket_name} basket — open the app to complete checkout`
                : `Failed: ${event.message}`,
              done: true,
              success: !!event.success,
            });
            setCheckoutState('idle');
          }
        },
        onError: (err) => {
          streamDone({ error: String(err) });
          log.fail('BASKET', 'auto-order stream error', { error: String(err) });
          setAutoStatus({ text: 'Something went wrong. Please try again.', done: true, success: false });
          setCheckoutState('idle');
        },
        onClose: () => {
          log.info('BASKET', 'auto-order stream closed');
          setCheckoutState('idle');
        },
      });
    } catch (err) {
      if ((err as any)?.name !== 'AbortError') {
        streamDone({ error: String(err) });
        log.fail('BASKET', 'auto-order caught exception', { error: String(err) });
        setAutoStatus({ text: 'Connection failed. Please try again.', done: true, success: false });
      } else {
        log.info('BASKET', 'auto-order aborted by user');
      }
      setCheckoutState('idle');
    }
  }

  function openCheckout() {
    const url = basket.checkout_url;
    if (!url) {
      log.warn('BASKET', 'openCheckout — no checkout_url');
      return;
    }

    log.start('BASKET', 'openCheckout', {
      mode: basket.checkout_mode,
      supermarket: basket.supermarket,
      items: basket.items.length,
      total: basket.total_formatted,
      url: url.slice(0, 80),
    });

    // Always in-app (never Linking.openURL / WebBrowser) — both are
    // system-browser contexts, so iOS/Android can intercept a Universal/App
    // Link (like Pepesto's hosted checkout URLs) and redirect to an
    // unrelated app or its store listing instead of showing the page. A
    // plain in-app WebView just loads the URL, no handoff possible.
    setInAppBrowserUrl(url);
  }

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>{icon}</Text>
        <View style={styles.headerText}>
          <Text style={styles.supermarketName}>{basket.supermarket_name}</Text>
          <Text style={styles.basketLabel}>
            {hasProducts ? `${basket.items.length} item${basket.items.length !== 1 ? 's' : ''}` : 'Grocery basket'}
          </Text>
        </View>
        {basket.total_formatted && (
          <Text style={styles.total}>{basket.total_formatted}</Text>
        )}
      </View>

      <View style={styles.divider} />

      {/* Product list */}
      {hasProducts ? (
        <View style={styles.itemList}>
          {basket.items.map((item, idx) => (
            <Pressable
              key={idx}
              style={({ pressed }) => [styles.itemRow, pressed && styles.itemRowPressed]}
              onPress={() => {
                if (item.product_url) {
                  log.info('BASKET', 'item tapped — opening product URL', {
                    item: item.item_name,
                    product: item.product_name,
                    url: item.product_url.slice(0, 80),
                  });
                  setInAppBrowserUrl(item.product_url);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={`Add ${item.item_name} to ${basket.supermarket_name}`}
            >
              {item.image_url ? (
                <Image
                  source={{ uri: item.image_url }}
                  style={styles.productImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.productImagePlaceholder}>
                  <Text style={styles.productImageEmoji}>🥦</Text>
                </View>
              )}
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.item_name}
                </Text>
                <Text style={styles.productName} numberOfLines={1}>
                  {item.product_name}
                </Text>
                {item.product_url ? (
                  <Text style={styles.addToBasket}>+ Add to trolley →</Text>
                ) : null}
              </View>
              <View style={styles.itemRight}>
                {item.num_units > 1 && (
                  <Text style={styles.units}>×{item.num_units}</Text>
                )}
                <Text style={styles.price}>{item.price_formatted}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.predirectNote}>
          <Text style={styles.predirectText}>
            Your items will be added to your {basket.supermarket_name} basket automatically.
          </Text>
        </View>
      )}

      {/* Missing items */}
      {basket.missing_items.length > 0 && (
        <View style={styles.missingContainer}>
          <Text style={styles.missingLabel}>Not found:</Text>
          <Text style={styles.missingItems}>{basket.missing_items.join(', ')}</Text>
        </View>
      )}

      <View style={styles.divider} />

      {/* Auto-order status */}
      {autoStatus && (
        <View style={[styles.autoStatus, autoStatus.done && (autoStatus.success ? styles.autoStatusSuccess : styles.autoStatusError)]}>
          <Text style={styles.autoStatusText}>{autoStatus.text}</Text>
        </View>
      )}

      {/* Asda hint — Pepesto opens with a default store; user needs to switch */}
      {basket.supermarket === 'asda.com' && basket.checkout_mode === 'automated' && (
        <View style={styles.hintContainer}>
          <Text style={styles.hintText}>
            Tap below to checkout. On the next screen, tap "Switch Store" and select Asda.
          </Text>
        </View>
      )}

      {/* Checkout button */}
      {(basket.checkout_mode === 'automated' || basket.checkout_mode === 'mcheckout') && basket.auto_checkout_skus?.length ? (
        <Pressable
          style={({ pressed }) => [
            styles.autoOrderButton,
            (pressed || checkoutState === 'auto_ordering' || checkoutState === 'opening') && styles.autoOrderButtonPressed,
          ]}
          onPress={handleOrderForMe}
          disabled={checkoutState !== 'idle'}
          accessibilityRole="button"
          accessibilityLabel={`Order from ${basket.supermarket_name}`}
        >
          <Text style={styles.autoOrderText}>
            {checkoutState === 'opening' ? 'Opening…' : checkoutState === 'auto_ordering' ? 'Ordering…' : `Order for me →`}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.checkoutButton,
            (pressed || checkoutState === 'opening') && styles.checkoutButtonPressed,
          ]}
          onPress={openCheckout}
          disabled={checkoutState !== 'idle'}
          accessibilityRole="button"
          accessibilityLabel={`Shop at ${basket.supermarket_name}`}
        >
          <Text style={styles.checkoutText}>
            {checkoutState === 'opening'
              ? 'Opening…'
              : `View basket on Pepesto →`}
          </Text>
        </Pressable>
      )}

      {checkoutSession && checkoutMinimized && (
        <Pressable
          style={({ pressed }) => [styles.resumeBanner, pressed && { opacity: 0.7 }]}
          onPress={() => setCheckoutMinimized(false)}
          accessibilityRole="button"
          accessibilityLabel="Resume checkout"
        >
          <Text style={styles.resumeBannerText}>▶ Checkout in progress — tap to view</Text>
        </Pressable>
      )}

      {checkoutSession && (
        <CheckoutWebView
          visible
          minimized={checkoutMinimized}
          sessionId={checkoutSession.sessionId}
          firstUrl={checkoutSession.firstUrl}
          firstInstruction={checkoutSession.instruction}
          onStatus={onStatus}
          onMinimize={() => setCheckoutMinimized(true)}
          onDone={(success, message) => {
            log.info('BASKET', 'CheckoutWebView done', { success, message });
            if (success) {
              log.ok('BASKET', 'item added to basket via WebView checkout');
              onStatus?.('✅ Item added to your basket', true);
            } else {
              log.fail('BASKET', 'WebView checkout failed', { message });
              onStatus?.(`❌ Checkout stopped: ${message}`, true);
            }
            setCheckoutSession(null);
            setCheckoutMinimized(false);
            setAutoStatus({
              text: success
                ? `✓ Added to your ${basket.supermarket_name} basket — open the app to complete checkout`
                : message,
              done: true,
              success,
            });
          }}
          onClose={() => {
            log.info('BASKET', 'CheckoutWebView closed by user');
            setCheckoutSession(null);
            setCheckoutMinimized(false);
          }}
        />
      )}

      {inAppBrowserUrl && (
        <InAppBrowser
          url={inAppBrowserUrl}
          title={basket.supermarket_name}
          onClose={() => setInAppBrowserUrl(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: spacing.xs,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  headerIcon: {
    fontSize: 22,
  },
  headerText: {
    flex: 1,
  },
  supermarketName: {
    ...typography.bodyBold,
    color: colors.textPrimary,
  },
  basketLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  total: {
    ...typography.bodyBold,
    color: colors.success,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  itemList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  itemRowPressed: {
    backgroundColor: colors.surface,
  },
  addToBasket: {
    ...typography.small,
    color: colors.brand,
    marginTop: 1,
  },
  productImage: {
    width: 36,
    height: 36,
    borderRadius: radii.xs,
    backgroundColor: colors.surface,
  },
  productImagePlaceholder: {
    width: 36,
    height: 36,
    borderRadius: radii.xs,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImageEmoji: {
    fontSize: 18,
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    ...typography.caption,
    color: colors.textMuted,
  },
  productName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  units: {
    ...typography.small,
    color: colors.textMuted,
  },
  price: {
    ...typography.caption,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  predirectNote: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  predirectText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  missingContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  missingLabel: {
    ...typography.small,
    color: colors.textMuted,
  },
  missingItems: {
    ...typography.small,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  hintContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: '#FFF8E1',
  },
  hintText: {
    ...typography.small,
    color: '#6D5D00',
    textAlign: 'center',
    lineHeight: 18,
  },
  autoStatus: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  autoStatusSuccess: {
    backgroundColor: '#e8f5e9',
  },
  autoStatusError: {
    backgroundColor: '#fdecea',
  },
  autoStatusText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  autoOrderButton: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  autoOrderButtonPressed: {
    backgroundColor: colors.brandDark,
  },
  autoOrderText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  checkoutButton: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  checkoutButtonSecondary: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  checkoutButtonPressed: {
    backgroundColor: colors.brandDark,
  },
  checkoutText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  checkoutTextSecondary: {
    ...typography.caption,
    color: colors.textMuted,
  },
  resumeBanner: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  resumeBannerText: {
    ...typography.caption,
    color: colors.brand,
  },
});
