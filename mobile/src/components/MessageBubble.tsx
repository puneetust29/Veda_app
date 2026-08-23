import { StyleSheet, Text, View } from 'react-native';

type Props = {
  text: string;
  tone: 'agent' | 'user' | 'error';
};

export default function MessageBubble({ text, tone }: Props) {
  return (
    <View style={[styles.bubble, styles[`${tone}Bubble`]]}>
      <Text style={styles[`${tone}Text`]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 15,
    maxWidth: '88%',
  },
  agentBubble: {
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  userBubble: {
    backgroundColor: '#0F0F0F',
    alignSelf: 'flex-end',
  },
  errorBubble: {
    backgroundColor: '#FFF0EE',
    alignSelf: 'stretch',
    borderLeftWidth: 3,
    borderLeftColor: '#E05A4E',
  },
  agentText: { color: '#0F0F0F', fontSize: 15, lineHeight: 22 },
  userText:  { color: '#FFFFFF', fontSize: 15, lineHeight: 22 },
  errorText: { color: '#C0392B', fontSize: 14, lineHeight: 20 },
});
