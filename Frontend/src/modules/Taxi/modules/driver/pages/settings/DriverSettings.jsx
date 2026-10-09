import React from 'react';
import { ArrowLeft, Trash2, User } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

/** Settings hub for taxi driver + owner: Edit Profile and Delete Account rows, same shape as the Food user's
 *  Settings page (blue on hover instead of Food's red). */
const DriverSettings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-md px-6 py-6 pb-20">
        <div className="mb-8 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(`${routePrefix}/profile`)}
            aria-label="Back"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white/70 shadow-[0_2px_12px_rgba(0,0,0,0.08)] outline-none transition-all active:scale-95"
          >
            <ArrowLeft className="h-6 w-6 text-black" />
          </button>
          <div>
            <h1 className="text-[22px] font-bold leading-none tracking-tight text-gray-900">Settings</h1>
            <p className="mt-1 text-[12px] text-gray-400">Profile and account settings</p>
          </div>
        </div>

        <div className="mt-6">
          <Link to={`${routePrefix}/edit-profile`} className="group block border-b border-gray-200/80 py-4">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-gray-500 transition-colors group-hover:text-blue-600" />
              <div className="min-w-0 flex-1">
                <h3 className="text-[17px] font-semibold text-gray-900 transition-colors group-hover:text-blue-600">Edit Profile</h3>
                <p className="mt-0.5 truncate text-[13px] text-gray-500">Change your name, phone, email and profile photo</p>
              </div>
            </div>
          </Link>

          <Link to={`${routePrefix}/delete-account`} className="group block border-b border-gray-200/80 py-4">
            <div className="flex items-center gap-3">
              <Trash2 className="h-5 w-5 text-[#FF3131]" />
              <div className="min-w-0 flex-1">
                <h3 className="text-[17px] font-semibold text-gray-900 transition-colors group-hover:text-red-500">Delete Account</h3>
                <p className="mt-0.5 truncate text-[13px] text-gray-500">Tap to delete your account</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default DriverSettings;
