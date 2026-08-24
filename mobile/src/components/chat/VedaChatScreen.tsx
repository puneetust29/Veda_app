import { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import ChatHistorySidebar from './ChatHistorySidebar';
import AnimatedWaveBackground from '../common/AnimatedWaveBackground';
import { colors, spacing, typography } from '../../theme';

type ChatMessage = {
  id: string;
  role: 'agent' | 'user';
  text: string;
  showYesNo?: boolean;
};

type Props = {
  onClose: () => void;
};

export default function VedaChatScreen({ onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'agent',
      text: 'What would you like me to go ahead with?',
      showYesNo: true,
    },
  ]);
  const [reply, setReply] = useState('');
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const handleSendReply = () => {
    if (reply.trim()) {
      setMessages([...messages, { id: String(Date.now()), role: 'user', text: reply }]);
      setReply('');
    }
  };

  const handleYesClick = () => {
    setMessages([
      ...messages,
      { id: String(Date.now()), role: 'user', text: 'Yes' },
      { id: String(Date.now() + 1), role: 'agent', text: 'Great! What would you like to do next?' },
    ]);
  };

  const handleNoClick = () => {
    setMessages([
      ...messages,
      { id: String(Date.now()), role: 'user', text: 'No' },
      { id: String(Date.now() + 1), role: 'agent', text: 'I understand. How can I assist you further?' },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <AnimatedWaveBackground />
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => setSidebarVisible(true)} hitSlop={15}>
            <Ionicons name="time" size={32} color="white" />
          </TouchableOpacity>

          <View style={{ flex: 1 }} />
          <Text style={styles.headerLogo}>V</Text>
          <View style={{ flex: 1 }} />

          <TouchableOpacity onPress={onClose} hitSlop={15}>
            <Ionicons name="close" size={32} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg) => (
          <View key={msg.id} style={msg.role === 'agent' ? styles.agentMessageWrapper : styles.userMessageWrapper}>
            {msg.role === 'agent' && (
              <View>
                <View style={styles.agentMessage}>
                  <View style={styles.agentIcon}>
                    <Text style={styles.agentIconText}>V</Text>
                  </View>
                  <View style={styles.agentBubble}>
                    <Text style={styles.agentText}>{msg.text}</Text>
                  </View>
                </View>
                <Text style={styles.disclaimer}>Veda AI may make mistakes. Please review.</Text>
              </View>
            )}
            {msg.role === 'user' && (
              <View style={styles.userMessage}>
                <Text style={styles.userText}>{msg.text}</Text>
              </View>
            )}

            {/* Yes/No buttons */}
            {msg.showYesNo && (
              <View style={styles.responseButtons}>
                <TouchableOpacity style={styles.yesButton} onPress={handleYesClick}>
                  <Text style={styles.yesButtonText}>yes</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Input Field */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inputSection}>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Reply to Veda"
            placeholderTextColor={colors.textMuted}
            value={reply}
            onChangeText={setReply}
            multiline
            maxHeight={100}
          />
          <TouchableOpacity
            style={[styles.sendButton, !reply.trim() && styles.sendButtonDisabled]}
            onPress={handleSendReply}
            disabled={!reply.trim()}
          >
            <Ionicons name="arrow-forward" size={20} color="white" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Sidebar */}
      <ChatHistorySidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        onNewSession={() => {
          setMessages([{ id: '1', role: 'agent', text: 'New session started. What would you like to know?' }]);
          setSidebarVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.brand,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    overflow: 'visible',
    position: 'relative',
    minHeight: 100,
    justifyContent: 'center',
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    zIndex: 10,
  },
  circleIconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLogo: {
    fontSize: 40,
    fontWeight: '700',
    color: 'white',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  agentMessageWrapper: {
    marginBottom: spacing.lg,
  },
  agentMessage: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  agentIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentIconText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
  },
  disclaimer: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginLeft: spacing.xl,
  },
  agentBubble: {
    flex: 1,
    backgroundColor: '#F5DEDE',
    borderRadius: 16,
    padding: spacing.lg,
    marginLeft: spacing.md,
  },
  agentText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  userMessageWrapper: {
    marginBottom: spacing.lg,
    alignItems: 'flex-end',
  },
  userMessage: {
    backgroundColor: colors.brand,
    borderRadius: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    maxWidth: '80%',
  },
  userText: {
    ...typography.body,
    color: 'white',
  },
  responseButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  yesButton: {
    backgroundColor: colors.backgroundAlt,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: spacing.md,
  },
  yesButtonText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  inputSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.textSecondary,
    borderTopOpacity: 0.1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
    borderRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
