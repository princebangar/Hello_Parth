import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Trash2 } from 'lucide-react';
import { userAuthService, clearLocalUserSession } from '../../services/authService';
import { clearCurrentRide } from '../../services/currentRideService';
import { socketService } from '../../../../shared/api/socket';
import UserDeleteAccountDialog from '@/shared/components/UserDeleteAccountDialog.jsx';

/** Settings hub — same shape and colours as Food's (Edit Profile + Delete
 *  Account rows). Plain neutral grays, not Taxi's `--user-text-secondary`
 *  variable — that one is slate-based and reads as blue-tinted rather than
 *  a clean neutral gray, which showed up on this page's icons. */
export default function Settings() {
  const navigate = useNavigate();
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await userAuthService.requestAccountDeletion('Requested via account settings');
      clearCurrentRide();
      socketService.disconnect();
      clearLocalUserSession();
      navigate('/login', { replace: true });
    } catch {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a]">
      <div className="max-w-md md:max-w-2xl mx-auto px-6 py-6 pb-20">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="h-11 w-11 flex items-center justify-center bg-white/70 dark:bg-[#1a1a1a]/70 backdrop-blur-md rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:bg-white/90 dark:hover:bg-[#222]/90 active:scale-95 transition-all outline-none border border-black/10 dark:border-white/10"
          >
            <ArrowLeft className="h-6 w-6 text-black dark:text-white" />
          </button>
          <div>
            <h1 className="text-[22px] font-bold text-gray-900 dark:text-white tracking-tight leading-none">
              Settings
            </h1>
            <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-1">
              Profile and account settings
            </p>
          </div>
        </div>

        <div className="mt-6">
          <Link to="/taxi/user/profile/edit" className="block group border-b border-gray-200/80 dark:border-gray-800/80 py-4">
            <div className="flex items-center gap-3 transition-all duration-150">
              <User className="h-5 w-5 text-gray-500 dark:text-gray-400 group-hover:text-blue-500 transition-colors" />
              <div className="flex-1 min-w-0">
                <h3 className="text-[17px] font-semibold text-gray-900 dark:text-white group-hover:text-blue-500 transition-colors">
                  Edit Profile
                </h3>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                  Change your name, description and profile photo
                </p>
              </div>
            </div>
          </Link>

          <div
            onClick={() => setDeleteAccountOpen(true)}
            className="block group cursor-pointer border-b border-gray-200/80 dark:border-gray-800/80 py-4"
          >
            <div className="flex items-center gap-3 transition-all duration-150">
              <Trash2 className="h-5 w-5 text-[#FF3131]" />
              <div className="flex-1 min-w-0">
                <h3 className="text-[17px] font-semibold text-gray-900 dark:text-white group-hover:text-red-500 transition-colors">
                  Delete Account
                </h3>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                  Tap to delete your account
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <UserDeleteAccountDialog
        open={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
        onConfirm={handleDeleteAccount}
        isDeleting={isDeleting}
      />
    </div>
  );
}
