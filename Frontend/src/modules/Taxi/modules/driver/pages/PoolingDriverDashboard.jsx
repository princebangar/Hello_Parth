import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Car, ChevronDown, LoaderCircle, LogOut, MapPin, Power, Route as RouteIcon, Ticket, Users } from 'lucide-react';
import { GoogleMap, MarkerF } from '@react-google-maps/api';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HAS_VALID_GOOGLE_MAPS_KEY, useBaseGoogleMapsLoader } from '../../admin/utils/googleMaps';
import { socketService } from '../../../shared/api/socket';
import {
  clearDriverAuthState,
  getCurrentDriver,
  getLocalDriverToken,
  getPoolingDriverDashboard,
  getPoolingDriverRoutes,
  sendPoolingDriverLocation,
  setPoolingDriverOnline,
  setPoolingDriverRoute,
} from '../services/registrationService';

const unwrap = (response) => response?.data?.data || response?.data || response;
const LOCATION_SEND_EVERY_MS = 15000;
const DEFAULT_CENTER = { lat: 22.7196, lng: 75.8577 };

const formatDay = (date, isToday) => {
  if (isToday) return 'Today';
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
};

// Pooling driver home: one big Online / Offline switch (offline = riders cannot book this car), a map with the live
// position, the routes this car runs, the departures that are booked, and a live notice when a seat is booked.
const PoolingDriverDashboard = () => {
  const navigate = useNavigate();
  const { isLoaded } = useBaseGoogleMapsLoader();
  const [profile, setProfile] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState(null);
  const [openDeparture, setOpenDeparture] = useState('');
  const lastSentRef = useRef(0);
  const mapRef = useRef(null);

  const isOnline = dashboard?.isOnline === true;

  const loadAll = useCallback(async () => {
    const [dash, routeList] = await Promise.all([getPoolingDriverDashboard(), getPoolingDriverRoutes()]);
    setDashboard(unwrap(dash));
    setRoutes(Array.isArray(unwrap(routeList)) ? unwrap(routeList) : []);
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const me = unwrap(await getCurrentDriver());
        if (!active) return;
        if (me?.approve === false || String(me?.status || '').toLowerCase() === 'pending') {
          navigate('/taxi/driver/pooling/status', { replace: true });
          return;
        }
        setProfile(me);
        await loadAll();
      } catch (err) {
        if (active) setError(err?.message || 'Unable to load your pooling dashboard');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [navigate, loadAll]);

  // New seat booked on this car: say so at once and refresh the departures.
  useEffect(() => {
    const token = getLocalDriverToken();
    if (!token) return undefined;
    socketService.connect({ role: 'driver', token });
    const onBooking = (payload = {}) => {
      toast.success(payload.message || 'New seat booked', { duration: 6000 });
      loadAll().catch(() => {});
    };
    socketService.on('pooling:booking:new', onBooking);
    return () => socketService.off('pooling:booking:new', onBooking);
  }, [loadAll]);

  // While online the position is shown on the map and sent to the server every few seconds.
  useEffect(() => {
    if (!isOnline || typeof navigator === 'undefined' || !navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(next);
        const now = Date.now();
        if (now - lastSentRef.current >= LOCATION_SEND_EVERY_MS) {
          lastSentRef.current = now;
          sendPoolingDriverLocation(next, Number.isFinite(pos.coords.heading) ? pos.coords.heading : null).catch(() => {});
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline]);

  useEffect(() => {
    if (position && mapRef.current) mapRef.current.panTo(position);
  }, [position]);

  const getFix = () => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 },
    );
  });

  const toggleOnline = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const goOnline = !isOnline;
      const fix = goOnline ? await getFix() : null;
      if (fix) setPosition(fix);
      const result = unwrap(await setPoolingDriverOnline(goOnline, fix));
      setDashboard((current) => ({ ...(current || {}), ...result }));
      toast.success(goOnline ? 'You are online - riders can book your car' : 'You are offline - your car is hidden from riders');
    } catch (err) {
      toast.error(err?.message || 'Could not change your status');
    } finally {
      setBusy(false);
    }
  };

  const toggleRoute = async (route) => {
    const next = !route.assigned;
    setRoutes((list) => list.map((item) => (item.id === route.id ? { ...item, assigned: next } : item)));
    try {
      await setPoolingDriverRoute(route.id, next);
      toast.success(next ? `Your car now runs ${route.routeName}` : `Removed from ${route.routeName}`);
      loadAll().catch(() => {});
    } catch (err) {
      setRoutes((list) => list.map((item) => (item.id === route.id ? { ...item, assigned: !next } : item)));
      toast.error(err?.message || 'Could not change the route');
    }
  };

  const handleLogout = () => {
    clearDriverAuthState();
    navigate('/taxi/driver/login', { replace: true });
  };

  const mapCenter = position || (dashboard?.location ? { lat: dashboard.location.lat, lng: dashboard.location.lng } : DEFAULT_CENTER);
  const departures = dashboard?.departures || [];
  const runsAnyRoute = useMemo(() => routes.some((route) => route.assigned), [routes]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoaderCircle className="animate-spin text-slate-900" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F8FF] pb-36">
      <div className="rounded-b-[2rem] px-5 pb-6 pt-8 text-white" style={{ background: 'linear-gradient(160deg,#0e2a7a 0%,#1e4fd0 60%,#3d84f5 100%)' }}>
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-100">Pooling Driver</p>
            <h1 className="truncate text-2xl font-black">{profile?.name || 'Pooling Driver'}</h1>
            <p className="mt-0.5 truncate text-xs font-semibold text-blue-100">
              {dashboard?.vehicle?.name || 'Vehicle'} - {dashboard?.vehicle?.number || ''} - {dashboard?.vehicle?.capacity || 0} seats
            </p>
          </div>
          <button type="button" onClick={handleLogout} aria-label="Logout" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white">
            <LogOut size={18} />
          </button>
        </div>

        <div className="mx-auto mt-5 max-w-lg">
          <button
            type="button"
            onClick={toggleOnline}
            disabled={busy}
            className={`flex w-full items-center justify-between rounded-3xl px-5 py-4 text-left shadow-lg transition active:scale-[0.99] ${isOnline ? 'bg-emerald-500 text-white' : 'bg-white text-slate-900'}`}
          >
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] opacity-80">{isOnline ? 'You are online' : 'You are offline'}</p>
              <p className="mt-0.5 text-sm font-bold">
                {isOnline ? 'Riders can book seats in your car' : 'Tap to go online and get seat bookings'}
              </p>
            </div>
            <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${isOnline ? 'bg-white/25' : 'bg-slate-900 text-white'}`}>
              {busy ? <LoaderCircle className="animate-spin" size={20} /> : <Power size={20} />}
            </span>
          </button>
        </div>
      </div>

      <div className="mx-auto mt-5 max-w-lg space-y-5 px-5">
        {error ? <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-600">{error}</div> : null}

        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
          <div className="h-48 w-full bg-slate-100">
            {HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={mapCenter}
                zoom={15}
                onLoad={(map) => { mapRef.current = map; }}
                options={{ disableDefaultUI: true, clickableIcons: false, gestureHandling: 'greedy' }}
              >
                <MarkerF
                  position={mapCenter}
                  icon={window.google?.maps ? { path: window.google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: isOnline ? '#16a34a' : '#64748b', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } : undefined}
                />
              </GoogleMap>
            ) : (
              <div className="flex h-full items-center justify-center text-xs font-bold text-slate-400">Loading map...</div>
            )}
          </div>
          <div className="flex items-center gap-2 px-4 py-3 text-xs font-bold text-slate-600">
            <MapPin size={14} className={isOnline ? 'text-emerald-600' : 'text-slate-400'} />
            {isOnline ? 'Sharing your live location while you are online' : 'Location is shared only while you are online'}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Seats today', value: dashboard?.todaySeats ?? 0, icon: Users },
            { label: 'Upcoming', value: dashboard?.upcomingBookings ?? 0, icon: Ticket },
            { label: 'Routes', value: routes.filter((route) => route.assigned).length, icon: RouteIcon },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm">
              <item.icon size={18} className="mx-auto text-blue-600" />
              <p className="mt-1 text-xl font-black text-slate-900">{item.value}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.label}</p>
            </div>
          ))}
        </div>

        <section>
          <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-slate-500">Routes my car runs</h2>
          {routes.length === 0 ? (
            <p className="rounded-2xl bg-white p-4 text-sm font-semibold text-slate-500 shadow-sm">No pooling routes have been created by the admin yet.</p>
          ) : (
            <div className="space-y-2">
              {routes.map((route) => (
                <div key={route.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{route.routeName || `${route.origin} to ${route.destination}`}</p>
                    <p className="truncate text-xs font-semibold text-slate-500">
                      {route.origin} to {route.destination} - {route.schedules.map((item) => item.departureTime).filter(Boolean).join(', ') || 'no timings'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleRoute(route)}
                    aria-pressed={route.assigned}
                    data-route-toggle
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${route.assigned ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${route.assigned ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {routes.length > 0 && !runsAnyRoute ? (
            <p className="mt-2 text-xs font-bold text-amber-600">Switch on at least one route - riders find your car only on the routes you run.</p>
          ) : null}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Booked departures</h2>
            <Link to="/taxi/driver/pooling/bookings" className="text-xs font-black uppercase tracking-wider text-blue-600">All bookings</Link>
          </div>
          {departures.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center">
              <Car className="mx-auto mb-2 text-slate-300" size={30} />
              <p className="text-sm font-black text-slate-700">No seats booked yet</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Go online and keep your routes switched on - bookings show up here the moment a rider pays.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {departures.map((row) => {
                const key = `${row.date}-${row.routeName}-${row.departureTime}`;
                const open = openDeparture === key;
                return (
                  <div key={key} className="rounded-2xl border border-slate-100 bg-white shadow-sm">
                    <button type="button" onClick={() => setOpenDeparture(open ? '' : key)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                      <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-wider text-blue-600">{formatDay(row.date, row.isToday)} - {row.departureTime || 'time not set'}</p>
                        <p className="truncate text-sm font-black text-slate-900">{row.routeName}</p>
                        <p className="text-xs font-semibold text-slate-500">{row.seatsBooked} seat{row.seatsBooked === 1 ? '' : 's'} - {row.bookings.length} booking{row.bookings.length === 1 ? '' : 's'}</p>
                      </div>
                      <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open ? (
                      <div className="space-y-2 border-t border-slate-100 p-4">
                        {row.bookings.map((booking) => (
                          <div key={booking.bookingId} className="rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">
                            <p className="text-sm font-black text-slate-900">{booking.passenger} - {booking.seats} seat{booking.seats === 1 ? '' : 's'}</p>
                            <p>Pickup: {booking.pickup || '-'}</p>
                            <p>Drop: {booking.drop || '-'}</p>
                            {booking.phone ? <a href={`tel:${booking.phone}`} className="mt-1 inline-block font-black text-blue-600">Call {booking.phone}</a> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default PoolingDriverDashboard;
