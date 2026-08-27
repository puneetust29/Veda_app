import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme';
import VedaIcon from '../icons/VedaIcon';

type Props = {
  text: string;
  tone: 'agent' | 'user' | 'error';
};

export default function MessageBubble({ text, tone }: Props) {
  const isAgent = tone === 'agent';

  return (
    <View style={isAgent ? styles.agentContainer : styles.container}>
      {isAgent && (
        <View style={styles.iconCircle}>
          <VedaIcon width={20} color="#FFFFFF" />
        </View>
      )}
      {isAgent ? (
        <LinearGradient
          colors={['rgba(255, 242, 242, 0.8)', 'rgba(255, 201, 201, 0.5)']}
          start={{ x: 0, y: 0.3 }}
          end={{ x: 1, y: 0.9 }}
          style={styles.agentBubble}
        >
          <Text style={styles.agentText}>{text}</Text>
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
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D32F2F',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
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
  userBubble: {
    backgroundColor: '#D32F2F',
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
  userText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21, fontWeight: '400' },
  errorText: { color: '#C62828', fontSize: 15, lineHeight: 21, fontWeight: '500' },
});
