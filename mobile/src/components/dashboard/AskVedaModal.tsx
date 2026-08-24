import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography } from '../../theme';

const AnimatedWaveBackground = () => {
  const wave1 = new Animated.Value(0);
  const wave2 = new Animated.Value(0);
  const wave3 = new Animated.Value(0);

  // Create infinite smooth wave animations with different speeds
  Animated.loop(
    Animated.timing(wave1, {
      toValue: 360,
      duration: 8000,
      useNativeDriver: false,
    }),
  ).start();

  Animated.loop(
    Animated.timing(wave2, {
      toValue: 360,
      duration: 10000,
      useNativeDriver: false,
    }),
  ).start();

  Animated.loop(
    Animated.timing(wave3, {
      toValue: 360,
      duration: 12000,
      useNativeDriver: false,
    }),
  ).start();

  return (
    <View style={styles.waveContainer}>
      {/* Wave layer 1 */}
      <Animated.View
        style={[
          styles.waveLayer,
          styles.waveLayer1,
          {
            transform: [
              {
                translateY: wave1.interpolate({
                  inputRange: [0, 360],
                  outputRange: [0, -100],
                }),
              },
            ],
          },
        ]}
      />
      {/* Wave layer 2 */}
      <Animated.View
        style={[
          styles.waveLayer,
          styles.waveLayer2,
          {
            transform: [
              {
                translateY: wave2.interpolate({
                  inputRange: [0, 360],
                  outputRange: [0, -80],
                }),
              },
            ],
          },
        ]}
      />
      {/* Wave layer 3 */}
      <Animated.View
        style={[
          styles.waveLayer,
          styles.waveLayer3,
          {
            transform: [
              {
                translateY: wave3.interpolate({
                  inputRange: [0, 360],
                  outputRange: [0, -60],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onStartChat?: (message: string) => void;
};

export default function AskVedaModal({ visible, onClose, onStartChat }: Props) {
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (message.trim()) {
      onStartChat?.(message);
      setMessage('');
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
        >
          <View style={styles.modalContent}>
            {/* Animated background */}
            <AnimatedWaveBackground />

            {/* Close button */}
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>

            {/* Main content */}
            <View style={styles.contentSection}>
              <Text style={styles.title}>Try asking</Text>
              <Text style={styles.exampleQuestion}>
                "How do I change my permission settings?"
              </Text>
            </View>

            {/* Input field */}
            <View style={styles.inputContainer}>
              <TouchableOpacity style={styles.plusButton}>
                <Ionicons name="add" size={20} color={colors.brand} />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="Ask Veda"
                placeholderTextColor={colors.textSecondary}
                value={message}
                onChangeText={setMessage}
              />
              <TouchableOpacity
                style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]}
                onPress={handleSend}
                disabled={!message.trim()}
              >
                <Ionicons name="arrow-forward" size={20} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.brand,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    minHeight: '60%',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  waveContainer: {
    ...StyleSheet.absoluteFillObject,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  waveLayer: {
    position: 'absolute',
    width: '140%',
    height: 150,
    borderRadius: 999,
  },
  waveLayer1: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    top: '10%',
    left: '-20%',
  },
  waveLayer2: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    top: '30%',
    left: '-15%',
  },
  waveLayer3: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    top: '50%',
    left: '-20%',
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: spacing.md,
    marginRight: -spacing.md,
    marginTop: -spacing.md,
    zIndex: 10,
  },
  contentSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: spacing.xxl,
    zIndex: 5,
  },
  title: {
    color: 'white',
    fontSize: 32,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  exampleQuestion: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 24,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    zIndex: 10,
  },
  plusButton: {
    padding: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
  },
  sendButton: {
    backgroundColor: colors.brandTint,
    borderRadius: 50,
    padding: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
