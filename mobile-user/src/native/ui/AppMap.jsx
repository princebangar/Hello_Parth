// Native Google map (react-native-maps, Google provider) replacing @react-google-maps/api's <GoogleMap>.
// Use Marker / Polyline / Circle / Polygon from 'react-native-maps' inside it, same markers, routes and controls as the web.
// Coordinates are { latitude, longitude } (web: { lat, lng }) — use toLatLng() to convert.
import React, { forwardRef } from 'react';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';

export const toLatLng = (p) => (p ? { latitude: Number(p.lat ?? p.latitude), longitude: Number(p.lng ?? p.longitude) } : null);
export const toLatLngLiteral = (c) => (c ? { lat: c.latitude, lng: c.longitude } : null);

/** zoom level (Google web) -> region deltas around a center */
export const regionFor = (center, zoom = 15) => {
  const c = toLatLng(center);
  const delta = 360 / 2 ** zoom;
  return { latitude: c.latitude, longitude: c.longitude, latitudeDelta: delta, longitudeDelta: delta };
};

export const AppMap = forwardRef(function AppMap({ children, ...props }, ref) {
  return (
    <MapView
      ref={ref}
      provider={PROVIDER_GOOGLE}
      toolbarEnabled={false}
      showsMyLocationButton={false}
      showsCompass={false}
      showsBuildings={false}
      showsIndoors={false}
      loadingEnabled
      {...props}
    >
      {children}
    </MapView>
  );
});

export { Marker, Polyline, Circle, Polygon, Callout } from 'react-native-maps';
