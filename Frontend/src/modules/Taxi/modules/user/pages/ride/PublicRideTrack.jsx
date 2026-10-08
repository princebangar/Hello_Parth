import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { GoogleMap, MarkerF } from '@react-google-maps/api';
import { Car, Loader2, MapPin, ShieldCheck, Navigation } from 'lucide-react';
import api from '../../../../shared/api/axiosInstance';
import { HAS_VALID_GOOGLE_MAPS_KEY, useBaseGoogleMapsLoader } from '../../../admin/utils/googleMaps';

// Public page behind the "Share ride" link: no login. Shows where the captain is right now, who is driving and how
// the trip is going. It refreshes by itself every few seconds until the trip is over.
const POLL_MS = 5000;

const STATUS_TEXT = {
  searching: 'Finding a captain',
  accepted: 'Captain is on the way to pick up',
  arriving: 'Captain has reached the pickup point',
  started: 'Trip in progress',
  ongoing: 'Trip in progress',
  arrived: 'Reaching the drop point',
  completed: 'Trip completed - reached safely',
  cancelled: 'This trip was cancelled',
};

const mapStyle = { width: '100%', height: '100%' };

const PublicRideTrack = () => {
  const { token } = useParams();
  const { isLoaded } = useBaseGoogleMapsLoader();
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);
  const fittedRef = useRef(false);

  useEffect(() => {
    let active = true;
    let timer = null;

    const load = async () => {
      try {
        const response = await api.get(`/common/track/${encodeURIComponent(token)}`, { dedupe: false });
        if (!active) return;
        setTrip(response?.data || response);
        setError('');
        if (!(response?.data || response)?.ended) {
          timer = window.setTimeout(load, POLL_MS);
        }
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'This tracking link is not available');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [token]);

  const driverPos = trip?.driverLocation || null;
  const center = driverPos || trip?.pickup || trip?.drop || { lat: 22.7196, lng: 75.8577 };

  // First time: show pickup, drop and the captain together. After that the map follows the captain smoothly.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps || !trip) return;
    if (!fittedRef.current) {
      const bounds = new window.google.maps.LatLngBounds();
      [trip.pickup, trip.drop, driverPos].filter(Boolean).forEach((point) => bounds.extend(point));
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 80);
        fittedRef.current = true;
      }
    } else if (driverPos && !trip.ended) {
      map.panTo(driverPos);
    }
  }, [trip, driverPos?.lat, driverPos?.lng, isLoaded]);

  const statusText = useMemo(() => {
    if (!trip) return '';
    return STATUS_TEXT[trip.liveStatus] || STATUS_TEXT[trip.status] || 'Trip';
  }, [trip]);

  const markerIcon = (color) => (window.google?.maps
    ? { path: window.google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: color, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 }
    : undefined);

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-slate-50 px-8 text-center font-sans">
        <ShieldCheck size={42} className="text-slate-300" />
        <h1 className="text-[18px] font-bold text-slate-800">Tracking link not available</h1>
        <p className="text-[13px] font-medium text-slate-500">{error || 'This link is not valid or has expired.'}</p>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex h-[100dvh] w-full max-w-xl flex-col overflow-hidden bg-slate-100 font-sans">
      <div className="relative min-h-0 flex-1">
        {HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
          <GoogleMap
            mapContainerStyle={mapStyle}
            center={center}
            zoom={15}
            onLoad={(map) => { mapRef.current = map; }}
            options={{ disableDefaultUI: true, zoomControl: true, clickableIcons: false }}
          >
            {trip.pickup && <MarkerF position={trip.pickup} icon={markerIcon('#16a34a')} title="Pickup" />}
            {trip.drop && <MarkerF position={trip.drop} icon={markerIcon('#dc2626')} title="Drop" />}
            {driverPos && <MarkerF position={driverPos} icon={markerIcon('#2563eb')} title="Captain" zIndex={10} />}
          </GoogleMap>
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] font-semibold text-slate-500">Loading map...</div>
        )}
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow">
          <span className={`h-2 w-2 rounded-full ${trip.ended ? 'bg-slate-400' : 'animate-pulse bg-emerald-500'}`} />
          {trip.ended ? 'Trip ended' : 'Live'}
        </div>
      </div>

      <div className="shrink-0 rounded-t-3xl bg-white px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(15,23,42,0.12)]">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Live ride tracking</p>
        <h1 className="mt-0.5 text-[18px] font-bold leading-tight text-slate-900">{statusText}</h1>

        {trip.driver && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white"><Car size={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold text-slate-900">{trip.driver.name}</p>
              <p className="truncate text-[12px] font-semibold text-slate-500">
                {[trip.driver.vehicleLabel, trip.driver.vehicleNumber].filter(Boolean).join(' - ') || 'Vehicle details soon'}
              </p>
            </div>
          </div>
        )}

        <div className="mt-3 space-y-2">
          <div className="flex items-start gap-2">
            <MapPin size={15} className="mt-0.5 shrink-0 text-emerald-600" />
            <p className="text-[12px] font-semibold text-slate-700">{trip.pickupAddress || 'Pickup'}</p>
          </div>
          <div className="flex items-start gap-2">
            <Navigation size={15} className="mt-0.5 shrink-0 text-rose-600" />
            <p className="text-[12px] font-semibold text-slate-700">{trip.dropAddress || 'Drop'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicRideTrack;
