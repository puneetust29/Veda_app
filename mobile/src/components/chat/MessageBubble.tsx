import { StyleSheet, Text, View, Image } from 'react-native';
import { colors } from '../../theme';

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
          <Image
            source={require('../../../assets/icon.png')}
            style={styles.icon}
            resizeMode="contain"
          />
        </View>
      )}
      <View style={[styles.bubble, tone === 'user' ? styles.userBubble : tone === 'error' ? styles.errorBubble : styles.agentBubble]}>
        <Text style={tone === 'user' ? styles.userText : tone === 'error' ? styles.errorText : styles.agentText}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  agentContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  icon: {
    width: 24,
    height: 24,
  },
  bubble: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: '90%',
  },
  agentBubble: {
    backgroundColor: '#FFF3E0',
    borderWidth: 0,
    borderColor: '#FFE0B2',
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
  agentText: { color: '#1F1F1F', fontSize: 15, lineHeight: 21, fontWeight: '400' },
  userText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21, fontWeight: '400' },
  errorText: { color: '#C62828', fontSize: 15, lineHeight: 21, fontWeight: '500' },
});
