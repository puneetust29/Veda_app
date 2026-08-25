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
import { api } from '../../lib/api';
import AnimatedWaveBackground from '../common/AnimatedWaveBackground';
import LoadingIndicator from './LoadingIndicator';
import TripSummaryCard from './cards/TripSummaryCard';
import RoamingRecommendationCard from './cards/RoamingRecommendationCard';
import TravelerCustomization from './cards/TravelerCustomization';
import TravelInsuranceCard from './cards/TravelInsuranceCard';
import PaymentSummaryCard from './cards/PaymentSummaryCard';
import ConfirmationChip from './cards/ConfirmationChip';
import AIDisclaimerChip from './cards/AIDisclaimerChip';

type Step = 'trip' | 'hotel' | 'roaming' | 'insurance' | 'payment' | 'complete';

type ChatMessage = {
  id: string;
  role: 'user' | 'agent';
  text: string;
  completed?: boolean;
};

type Props = {
  event: any;
  onClose: () => void;
};

const API_BASE = 'http://localhost:8000';

export default function TravelRecommendationFlow({ event, onClose }: Props) {
  const { token } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  const hotelStreamControllerRef = useRef<AbortController | null>(null);
  const roamingStreamControllerRef = useRef<AbortController | null>(null);

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
    hotelBookings: !!hotelData, // Only true if hotel data exists from agent
    roaming: false,
    travelInsurance: false,
  });
  const [confirmedItems, setConfirmedItems] = useState<Set<string>>(new Set());

  // Hotel state - pull from event or call agent
  const [hotelData, setHotelData] = useState<any>(event?.hotel_booking || null);
  const [hotelLoading, setHotelLoading] = useState(!event?.hotel_booking);
  const [hotelChecked, setHotelChecked] = useState(!!event?.hotel_booking);

  const [roamingRecommendation, setRoamingRecommendation] = useState<any>(null);
  const [insuranceData, setInsuranceData] = useState<any>(null);

  // Chat & Loading States
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [roamingLoading, setRoamingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);

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
  }, [currentStep, chatMessages, confirmedItems]);

  // Cleanup streams on unmount
  useEffect(() => {
    return () => {
      hotelStreamControllerRef.current?.abort();
      roamingStreamControllerRef.current?.abort();
    };
  }, []);

  // Update hotel booking status based on hotel data from agent
  useEffect(() => {
    setCompletedItems(prev => ({
      ...prev,
      hotelBookings: !!hotelData,
    }));
  }, [hotelData]);

  // Hotel suggestion message - from hotelResult
  const [hotelSuggestionMsg, setHotelSuggestionMsg] = useState<string>('');

  // Check hotel booking status from backend with streaming messages
  useEffect(() => {
    // Run stream if: first visit (!hotelChecked) OR revisiting with no active stream (!hotelLoading)
    if (currentStep === 'hotel' && (!hotelChecked || !hotelLoading)) {
      // Only clear messages on revisit to avoid blank screen on first visit
      if (hotelChecked && !hotelLoading) {
        setChatMessages([]);
      }
      setRoamingRecommendation(null); // Clear roaming data when entering hotel
      setError(null); // Clear any errors
      setHotelLoading(true);

      // Stream hotel agent messages
      // Abort any previous hotel stream
      hotelStreamControllerRef.current?.abort();

      const controller = new AbortController();
      hotelStreamControllerRef.current = controller;
      let hotelResult: any = null;

      api.streamRoamingConversation({
        calendarEventId: event.id,
        signal: controller.signal,
        agentType: 'hotel',
        onEvent: (event_) => {
          // Display all streaming messages in chat - handle both 'text' and 'status' event types
          if ((event_.type === 'text' && event_.data.role === 'agent') || event_.type === 'status') {
            const messageText = event_.type === 'text' ? event_.data.text : event_.data.text;
            const msg: ChatMessage = {
              id: String(Date.now() + Math.random()),
              role: 'agent',
              text: messageText,
            };
            setChatMessages(prev => [...prev, msg]);
            log('HOTEL_MSG', 'Agent message', messageText);
          }
          // Collect hotel result with correct field names
          if (event_.type === 'hotel_result') {
            hotelResult = (event_ as any).data;
            log('HOTEL_RESULT', 'Got hotel result', hotelResult);

            // Use the hotel.suggestion (correct one from API)
            if (hotelResult?.hotel && hotelResult.hotel.suggestion) {
              setHotelSuggestionMsg(hotelResult.hotel.suggestion);
            }
          }
        },
        onError: (err) => {
          log('HOTEL', 'Stream error', err);
          setHotelLoading(false);
        },
        onClose: () => {
          // Mark all messages as completed when stream finishes
          setChatMessages(prev => prev.map(msg => ({ ...msg, completed: true })));

          // Check if hotel was found using correct field name from HotelDetectionResult
          if (hotelResult?.hotel && hotelResult.hotel.found) {
            setHotelData(hotelResult.hotel);
          }
          setHotelLoading(false);
          setHotelChecked(true);
          log('HOTEL', 'Stream closed', { hotelData: hotelResult?.hotel });
        },
      }).catch(err => {
        log('HOTEL', 'Error', err);
        setHotelLoading(false);
        setHotelChecked(true);
      });

      return () => {
        // Abort hotel stream when leaving hotel step
        if (currentStep !== 'hotel') {
          hotelStreamControllerRef.current?.abort();
        }
      };
    }
  }, [currentStep, hotelChecked]);

  // Handle Step Navigation
  const handleContinue = () => {
    log('NAVIGATION', `Continuing from step: ${currentStep}`);
    if (currentStep === 'trip') {
      setChatMessages([]); // Clear before entering hotel
      setCurrentStep('hotel');
    } else if (currentStep === 'hotel') {
      setChatMessages([]); // Clear hotel messages before moving to roaming

      // Abort any previous roaming stream
      roamingStreamControllerRef.current?.abort();

      setCurrentStep('roaming');
      setRoamingLoading(true);
      setError(null);

      // Stream roaming recommendation with LLM messages
      const controller = new AbortController();
      roamingStreamControllerRef.current = controller;
      let roamingResult: any = null;

      api.streamRoamingConversation({
        calendarEventId: event.id,
        signal: controller.signal,
        agentType: 'roaming',
        onEvent: (event_) => {
          // Display all streaming messages in chat - handle both 'text' and 'status' event types
          if ((event_.type === 'text' && event_.data.role === 'agent') || event_.type === 'status') {
            const messageText = event_.type === 'text' ? event_.data.text : event_.data.text;
            const msg: ChatMessage = {
              id: String(Date.now() + Math.random()),
              role: 'agent',
              text: messageText,
            };
            setChatMessages(prev => [...prev, msg]);
            log('ROAMING_MSG', 'Agent message', messageText);
          }
          // Collect recommendation data - backend sends 'card' not 'candidate_plan'
          if (event_.type === 'recommendation_ready') {
            roamingResult = (event_ as any).data;
            log('ROAMING_RESULT', 'Got recommendation', roamingResult);

            // Display multiple streaming messages for recommendation
            if (roamingResult?.card && roamingResult.card.plan) {
              const plan = roamingResult.card.plan;

              // Add multiple messages to simulate streaming
              const messages: ChatMessage[] = [
                {
                  id: String(Date.now() + Math.random()),
                  role: 'agent',
                  text: `Found a great match: ${plan.plan_name}`,
                  completed: true,
                },
                {
                  id: String(Date.now() + Math.random()),
                  role: 'agent',
                  text: `${plan.data_gb}GB data, ${plan.duration_days} days - €${plan.price}`,
                  completed: true,
                },
                {
                  id: String(Date.now() + Math.random()),
                  role: 'agent',
                  text: `Perfect for your ${plan.duration_days}-day trip to ${plan.country_name}`,
                  completed: true,
                },
              ];

              setChatMessages(prev => [...prev, ...messages]);
            }
          }
        },
        onError: (err) => {
          log('ROAMING', 'Stream error', err);
          setRoamingLoading(false);
        },
        onClose: () => {
          // Mark all messages as completed when stream finishes
          setChatMessages(prev => prev.map(msg => ({ ...msg, completed: true })));

          // Backend sends 'card' with the plan, transform to match UI expectations
          if (roamingResult?.card && roamingResult.card.plan) {
            setRoamingRecommendation({
              candidate_plan: roamingResult.card.plan,
              reasoning: roamingResult.card.reasoning,
              judge_feedback: roamingResult.card.judge_feedback,
            });
          } else if (chatMessages.length === 0) {
            setError('No suitable roaming plans available for this trip. Please try different dates.');
          }
          setRoamingLoading(false);
          log('ROAMING', 'Stream closed');
        },
      }).catch(err => {
        log('ROAMING', 'Error', err);
        const errorMsg = err instanceof Error ? err.message : 'Failed to get recommendation';
        if (errorMsg.includes('422')) {
          setError('No suitable roaming plans available for this trip. Please try different dates.');
        } else {
          setError(errorMsg);
        }
        setRoamingLoading(false);
      });
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
    if (currentStep === 'roaming') {
      const newConfirmed = new Set(confirmedItems);
      newConfirmed.add('roaming');
      setConfirmedItems(newConfirmed);
    } else if (currentStep === 'insurance') {
      const newConfirmed = new Set(confirmedItems);
      newConfirmed.add('insurance');
      setConfirmedItems(newConfirmed);
    }
    expandedSections.delete(currentStep);
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

    if (!message || chatLoading) {
      return;
    }

    log('CHAT', 'Sending message to backend', { message, eventId: event?.id });

    // Add user message immediately
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      text: message,
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      // Use the backend streaming chat endpoint
      const controller = new AbortController();

      let agentText = '';

      await api.streamRoamingConversation({
        calendarEventId: event.id,
        signal: controller.signal,
        message: message,
        priorPlan: roamingRecommendation?.candidate_plan,
        priorReasoning: roamingRecommendation?.reasoning,
        priorJudgeFeedback: roamingRecommendation?.judge_feedback,
        onEvent: (event_) => {
          // Handle streaming events from backend
          if (event_.type === 'text' && event_.data.role === 'agent') {
            agentText += event_.data.text;
          }
        },
        onError: (err) => {
          log('CHAT', 'Stream error', err);
          throw err;
        },
        onClose: () => {
          log('CHAT', 'Stream closed');
        },
      });

      // Add agent response from backend
      if (agentText.trim()) {
        const agentMsg: ChatMessage = {
          id: String(Date.now() + 1),
          role: 'agent',
          text: agentText,
        };
        setChatMessages(prev => [...prev, agentMsg]);
        log('CHAT', 'Backend response received', { text: agentText });
      }

    } catch (err) {
      log('CHAT', 'ERROR', err);
      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'agent',
        text: 'Sorry, I encountered an error processing your message. Please try again.',
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  // Handle Payment Options
  const handleViewPaymentOptions = () => {
    log('PAYMENT', 'View other options clicked');
    setShowPaymentOptions(!showPaymentOptions);
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
        {/* Trip Summary - Always visible */}
        {(
          <>
            {currentStep === 'trip' && (
              <View style={styles.agentMessageWrapper}>
                <View style={styles.agentIcon}>
                  <Text style={styles.agentIconText}>V</Text>
                </View>
                <View style={styles.agentBubble}>
                  <Text style={styles.agentText}>
                    I see you're travelling to {event?.destination || 'Australia'} in August.{'\n'}
                    You've halfway there, and I've two recommendations to make you travel ready.
                  </Text>
                </View>
              </View>
            )}

            <TripSummaryCard
              event={event}
              completedItems={completedItems}
              onToggleItem={handleToggleItem}
              onContinue={handleContinue}
            />
          </>
        )}

        {/* Hotel Section */}
        {(currentStep === 'hotel' || currentStep === 'roaming' || currentStep === 'insurance' || currentStep === 'payment' || currentStep === 'complete') && (
          <>
            {hotelLoading && currentStep === 'hotel' && chatMessages.length === 0 && !hotelData && (
              <LoadingIndicator initialMessage="Checking hotel booking…" />
            )}

            {!hotelLoading && hotelData && (
              <View style={styles.hotelCard}>
                <View style={styles.hotelHeader}>
                  <Ionicons name="home" size={24} color={colors.brand} />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={styles.hotelName}>{hotelData.hotel_name || 'Hotel Booking'}</Text>
                    <Text style={styles.hotelLocation}>{hotelData.location || event?.destination}</Text>
                  </View>
                </View>

                {hotelData.confidence && (
                  <View style={styles.hotelRating}>
                    <Ionicons name="star" size={16} color="#FFB800" />
                    <Text style={styles.hotelRatingText}>{(hotelData.confidence * 100).toFixed(0)}% match</Text>
                  </View>
                )}

                <View style={styles.hotelDetails}>
                  {hotelData.check_in && (
                    <View style={styles.hotelDetailRow}>
                      <Text style={styles.hotelDetailLabel}>Check-in</Text>
                      <Text style={styles.hotelDetailValue}>{hotelData.check_in}</Text>
                    </View>
                  )}
                  {hotelData.check_out && (
                    <View style={styles.hotelDetailRow}>
                      <Text style={styles.hotelDetailLabel}>Check-out</Text>
                      <Text style={styles.hotelDetailValue}>{hotelData.check_out}</Text>
                    </View>
                  )}
                </View>

                {currentStep === 'hotel' && (
                  <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
                    <Text style={styles.continueButtonText}>Continue to Roaming</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {!hotelData && currentStep === 'hotel' && (
              <>
                {hotelLoading && chatMessages.length === 0 && (
                  <LoadingIndicator initialMessage="Checking hotel bookings…" />
                )}

                {/* Chat Messages - display hotel streaming messages only (filter out roaming messages) */}
                {chatMessages.filter(msg => !msg.text.includes('roaming') && !msg.text.includes('Comparing') && !msg.text.includes('plan')).length > 0 && (
                  <View style={styles.chatMessagesContainer}>
                    {chatMessages.filter(msg => !msg.text.includes('roaming') && !msg.text.includes('Comparing') && !msg.text.includes('plan')).map((msg) => (
                      <View
                        key={msg.id}
                        style={msg.role === 'agent' ? styles.agentChatMessage : styles.userChatMessage}
                      >
                        {msg.role === 'agent' && (
                          <View style={styles.statusIcon}>
                            {msg.completed ? (
                              <Text style={styles.completedIcon}>✓</Text>
                            ) : (
                              <ActivityIndicator size="small" color={colors.brand} />
                            )}
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

                {/* Hotel suggestion message card - from hotel_result.hotel.suggestion */}
                {!hotelLoading && hotelSuggestionMsg && (
                  <>
                    <View style={styles.hotelSuggestionCard}>
                      <View style={styles.hotelSuggestionHeader}>
                        <Ionicons name="home" size={24} color="#8B6F47" />
                        <Text style={styles.hotelSuggestionTitle}>Hotel Booking</Text>
                      </View>
                      <View style={styles.hotelSuggestionContent}>
                        <Text style={styles.hotelSuggestionText}>
                          {hotelSuggestionMsg}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.hotelActionButtons}>
                      <TouchableOpacity
                        style={styles.bookHotelButton}
                        onPress={() => {
                          log('HOTEL', 'Book hotel clicked');
                          // TODO: Open hotel booking UI
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.bookHotelButtonText}>Book Hotel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.skipButton}
                        onPress={() => {
                          log('SKIP_BUTTON', 'Continue to Roaming clicked');
                          handleContinue();
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.skipButtonText}>Continue to Roaming</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* Roaming Section */}
        {(currentStep === 'roaming' || currentStep === 'insurance' || currentStep === 'payment' || currentStep === 'complete') && (
          <>
            {!confirmedItems.has('roaming') && (
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

                {/* Chat Messages - display after intro message */}
                {chatMessages.length > 0 && (
                  <View style={styles.chatMessagesContainer}>
                    {chatMessages.map((msg) => (
                      <View
                        key={msg.id}
                        style={msg.role === 'agent' ? styles.agentChatMessage : styles.userChatMessage}
                      >
                        {msg.role === 'agent' && (
                          <View style={styles.statusIcon}>
                            {msg.completed ? (
                              <Text style={styles.completedIcon}>✓</Text>
                            ) : (
                              <ActivityIndicator size="small" color={colors.brand} />
                            )}
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

                {roamingLoading && chatMessages.length === 0 && <LoadingIndicator initialMessage="Getting recommendations…" />}

                {!roamingLoading && !roamingRecommendation && error && (
                  <View style={styles.errorMessage}>
                    <Ionicons name="alert-circle" size={20} color="#C41C3B" />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={() => {
                      setCurrentStep('trip');
                      setTimeout(() => handleContinue(), 100);
                    }}>
                      <Text style={styles.retryButtonText}>Try Again</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {!roamingLoading && roamingRecommendation?.candidate_plan && (
                  <>
                    <View style={styles.roamingCard}>
                      {/* Header with Vodafone branding */}
                      <View style={styles.roamingHeader}>
                        <View style={styles.vodafoneLogo}>
                          <Text style={styles.vodafoneLogoText}>🔴</Text>
                        </View>
                        <View style={styles.roamingHeaderText}>
                          <Text style={styles.vodafoneName}>Vodafone</Text>
                          <Text style={styles.roamingPlanName}>{roamingRecommendation.candidate_plan.plan_name}</Text>
                        </View>
                      </View>

                      {/* Why this one - existing section */}
                      <View style={styles.roamingSection}>
                        <Text style={styles.roamingSectionTitle}>Why this one</Text>
                        <View style={styles.roamingChecklistItem}>
                          <Ionicons name="checkmark" size={20} color={colors.brand} />
                          <Text style={styles.roamingChecklistText}>Matches your typical data usage.</Text>
                        </View>
                        <View style={styles.roamingChecklistItem}>
                          <Ionicons name="checkmark" size={20} color={colors.brand} />
                          <Text style={styles.roamingChecklistText}>{roamingRecommendation.candidate_plan.duration_days} days, exactly matches your trip.</Text>
                        </View>
                        <View style={styles.roamingChecklistItem}>
                          <Ionicons name="checkmark" size={20} color={colors.brand} />
                          <Text style={styles.roamingChecklistText}>Works for all 3 travellers.</Text>
                        </View>
                      </View>

                      {/* Judge Approved - new section from backend */}
                      {roamingRecommendation.judge_feedback && (
                        <View style={styles.roamingSection}>
                          <View style={styles.judgeApprovedHeader}>
                            <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
                            <Text style={styles.roamingSectionTitle}>Judge Approved</Text>
                          </View>
                          <Text style={styles.judgeFeedbackText}>
                            {roamingRecommendation.judge_feedback}
                          </Text>
                        </View>
                      )}

                      {/* Why this plan - new section from backend reasoning */}
                      {roamingRecommendation.reasoning && (
                        <View style={styles.roamingSection}>
                          <Text style={styles.roamingSectionTitle}>Why this plan</Text>
                          <Text style={styles.reasoningText}>
                            {roamingRecommendation.reasoning}
                          </Text>
                        </View>
                      )}

                      {/* Family setup - from travelerSelections state */}
                      <View style={styles.roamingSection}>
                        <Text style={styles.roamingSectionTitle}>Family setup</Text>

                        {Object.entries(travelerSelections).map(([traveler, selection]) => (
                          <View key={traveler} style={styles.travelerRow}>
                            <View style={styles.travelerAvatar}>
                              <Text style={styles.travelerInitial}>
                                {traveler.charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <View style={styles.travelerInfo}>
                              <Text style={styles.travelerName}>{traveler}</Text>
                              <Text style={styles.travelerDetails}>
                                {selection.gb > 0
                                  ? `${selection.gb} GB${selection.gb > 1 ? ` | ${selection.gb * 50} mins and ${selection.gb * 50} texts` : ''}`
                                  : 'No plan needed'}
                              </Text>
                            </View>
                            {selection.price > 0 && (
                              <Text style={styles.travelerPrice}>£{selection.price}</Text>
                            )}
                          </View>
                        ))}
                      </View>

                      {/* Total */}
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Total</Text>
                        <Text style={styles.totalPrice}>£{roamingRecommendation.candidate_plan.price}</Text>
                      </View>

                      {/* Action Buttons - Modify & Approve side by side */}
                      <View style={styles.actionButtonRow}>
                        <TouchableOpacity
                          style={styles.modifyButton}
                          onPress={() => {
                            const newSet = new Set(expandedSections);
                            newSet.add('roaming');
                            setExpandedSections(newSet);
                          }}
                        >
                          <Text style={styles.modifyButtonText}>Modify</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.approveButton}
                          onPress={handleApprove}
                        >
                          <Text style={styles.approveButtonText}>Approve roaming</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <AIDisclaimerChip />

                    {/* Show traveler customization when Modify is clicked */}
                    {expandedSections.has('roaming') && (
                      <TravelerCustomization
                        selections={travelerSelections}
                        onSelect={(traveler, gb, price) => {
                          setTravelerSelections({
                            ...travelerSelections,
                            [traveler]: { gb, price },
                          });
                        }}
                        total={calculateTotal()}
                        onApply={() => {
                          // Close expanded section and approve
                          expandedSections.delete('roaming');
                          setExpandedSections(new Set(expandedSections));
                          handleApprove();
                        }}
                      />
                    )}
                  </>
                )}
              </>
            )}
            {confirmedItems.has('roaming') && (
              <ConfirmationChip label="Roaming plan" />
            )}
          </>
        )}

        {/* Insurance Section */}
        {(currentStep === 'insurance' || currentStep === 'payment' || currentStep === 'complete') && (
          <>
            {!confirmedItems.has('insurance') && (
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
                <AIDisclaimerChip />
              </>
            )}
            {confirmedItems.has('insurance') && (
              <ConfirmationChip label="Travel insurance" />
            )}
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


        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Footer with Actions & Chat */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.footerSection}
      >
        {/* Action Button - Only for insurance, payment steps (not hotel/roaming, they have inline buttons) */}
        {currentStep !== 'complete' && currentStep !== 'trip' && currentStep !== 'hotel' && currentStep !== 'roaming' && !roamingLoading && (
          <View style={styles.actionContainer}>
            {/* Payment Options Dropdown */}
            {currentStep === 'payment' && showPaymentOptions && (
              <View style={styles.paymentOptionsContainer}>
                <Text style={styles.paymentOptionsTitle}>Payment Methods</Text>
                {['Credit Card', 'Debit Card', 'Apple Pay', 'Google Pay', 'PayPal'].map((method) => (
                  <TouchableOpacity key={method} style={styles.paymentOption}>
                    <Ionicons name="card" size={20} color={colors.brand} />
                    <Text style={styles.paymentOptionText}>{method}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.buttonRow}>
              {currentStep !== 'roaming' && (
                <TouchableOpacity
                  style={styles.button}
                  onPress={() => {
                    if (currentStep === 'roaming') {
                      handleApprove();
                    } else if (currentStep === 'insurance') {
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
              )}
              {currentStep === 'payment' && (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleViewPaymentOptions}
                >
                  <Text style={styles.secondaryButtonText}>View other options</Text>
                </TouchableOpacity>
              )}
            </View>
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
            onSubmitEditing={handleSendChat}
            multiline
            maxHeight={50}
            editable={!chatLoading}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendButton, (!chatInput.trim() || chatLoading) && styles.sendButtonDisabled]}
            onPress={handleSendChat}
            disabled={!chatInput.trim() || chatLoading}
          >
            {chatLoading ? (
              <ActivityIndicator size="small" color="#999" />
            ) : (
              <Ionicons name="send" size={18} color="#999" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.textSecondary,
  },
  providerLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  headerText: {
    flex: 1,
  },
  provider: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  planName: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  checklistText: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
  },
  detailText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 2,
    borderTopColor: colors.textSecondary,
  },
  priceLabel: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  price: {
    ...typography.sectionTitle,
    color: colors.brand,
  },
  errorMessage: {
    backgroundColor: '#FFE0E0',
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: '#C41C3B',
  },
  errorText: {
    color: '#C41C3B',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    flex: 1,
  },
  retryButton: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 8,
    marginTop: spacing.sm,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  roamingCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  roamingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  vodafoneLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5DEDE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vodafoneLogoText: {
    fontSize: 24,
  },
  roamingHeaderText: {
    flex: 1,
  },
  vodafoneName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  roamingPlanName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginTop: spacing.xs,
  },
  roamingSection: {
    marginBottom: spacing.lg,
  },
  roamingSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: spacing.md,
  },
  judgeApprovedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  judgeFeedbackText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    fontWeight: '400',
  },
  reasoningText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    fontWeight: '400',
  },
  roamingChecklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  roamingChecklistText: {
    flex: 1,
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
  },
  travelerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  travelerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5DEDE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  travelerInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.brand,
  },
  travelerInfo: {
    flex: 1,
  },
  travelerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  travelerDetails: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  travelerPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.brand,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderTopColor: '#eee',
    borderBottomColor: '#eee',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  totalPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.brand,
  },
  actionButtonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modifyButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.brand,
    borderRadius: 24,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  modifyButtonFullWidth: {
    borderWidth: 2,
    borderColor: colors.brand,
    borderRadius: 24,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modifyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.brand,
  },
  approveButton: {
    flex: 1,
    backgroundColor: colors.brand,
    borderRadius: 24,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  approveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
  statusIcon: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  completedIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.brand,
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
    backgroundColor: '#FFFFFF',
  },
  actionContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  button: {
    flex: 1,
    backgroundColor: colors.brand,
    borderRadius: 24,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  secondaryButton: {
    flex: 1,
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
  paymentOptionsContainer: {
    backgroundColor: '#F5DEDE',
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  paymentOptionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  paymentOptionText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  chatInputSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: '#FFFFFF',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    maxHeight: 50,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  hotelCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  hotelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  hotelName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  hotelLocation: {
    fontSize: 14,
    color: '#666',
    marginTop: spacing.xs,
  },
  hotelDetails: {
    marginBottom: spacing.lg,
  },
  hotelDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  hotelDetailLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  hotelDetailValue: {
    fontSize: 14,
    color: '#000',
    fontWeight: '600',
  },
  hotelRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  hotelRatingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  hotelPriceRow: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  hotelPriceValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.brand,
  },
  continueButton: {
    backgroundColor: colors.brand,
    borderRadius: 24,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  continueButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  skipButton: {
    backgroundColor: '#F0F0F0',
    borderRadius: 24,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  skipButtonText: {
    color: colors.brand,
    fontSize: 16,
    fontWeight: '700',
  },
  hotelSuggestionCard: {
    backgroundColor: '#FFFAF0',
    borderLeftWidth: 4,
    borderLeftColor: '#D4AF87',
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  hotelSuggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  hotelSuggestionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  hotelSuggestionContent: {
    paddingLeft: spacing.md,
  },
  hotelSuggestionText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
    fontWeight: '400',
  },
  hotelActionButtons: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  bookHotelButton: {
    backgroundColor: colors.brand,
    borderRadius: 24,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  bookHotelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});
