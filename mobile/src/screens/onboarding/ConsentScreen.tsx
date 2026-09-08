import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Animated, LayoutAnimation, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AccordionSection from '../../components/onboarding/AccordionSection';
import StepHeader from '../../components/onboarding/StepHeader';
import StepProgressBar from '../../components/onboarding/StepProgressBar';
import { colors, fonts, radii, spacing, typography } from '../../theme';
import type { OnboardingStackParamList } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Consent'>;

const BULLETS = [
  'Organise your plans, reminders and schedules',
  'Connect information across your apps and accounts',
  'Help with travel and everyday tasks',
  'Personalise recommendations and experiences',
  'Recommend relevant Vodafone products and services',
  'Improve Veda and help keep your account secure',
];

const SHARE_BULLETS = [
  "Connected services you've authorised",
  'Vodafone and trusted partners to complete purchases or requests',
  'Family members only when you choose to share',
  'Trusted providers that help operate and secure Veda',
  'Legal or security authorities where required',
];

const PROTECT_BULLETS = [
  "Collecting only what's needed",
  'Encrypting data in transit and storage',
  'Limiting access to trusted providers',
  'Monitoring for fraud and misuse',
  "Deleting information when it's no longer needed",
];

const CONTROL_BULLETS = [
  'Choose which apps and accounts to connect',
  'Review or remove access at any time',
  'Manage personalisation and marketing preferences',
  'Access, correct or delete your information where applicable',
  'Request human review of significant AI decisions',
];

// Fuller copy shown only in the "Privacy Policy" modal opened from the
// "Privacy Notice" link. The inline consent accordions keep the shorter
// summary copy above.
const USE_BULLETS_DETAILED = [
  'Organise important events, plans and reminders',
  'Bring together relevant information from your connected accounts',
  'Coordinate shared plans and services across your family',
  'Recommend relevant Vodafone products, plans and services',
  'Support travel, scheduling and other everyday tasks',
  'Personalise information and recommendations based on your preferences',
  'Improve the performance, reliability and usability of Veda',
  'Detect fraud, misuse and security issues',
];

const SHARE_BULLETS_DETAILED = [
  'With services you choose to connect, when required to complete an action you request',
  'With Vodafone or another provider when you compare, select or purchase a product or service',
  'With family members when you intentionally share plans, events or other information with them',
  'With technology, hosting, security, analytics and customer-support providers that help operate Veda',
  'Where required by law, regulation or a valid request from an authorised body',
  'Where necessary to prevent fraud, protect users or maintain the security of the service',
];

const PROTECT_BULLETS_DETAILED = [
  'Limiting access to authorised people and service providers',
  'Encrypting information where appropriate during transfer and storage',
  'Requesting only the information needed for each feature',
  'Separating private information from information intentionally shared with others',
  'Monitoring for unauthorised access, fraud and misuse',
  'Reviewing connected services and service providers before information is shared',
  'Keeping information only for as long as it is required for the stated purpose',
  'Deleting or anonymising information when it is no longer needed',
];

const CONTROL_BULLETS_DETAILED = [
  'Choose which services and individual accounts to connect',
  'Allow access only to the information needed for a selected feature',
  'Review and change connected-account permissions',
  'Turn optional personalisation on or off',
  'Choose whether to receive marketing communications',
  'Withdraw optional consent at any time',
  'Disconnect an account or service',
  'Correct inaccurate personal information',
  'Request access to the information held about you',
  'Request deletion or restriction where applicable',
  'Object to certain uses of your information',
  'Request a portable copy of eligible information',
  'Ask for human review where an automated decision significantly affects you',
  'Raise a privacy concern or complaint',
];

type AccordionId = 'use' | 'safe' | 'ai' | 'control';

const TOTAL_ACCORDIONS = 4;

// Shared between the inline consent accordions and the full "Privacy Policy"
// modal (opened from the "Privacy Notice" link) so the two stay in sync.
// Only one section is expanded at a time within a given instance. The modal
// uses the fuller `detailed` copy; the inline page keeps the short summary.
function PrivacyAccordions({
  onToggle,
  detailed = false,
}: {
  onToggle: (id: AccordionId, expanded: boolean) => void;
  detailed?: boolean;
}) {
  const [openId, setOpenId] = useState<AccordionId | null>(null);

  const handleToggle = (id: AccordionId, expanded: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenId(expanded ? id : null);
    onToggle(id, expanded);
  };

  return (
    <>
      <AccordionSection
        title="How Veda uses your information"
        expanded={openId === 'use'}
        onToggle={(expanded) => handleToggle('use', expanded)}
      >
        <Text style={styles.sectionIntro}>
          {detailed
            ? 'Veda uses information you choose to provide or connect to:'
            : 'Veda only uses the information you choose to share to:'}
        </Text>
        {(detailed ? USE_BULLETS_DETAILED : BULLETS).map((bullet) => (
          <View key={bullet} style={styles.bulletRow}>
            <Text style={styles.bulletDot}>{'•'}</Text>
            <Text style={styles.bulletText}>{bullet}</Text>
          </View>
        ))}
        {detailed ? (
          <>
            <Text style={styles.sectionExtra}>
              Some features use AI to summarise information, identify relevant actions and generate
              recommendations. Recommendations are suggestions only, and important purchases, account changes or
              service activations will require your confirmation.
            </Text>
            <Text style={styles.sectionExtra}>
              Veda only uses information for clear, stated purposes and should collect no more information than is
              necessary for those purposes.
            </Text>
          </>
        ) : (
          <Text style={styles.sectionExtra}>
            AI helps Veda summarise information and recommend actions. You'll always review and approve important
            actions before they're completed.
          </Text>
        )}
      </AccordionSection>
      <AccordionSection
        title="When Veda shares your information"
        expanded={openId === 'safe'}
        onToggle={(expanded) => handleToggle('safe', expanded)}
      >
        <Text style={styles.sectionIntro}>
          {detailed
            ? 'Veda may share your information:'
            : 'Veda only shares information when needed to provide the services you choose. This may include:'}
        </Text>
        {(detailed ? SHARE_BULLETS_DETAILED : SHARE_BULLETS).map((bullet) => (
          <View key={bullet} style={styles.bulletRow}>
            <Text style={styles.bulletDot}>{'•'}</Text>
            <Text style={styles.bulletText}>{bullet}</Text>
          </View>
        ))}
        {detailed ? (
          <>
            <Text style={styles.sectionExtra}>
              Your private emails, messages, calendars and connected-account information are not automatically
              shared with family members.
            </Text>
            <Text style={styles.sectionExtra}>
              Connecting one account does not automatically connect every account you hold with the same provider.
              Each account must be selected and authorised separately.
            </Text>
            <Text style={styles.sectionExtra}>
              Veda does not sell your personal information to advertisers. Any use of information for personalised
              marketing or promotional communications will be explained separately and will respect your marketing
              choices.
            </Text>
          </>
        ) : (
          <Text style={styles.sectionExtra}>
            Veda never sells your personal information or shares your private data without your permission.
          </Text>
        )}
      </AccordionSection>
      <AccordionSection
        title="How Veda protects your privacy"
        expanded={openId === 'ai'}
        onToggle={(expanded) => handleToggle('ai', expanded)}
      >
        <Text style={styles.sectionIntro}>
          {detailed
            ? 'Veda protects your information through appropriate technical and organisational safeguards, including:'
            : 'Veda protects your information by:'}
        </Text>
        {(detailed ? PROTECT_BULLETS_DETAILED : PROTECT_BULLETS).map((bullet) => (
          <View key={bullet} style={styles.bulletRow}>
            <Text style={styles.bulletDot}>{'•'}</Text>
            <Text style={styles.bulletText}>{bullet}</Text>
          </View>
        ))}
        {detailed ? (
          <>
            <Text style={styles.sectionExtra}>
              Veda will not use connected information for an unrelated purpose without first providing clear
              information and, where required, asking for a new permission.
            </Text>
            <Text style={styles.sectionExtra}>
              Where AI is used, Veda will apply safeguards to reduce inaccurate, unfair or unexpected use of
              personal information and provide meaningful human oversight where a decision could significantly
              affect you.
            </Text>
          </>
        ) : (
          <Text style={styles.sectionExtra}>
            Veda won't use your information for new purposes without informing you and requesting permission where
            required.
          </Text>
        )}
      </AccordionSection>
      <AccordionSection
        title="Your Permissions"
        isLast
        expanded={openId === 'control'}
        onToggle={(expanded) => handleToggle('control', expanded)}
      >
        <Text style={styles.sectionIntro}>
          {detailed ? 'You remain in control of the information you share with Veda. You can:' : "You're always in control. You can:"}
        </Text>
        {(detailed ? CONTROL_BULLETS_DETAILED : CONTROL_BULLETS).map((bullet) => (
          <View key={bullet} style={styles.bulletRow}>
            <Text style={styles.bulletDot}>{'•'}</Text>
            <Text style={styles.bulletText}>{bullet}</Text>
          </View>
        ))}
        <Text style={styles.sectionExtra}>
          {detailed
            ? 'Withdrawing a permission will stop future access through that connection. Information already used for a completed transaction, legal obligation or security purpose may need to be retained for a limited period.'
            : 'Removing access stops future data sharing through that connection, while information required for legal, security or completed transactions may be retained.'}
        </Text>
      </AccordionSection>
    </>
  );
}

// Consent step now uses four collapsed accordions. The CTA stays disabled
// until each accordion has been opened at least once.
export default function ConsentScreen({ navigation }: Props) {
  const [openedAccordions, setOpenedAccordions] = useState<Record<AccordionId, boolean>>({
    use: false,
    safe: false,
    ai: false,
    control: false,
  });
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const ctaAnim = useRef(new Animated.Value(0)).current;
  const openedCount = Object.values(openedAccordions).filter(Boolean).length;
  const allOpened = openedCount === TOTAL_ACCORDIONS;

  const handleAccordionToggle = (id: AccordionId, expanded: boolean) => {
    if (!expanded) return;
    setOpenedAccordions((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  useEffect(() => {
    Animated.timing(ctaAnim, { toValue: allOpened ? 1 : 0, duration: 300, useNativeDriver: false }).start();
  }, [allOpened, ctaAnim]);


  return (
    <View style={styles.container}>
      <StepHeader onBack={() => navigation.goBack()} />

      <Animated.ScrollView contentContainerStyle={styles.body}>
        <StepProgressBar step={5} totalSteps={5}/>
        <Text style={styles.title}>Your data belongs to you.</Text>
        <Text style={styles.subtitle}>
          Veda only accesses information you've approved, and you can change or remove permissions anytime.
        </Text>

        <PrivacyAccordions onToggle={handleAccordionToggle} />
      </Animated.ScrollView>
      <View style={styles.policyContainer}>
      <Text style={styles.agreement}>
          By selecting <Text style={styles.agreementBold}>Agree & Continue</Text>, you agree to Veda's terms and
          privacy policy.
        </Text>
      <View style={styles.legalLinks}>
          <TouchableOpacity onPress={() => setPrivacyModalVisible(true)}>
            <Text style={styles.link}>Privacy Notice</Text>
          </TouchableOpacity>
          <Text style={styles.legalDivider}>·</Text>
          <Text style={styles.link}>Terms of Use</Text>
        </View>
        </View>
      <View style={styles.footer}>
        <TouchableOpacity disabled={!allOpened} onPress={() => navigation.navigate('Success')}>
          <Animated.View style={[styles.cta, { opacity: ctaAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }]}>
            <Animated.Text style={styles.ctaText}>Agree & Continue</Animated.Text>
          </Animated.View>
        </TouchableOpacity>
        <Text style={styles.counterText}>{openedCount}/{TOTAL_ACCORDIONS} Terms read.</Text>
      </View>

      <Modal
        visible={privacyModalVisible}
        animationType="slide"
        onRequestClose={() => setPrivacyModalVisible(false)}
        style={{height: '100%'}}
      >
        <View style={styles.container}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.md }]}>
            <Text style={styles.modalTitle}>Privacy Policy</Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setPrivacyModalVisible(false)}
              hitSlop={16}
            >
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            <PrivacyAccordions onToggle={handleAccordionToggle} detailed />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: spacing.xl,paddingTop: spacing.xl,paddingBottom: spacing.xl },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm, fontSize: 38 },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.lg },
  sectionIntro: {
    ...typography.caption,
    fontFamily: fonts.bodyLight,
    fontWeight: '300',
    color: colors.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 20
  },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.xs },
  bulletDot: { ...typography.caption, fontFamily: fonts.bodyLight, fontWeight: '300', color: colors.textMuted },
  bulletText: {
    ...typography.caption,
    fontFamily: fonts.bodyLight,
    fontWeight: '300',
    color: colors.textMuted,
    flex: 1,
    lineHeight: 18,
  },
  sectionExtra: {
    ...typography.caption,
    fontFamily: fonts.bodyLight,
    fontWeight: '300',
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  agreement: { ...typography.small, color: colors.textMuted, marginTop: spacing.lg, lineHeight: 16 },
  agreementBold: { color: colors.textPrimary, fontWeight: '700' },
  policyContainer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, borderTopColor: colors.border, borderTopWidth: 1},
  legalLinks: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  link: { ...typography.small, color: colors.brandText, fontWeight: '700' },
  legalDivider: { ...typography.small, color: colors.textMuted },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, paddingTop: spacing.sm },
  cta: { backgroundColor: colors.brandBackGround,borderRadius: radii.pill, paddingVertical: spacing.lg, alignItems: 'center' },
  ctaText: { ...typography.bodyBold, color: colors.white, fontSize: 16 },
  counterText: { ...typography.small, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  modalTitle: { ...typography.bodyBold, color: colors.textPrimary, fontSize: 20 },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
