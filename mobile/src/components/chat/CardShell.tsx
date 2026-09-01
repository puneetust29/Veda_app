import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import HeaderBackground from '../../../assets/header-background.svg';

type Props = {
  badge: ReactNode;
  badgeBackgroundColor?: string;
  title: string;
  children: ReactNode;
  buttonLabel: string;
  onButtonPress: () => void;
  loading?: boolean;
  buttonDisabled?: boolean;
  footer?: ReactNode;
};

export default function CardShell({
  badge,
  badgeBackgroundColor = 'rgba(230, 0, 0, 0.08)',
  title,
  children,
  buttonLabel,
  onButtonPress,
  loading = false,
  buttonDisabled = false,
  footer,
}: Props) {
  return (
    <View style={styles.cardShadow}>
      <View style={styles.card}>
        {/* Decorative Header Background */}
        <View style={styles.decorativeHeader} pointerEvents="none">
          <HeaderBackground width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />
        </View>

        {/* Header Section */}
        <View style={styles.headerSection}>
          <View style={[styles.badge, { backgroundColor: badgeBackgroundColor }]}>{badge}</View>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>

        {children}

        {/* Action Button */}
        <TouchableOpacity
          style={[styles.button, (loading || buttonDisabled) && styles.buttonDisabled]}
          onPress={onButtonPress}
          disabled={loading || buttonDisabled}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.buttonText}>{buttonLabel}</Text>
          )}
        </TouchableOpacity>

        {footer}
      </View>
    </View>
  );
}

export const cardShellStyles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Urbanist_400Regular',
    color: '#000000',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  sectionValue: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Urbanist_600SemiBold',
    color: '#000000',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    marginHorizontal: 16,
    marginVertical: 12,
  },
});

const styles = StyleSheet.create({
  cardShadow: {
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
    borderRadius: 24,
  },
  card: {
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  decorativeHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 141,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  headerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingHorizontal: 16,
    marginBottom: 8,
    zIndex: 1,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Urbanist_600SemiBold',
    color: '#000000',
    flex: 1,
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#f00405',
    borderRadius: 24,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Urbanist_700Bold',
  },
});
