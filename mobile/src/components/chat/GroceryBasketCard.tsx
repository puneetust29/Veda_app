import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRef, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { GroceryBasketPayload } from '../../types';
import { api } from '../../lib/api';
import { colors } from '../../theme/colors';
import { radii, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import AsdaLoginSheet from './AsdaLoginSheet';

const ASDA_SESSION_KEY = 'asda_session_saved';

type Props = {
  basket: GroceryBasketPayload;
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

export default function GroceryBasketCard({ basket }: Props) {
  const icon = SUPERMARKET_EMOJI[basket.supermarket] ?? '🛒';
  const hasProducts = basket.items.length > 0;
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('idle');
  const [autoStatus, setAutoStatus] = useState<AutoOrderStatus | null>(null);
  const [showLoginSheet, setShowLoginSheet] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function handleOrderForMe() {
    if (basket.supermarket === 'asda.com') {
      const saved = await AsyncStorage.getItem(ASDA_SESSION_KEY);
      if (!saved) {
        setShowLoginSheet(true);
        return;
      }
    }
    startAutoOrder();
  }

  function handleLoginSuccess() {
    AsyncStorage.setItem(ASDA_SESSION_KEY, 'true').catch(() => null);
    setShowLoginSheet(false);
    startAutoOrder();
  }

  async function startAutoOrder() {
    if (!basket.auto_checkout_skus?.length) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setCheckoutState('auto_ordering');
    setAutoStatus({ text: 'Connecting to Asda…', done: false, success: false });
    console.log('[GroceryBasketCard] auto-order START | supermarket:', basket.supermarket, '| skus:', basket.auto_checkout_skus.length);

    try {
      await api.streamGroceryAutoCheckout({
        supermarketDomain: basket.supermarket,
        skus: basket.auto_checkout_skus,
        signal: ctrl.signal,
        onEvent: (event) => {
          console.log('[GroceryBasketCard] auto-checkout event:', event);
          if (event.kind === 'status' && event.text) {
            setAutoStatus({ text: event.text, done: false, success: false });
          } else if (event.kind === 'done') {
            setAutoStatus({
              text: event.success ? '✓ Order placed successfully!' : `Failed: ${event.message}`,
              done: true,
              success: !!event.success,
            });
            setCheckoutState('idle');
          }
        },
        onError: (err) => {
          console.error('[GroceryBasketCard] auto-checkout error:', err);
          setAutoStatus({ text: 'Something went wrong. Please try again.', done: true, success: false });
          setCheckoutState('idle');
        },
        onClose: () => {
          setCheckoutState('idle');
        },
      });
    } catch (err) {
      if ((err as any)?.name !== 'AbortError') {
        console.error('[GroceryBasketCard] auto-order catch:', err);
        setAutoStatus({ text: 'Connection failed. Please try again.', done: true, success: false });
      }
      setCheckoutState('idle');
    }
  }

  async function openCheckout() {
    const url = basket.checkout_url;
    if (!url) {
      console.warn('[GroceryBasketCard] openCheckout — no checkout_url available');
      return;
    }
    console.log('[GroceryBasketCard] openCheckout START');
    console.log('[GroceryBasketCard] checkout_url:', url);
    console.log('[GroceryBasketCard] mode:', basket.checkout_mode);
    console.log('[GroceryBasketCard] supermarket:', basket.supermarket);
    console.log('[GroceryBasketCard] items_count:', basket.items.length);
    console.log('[GroceryBasketCard] total:', basket.total_formatted);

    setCheckoutState('opening');
    try {
      if (basket.checkout_mode === 'oneshot' || basket.checkout_mode === 'session') {
        // Pepesto hosted checkout page — real web URL, opens in-app sheet
        // User reviews basket, logs into supermarket, pays directly on Pepesto's page
        console.log('[GroceryBasketCard] opening Pepesto hosted checkout sheet (mode:', basket.checkout_mode, ')');
        const result = await WebBrowser.openBrowserAsync(url, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        });
        console.log('[GroceryBasketCard] WebBrowser result:', result.type);
      } else {
        // Supermarket search fallback — opens in native browser or supermarket app
        console.log('[GroceryBasketCard] opening supermarket search via Linking (mode:', basket.checkout_mode, ')');
        await Linking.openURL(url);
      }
    } catch (err) {
      console.error('[GroceryBasketCard] openCheckout ERROR:', err);
    } finally {
      setCheckoutState('idle');
    }
  }

  return (
    <>
    <AsdaLoginSheet
      visible={showLoginSheet}
      onSuccess={handleLoginSuccess}
      onClose={() => setShowLoginSheet(false)}
    />
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
                  console.log('[GroceryBasketCard] opening product:', item.product_url);
                  Linking.openURL(item.product_url);
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

      {/* Auto-order button (primary) — shown when automated checkout is available */}
      {basket.checkout_mode === 'automated' && basket.auto_checkout_skus?.length ? (
        <Pressable
          style={({ pressed }) => [
            styles.autoOrderButton,
            (pressed || checkoutState === 'auto_ordering') && styles.autoOrderButtonPressed,
          ]}
          onPress={handleOrderForMe}
          disabled={checkoutState !== 'idle'}
          accessibilityRole="button"
          accessibilityLabel={`Auto-order from ${basket.supermarket_name}`}
        >
          <Text style={styles.autoOrderText}>
            {checkoutState === 'auto_ordering' ? 'Ordering…' : `Order for me →`}
          </Text>
        </Pressable>
      ) : null}

      {/* Checkout button (secondary fallback) */}
      <Pressable
        style={({ pressed }) => [
          basket.checkout_mode === 'automated' ? styles.checkoutButtonSecondary : styles.checkoutButton,
          (pressed || checkoutState === 'opening') && styles.checkoutButtonPressed,
        ]}
        onPress={openCheckout}
        disabled={checkoutState !== 'idle'}
        accessibilityRole="button"
        accessibilityLabel={`Shop at ${basket.supermarket_name}`}
      >
        <Text style={basket.checkout_mode === 'automated' ? styles.checkoutTextSecondary : styles.checkoutText}>
          {checkoutState === 'opening'
            ? 'Opening…'
            : `View basket on Pepesto →`}
        </Text>
      </Pressable>
    </View>
    </>
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
});
