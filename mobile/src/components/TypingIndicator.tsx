import { ActivityIndicator, StyleSheet, View } from 'react-native';

export default function TypingIndicator() {
  return (
    <View style={styles.bubble}>
      <ActivityIndicator size="small" color="#ABABAB" />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignSelf: 'center',
    backgroundColor: '#F2F2F0',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
});
