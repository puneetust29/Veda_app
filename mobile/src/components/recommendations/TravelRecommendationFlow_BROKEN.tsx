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

type Props = {
  event: any;
  onClose: () => void;
};

export default function TravelRecommendationFlow({ event, onClose }: Props) {
  const { token } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentStep, setCurrentStep] = useState<Step>('trip');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [travelerSelections, setTravelerSelections] = useState({
    Emily: { gb: 2, price: 18 },
    Sophia: { gb: 2, price: 12.75 },
    Oliver: { gb: 0, price: 0 },
  });
  const [chatMessage, setChatMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{id: string; role: 'user' | 'agent'; text: string}>>([]);
  const [completedItems, setCompletedItems] = useState({
    flightBookings: true,
    hotelBookings: true,
    roaming: false,
    travelInsurance: false,
  });
  const [loading, setLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);

  // Auto-scroll down when step changes or chat messages change
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [currentStep, chatMessages]);

  // Fetch roaming recommendation from backend
  useEffect(() => {
    if (currentStep === 'roaming' && event?.id) {
      fetchRoamingRecommendation();
    }
  }, [currentStep]);

  const fetchRoamingRecommendation = async () => {
    if (!token) return;

    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/roaming/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          calendar_event_id: event?.id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Roaming recommendation:', data);
      } else {
        console.error('Roaming recommendation failed:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch roaming recommendation:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendChatMessage = async () => {
    if (!chatMessage.trim() || !token) return;

    // Add user message to chat
    const userMsg = {
      id: String(Date.now()),
      role: 'user' as const,
      text: chatMessage,
    };
    setChatMessages(prev => [...prev, userMsg]);
    setChatMessage('');
    setChatLoading(true);

    try {
      // Send to backend chat endpoint with real auth token
      const response = await fetch('http://localhost:8000/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          calendar_event_id: event?.id,
          message: userMsg.text,
        }),
      });

      if (response.ok) {
        // Parse the streaming response
        const reader = response.body?.getReader();
        let fullResponse = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            fullResponse += chunk;
          }
        }

        // Show agent response
        const agentMsg = {
          id: String(Date.now() + 1),
          role: 'agent' as const,
          text: fullResponse || 'I\'ve noted your feedback and updated the recommendations.',
        };
        setChatMessages(prev => [...prev, agentMsg]);

        // Scroll down after response
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 300);
      } else {
        console.error('Chat request failed:', response.status, response.statusText);
        const errorMsg = {
          id: String(Date.now() + 1),
          role: 'agent' as const,
          text: `Error: ${response.status} - Unable to process your message`,
        };
        setChatMessages(prev => [...prev, errorMsg]);
      }
    } catch (error) {
      console.error('Failed to send chat message:', error);
      const errorMsg = {
        id: String(Date.now() + 1),
        role: 'agent' as const,
        text: 'Sorry, I encountered an error processing your message. Please try again.',
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    const newSet = new Set(expandedSections);
    if (newSet.has(section)) {
      newSet.delete(section);
    } else {
      newSet.add(section);
    }
    setExpandedSections(newSet);
  };

  const handleTravelerSelection = (traveler: string, gb: number, price: number) => {
    setTravelerSelections((prev) => ({
      ...prev,
      [traveler]: { gb, price },
    }));
  };

  const calculateTotal = () => {
    return Object.values(travelerSelections).reduce((sum, sel) => sum + sel.price, 0);
  };

  const handleContinue = () => {
    if (currentStep === 'trip') {
      setCurrentStep('roaming');
    } else if (currentStep === 'roaming') {
      setCurrentStep('insurance');
    } else if (currentStep === 'insurance') {
      setCurrentStep('payment');
    } else if (currentStep === 'payment') {
      setCurrentStep('complete');
    }
  };

  const handleApprove = () => {
    if (currentStep === 'roaming') {
      setExpandedSections(new Set());
      handleContinue();
    } else if (currentStep === 'insurance') {
      handleContinue();
    }
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

      {/* Scrollable Content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Initial Message */}
        <View style={styles.agentMessageWrapper}>
          <View style={styles.agentIcon}>
            <Text style={styles.agentIconText}>V</Text>
          </View>
          <View style={styles.agentBubble}>
            <Text style={styles.agentText}>
              I see you're travelling to {event?.destination || 'Australia'} in August.
            </Text>
            <Text style={[styles.agentText, { marginTop: spacing.md }]}>
              You've halfway there, and I've two recommendations to make you travel ready.
            </Text>
          </View>
        </View>

        {/* Trip Summary Card */}
        <TripSummaryCard
          event={event}
          completedItems={completedItems}
          onToggleItem={(item) =>
            setCompletedItems(prev => ({...prev, [item]: !prev[item as keyof typeof prev]}))
          }
        />

        {/* Roaming Section */}
        {currentStep === 'roaming' || currentStep === 'insurance' || currentStep === 'payment' || currentStep === 'complete' ? (
          <>
            <View style={styles.agentMessageWrapper}>
              <View style={styles.agentIcon}>
                <Text style={styles.agentIconText}>V</Text>
              </View>
              <View style={styles.agentBubble}>
                <Text style={styles.agentText}>
                  Based on your travel history, itinerary and members traveling, here's the best setup for your trip. Let's start with roaming
                </Text>
              </View>
            </View>

            {loading ? (
              <LoadingIndicator />
            ) : (
              <RoamingRecommendationCard
                isExpanded={expandedSections.has('roaming')}
                onToggleExpand={() => toggleSection('roaming')}
              >
                {expandedSections.has('roaming') && (
                  <TravelerCustomization
                    selections={travelerSelections}
                    onSelect={handleTravelerSelection}
                    total={calculateTotal()}
                    onApply={() => toggleSection('roaming')}
                  />
                )}
              </RoamingRecommendationCard>
            )}
          </>
        ) : null}

        {/* Travel Insurance Section */}
        {currentStep === 'insurance' || currentStep === 'payment' || currentStep === 'complete' ? (
          <>
            <View style={styles.agentMessageWrapper}>
              <View style={styles.agentIcon}>
                <Text style={styles.agentIconText}>V</Text>
              </View>
              <View style={styles.agentBubble}>
                <Text style={styles.agentText}>
                  Roaming is in place, let's take a look at your travel insurance.
                </Text>
              </View>
            </View>

            <TravelInsuranceCard />
          </>
        ) : null}

        {/* Payment Summary Section */}
        {currentStep === 'payment' || currentStep === 'complete' ? (
          <>
            <View style={styles.agentMessageWrapper}>
              <View style={styles.agentIcon}>
                <Text style={styles.agentIconText}>V</Text>
              </View>
              <View style={styles.agentBubble}>
                <Text style={styles.agentText}>
                  Everything is ready for your trip. Here's a summary before payment.
                </Text>
              </View>
            </View>

            <PaymentSummaryCard roamingTotal={calculateTotal()} />
          </>
        ) : null}

        {/* Complete Message */}
        {currentStep === 'complete' ? (
          <View style={styles.agentMessageWrapper}>
            <View style={styles.agentIcon}>
              <Text style={styles.agentIconText}>V</Text>
            </View>
            <View style={styles.agentBubble}>
              <Text style={[styles.agentText, { fontWeight: 'bold' }]}>
                Travel insurance confirmed
              </Text>
              <Text style={[styles.agentText, { marginTop: spacing.md }]}>
                All set! Your roaming and travel insurance are ready for your trip.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Action & Chat Section */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.footerSection}>
        {currentStep !== 'complete' && (
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={styles.button}
              onPress={currentStep === 'roaming' || currentStep === 'insurance' ? handleApprove : handleContinue}
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
          </View>
        )}

        {/* Chat Messages Display */}
        {chatMessages.length > 0 && (
          <View style={styles.chatMessagesContainer}>
            {chatMessages.map((msg) => (
              <View key={msg.id} style={msg.role === 'agent' ? styles.agentChatMessage : styles.userChatMessage}>
                {msg.role === 'agent' && (
                  <View style={styles.agentChatIcon}>
                    <Text style={styles.agentChatIconText}>V</Text>
                  </View>
                )}
                <View style={msg.role === 'agent' ? styles.agentChatBubble : styles.userChatBubble}>
                  <Text style={msg.role === 'agent' ? styles.agentChatText : styles.userChatText}>
                    {msg.text}
                  </Text>
                </View>
              </View>
            ))}
            {chatLoading && <LoadingIndicator />}
          </View>
        )}

        {/* Chat Input */}
        <View style={styles.chatInputSection}>
          <TextInput
            style={styles.chatInput}
            placeholder="Ask Veda"
            placeholderTextColor={colors.textSecondary}
            value={chatMessage}
            onChangeText={setChatMessage}
            multiline
            maxHeight={80}
            editable={!chatLoading}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!chatMessage.trim() || chatLoading) && styles.sendButtonDisabled]}
            onPress={handleSendChatMessage}
            disabled={!chatMessage.trim() || chatLoading}
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
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: 24,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
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
  chatMessagesContainer: {
    marginBottom: spacing.lg,
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
    ...typography.small,
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
    ...typography.small,
    color: 'white',
    lineHeight: 18,
  },
});
