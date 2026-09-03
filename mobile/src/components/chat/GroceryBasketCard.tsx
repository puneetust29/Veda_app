import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { GroceryBasketPayload } from '../../types';
import { colors } from '../../theme/colors';
import { radii, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = {
  basket: GroceryBasketPayload;
};

type CheckoutState = 'idle' | 'opening';

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
      if (basket.checkout_mode === 'session') {
        // Pepesto hosted payment page (Stripe) — opens as in-app sheet, no app redirect
        console.log('[GroceryBasketCard] opening Pepesto payment sheet (session mode)');
        const result = await WebBrowser.openBrowserAsync(url, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        });
        console.log('[GroceryBasketCard] WebBrowser result:', result.type);
      } else {
        // Supermarket search / fallback — open in native browser or supermarket app
        console.log('[GroceryBasketCard] opening supermarket via Linking (mode:', basket.checkout_mode, ')');
        await Linking.openURL(url);
      }
    } catch (err) {
      console.error('[GroceryBasketCard] openCheckout ERROR:', err);
    } finally {
      setCheckoutState('idle');
    }
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

      {/* Checkout button */}
      <Pressable
        style={({ pressed }) => [
          styles.checkoutButton,
          (pressed || checkoutState === 'opening') && styles.checkoutButtonPressed,
        ]}
        onPress={openCheckout}
        disabled={checkoutState === 'opening'}
        accessibilityRole="button"
        accessibilityLabel={`Shop at ${basket.supermarket_name}`}
      >
        <Text style={styles.checkoutText}>
          {checkoutState === 'opening'
            ? 'Opening…'
            : `Shop at ${basket.supermarket_name} →`}
        </Text>
      </Pressable>
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
  checkoutButton: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  checkoutButtonPressed: {
    backgroundColor: colors.brandDark,
  },
  checkoutText: {
    ...typography.bodyBold,
    color: colors.white,
  },
});
