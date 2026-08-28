import { useEffect, useRef } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radii, spacing } from '../../theme';

type Props = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  variant?: 'default' | 'success';
};

// A single hidden TextInput drives entry for all boxes below it, so
// backspace behaves like normal text editing instead of relying on
// per-box onKeyPress — which doesn't reliably fire on Android when the
// box being backspaced into is already empty.
export default function OtpInput({ length = 6, value, onChange, disabled, variant = 'default' }: Props) {
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (!disabled) {
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Blur explicitly rather than relying on `editable` to drop focus — on
    // Android, flipping `editable` false while the input is focused makes
    // the OS jump focus (with its default highlight) to the next focusable
    // view, e.g. the "Resend code" button below. Touch input is blocked via
    // `pointerEvents` instead, so `editable` never has to change here.
    if (disabled) {
      inputRef.current?.blur();
    }
  }, [disabled]);

  const activeIndex = Math.min(value.length, length - 1);

  return (
    <View style={styles.row}>
      {Array.from({ length }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.box,
            value[index] ? styles.boxFilled : null,
            variant === 'success' && value[index]
              ? styles.boxSuccess
              : variant === 'default' && (value[index] || (!disabled && activeIndex === index))
                ? styles.boxFocused
                : null,
          ]}
        >
          <Text style={styles.digit}>{value[index] ?? ''}</Text>
        </View>
      ))}
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        pointerEvents={disabled ? 'none' : 'auto'}
        caretHidden
        contextMenuHidden
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  box: {
    width: 52,
    height: 56,
    borderRadius: radii.sm,
    backgroundColor: colors.fieldFill,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: { backgroundColor: colors.fieldFill },
  boxFocused: { borderColor: colors.brandText, borderWidth: 1 },
  boxSuccess: { borderColor: colors.success, borderWidth: 1 },
  digit: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
});
