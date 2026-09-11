import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme';
import VedaIcon from '../icons/VedaIcon';
import VodafoneIcon from '../../../assets/dashboard/svg/vodafone-icon.svg';
import type { ConnectAppSource } from '../../types';

const appGmail = require('../../../assets/dashboard/app-gmail.png');

type Props = {
  text: string;
  tone: 'agent' | 'user' | 'error';
  /** Sources the message content was pulled from (e.g. bill inbox, provider),
   * shown as linked-app icons next to the agent avatar. */
  connectApps?: ConnectAppSource[];
};

function ConnectAppIcon({ source }: { source: ConnectAppSource }) {
  if (source === 'gmail') {
    return <Image source={appGmail} style={styles.connectIconInset} resizeMode="contain" />;
  }
  return <VodafoneIcon width={16} height={16} />;
}

export default function MessageBubble({ text, tone, connectApps }: Props) {
  // Don't render if text is empty
  if (!text || !text.trim()) {
    return null;
  }

  const isAgent = tone === 'agent';
  const appSources = connectApps ?? [];
  const hasConnectedApps = appSources.length > 0;

  return (
    <View style={isAgent ? styles.agentContainer : styles.container}>
      {isAgent && (
        <View style={styles.headerRow}>
          <View style={[styles.iconCircle, hasConnectedApps && styles.iconCircleLarge]}>
            <VedaIcon width={hasConnectedApps ? 22 : 20} color="#FFFFFF" />
          </View>
          {hasConnectedApps && (
            <View style={styles.connectIcons}>
              {appSources.map((source, index) => (
                <View
                  key={`${source}-${index}`}
                  style={[styles.connectIconCircle, index > 0 && styles.connectIconGap]}
                >
                  <ConnectAppIcon source={source} />
                </View>
              ))}
            </View>
          )}
        </View>
      )}
      {isAgent ? (
        <LinearGradient
          colors={
            hasConnectedApps
              ? ['rgba(255, 243, 243, 0.95)', 'rgba(255, 224, 224, 0.75)']
              : ['rgba(255, 242, 242, 0.8)', 'rgba(255, 201, 201, 0.5)']
          }
          start={{ x: 0, y: 0.3 }}
          end={{ x: 1, y: 0.9 }}
          style={[styles.agentBubble, hasConnectedApps && styles.agentBubbleFeature]}
        >
          <Text style={[styles.agentText, hasConnectedApps && styles.agentTextFeature]}>{text}</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.bubble, tone === 'user' ? styles.userBubble : styles.errorBubble]}>
          <Text style={tone === 'user' ? styles.userText : styles.errorText}>
            {text}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  agentContainer: {
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F00405',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleLarge: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  connectIcons: { flexDirection: 'row' },
  connectIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#E4E4E4',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  connectIconGap: { marginLeft: -6 },
  connectIconInset: { width: 14, height: 14 },
  bubble: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: '90%',
  },
  agentBubble: {
    padding: 16,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderBottomLeftRadius: 12,
    maxWidth: '90%',
  },
  agentBubbleFeature: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    maxWidth: '100%',
  },
  userBubble: {
    backgroundColor: '#F00405',
    alignSelf: 'flex-end',
    borderWidth: 0,
  },
  errorBubble: {
    backgroundColor: '#FFEBEE',
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  agentText: {
    color: '#131313',
    fontSize: 14,
    lineHeight: 19.6,
    fontFamily: 'Inter_400Regular',
  },
  agentTextFeature: {
    fontSize: 14,
    lineHeight: 20,
  },
  userText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21, fontWeight: '400' },
  errorText: { color: '#C62828', fontSize: 15, lineHeight: 21, fontWeight: '500' },
});
