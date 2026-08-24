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
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
    maxWidth: '90%',
  },
  agentBubble: {
    backgroundColor: '#f1f1f3',
    alignSelf: 'flex-start',
  },
  userBubble: {
    backgroundColor: '#111',
    alignSelf: 'flex-end',
  },
  errorBubble: {
    backgroundColor: '#fdecea',
    alignSelf: 'stretch',
  },
  agentText: { color: '#111', fontSize: 15, lineHeight: 21 },
  userText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  errorText: { color: '#c0392b', fontSize: 15, lineHeight: 21 },
});
