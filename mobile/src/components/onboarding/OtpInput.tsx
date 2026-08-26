import { useRef } from 'react';
import { Keyboard, StyleSheet, TextInput, View } from 'react-native';

import { colors, radii, spacing } from '../../theme';

type Props = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

// Six-box OTP entry: typing a digit auto-advances focus to the next box,
// backspace on an empty box moves focus back — matches the auto-advancing
// digit boxes on the prototype's "Verify it's you" screen.
export default function OtpInput({ length = 6, value, onChange, disabled }: Props) {
  const inputs = useRef<Array<TextInput | null>>([]);

  const setDigit = (index: number, digit: string) => {
    const digits = value.padEnd(length, ' ').split('');
    digits[index] = digit;
    const next = digits.join('').replace(/ +$/, '');
    onChange(next);

    if (digit && index < length - 1) {
      inputs.current[index + 1]?.focus();
    } else if (digit && next.length === length) {
      inputs.current[index]?.blur();
      Keyboard.dismiss();
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !value[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.row}>
      {Array.from({ length }).map((_, index) => (
        <TextInput
          key={index}
          ref={(ref) => {
            inputs.current[index] = ref;
          }}
          style={[styles.box, value[index] ? styles.boxFilled : null]}
          value={value[index] ?? ''}
          onChangeText={(digit) => setDigit(index, digit.slice(-1))}
          onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
          keyboardType="number-pad"
          maxLength={1}
          editable={!disabled}
          textAlign="center"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  box: {
    width: 44,
    height: 52,
    borderRadius: radii.sm,
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  boxFilled: { backgroundColor: colors.surface },
});
