import React, { useState, useEffect, useMemo } from 'react';
import { GoogleMap, MarkerF, InfoWindow } from '@react-google-maps/api';
import { 
  ChevronRight, 
  Map as MapIcon, 
  RefreshCw, 
  Filter,
  ArrowLeft,
  Activity,
  User,
  Car,
  Clock,
  Navigation,
  Search,
  MousePointer2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppGoogleMapsLoader, HAS_VALID_GOOGLE_MAPS_KEY } from '../../utils/googleMaps';
import { adminService } from '../../services/adminService';
import { motion, AnimatePresence } from 'framer-motion';

const INDIA_CENTER = { lat: 22.7196, lng: 75.8577 };
const MAP_CONTAINER_STYLE = { width: '100%', height: '400px' };

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: true,
  fullscreenControl: true,
  styles: [
    { elementType: 'geometry', stylers: [{ color: '#f9fafb' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#e5e7eb' }] }
  ]
};

const GodsEye = () => {
  const navigate = useNavigate();
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [driverMode, setDriverMode] = useState('all');
  const [vehicleType, setVehicleType] = useState('all');
  const [refreshMethod, setRefreshMethod] = useState('automatic');
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [mapRef, setMapRef] = useState(null);

  const { isLoaded, loadError } = useAppGoogleMapsLoader();

  const inputClass = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors appearance-none cursor-pointer";
  const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-widest";

  const fetchZones = async () => {
    setLoading(true);
    try {
      const response = await adminService.getZones();
      const results = response?.data?.results || response?.data || [];
      setZones(results);
    } catch (error) {
      console.error('Failed to fetch Gods Eye data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchZones();
    if (refreshMethod === 'automatic') {
      const interval = setInterval(fetchZones, 30000);
      return () => clearInterval(interval);
    }
  }, [refreshMethod]);

  const markers = useMemo(() => {
    if (!zones.length) return [];
    return zones.flatMap((zone, idx) => {
      const coord = zone.coordinates?.[0]?.[0] || [75.8577, 22.7196];
      const lat = Number(coord[1]);
      const lng = Number(coord[0]);
      
      // Mock drivers and demand for visualization
      return [
        { id: `${zone._id}-d1`, type: 'driver', pos: { lat: lat + 0.01, lng: lng - 0.01 }, title: `Driver ${idx + 1}`, status: 'Online' },
        { id: `${zone._id}-d2`, type: 'driver', pos: { lat: lat - 0.01, lng: lng + 0.01 }, title: `Driver ${idx + 10}`, status: 'On Ride' },
        { id: `${zone._id}-r1`, type: 'demand', pos: { lat: lat + 0.005, lng: lng + 0.005 }, title: `Request ${idx + 1}`, status: 'Pending' }
      ];
    });
  }, [zones]);

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8 font-sans animate-in fade-in duration-500">
      
      {/* Header Block */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <span>Map</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">God's Eye</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">God's Eye</h1>
          <button 
             onClick={() => navigate('/taxi/admin/dashboard')}
             className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </div>

      <div className="space-y-8">
        
        {/* Filters Section (Card Pattern) */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-in slide-in-from-top-4 duration-700">
           <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
              <div className="flex items-center gap-3">
                 <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                    <Filter size={18} />
                 </div>
                 <h3 className="text-sm font-black text-gray-900 uppercase tracking-[0.1em]">Fleet Filtration</h3>
              </div>
              {loading && <RefreshCw size={16} className="text-indigo-400 animate-spin" />}
           </div>
           
           <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                 {/* Driver Select */}
                 <div className="space-y-2">
                    <label className={labelClass}>Drivers</label>
                    <div className="relative group">
                       <select value={driverMode} onChange={e => setDriverMode(e.target.value)} className={inputClass}>
                          <option value="all">All Modes</option>
                          <option value="online">Online Only</option>
                          <option value="on-ride">On Active Ride</option>
                       </select>
                       <User size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-indigo-500 transition-colors pointer-events-none" />
                    </div>
                 </div>

                 {/* Vehicle Select */}
                 <div className="space-y-2">
                    <label className={labelClass}>Vehicle Types</label>
                    <div className="relative group">
                       <select value={vehicleType} onChange={e => setVehicleType(e.target.value)} className={inputClass}>
                          <option value="all">All Vehicles</option>
                          <option value="car">Cars Only</option>
                          <option value="bike">Bikes Only</option>
                       </select>
                       <Car size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-indigo-500 transition-colors pointer-events-none" />
                    </div>
                 </div>

                 {/* Refresh Select */}
                 <div className="space-y-2">
                    <label className={labelClass}>Refresh Method *</label>
                    <div className="relative group">
                       <select value={refreshMethod} onChange={e => setRefreshMethod(e.target.value)} className={inputClass}>
                          <option value="automatic">Automatic (30s)</option>
                          <option value="manual">Manual Refresh</option>
                       </select>
                       <Clock size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-indigo-500 transition-colors pointer-events-none" />
                    </div>
                 </div>
              </div>

              <div className="flex items-center gap-3 mt-8 pt-8 border-t border-gray-50">
                 <button onClick={fetchZones} className="px-8 py-3 bg-[#00BFA5] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-[#00BFA5]/20 hover:scale-[1.02] transition-all">
                    Apply Grid
                 </button>
                 <button onClick={() => { setDriverMode('all'); setVehicleType('all'); }} className="px-8 py-3 bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-rose-100 hover:scale-[1.02] transition-all">
                    Reset Deck
                 </button>
              </div>
           </div>
        </div>

        {/* Map Canvas */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden p-2">
           <div className="rounded-lg overflow-hidden relative">
              {loadError ? (
                 <div className="h-[400px] flex items-center justify-center bg-gray-50 uppercase font-semibold text-rose-500">Maps Load Failed</div>
              ) : HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
                 <GoogleMap
                    mapContainerStyle={MAP_CONTAINER_STYLE} center={INDIA_CENTER} zoom={12} options={mapOptions} onLoad={setMapRef}
                 >
                    {markers.map((m) => (
                       <MarkerF 
                          key={m.id} position={m.pos} title={m.title}
                          onClick={() => setSelectedMarker(m)}
                          icon={{
                             path: window.google.maps.SymbolPath.CIRCLE, scale: 8,
                             fillColor: m.type === 'driver' ? '#00BFA5' : '#FB923C',
                             fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3
                          }}
                       />
                    ))}

                    {selectedMarker && (
                       <InfoWindow position={selectedMarker.pos} onCloseClick={() => setSelectedMarker(null)}>
                          <div className="p-3 bg-white min-w-[200px]">
                             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{selectedMarker.type}</p>
                             <p className="text-sm font-black text-gray-900 mb-2">{selectedMarker.title}</p>
                             <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${selectedMarker.status === 'On Ride' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                <span className="text-[11px] font-bold text-gray-600">{selectedMarker.status}</span>
                             </div>
                          </div>
                       </InfoWindow>
                    )}
                 </GoogleMap>
              ) : (
                 <div className="h-[400px] bg-slate-100 flex items-center justify-center">
                    <div className="text-center space-y-4">
                       <MapIcon size={40} className="mx-auto text-gray-300" />
                       <p className="text-xs font-black text-gray-300 uppercase tracking-[0.3em]">Command Grid Offline</p>
                    </div>
                 </div>
              )}
           </div>
        </div>

        {/* Status Deck */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pb-12">
           <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm"><Activity size={22} /></div>
              <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Fleet Connectivity</p><p className="text-xl font-black text-gray-900 tracking-tight leading-none">98.2% Active</p></div>
           </div>
           <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm"><Navigation size={22} /></div>
              <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Active Pockets</p><p className="text-xl font-black text-gray-900 tracking-tight leading-none">{zones.length} Localities</p></div>
           </div>
           <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm"><MousePointer2 size={22} /></div>
              <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Incoming Feed</p><p className="text-xl font-black text-amber-600 tracking-tight leading-none">Live Syncing</p></div>
           </div>
           <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4 border-l-4 border-l-indigo-500">
              <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-indigo-100"><Search size={22} /></div>
              <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Precision</p><p className="text-xl font-black text-gray-900 tracking-tight leading-none">0.8s Latency</p></div>
           </div>
        </div>

      </div>
    </div>
  );
};

export default GodsEye;
