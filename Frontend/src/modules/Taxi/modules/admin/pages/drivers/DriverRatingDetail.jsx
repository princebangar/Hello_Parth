import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Mail, MapPin, Phone, Star, User } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

const DriverRatingDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDetail = async () => {
      setIsLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/driver-ratings/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setDetail(data.data);
        } else {
          setError(data.message || 'Unable to load rating');
        }
      } catch (err) {
        setError('Unable to load rating');
      } finally {
        setIsLoading(false);
      }
    };
    fetchDetail();
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-sm text-gray-500">
        Loading rating...
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm font-semibold text-rose-600">{error || 'Rating not found'}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const driver = detail.driver;
  const reviews = detail.reviews || [];

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8 font-sans text-gray-900">
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <span>Drivers</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">View Rating</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl text-gray-900 font-bold">View Rating</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/admin/drivers/${driver._id}`, { state: { from: `/admin/drivers/ratings/${driver._id}` } })}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <User size={16} /> View driver profile
            </button>
            <button
              onClick={() => navigate('/taxi/admin/drivers/ratings')}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft size={16} /> Back
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_260px] gap-6 items-center">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center text-2xl font-bold text-gray-400">
              {driver.image
                ? <img src={driver.image} alt={driver.name} className="w-full h-full object-cover" />
                : String(driver.name || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg text-gray-900 font-bold">{driver.name}</h2>
              <div className="flex items-center gap-1 text-amber-400">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} size={14} className={s <= Math.round(driver.rating) ? 'fill-current' : 'text-gray-200'} />
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {driver.rating_count > 0 ? `${Number(driver.rating).toFixed(1)} from ${driver.rating_count} rating${driver.rating_count === 1 ? '' : 's'}` : 'No ratings yet'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Phone size={14} className="text-gray-400" />
              <span>{driver.phone || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail size={14} className="text-gray-400" />
              <span>{driver.email || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-gray-400" />
              <span>{driver.transport_type || 'Taxi'}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {driver.vehicle_image ? (
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                <img src={driver.vehicle_image} alt="Vehicle" className="w-full h-full object-cover" />
              </div>
            ) : null}
            <div className="text-sm text-gray-600">
              <p className="text-gray-900 font-semibold">{driver.transport_type || 'Vehicle'}</p>
              <p>{driver.vehicle_make}</p>
              <p>{driver.vehicle_model}</p>
              <p>{driver.vehicle_number}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-semibold">
            DRIVER RATING
          </div>
          <div className="text-sm text-gray-600">Rated trips ({reviews.length})</div>
        </div>

        <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
          {reviews.length === 0 ? (
            <div className="p-4 text-sm text-gray-400">No customer has rated this driver yet.</div>
          ) : (
            reviews.map((item) => (
              <div key={item._id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 text-sm">
                <div className="flex items-center gap-0.5 text-amber-400 shrink-0 sm:w-24 sm:pt-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} size={13} className={s <= Math.round(item.rating) ? 'fill-current' : 'text-gray-200'} />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-gray-800 break-words">{item.pickup_location}</p>
                  {item.comment ? <p className="text-gray-500 italic mt-0.5 break-words">"{item.comment}"</p> : null}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {item.customer_name ? `${item.customer_name} · ` : ''}Trip #{String(item.request_id).slice(-6).toUpperCase()}
                  </p>
                </div>
                <div className="text-xs text-gray-500 shrink-0">
                  {item.date ? new Date(item.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DriverRatingDetail;
