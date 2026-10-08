import React, { useEffect, useMemo, useState } from 'react';
import * as Motion from 'framer-motion';
import { AnimatePresence } from 'framer-motion';
import {
    User,
    Car,
    FileText,
    Bell,
    History,
    CreditCard,
    UserPlus,
    ShieldCheck,
    HelpCircle,
    LogOut,
    ArrowRight,
    Star,
    Route,
    ChevronRight,
    CheckCircle2,
    Wallet,
    Info,
    Gift,
    Shield,
    BadgePercent,
    Mail,
    HandCoins,
    Phone,
    X,
    Landmark,
    MapPin,
    MapPinned,
    Hash,
    Palette,
    ChevronLeft,
    Pencil,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useBodyScrollLock from '../../../shared/hooks/useBodyScrollLock';
import { clearDriverAuthState, getCurrentDriver, readDriverCache, updateDriverProfile } from '../services/registrationService';

// Same placeholder photo as the Food user and delivery profiles.
const DEFAULT_AVATAR = '/assets/images/profile_avatar.webp';

// Soft coloured chip behind each menu icon (blue family first, a few accents like the reference design).
const ICON_TONES = {
    personal: 'bg-blue-50 text-blue-600',
    wallet: 'bg-emerald-50 text-emerald-600',
    bankDetails: 'bg-orange-50 text-orange-500',
    vehicle: 'bg-violet-50 text-violet-600',
    docs: 'bg-sky-50 text-sky-600',
    history: 'bg-indigo-50 text-indigo-600',
    notifications: 'bg-amber-50 text-amber-500',
    refer: 'bg-pink-50 text-pink-500',
    incentives: 'bg-teal-50 text-teal-600',
    sos: 'bg-rose-50 text-rose-500',
    help: 'bg-cyan-50 text-cyan-600',
    terms: 'bg-slate-100 text-slate-600',
    privacy: 'bg-slate-100 text-slate-600',
    refund: 'bg-slate-100 text-slate-600',
    deleteAccount: 'bg-rose-50 text-rose-500',
    fleet: 'bg-violet-50 text-violet-600',
    drivers: 'bg-blue-50 text-blue-600',
};

const unwrapDriver = (response) => response?.data?.data || response?.data || response || null;
const ROUTE_BOOKING_STORAGE_KEY = 'driver_route_booking_preferences';

const readRouteBookingPreferences = () => {
    try {
        const raw = localStorage.getItem(ROUTE_BOOKING_STORAGE_KEY);
        return raw ? JSON.parse(raw) : { enabled: false, coordinates: null, label: '' };
    } catch {
        return { enabled: false, coordinates: null, label: '' };
    }
};

const writeRouteBookingPreferences = (nextValue) => {
    localStorage.setItem(ROUTE_BOOKING_STORAGE_KEY, JSON.stringify(nextValue));
    return nextValue;
};

const formatRouteBookingLabel = (coordinates) => {
    if (!Array.isArray(coordinates) || coordinates.length !== 2) {
        return 'Receive requests from your selected area';
    }

    const [lng, lat] = coordinates;
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
        return 'Receive requests from your selected area';
    }

    return `On - requests near the spot you pinned (${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)})`;
};

const normalizeRouteBookingPreferences = (routeBooking = null) => {
    const coordinates = Array.isArray(routeBooking?.coordinates) && routeBooking.coordinates.length === 2
        ? routeBooking.coordinates
        : null;

    return {
        enabled: Boolean(routeBooking?.enabled && coordinates),
        coordinates,
        label: String(routeBooking?.label || (coordinates ? formatRouteBookingLabel(coordinates) : '')).trim(),
        updatedAt: routeBooking?.updatedAt || null,
    };
};

const normalizeBankDetails = (bankDetails = {}) => ({
    accountHolderName: String(bankDetails?.accountHolderName || '').trim(),
    upiId: String(bankDetails?.upiId || '').trim(),
    qrCodeImage: String(bankDetails?.qrCodeImage || '').trim(),
    accountNumber: String(bankDetails?.accountNumber || '').trim(),
    ifsc: String(bankDetails?.ifsc || '').trim().toUpperCase(),
    branchName: String(bankDetails?.branchName || '').trim(),
    updatedAt: bankDetails?.updatedAt || null,
});

const DriverProfile = () => {
    const navigate = useNavigate();
    const [routeBookingPreferences, setRouteBookingPreferences] = useState(() => readRouteBookingPreferences());
    const [isLogoutOpen, setIsLogoutOpen] = useState(false);
    const [legalModal, setLegalModal] = useState(null);
    // The page behind the policy sheet must not scroll while it is open.
    useBodyScrollLock(Boolean(legalModal));
    // Home already loaded the driver: show it at once, refresh quietly.
    const [driver, setDriver] = useState(() => readDriverCache('me') || null);
    const [isLoading, setIsLoading] = useState(() => !readDriverCache('me'));
    const [error, setError] = useState('');
    const [routeBookingBusy, setRouteBookingBusy] = useState(false);
    const role = localStorage.getItem('role') || 'driver';
    const isOwner = role === 'owner';
    const routePrefix = isOwner ? '/taxi/owner' : '/taxi/driver';

    useEffect(() => {
        let active = true;

        const loadDriver = async () => {
            setError('');

            try {
                const response = await getCurrentDriver();
                if (!active) return;
                const nextDriver = unwrapDriver(response);
                setDriver(nextDriver);
                const nextRouteBooking = normalizeRouteBookingPreferences(nextDriver?.routeBooking);
                setRouteBookingPreferences(writeRouteBookingPreferences(nextRouteBooking));
            } catch (err) {
                if (!active) return;
                setError(err?.message || 'Unable to load driver profile');
            } finally {
                if (active) {
                    setIsLoading(false);
                }
            }
        };

        loadDriver();

        return () => {
            active = false;
        };
    }, []);

    const openLegal = (type) => {
        const contentMap = {
            terms: {
                title: 'Terms and Conditions',
                Icon: FileText,
                description: 'General rules for using the Hello Parth platform.',
                content: `By using the Hello Parth platform, you agree to comply with all applicable transport regulations and our safety standards.

Key Highlights:
• Professionalism: Drivers and Staff must maintain a high standard of service.
• Vehicle Readiness: All vehicles listed must be in active, roadworthy condition.
• Compliance: You must ensure all permits and insurance are valid.
• Platform Fees: Hello Parth charges a service fee for every successful booking handled.
• Account Security: You are responsible for keeping your credentials and biometric data secure.`
            },
            privacy: {
                title: 'Privacy Policy',
                Icon: Shield,
                description: 'How we handle your data and biometrics.',
                content: `Hello Parth takes data security seriously. We collect specific information to ensure safety and service quality.

Data Collected:
• Biometrics: Fingerprint hashes are stored encrypted (AES-256) for verification only. Raw images are never stored permanently.
• Location: Live GPS tracking is used during active bookings for safety.
• Contact: Phone and email are used for booking updates and support.
• Vehicle Data: Inspection logs and photos are kept for insurance purposes.

We do not share your biometric data with third-party advertising networks.`
            },
            refund: {
                title: 'Refund Policy',
                Icon: HandCoins,
                description: 'Cancellation and refund guidelines.',
                content: `Transparent refund rules for customers and partners.

Booking Cancellations:
• Customer-initiated: Refund varies based on how close the pickup time is.
• Operator-initiated: If a vehicle fails inspection, a full refund is processed to the customer.
• Service Center Fees: Fees for inspections are non-refundable once the inspection report is generated.

Processing Time: Refunds are typically credited back to the original payment method within 5-7 working days.`
            }
        };
        setLegalModal(contentMap[type]);
    };

    const handleLogout = () => {
        clearDriverAuthState();
        setIsLogoutOpen(false);
        navigate(`${routePrefix}/login`, { replace: true });
    };

    // Dynamic Section Data with Project-mapped Paths
    const driverName = useMemo(() => {
        if (!driver?.name) return 'Driver';
        return String(driver.name);
    }, [driver?.name]);

    const driverPhone = useMemo(() => driver?.phone || 'N/A', [driver?.phone]);
    const driverEmail = useMemo(() => driver?.email || 'N/A', [driver?.email]);
    const driverVehicle = useMemo(() => {
        const parts = [driver?.registerFor, driver?.vehicleType].filter(Boolean);
        return parts.length > 0 ? parts.join(' - ') : 'N/A';
    }, [driver?.registerFor, driver?.vehicleType]);
    const driverLocation = useMemo(() => driver?.city || 'N/A', [driver?.city]);
    const driverZone = useMemo(() => driver?.zone?.name || 'N/A', [driver?.zone?.name]);
    const driverNumber = useMemo(() => driver?.vehicleNumber || 'N/A', [driver?.vehicleNumber]);
    const driverColor = useMemo(() => driver?.vehicleColor || 'N/A', [driver?.vehicleColor]);
    const driverRating = useMemo(() => Number(driver?.rating || 0), [driver?.rating]);
    const routeBookingSubtitle = useMemo(() => {
        if (!routeBookingPreferences.enabled) {
            return 'Off - requests come from your live location. Turn on to pin where you are now';
        }

        return routeBookingPreferences.label || formatRouteBookingLabel(routeBookingPreferences.coordinates);
    }, [routeBookingPreferences.coordinates, routeBookingPreferences.enabled, routeBookingPreferences.label]);
    const bankDetails = useMemo(() => normalizeBankDetails(driver?.bankDetails), [driver?.bankDetails]);
    const bankDetailsSubtitle = useMemo(() => {
        if (bankDetails.accountHolderName) return bankDetails.accountHolderName;
        if (bankDetails.upiId) return bankDetails.upiId;
        if (bankDetails.accountNumber) return `A/C ${bankDetails.accountNumber.slice(-4).padStart(bankDetails.accountNumber.length, '*')}`;
        return 'Add UPI, QR and bank account';
    }, [bankDetails.accountHolderName, bankDetails.accountNumber, bankDetails.upiId]);

    const hasProfileImage = Boolean(driver?.profileImage);
    const [avatarBroken, setAvatarBroken] = useState(false);
    useEffect(() => {
        setAvatarBroken(false);
    }, [driver?.profileImage]);
    const avatarSrc = hasProfileImage && !avatarBroken ? driver.profileImage : DEFAULT_AVATAR;

    const openBankDetails = () => {
        navigate(`${routePrefix}/profile/bank-details`);
    };

    const handleRouteBookingToggle = async () => {
        if (routeBookingBusy) {
            return;
        }

        if (routeBookingPreferences.enabled) {
            setRouteBookingBusy(true);
            setError('');
            try {
                const response = await updateDriverProfile({
                    routeBooking: {
                        enabled: false,
                    },
                });
                const nextRouteBooking = normalizeRouteBookingPreferences(
                    unwrapDriver(response)?.routeBooking || { enabled: false },
                );
                setRouteBookingPreferences(writeRouteBookingPreferences(nextRouteBooking));
            } catch (err) {
                setError(err?.response?.data?.message || err?.message || 'Could not update route booking.');
            } finally {
                setRouteBookingBusy(false);
            }
            return;
        }

        if (!navigator.geolocation) {
            setError('Location is not available on this device.');
            return;
        }

        setRouteBookingBusy(true);
        setError('');

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const nextCoordinates = [position.coords.longitude, position.coords.latitude];
                const nextLabel = formatRouteBookingLabel(nextCoordinates);

                try {
                    const response = await updateDriverProfile({
                        routeBooking: {
                            enabled: true,
                            coordinates: nextCoordinates,
                            label: nextLabel,
                        },
                    });
                    const nextRouteBooking = normalizeRouteBookingPreferences(
                        unwrapDriver(response)?.routeBooking || {
                            enabled: true,
                            coordinates: nextCoordinates,
                            label: nextLabel,
                        },
                    );
                    setRouteBookingPreferences(writeRouteBookingPreferences(nextRouteBooking));
                } catch (err) {
                    setError(err?.response?.data?.message || err?.message || 'Could not update route booking.');
                } finally {
                    setRouteBookingBusy(false);
                }
            },
            () => {
                setRouteBookingBusy(false);
                setError('Please allow location permission to enable route booking.');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
        );
    };

    const sections = [
        ...(isOwner ? [{
            title: 'Fleet Management',
            items: [
                { id: 'fleet', label: 'Manage Fleet', icon: <Car size={20} />, path: `${routePrefix}/vehicle-fleet` },
                { id: 'drivers', label: 'Manage Drivers', icon: <UserPlus size={20} />, path: `${routePrefix}/manage-drivers` },
            ]
        }] : []),
        {
            title: 'Your Account',
            items: [
                { id: 'personal', label: 'Personal Information', sub: 'Name, phone, email, photo', icon: <User size={20} />, path: `${routePrefix}/edit-profile` },
                { id: 'wallet', label: 'Wallet', sub: 'Balance and earnings', icon: <Wallet size={20} />, path: `${routePrefix}/wallet` },
                { id: 'bankDetails', label: 'Bank Details', sub: bankDetailsSubtitle, icon: <Landmark size={20} />, action: openBankDetails },
                ...(!isOwner ? [
                    { id: 'vehicle', label: 'My Vehicle', sub: 'Your vehicle details', icon: <Car size={20} />, path: `${routePrefix}/vehicle-fleet` },
                ] : []),
                { id: 'docs', label: 'Documents', sub: 'Your uploaded documents', icon: <FileText size={20} />, path: `${routePrefix}/documents` },
                { id: 'history', label: 'Ride History', sub: 'Your past trips', icon: <History size={20} />, path: `${routePrefix}/history` },
                { id: 'notifications', label: 'Notifications', sub: 'Alerts and updates', icon: <Bell size={20} />, path: `${routePrefix}/notifications` },
            ]
        },
        {
            title: 'Benefits',
            items: [
                { id: 'refer', label: 'Refer & Earn', icon: <Gift size={20} />, path: `${routePrefix}/referral` },
                ...(!isOwner ? [{ id: 'incentives', label: 'Incentives', icon: <BadgePercent size={20} />, path: `${routePrefix}/incentives` }] : []),
                ...(!isOwner ? [{ id: 'sos', label: 'Emergency SOS', icon: <Shield size={20} />, path: `${routePrefix}/security` }] : []),
            ]
        },
        {
            title: 'Legal & Support',
            items: [
                { id: 'help', label: 'Help & Support', icon: <Info size={20} />, path: `${routePrefix}/help-support` },
                { id: 'terms', label: 'Terms & Conditions', icon: <FileText size={20} />, action: () => openLegal('terms') },
                { id: 'privacy', label: 'Privacy Policy', icon: <Shield size={20} />, action: () => openLegal('privacy') },
                { id: 'refund', label: 'Refund Policy', icon: <HandCoins size={20} />, action: () => openLegal('refund') },
            ]
        },
        {
            title: 'Danger Zone',
            items: [
                { id: 'deleteAccount', label: 'Delete Account', icon: <LogOut size={20} />, path: `${routePrefix}/delete-account` },
            ]
        }
    ];

    return (
        <div className="min-h-screen bg-white font-sans select-none overflow-x-hidden pb-32">
            {/* Hero: blue gradient with a soft swoosh and a wave edge; the photo sits on the wave (reference design) */}
            <div
                className="relative text-white"
                style={{ background: 'linear-gradient(110deg, #0e2a7a 0%, #1e4fd0 52%, #3d84f5 100%)' }}
            >
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 400 160" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M190 0 C230 40 262 70 330 80 C370 86 390 96 400 110 L400 0 Z" fill="rgba(255,255,255,0.10)" />
                    <path d="M290 0 C300 30 332 50 400 52 L400 0 Z" fill="rgba(255,255,255,0.08)" />
                </svg>
                <div
                    className="relative flex items-start gap-2 px-4 pb-16"
                    style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)' }}
                >
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white active:scale-90"
                        aria-label="Back"
                    >
                        <ChevronLeft size={28} strokeWidth={2.2} />
                    </button>
                    <div className="pt-0.5">
                        <h2 className="text-[28px] font-bold leading-tight">Profile</h2>
                        <p className="mt-1 text-[13px] font-medium text-white/85">Your information, your way</p>
                    </div>
                </div>
                {/* The white runs 1px past the hero's bottom (the hero is deliberately not overflow-hidden): two
                    anti-aliased edges on the same fractional pixel left a hairline behind the name on phones. */}
                <svg className="absolute -bottom-px left-0 block h-[56px] w-full" viewBox="0 0 400 56" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M0 56 V30 C70 22 150 30 230 26 C305 22 355 6 400 0 V56 Z" fill="rgba(255,255,255,0.28)" />
                    <path d="M0 56 V40 C80 32 160 44 240 36 C310 29 360 18 400 12 V56 Z" fill="#ffffff" />
                </svg>
            </div>

            <div className="relative z-10 -mt-[56px] flex items-start gap-4 px-5">
                <div className="relative shrink-0">
                    <div className="h-[96px] w-[96px] rounded-full bg-white p-1 shadow-[0_10px_24px_rgba(14,42,122,0.22)]">
                        <img
                            src={avatarSrc}
                            alt={driverName}
                            onError={() => setAvatarBroken(true)}
                            className="h-full w-full rounded-full object-cover"
                            draggable={false}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate(`${routePrefix}/edit-profile`)}
                        aria-label="Edit profile"
                        className="absolute bottom-1 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6] text-white shadow-md active:scale-90"
                    >
                        <Pencil size={14} strokeWidth={2.5} />
                    </button>
                </div>
                <div className="min-w-0 flex-1 pt-[44px]">
                    <p className="truncate text-[22px] font-bold leading-tight text-[#0f1b4c]">
                        {isLoading ? 'Loading...' : driverName}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                        <Star size={15} className="text-amber-400" fill="currentColor" />
                        <span className="text-[13px] font-medium text-slate-500">{driverRating > 0 ? `${driverRating.toFixed(1)} Rating` : 'New - no ratings yet'}</span>
                    </div>
                </div>
            </div>

            <div className="mx-4 mt-5 rounded-[22px] bg-white p-1.5 shadow-[0_8px_30px_rgba(14,42,122,0.10)] ring-1 ring-slate-100">
                {error ? (
                    <p className="p-3 text-[11px] font-medium text-rose-500">{error}</p>
                ) : (
                    [
                        [
                            { label: 'Phone', value: driverPhone, Icon: Phone },
                            { label: 'Email', value: driverEmail, Icon: Mail },
                        ],
                        [
                            { label: 'City', value: driverLocation, Icon: MapPin },
                            { label: 'Zone', value: driverZone, Icon: MapPinned },
                            { label: 'Color', value: driverColor, Icon: Palette },
                        ],
                        [
                            { label: 'Vehicle Type', value: driverVehicle, Icon: Car },
                            { label: 'Vehicle No.', value: driverNumber, Icon: Hash },
                        ],
                    ].map((row, rowIndex) => (
                        <div
                            key={rowIndex}
                            // first row: the email gets the wider half, so it fits on 360px phones too
                            className={`grid ${row.length === 3 ? 'grid-cols-3' : rowIndex === 0 ? 'grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]' : 'grid-cols-2'} ${rowIndex > 0 ? 'border-t border-slate-100' : ''}`}
                        >
                            {row.map(({ label, value, Icon }, cellIndex) => (
                                <div
                                    key={label}
                                    className={`flex min-w-0 items-center gap-2 px-2.5 py-3 ${cellIndex > 0 ? 'border-l border-slate-100' : ''}`}
                                >
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                                        <Icon size={15} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-medium text-slate-400">{label}</p>
                                        <p className="truncate text-[12px] font-semibold text-slate-900" title={value}>{value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))
                )}
            </div>

            {/* List Menu */}
            <main className="space-y-1">
                {sections.map((section, sIdx) => (
                    <div key={sIdx} className="pt-6">
                        <h3 className="px-6 text-[12px] font-bold uppercase tracking-[0.16em] text-[#5a6b8f] mb-1">{section.title}</h3>
                        <div>
                            {section.items.map((item, itemIndex) => (
                                <Motion.motion.div
                                    key={item.id}
                                    whileTap={item.type !== 'toggle' ? { backgroundColor: '#F5F8FF' } : {}}
                                    onClick={() => {
                                        if (item.action) item.action();
                                        else if (item.path) navigate(item.path, item.state ? { state: item.state } : undefined);
                                    }}
                                    className="group flex cursor-pointer items-center gap-4 pl-6 pr-5"
                                >
                                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${ICON_TONES[item.id] || 'bg-blue-50 text-blue-600'}`}>
                                        {item.icon}
                                    </div>
                                    {/* the divider starts at the text, like the reference */}
                                    <div className={`flex min-w-0 flex-1 items-center justify-between gap-3 py-4 ${itemIndex < section.items.length - 1 ? 'border-b border-slate-100' : ''}`}>
                                        <div className="min-w-0">
                                            <h4 className="text-[15px] font-semibold tracking-tight text-[#0f1b4c]">{item.label}</h4>
                                            {item.sub && <p className="mt-0.5 truncate text-[12px] font-medium text-slate-400">{item.sub}</p>}
                                        </div>
                                        {item.type === 'toggle' ? (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleRouteBookingToggle(); }}
                                                disabled={routeBookingBusy}
                                                className={`w-10 h-5.5 rounded-full relative transition-colors duration-300 ${routeBookingPreferences.enabled ? 'bg-slate-900' : 'bg-slate-200'} ${routeBookingBusy ? 'opacity-70' : ''}`}
                                            >
                                                <Motion.motion.div
                                                    animate={{ x: routeBookingPreferences.enabled ? 20 : 2 }}
                                                    className="absolute top-1 w-3.5 h-3.5 rounded-full bg-white shadow-sm"
                                                />
                                            </button>
                                        ) : (
                                            <ChevronRight size={18} className="shrink-0 text-slate-400" />
                                        )}
                                    </div>
                                </Motion.motion.div>
                            ))}
                        </div>
                    </div>
                ))}
            </main>

            {/* Owner Support Section */}
            <div className="px-6 py-4 mt-6">
                <div className="rounded-[28px] border border-slate-100 bg-slate-50/50 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <h3 className="text-[13px] font-bold text-slate-900 uppercase tracking-wider">Owner Support</h3>
                    </div>

                    <div className="space-y-5">
                        <a href="mailto:helloparthg@gmail.com" className="flex items-center gap-4 group">
                            <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-emerald-500 transition-colors shadow-sm">
                                <Mail size={18} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email Support</p>
                                <p className="text-[14px] font-bold text-slate-800">helloparthg@gmail.com</p>
                            </div>
                        </a>

                        <a href="tel:9193911911" className="flex items-center gap-4 group">
                            <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-sky-500 transition-colors shadow-sm">
                                <Phone size={18} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Call Support</p>
                                <p className="text-[14px] font-bold text-slate-800">91-93-911-911</p>
                            </div>
                        </a>
                    </div>
                </div>
            </div>

            {/* Sign Out Section */}
            <div className="px-6 py-6">
                <button
                    onClick={() => setIsLogoutOpen(true)}
                    className="flex items-center gap-3 text-rose-500 font-bold text-[13px] active:translate-x-1 transition-transform"
                >
                    <LogOut size={16} strokeWidth={2.5} />
                    Logout from Account
                </button>
            </div>


            <AnimatePresence>
                {isLogoutOpen && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 px-5 backdrop-blur-sm">
                        <Motion.motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 12 }}
                            className="w-full max-w-xs rounded-[28px] bg-white p-6 shadow-2xl border border-slate-100"
                        >
                            <div className="space-y-2 text-center">
                                <h3 className="text-[18px] font-bold text-slate-900 tracking-tight">Logout</h3>
                                <p className="text-[13px] font-medium text-slate-500">
                                    Are you sure you want to logout?
                                </p>
                            </div>

                            <div className="mt-6 grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setIsLogoutOpen(false)}
                                    className="h-12 rounded-2xl border border-slate-200 text-slate-700 font-bold text-[13px]"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleLogout}
                                    className="h-12 rounded-2xl bg-rose-500 text-white font-bold text-[13px]"
                                >
                                    Logout
                                </button>
                            </div>
                        </Motion.motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Legal Modal */}
            <AnimatePresence>
                {legalModal && (
                    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 backdrop-blur-sm px-4 pb-8 sm:items-center sm:pb-0">
                        <Motion.motion.div
                            initial={{ opacity: 0, y: 100 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 100 }}
                            className="w-full max-w-lg overflow-hidden rounded-[32px] bg-white shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-8">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-slate-50 text-slate-900 shadow-sm border border-slate-100">
                                        <legalModal.Icon size={28} />
                                    </div>
                                    <button
                                        onClick={() => setLegalModal(null)}
                                        className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="mt-6">
                                    <h3 className="text-2xl font-bold text-slate-950">{legalModal.title}</h3>
                                    <p className="mt-1 text-sm font-medium text-slate-500">{legalModal.description}</p>
                                </div>

                                <div className="mt-8 max-h-[40vh] overflow-y-auto pr-2">
                                    <div className="whitespace-pre-line text-sm leading-7 text-slate-700 font-medium">
                                        {legalModal.content}
                                    </div>
                                </div>

                                <button
                                    onClick={() => setLegalModal(null)}
                                    className="mt-8 w-full rounded-2xl bg-slate-950 py-4 text-sm font-bold text-white shadow-xl shadow-slate-200 transition hover:bg-slate-800 active:scale-95"
                                >
                                    Understood
                                </button>
                            </div>
                        </Motion.motion.div>
                        <div className="absolute inset-0 -z-10" onClick={() => setLegalModal(null)} />
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default DriverProfile;
