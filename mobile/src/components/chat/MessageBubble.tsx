import { StyleSheet, Text, View } from 'react-native';

type Props = {
  text: string;
  tone: 'agent' | 'user' | 'error';
};

export default function MessageBubble({ text, tone }: Props) {
  return (
    <View style={[styles.bubble, tone === 'user' ? styles.userBubble : tone === 'error' ? styles.errorBubble : styles.agentBubble]}>
      <Text style={tone === 'user' ? styles.userText : tone === 'error' ? styles.errorText : styles.agentText}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    maxWidth: '90%',
  },
  agentBubble: {
    backgroundColor: '#FFF3E0',
    alignSelf: 'flex-start',
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
