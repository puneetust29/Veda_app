import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import ChatScreen from '../screens/ChatScreen';
import DashboardScreen from '../screens/DashboardScreen';
import FlightDetailScreen from '../screens/FlightDetailScreen';
import RoamingPlansScreen from '../screens/RoamingPlansScreen';
import SignInScreen from '../screens/SignInScreen';
import SubscriptionsScreen from '../screens/SubscriptionsScreen';
import type { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { customer, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {customer ? (
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
          </>
        ) : (
          <Stack.Screen name="SignIn" component={SignInScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
