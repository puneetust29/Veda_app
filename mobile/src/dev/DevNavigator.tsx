import { HeaderBackButton } from '@react-navigation/elements';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import IntegrationDetailScreen from './screens/IntegrationDetailScreen';
import IntegrationsCatalogScreen from './screens/IntegrationsCatalogScreen';
import StripePaymentScreen from './screens/StripePaymentScreen';
import type { DevStackParamList } from './types';

const Stack = createNativeStackNavigator<DevStackParamList>();

// Self-contained nested navigator for POC/dev-only integration screens.
// Register new dev screens here -- the root navigator only ever mounts
// this one navigator and never needs to change as this list grows.
export default function DevNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Catalog"
        component={IntegrationsCatalogScreen}
        options={({ navigation }) => ({
          title: 'Integrations (Dev)',
          // Catalog is the first screen of this nested stack, so native-stack
          // has no back history of its own to render a button for. goBack()
          // still works -- unhandled GO_BACK actions bubble up to the root
          // stack -- so wire it manually to return to the Dashboard.
          headerLeft: (props) => <HeaderBackButton {...props} onPress={() => navigation.goBack()} />,
        })}
      />
      <Stack.Screen name="Detail" component={IntegrationDetailScreen} options={{ title: '' }} />
      <Stack.Screen name="StripePayment" component={StripePaymentScreen} options={{ title: 'Stripe Payment' }} />
    </Stack.Navigator>
  );
}
