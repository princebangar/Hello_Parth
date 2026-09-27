import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Car, LoaderCircle, PencilLine, Plus, Trash2, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import { ownerPoolingVehicleService } from '../services/registrationService';

const LIST_PATH = '/taxi/owner/pooling-vehicles';

const STATUS_STYLES = {
  active: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  inactive: 'bg-slate-100 text-slate-600',
  maintenance: 'bg-rose-50 text-rose-700',
};

const unwrapList = (response) => {
  const data = response?.data?.data || response?.data || response;
  return Array.isArray(data) ? data : [];
};

/** Owner's own pooling vehicles (the admin approves them before they can take pooling bookings). */
const OwnerPoolingVehicles = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setVehicles(unwrapList(await ownerPoolingVehicleService.getPoolingVehicles()));
    } catch (requestError) {
      setError(requestError?.message || 'Could not load your pooling vehicles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (vehicle) => {
    if (!window.confirm(`Delete ${vehicle.name || 'this vehicle'}?`)) return;
    try {
      await ownerPoolingVehicleService.deletePoolingVehicle(vehicle._id);
      toast.success('Vehicle deleted');
      setVehicles((current) => current.filter((item) => item._id !== vehicle._id));
    } catch (requestError) {
      toast.error(requestError?.message || 'Could not delete this vehicle');
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fb] px-5 pb-32 pt-8 font-sans">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/taxi/owner/dashboard')}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-black tracking-tight text-slate-900">Pooling Vehicles</h1>
            <p className="text-xs font-semibold text-slate-500">Cars you offer for shared rides</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate(`${LIST_PATH}/create`)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-black uppercase tracking-wider text-white active:scale-95"
        >
          <Plus size={15} /> Add
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center py-20 text-slate-400">
          <LoaderCircle className="animate-spin" size={26} />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5 text-sm font-bold text-rose-600">
          {error}
          <button type="button" onClick={load} className="mt-3 block text-xs font-black uppercase tracking-wider underline">
            Try again
          </button>
        </div>
      ) : vehicles.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <Car className="mx-auto mb-3 text-slate-300" size={34} />
          <p className="text-sm font-black text-slate-800">No pooling vehicles yet</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Add a car — it goes live after the admin approves it.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {vehicles.map((vehicle) => {
            const status = String(vehicle.status || 'pending').toLowerCase();
            return (
              <div key={vehicle._id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-black text-slate-900">{vehicle.name}</p>
                    <p className="truncate text-xs font-semibold text-slate-500">
                      {[vehicle.vehicleModel, vehicle.vehicleNumber].filter(Boolean).join(' • ')}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${STATUS_STYLES[status] || STATUS_STYLES.inactive}`}>
                    {status}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
                    <Users size={14} /> {vehicle.capacity || 0} seats
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`${LIST_PATH}/edit/${vehicle._id}`)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 active:scale-95"
                      aria-label="Edit vehicle"
                    >
                      <PencilLine size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(vehicle)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 active:scale-95"
                      aria-label="Delete vehicle"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DriverBottomNav />
    </div>
  );
};

export default OwnerPoolingVehicles;
