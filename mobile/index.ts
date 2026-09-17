import { registerRootComponent } from 'expo';

// Must be imported before registerRootComponent so the TaskManager callback
// is registered before the OS delivers any queued geofence events.
import './src/tasks/geofenceTask';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
