import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import ChatScreen from '../screens/ChatScreen';
import DashboardScreen from '../screens/DashboardScreen';
import DeviceCalendarScreen from '../screens/DeviceCalendarScreen';
import FlightDetailScreen from '../screens/FlightDetailScreen';
import RoamingPlansScreen from '../screens/RoamingPlansScreen';
import SubscriptionsScreen from '../screens/SubscriptionsScreen';
import OnboardingNavigator from './OnboardingNavigator';
import type { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { customer, loading, onboardingComplete } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Keep rendering the same "Onboarding" screen branch for both "not signed
  // in yet" and "signed in but still working through onboarding steps" --
  // this is what lets OnboardingNavigator stay mounted (and keep its current
  // screen) across the sign-in that happens right after OTP verification,
  // instead of remounting back to the Landing screen.
  const showOnboarding = !customer || !onboardingComplete;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {showOnboarding ? (
          <Stack.Screen name="Onboarding" component={OnboardingNavigator} />
        ) : (
          <>
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={({ route }) => ({
                headerShown: true,
                title: route.params.event.destination ?? '',
              })}
            />
            <Stack.Screen
              name="FlightDetail"
              component={FlightDetailScreen}
              options={{ headerShown: true, title: '' }}
            />
            <Stack.Screen
              name="Subscriptions"
              component={SubscriptionsScreen}
              options={{ headerShown: true, title: '' }}
            />
            <Stack.Screen
              name="RoamingPlans"
              component={RoamingPlansScreen}
              options={{ headerShown: true, title: 'Available Plans' }}
            />
            <Stack.Screen
              name="DeviceCalendar"
              component={DeviceCalendarScreen}
              options={{ headerShown: true, title: 'Calendars' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
