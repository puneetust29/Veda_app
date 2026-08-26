import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import OnboardingBanner from '../../components/onboarding/OnboardingBanner';
import StepHeader from '../../components/onboarding/StepHeader';
import StepProgressBar from '../../components/onboarding/StepProgressBar';
import { useOnboarding } from '../../context/OnboardingContext';
import { colors, radii, spacing, typography } from '../../theme';
import type { OnboardingStackParamList } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'PhoneEntry'>;

const HELP_BULLETS = [
  'Recognise your Vodafone account',
  'Personalise your experience from day one',
  'Understand your Vodafone services and devices',
];

interface Country {
  code: string;
  name: string;
  flag: string;
}

const COUNTRY_CODES: Country[] = [
  { code: '+1', name: 'United States', flag: '🇺🇸' },
  { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: '+33', name: 'France', flag: '🇫🇷' },
  { code: '+49', name: 'Germany', flag: '🇩🇪' },
  { code: '+39', name: 'Italy', flag: '🇮🇹' },
  { code: '+34', name: 'Spain', flag: '🇪🇸' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: '+81', name: 'Japan', flag: '🇯🇵' },
  { code: '+86', name: 'China', flag: '🇨🇳' },
  { code: '+91', name: 'India', flag: '🇮🇳' },
];

export default function PhoneEntryScreen({ navigation }: Props) {
  const { phoneNumber, setPhoneNumber } = useOnboarding();
  const [selectedCountry, setSelectedCountry] = useState<Country>(COUNTRY_CODES[0]);
  const [localNumber, setLocalNumber] = useState(phoneNumber.replace(/^\+\d+/, ''));
  const [helpVisible, setHelpVisible] = useState(false);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);

  const isValid = localNumber.replace(/\s/g, '').length >= 10;

  const handleContinue = () => {
    setPhoneNumber(`${selectedCountry.code}${localNumber.replace(/\s/g, '')}`);
    navigation.navigate('OtpVerification');
  };

  return (
    <View style={styles.container}>
      <OnboardingBanner />
      <StepHeader onBack={() => navigation.goBack()} overlay />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <StepProgressBar step={1} />
        <Text style={styles.title}>Let's get to know{'\n'}each other.</Text>
        <Text style={styles.subtitle}>Your Vodafone number is the quickest way to personalise Veda.</Text>

        <View style={styles.inputRow}>
          <TouchableOpacity
            style={styles.countrySelector}
            onPress={() => setCountryPickerVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.flag}>{selectedCountry.flag}</Text>
            <Text style={styles.countryCode}>{selectedCountry.code}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Mobile number"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            autoComplete="tel"
            value={localNumber}
            onChangeText={setLocalNumber}
          />
        </View>

        <TouchableOpacity style={styles.helpLink} onPress={() => setHelpVisible(true)}>
          <Ionicons name="heart-outline" size={14} color={colors.brand} />
          <Text style={styles.helper}>How your number helps</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.cta, !isValid && styles.ctaDisabled]}
          disabled={!isValid}
          onPress={handleContinue}
        >
          <Text style={[styles.ctaText, !isValid && styles.ctaTextDisabled]}>Continue</Text>
        </TouchableOpacity>

        <View style={styles.footerLinks}>
          <TouchableOpacity style={styles.footerRow}>
            <View>
              <Text style={styles.footerCaption}>Need a new line?</Text>
              <Text style={styles.footerLinkText}>Get a Vodafone number</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.brand} />
          </TouchableOpacity>
          <View style={styles.footerDivider} />
          <TouchableOpacity style={styles.footerRow}>
            <View>
              <Text style={styles.footerCaption}>Already with another network?</Text>
              <Text style={styles.footerLinkText}>Switch to Vodafone</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.brand} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Bottom-sheet-style modal reproducing the Figma tooltip shown when
          tapping "How your number helps". */}
      <Modal visible={helpVisible} transparent animationType="fade" onRequestClose={() => setHelpVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setHelpVisible(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>Here's how it helps</Text>
            <Text style={styles.sheetIntro}>Your Vodafone number gives Veda a trusted starting point.</Text>
            <Text style={styles.sheetSubIntro}>It helps Veda:</Text>
            {HELP_BULLETS.map((bullet) => (
              <View key={bullet} style={styles.sheetBulletRow}>
                <Ionicons name="checkmark" size={16} color={colors.brand} />
                <Text style={styles.sheetBulletText}>{bullet}</Text>
              </View>
            ))}
            <Text style={styles.sheetFooter}>
              You always stay in control and can change permissions at any time. We'll never access or share your
              information without your permission.
            </Text>
            <TouchableOpacity style={styles.sheetCta} onPress={() => setHelpVisible(false)}>
              <Text style={styles.sheetCtaText}>Got it</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Country Code Picker Modal */}
      <Modal visible={countryPickerVisible} transparent animationType="slide" onRequestClose={() => setCountryPickerVisible(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Country</Text>
              <TouchableOpacity onPress={() => setCountryPickerVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={COUNTRY_CODES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.countryItem,
                    selectedCountry.code === item.code && styles.countryItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedCountry(item);
                    setCountryPickerVisible(false);
                  }}
                >
                  <Text style={styles.countryItemFlag}>{item.flag}</Text>
                  <View style={styles.countryItemText}>
                    <Text style={styles.countryItemName}>{item.name}</Text>
                    <Text style={styles.countryItemCode}>{item.code}</Text>
                  </View>
                  {selectedCountry.code === item.code && (
                    <Ionicons name="checkmark" size={20} color={colors.brand} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xl },
  title: { ...typography.headline, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  flag: { fontSize: 20 },
  countryCode: { ...typography.bodyBold, color: colors.textPrimary, minWidth: 40 },
  input: { flex: 1, paddingVertical: spacing.md, fontSize: 16, color: colors.textPrimary },
  helpLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  helper: { ...typography.caption, color: colors.brand },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  ctaDisabled: { backgroundColor: colors.border },
  ctaText: { ...typography.bodyBold, color: colors.white, fontSize: 16 },
  ctaTextDisabled: { color: colors.textDisabled },
  footerLinks: { marginTop: spacing.xxl },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  footerCaption: { ...typography.caption, color: colors.textMuted },
  footerLinkText: { ...typography.bodyBold, color: colors.textPrimary },
  footerDivider: { height: 1, backgroundColor: colors.border },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  sheetTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm },
  sheetIntro: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  sheetSubIntro: { ...typography.bodyBold, color: colors.textPrimary, marginBottom: spacing.sm },
  sheetBulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  sheetBulletText: { ...typography.body, color: colors.textSecondary, flex: 1 },
  sheetFooter: { ...typography.caption, color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.xl },
  sheetCta: { backgroundColor: colors.brand, borderRadius: radii.pill, paddingVertical: spacing.lg, alignItems: 'center' },
  sheetCtaText: { ...typography.bodyBold, color: colors.white, fontSize: 16 },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  pickerContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '80%',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: { ...typography.title, color: colors.textPrimary },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  countryItemSelected: { backgroundColor: colors.surface },
  countryItemFlag: { fontSize: 24 },
  countryItemText: { flex: 1 },
  countryItemName: { ...typography.body, color: colors.textPrimary },
  countryItemCode: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
});
