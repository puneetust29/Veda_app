import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { OnboardingProvider } from '../context/OnboardingContext';
import AccountSelectionScreen from '../screens/onboarding/AccountSelectionScreen';
import AppPermissionsScreen from '../screens/onboarding/AppPermissionsScreen';
import ConsentScreen from '../screens/onboarding/ConsentScreen';
import LandingScreen from '../screens/onboarding/LandingScreen';
import OtpVerificationScreen from '../screens/onboarding/OtpVerificationScreen';
import PhoneEntryScreen from '../screens/onboarding/PhoneEntryScreen';
import PlanSelectionScreen from '../screens/onboarding/PlanSelectionScreen';
import SuccessScreen from '../screens/onboarding/SuccessScreen';
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import type { OnboardingStackParamList } from '../types';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

// Pre-auth onboarding flow: Landing -> phone/OTP verification -> welcome
// recommendations -> plan/app/account setup -> consent -> success, then
// hands off to the authenticated stack via AuthContext.signIn. Uses
// native-stack's default slide transition between steps.
export default function OnboardingNavigator() {
  return (
    <OnboardingProvider>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="Landing" component={LandingScreen} />
        <Stack.Screen name="PhoneEntry" component={PhoneEntryScreen} />
        <Stack.Screen name="OtpVerification" component={OtpVerificationScreen} />
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="PlanSelection" component={PlanSelectionScreen} />
        <Stack.Screen name="AppPermissions" component={AppPermissionsScreen} />
        <Stack.Screen name="AccountSelection" component={AccountSelectionScreen} />
        <Stack.Screen name="Consent" component={ConsentScreen} />
        <Stack.Screen name="Success" component={SuccessScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      </Stack.Navigator>
    </OnboardingProvider>
  );
}
