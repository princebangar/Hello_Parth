// Entry: browser-API compat first (localStorage, events, location, geolocation ...), then the background location task
// (must be defined before Android starts it, also when the app was closed), then Expo Router.
import 'react-native-url-polyfill/auto';
import './src/lib/webCompat';
import './src/lib/riderLocation';
import 'expo-router/entry';
