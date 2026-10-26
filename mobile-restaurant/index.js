// Entry: browser-API compat first (localStorage, events, location, geolocation ...), then Expo Router.
// (The restaurant app has no background location task, unlike the delivery / Captain apps it was copied from.)
import 'react-native-url-polyfill/auto';
import './src/lib/webCompat';
import 'expo-router/entry';
