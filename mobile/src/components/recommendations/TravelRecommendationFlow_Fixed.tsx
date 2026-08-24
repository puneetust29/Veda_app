import React, { useState, useRef, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import AnimatedWaveBackground from '../common/AnimatedWaveBackground';
import LoadingIndicator from './LoadingIndicator';
import TripSummaryCard from './cards/TripSummaryCard';
import RoamingRecommendationCard from './cards/RoamingRecommendationCard';
import TravelerCustomization from './cards/TravelerCustomization';
import TravelInsuranceCard from './cards/TravelInsuranceCard';
import PaymentSummaryCard from './cards/PaymentSummaryCard';

type Step = 'trip' | 'roaming' | 'insurance' | 'payment' | 'complete';

type ChatMessage = {
  id: string;
  role: 'user' | 'agent';
  text: string;
};

type Props = {
  event: any;
  onClose: () => void;
};

const API_BASE = 'http://localhost:8000';

export default function TravelRecommendationFlow({ event, onClose }: Props) {
  const { token } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);

  // State Management
  const [currentStep, setCurrentStep] = useState<Step>('trip');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [travelerSelections, setTravelerSelections] = useState({
    Emily: { gb: 2, price: 18 },
    Sophia: { gb: 2, price: 12.75 },
    Oliver: { gb: 0, price: 0 },
  });
  const [completedItems, setCompletedItems] = useState({
    flightBookings: true,
    hotelBookings: true,
    roaming: false,
    travelInsurance: false,
  });

  // Chat & Loading States
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [roamingLoading, setRoamingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debug logging
  const log = (tag: string, message: string, data?: any) => {
    console.log(`[${tag}] ${message}`, data || '');
  };

  // Auto-scroll when content changes
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
    return () => clearTimeout(timer);
  }, [currentStep, chatMessages]);

  // Handle Step Navigation
  const handleContinue = () => {
    log('NAVIGATION', `Continuing from step: ${currentStep}`);
    if (currentStep === 'trip') {
      setCurrentStep('roaming');
      setRoamingLoading(true); // Start loading roaming data
    } else if (currentStep === 'roaming') {
      setCurrentStep('insurance');
    } else if (currentStep === 'insurance') {
      setCurrentStep('payment');
    } else if (currentStep === 'payment') {
      setCurrentStep('complete');
    }
  };

  const handleApprove = () => {
    log('APPROVE', `Approved from step: ${currentStep}`);
    expandedSections.delete('roaming');
    setExpandedSections(new Set(expandedSections));
    handleContinue();
  };

  // Handle Checkbox Clicks
  const handleToggleItem = (item: string) => {
    log('CHECKBOX', `Toggled: ${item}`);
    setCompletedItems(prev => ({
      ...prev,
      [item]: !prev[item as keyof typeof prev],
    }));
  };

  // Handle Chat Message Send
  const handleSendChat = async () => {
    const message = chatInput.trim();

    if (!message) {
      log('CHAT', 'Empty message, skipping');
      return;
    }

    if (!token) {
      log('CHAT', 'ERROR: No auth token');
      setError('Not authenticated. Please log in again.');
      return;
    }

    if (!event?.id) {
      log('CHAT', 'ERROR: No event ID');
      setError('No event context. Please go back and try again.');
      return;
    }

    log('CHAT', 'Sending message', { message, eventId: event.id });

    // Add user message immediately
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      text: message,
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    setError(null);

    try {
      log('CHAT', 'Calling backend', { url: `${API_BASE}/chat/stream` });

      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          calendar_event_id: event.id,
          message: userMsg.text,
        }),
      });

      log('CHAT', `Response status: ${response.status}`);

      if (!response.ok) {
        throw new Error(`Backend error: ${response.status} ${response.statusText}`);
      }

      // Simple response for now (would be streaming in production)
      const agentMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'agent',
        text: `Thanks for your input! I've updated the recommendations based on your feedback: "${message}"`,
      };

      setChatMessages(prev => [...prev, agentMsg]);
      log('CHAT', 'Received response', { text: agentMsg.text });

    } catch (err) {
      log('CHAT', 'ERROR', err);
      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'agent',
        text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
      };
      setChatMessages(prev => [...prev, errorMsg]);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setChatLoading(false);
    }
  };

  // Handle Payment Options
  const handleViewPaymentOptions = () => {
    log('PAYMENT', 'View other options clicked');
    Alert.alert('Payment Options', 'Credit Card, Debit Card, Apple Pay, Google Pay coming soon!');
  };

  const calculateTotal = () => {
    return Object.values(travelerSelections).reduce((sum, sel) => sum + sel.price, 0);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <AnimatedWaveBackground />
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={onClose} hitSlop={15}>
            <Ionicons name="close" size={32} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerLogo}>V</Text>
          <View style={{ width: 32 }} />
        </View>
      </View>

      {/* Error Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color="#c41c3b" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Main Scrollable Content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Trip Summary */}
        {currentStep === 'trip' && (
          <>
            <View style={styles.agentMessageWrapper}>
              <View style={styles.agentIcon}>
                <Text style={styles.agentIconText}>V</Text>
              </View>
              <View style={styles.agentBubble}>
                <Text style={styles.agentText}>
                  I see you're travelling to {event?.destination || 'Australia'} in August. You've halfway there, and I've two recommendations to make you travel ready.
                </Text>
              </View>
            </View>

            <TripSummaryCard
              event={event}
              completedItems={completedItems}
              onToggleItem={handleToggleItem}
            />
          </>
        )}

        {/* Roaming Section */}
        {(currentStep === 'roaming' || currentStep === 'insurance' || currentStep === 'payment' || currentStep === 'complete') && (
          <>
            <View style={styles.agentMessageWrapper}>
              <View style={styles.agentIcon}>
                <Text style={styles.agentIconText}>V</Text>
              </View>
              <View style={styles.agentBubble}>
                <Text style={styles.agentText}>
                  Based on your travel history and members traveling, here's the best setup. Let's start with roaming.
                </Text>
              </View>
            </View>

            {roamingLoading ? (
              <LoadingIndicator />
            ) : (
              <RoamingRecommendationCard
                isExpanded={expandedSections.has('roaming')}
                onToggleExpand={() => {
                  const newSet = new Set(expandedSections);
                  if (newSet.has('roaming')) {
                    newSet.delete('roaming');
                  } else {
                    newSet.add('roaming');
                  }
                  setExpandedSections(newSet);
                }}
              >
                {expandedSections.has('roaming') && (
                  <TravelerCustomization
                    selections={travelerSelections}
                    onSelect={(traveler, gb, price) => {
                      log('TRAVELER', `${traveler} selected: ${gb}GB - £${price}`);
                      setTravelerSelections(prev => ({
                        ...prev,
                        [traveler]: { gb, price },
                      }));
                    }}
                    total={calculateTotal()}
                    onApply={() => {
                      log('ROAMING', 'Applied traveler customization');
                      expandedSections.delete('roaming');
                      setExpandedSections(new Set(expandedSections));
                    }}
                  />
                )}
              </RoamingRecommendationCard>
            )}
          </>
        )}

        {/* Insurance Section */}
        {(currentStep === 'insurance' || currentStep === 'payment' || currentStep === 'complete') && (
          <>
            <View style={styles.agentMessageWrapper}>
              <View style={styles.agentIcon}>
                <Text style={styles.agentIconText}>V</Text>
              </View>
              <View style={styles.agentBubble}>
                <Text style={styles.agentText}>Roaming is in place. Let's look at your travel insurance.</Text>
              </View>
            </View>

            <TravelInsuranceCard />
          </>
        )}

        {/* Payment Section */}
        {(currentStep === 'payment' || currentStep === 'complete') && (
          <>
            <View style={styles.agentMessageWrapper}>
              <View style={styles.agentIcon}>
                <Text style={styles.agentIconText}>V</Text>
              </View>
              <View style={styles.agentBubble}>
                <Text style={styles.agentText}>Everything's ready. Here's your summary before payment.</Text>
              </View>
            </View>

            <PaymentSummaryCard roamingTotal={calculateTotal()} />
          </>
        )}

        {/* Complete Message */}
        {currentStep === 'complete' && (
          <View style={styles.agentMessageWrapper}>
            <View style={styles.agentIcon}>
              <Text style={styles.agentIconText}>V</Text>
            </View>
            <View style={styles.agentBubble}>
              <Text style={[styles.agentText, { fontWeight: 'bold' }]}>Travel confirmed!</Text>
              <Text style={[styles.agentText, { marginTop: spacing.md }]}>
                Your roaming and insurance are ready for your trip.
              </Text>
            </View>
          </View>
        )}

        {/* Chat Messages */}
        {chatMessages.length > 0 && (
          <View style={styles.chatMessagesContainer}>
            {chatMessages.map((msg) => (
              <View
                key={msg.id}
                style={msg.role === 'agent' ? styles.agentChatMessage : styles.userChatMessage}
              >
                {msg.role === 'agent' && (
                  <View style={styles.agentChatIcon}>
                    <Text style={styles.agentChatIconText}>V</Text>
                  </View>
                )}
                <View
                  style={msg.role === 'agent' ? styles.agentChatBubble : styles.userChatBubble}
                >
                  <Text
                    style={msg.role === 'agent' ? styles.agentChatText : styles.userChatText}
                  >
                    {msg.text}
                  </Text>
                </View>
              </View>
            ))}
            {chatLoading && <LoadingIndicator />}
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Footer with Actions & Chat */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.footerSection}
      >
        {/* Action Button */}
        {currentStep !== 'complete' && (
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                if (currentStep === 'roaming' || currentStep === 'insurance') {
                  handleApprove();
                } else {
                  handleContinue();
                }
              }}
            >
              <Text style={styles.buttonText}>
                {currentStep === 'roaming'
                  ? 'Approve roaming'
                  : currentStep === 'insurance'
                  ? 'Continue'
                  : currentStep === 'payment'
                  ? 'Pay with Visa card'
                  : 'Continue'}
              </Text>
            </TouchableOpacity>

            {currentStep === 'payment' && (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleViewPaymentOptions}
              >
                <Text style={styles.secondaryButtonText}>View other options</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Chat Input */}
        <View style={styles.chatInputSection}>
          <TextInput
            style={styles.chatInput}
            placeholder="Reply to Veda"
            placeholderTextColor={colors.textMuted}
            value={chatInput}
            onChangeText={setChatInput}
            multiline
            maxHeight={80}
            editable={!chatLoading}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!chatInput.trim() || chatLoading) && styles.sendButtonDisabled]}
            onPress={handleSendChat}
            disabled={!chatInput.trim() || chatLoading}
          >
            {chatLoading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="arrow-forward" size={20} color="white" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    zIndex: 10,
  },
  headerLogo: {
    fontSize: 40,
    fontWeight: '700',
    color: 'white',
  },
  errorBanner: {
    backgroundColor: '#ffe0e0',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  errorText: {
    flex: 1,
    color: '#c41c3b',
    fontSize: 14,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  agentMessageWrapper: {
    marginBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
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
  agentBubble: {
    flex: 1,
    backgroundColor: '#F5DEDE',
    borderRadius: 16,
    padding: spacing.lg,
  },
  agentText: {
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  chatMessagesContainer: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.textSecondary,
    borderTopOpacity: 0.1,
    paddingTop: spacing.lg,
  },
  agentChatMessage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  userChatMessage: {
    alignItems: 'flex-end',
    marginBottom: spacing.md,
  },
  agentChatIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentChatIconText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  agentChatBubble: {
    flex: 1,
    backgroundColor: '#F5DEDE',
    borderRadius: 12,
    padding: spacing.md,
  },
  agentChatText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  userChatBubble: {
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '80%',
  },
  userChatText: {
    fontSize: 14,
    color: 'white',
    lineHeight: 18,
  },
  bottomPadding: {
    height: spacing.xxl,
  },
  footerSection: {
    borderTopWidth: 1,
    borderTopColor: colors.textSecondary,
    borderTopOpacity: 0.1,
  },
  actionContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: 24,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.brand,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: colors.brand,
    fontSize: 16,
    fontWeight: '600',
  },
  chatInputSection: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
    borderRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    maxHeight: 80,
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
