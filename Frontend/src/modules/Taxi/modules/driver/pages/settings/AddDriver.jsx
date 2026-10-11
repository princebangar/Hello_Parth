import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, UserPlus, CheckCircle2, ChevronRight, Upload, X, ShieldCheck, Mail, Phone, MapPin, IndianRupee } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { createOwnerFleetDriver, getDriverDocumentTemplates, getOwnerFleetDrivers, getOwnerFleetVehicles, getOwnerFleetZones, updateOwnerFleetDriver } from '../../services/registrationService';
import { normalizeDriverDocumentTemplates } from '../../utils/documentTemplates';
import FleetDocumentFields, { buildFleetDocumentsPayload, validateFleetDocumentInputs } from '../../components/FleetDocumentFields';

const AddDriver = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { driverId } = useParams();
    const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
    const isEditMode = Boolean(driverId);
    const [submitting, setSubmitting] = useState(false);
    const [loadingDriver, setLoadingDriver] = useState(false);
    const [loadingVehicles, setLoadingVehicles] = useState(false);
    const [loadingZones, setLoadingZones] = useState(false);
    const [error, setError] = useState('');
    const [fleetVehicles, setFleetVehicles] = useState([]);
    const [fleetZones, setFleetZones] = useState([]);
    const [step, setStep] = useState(1); // 1: Details, 2: Documents, 3: Success
    // Every step opens from the top (the previous step's scroll position used to stay).
    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }, [step]);
    // A half-filled "add driver" form survives a refresh (files cannot be stored, so they are picked again).
    const DRAFT_KEY = 'helloparth:addDriverDraft';
    const readDraft = () => {
        if (driverId) return {};
        try {
            return JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || '{}') || {};
        } catch {
            return {};
        }
    };
    const [formData, setFormData] = useState(() => ({
        name: '',
        mobile: '',
        email: '',
        address: '',
        salary: '',
        assignedFleetVehicleId: '',
        zoneId: '',
        ...readDraft(),
        documents: {},
    }));
    // The papers to collect come from Admin > Fleet Needed Documents (driver papers); number / expiry per template.
    const [documentTemplates, setDocumentTemplates] = useState([]);
    const [templatesLoading, setTemplatesLoading] = useState(true);
    const [documentMeta, setDocumentMeta] = useState({});

    useEffect(() => {
        if (isEditMode) return undefined;
        let active = true;
        getDriverDocumentTemplates('fleet_driver')
            .then((response) => {
                if (!active) return;
                const results = response?.data?.data?.results || response?.data?.results || [];
                setDocumentTemplates(normalizeDriverDocumentTemplates(results));
            })
            .catch(() => active && setError((current) => current || 'Could not load the document list'))
            .finally(() => active && setTemplatesLoading(false));
        return () => { active = false; };
    }, [isEditMode]);

    useEffect(() => {
        if (isEditMode) return;
        const { documents: _documents, ...textFields } = formData;
        try {
            window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(textFields));
        } catch {
            /* storage blocked: the form just is not remembered */
        }
    }, [formData, isEditMode]);

    useEffect(() => {
        if (!isEditMode) return;

        const stateDriver = location.state?.driver;
        if (stateDriver && String(stateDriver.id) === String(driverId)) {
            setFormData((prev) => ({
                ...prev,
                name: stateDriver.name || '',
                mobile: stateDriver.phone || '',
                email: stateDriver.email || '',
                address: stateDriver.address || '',
                salary: stateDriver.salary ? String(stateDriver.salary) : '',
                assignedFleetVehicleId: stateDriver.assignedVehicle?.vehicleId || '',
                zoneId: stateDriver.zone?.zoneId || '',
            }));
            return;
        }

        let active = true;
        setLoadingDriver(true);
        setError('');

        getOwnerFleetDrivers()
            .then((response) => {
                if (!active) return;
                const payload = response?.data?.data || response?.data || response;
                const match = (payload?.results || []).find((item) => String(item.id || item._id) === String(driverId));
                if (!match) {
                    setError('Driver not found.');
                    return;
                }

                setFormData((prev) => ({
                    ...prev,
                    name: match.name || '',
                    mobile: match.phone || '',
                    email: match.email || '',
                    address: match.city || '',
                    salary: match.salary ? String(match.salary) : '',
                    assignedFleetVehicleId: match.assignedVehicle?.vehicleId || '',
                    zoneId: match.zone?.zoneId || '',
                }));
            })
            .catch((err) => {
                if (!active) return;
                setError(err?.message || 'Unable to load driver details');
            })
            .finally(() => {
                if (active) setLoadingDriver(false);
            });

        return () => {
            active = false;
        };
    }, [driverId, isEditMode, location.state]);

    useEffect(() => {

        let active = true;
        setLoadingVehicles(true);

        getOwnerFleetVehicles()
            .then((response) => {
                if (!active) return;
                const payload = response?.data?.data || response?.data || response;
                setFleetVehicles(Array.isArray(payload?.results) ? payload.results : []);
            })
            .catch((err) => {
                if (!active) return;
                setError((current) => current || err?.message || 'Unable to load owner vehicles');
            })
            .finally(() => {
                if (active) setLoadingVehicles(false);
            });

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {

        let active = true;
        setLoadingZones(true);

        getOwnerFleetZones()
            .then((response) => {
                if (!active) return;
                const payload = response?.data?.data || response?.data || response;
                setFleetZones(Array.isArray(payload?.results) ? payload.results : []);
            })
            .catch((err) => {
                if (!active) return;
                setError((current) => current || err?.message || 'Unable to load owner zones');
            })
            .finally(() => {
                if (active) setLoadingZones(false);
            });

        return () => {
            active = false;
        };
    }, []);

    const handleFileUpload = (fieldKey, file) => {
        if (file) setFormData((p) => ({ ...p, documents: { ...(p.documents || {}), [fieldKey]: file } }));
    };
    const clearFile = (fieldKey) => setFormData((p) => {
        const next = { ...(p.documents || {}) };
        delete next[fieldKey];
        return { ...p, documents: next };
    });
    const documentError = templatesLoading ? 'Loading' : validateFleetDocumentInputs(documentTemplates, formData.documents || {}, documentMeta);

    const returnTo = useMemo(
        () =>
            typeof location.state?.returnTo === 'string' && location.state.returnTo.trim()
                ? location.state.returnTo.trim()
                : `${routePrefix}/manage-drivers`,
        [location.state?.returnTo]
    );

    const availableVehicles = useMemo(
        () =>
            fleetVehicles.filter((vehicle) => {
                const assignedDriverId = vehicle?.assignedDriver?.id;
                return !assignedDriverId || String(assignedDriverId) === String(driverId);
            }),
        [driverId, fleetVehicles]
    );

    const handleSubmit = async () => {
        if (submitting) {
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            const payload = {
                name: formData.name,
                phone: formData.mobile,
                email: formData.email,
                address: formData.address,
                city: formData.address,
                salary: Number(formData.salary || 0),
                assignedFleetVehicleId: formData.assignedFleetVehicleId || '',
                zoneId: formData.zoneId || '',
            };

            if (!isEditMode) {
                payload.documents = await buildFleetDocumentsPayload(documentTemplates, formData.documents || {}, documentMeta, {}, 'driver-documents');
            }

            if (isEditMode) {
                await updateOwnerFleetDriver(driverId, payload);
            } else {
                await createOwnerFleetDriver(payload);
            }

            try {
                window.sessionStorage.removeItem(DRAFT_KEY);
            } catch {
                /* ignore */
            }
            setStep(3);

            setTimeout(() => {
                navigate(returnTo, { replace: true });
            }, 5000);
        } catch (err) {
            setError(err?.message || 'Failed to submit driver request');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-white font-sans p-5 pt-8 select-none overflow-x-clip pb-32">
            <header className="sticky top-0 z-30 -mx-5 mb-6 flex items-center justify-between bg-white px-5 py-3">
                <button onClick={() => (step === 2 ? setStep(1) : navigate(-1))} className="w-9 h-9 bg-slate-50 rounded-lg flex items-center justify-center text-slate-900 active:scale-95 transition-transform">
                    <ArrowLeft size={18} strokeWidth={2.5} />
                </button>
                <div className="flex gap-1">
                    {[1, 2, 3].map(s => (
                        <div key={s} className={`w-6 h-1 rounded-full transition-all ${step >= s ? 'bg-slate-900' : 'bg-slate-100'}`} />
                    ))}
                </div>
            </header>

            <main className="max-w-sm mx-auto">
                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div 
                            key="step1"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            <div className="space-y-1.5">
                                <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase">{isEditMode ? 'Edit Driver' : 'Driver Details'}</h1>
                                <p className="text-[11px] font-bold text-slate-400 opacity-80 uppercase tracking-widest leading-relaxed">{isEditMode ? 'Update fleet driver information and monthly salary' : 'Register a new driver for your fleet and set monthly salary'}</p>
                            </div>

                            <div className="space-y-4">
                                {loadingDriver ? (
                                    <p className="text-[11px] font-bold text-slate-400">Loading driver details...</p>
                                ) : null}
                                {error ? (
                                    <p className="text-[11px] font-bold text-rose-500">{error}</p>
                                ) : null}
                                <div className="bg-slate-50 p-3.5 rounded-2xl shadow-sm">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Full Name</label>
                                    <input 
                                        value={formData.name}
                                        onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                                        placeholder="Enter driver's name"
                                        className="w-full bg-transparent border-none p-0 text-[15px] font-semibold text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-300"
                                    />
                                </div>

                                <div className="bg-slate-50 p-3.5 rounded-2xl shadow-sm">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 flex items-center gap-1.5"><Phone size={10} /> Mobile Number</label>
                                    <input 
                                        value={formData.mobile}
                                        onChange={(e) => setFormData(p => ({ ...p, mobile: e.target.value.replace(/\D/g, '') }))}
                                        placeholder="10-digit mobile number"
                                        maxLength={10}
                                        className="w-full bg-transparent border-none p-0 text-[15px] font-semibold text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-300"
                                    />
                                </div>

                                <div className="bg-slate-50 p-3.5 rounded-2xl shadow-sm">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 flex items-center gap-1.5"><Mail size={10} /> Email Address</label>
                                    <input 
                                        value={formData.email}
                                        onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                                        placeholder="driver@example.com"
                                        className="w-full bg-transparent border-none p-0 text-[15px] font-semibold text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-300"
                                    />
                                </div>

                                <div className="bg-slate-50 p-3.5 rounded-2xl shadow-sm">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 flex items-center gap-1.5"><MapPin size={10} /> Address</label>
                                    <textarea 
                                        rows={2}
                                        value={formData.address}
                                        onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))}
                                        placeholder="Full residential address"
                                        className="w-full bg-transparent border-none p-0 text-[15px] font-semibold text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-300 resize-none"
                                    />
                                </div>

                                <div className="bg-slate-50 p-3.5 rounded-2xl shadow-sm">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 flex items-center gap-1.5"><IndianRupee size={10} /> Monthly Salary</label>
                                    <input
                                        value={formData.salary}
                                        onChange={(e) => setFormData(p => ({ ...p, salary: e.target.value.replace(/[^\d.]/g, '') }))}
                                        placeholder="Enter monthly salary"
                                        inputMode="decimal"
                                        className="w-full bg-transparent border-none p-0 text-[15px] font-semibold text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-300"
                                    />
                                </div>

                                {(
                                    <div className="bg-slate-50 p-3.5 rounded-2xl shadow-sm">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Assigned Vehicle</label>
                                        <select
                                            value={formData.assignedFleetVehicleId}
                                            onChange={(e) => setFormData((p) => ({ ...p, assignedFleetVehicleId: e.target.value }))}
                                            disabled={loadingVehicles}
                                            className="w-full bg-transparent border-none p-0 text-[15px] font-semibold text-slate-900 focus:outline-none focus:ring-0"
                                        >
                                            <option value="">No vehicle assigned</option>
                                            {availableVehicles.map((vehicle) => {
                                                const optionId = String(vehicle.id || vehicle._id || '');
                                                const optionLabel = [
                                                    vehicle.car_brand,
                                                    vehicle.car_model,
                                                    vehicle.license_plate_number,
                                                ].filter(Boolean);

                                                return (
                                                    <option key={optionId} value={optionId}>
                                                        {optionLabel.join(' - ') || 'Unnamed vehicle'}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                        <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                            {loadingVehicles ? 'Loading fleet vehicles...' : 'Only this owner\'s unassigned vehicles are shown here.'}
                                        </p>
                                    </div>
                                )}

                                {(
                                    <div className="bg-slate-50 p-3.5 rounded-2xl shadow-sm">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Assigned Zone</label>
                                        <select
                                            value={formData.zoneId}
                                            onChange={(e) => setFormData((p) => ({ ...p, zoneId: e.target.value }))}
                                            disabled={loadingZones}
                                            className="w-full bg-transparent border-none p-0 text-[15px] font-semibold text-slate-900 focus:outline-none focus:ring-0"
                                        >
                                            <option value="">No zone assigned</option>
                                            {fleetZones.map((zone) => {
                                                const optionId = String(zone.id || zone._id || '');
                                                return (
                                                    <option key={optionId} value={optionId}>
                                                        {zone.name || 'Unnamed zone'}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                        <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                            {loadingZones ? 'Loading zones...' : 'Only zones under this owner service location are shown here.'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="fixed bottom-0 left-0 right-0 p-5 bg-white border-t border-slate-50">
                                <button 
                                    onClick={() => {
                                        if (isEditMode) {
                                            handleSubmit();
                                            return;
                                        }
                                        setStep(2);
                                    }}
                                    disabled={submitting || loadingDriver || !formData.name || !formData.mobile}
                                    className={`w-full h-14 rounded-2xl flex items-center justify-center gap-2 text-[13px] font-black uppercase tracking-widest shadow-lg transition-all ${
                                        (formData.name && formData.mobile && !loadingDriver) 
                                        ? 'bg-slate-900 text-white shadow-slate-900/10' 
                                        : 'bg-slate-100 text-slate-300 pointer-events-none'
                                    }`}
                                >
                                    {isEditMode ? 'Save Driver' : 'Next: Documents'} {!isEditMode ? <ChevronRight size={16} strokeWidth={3} /> : <UserPlus size={16} strokeWidth={3} />}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div 
                            key="step2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            <div className="space-y-1.5">
                                <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase">Documents</h1>
                                <p className="text-[11px] font-bold text-slate-400 opacity-80 uppercase tracking-widest leading-relaxed">Documents asked by the admin</p>
                            </div>

                            <div className="space-y-5">
                                {error ? (
                                    <p className="text-[11px] font-bold text-rose-500">{error}</p>
                                ) : null}
                                {templatesLoading ? (
                                    <p className="text-[11px] font-bold text-slate-400">Loading the document list...</p>
                                ) : (
                                    <FleetDocumentFields
                                        templates={documentTemplates}
                                        files={formData.documents}
                                        meta={documentMeta}
                                        onFile={handleFileUpload}
                                        onClear={clearFile}
                                        onMeta={(templateId, field, value) => setDocumentMeta((prev) => ({ ...prev, [templateId]: { ...(prev[templateId] || {}), [field]: value } }))}
                                    />
                                )}
                            </div>

                            <div className="fixed bottom-0 left-0 right-0 p-5 bg-white border-t border-slate-50">
                                <button 
                                    onClick={handleSubmit}
                                    disabled={submitting || Boolean(documentError)}
                                    className={`w-full h-14 rounded-2xl flex items-center justify-center gap-2 text-[13px] font-black uppercase tracking-widest shadow-lg transition-all ${
                                        !documentError
                                        ? 'bg-slate-900 text-white shadow-slate-900/10' 
                                        : 'bg-slate-100 text-slate-300 pointer-events-none'
                                    }`}
                                >
                                    {submitting ? 'Submitting...' : 'Register Driver'} <UserPlus size={16} strokeWidth={3} />
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div 
                            key="step3"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center justify-center space-y-8 pt-20"
                        >
                            <div className="w-24 h-24 bg-emerald-500 rounded-[2.5rem] flex items-center justify-center text-white shadow-emerald-500/20 shadow-2xl relative">
                                <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 2 }}><CheckCircle2 size={40} /></motion.div>
                            </div>

                            <div className="text-center space-y-3">
                                <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Pending!</h1>
                                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-[0.2em] leading-relaxed px-10">
                                    {isEditMode ? 'Driver details updated successfully.' : <>Driver details sent to admin. Status will update in <span className="text-slate-900">5 seconds</span>.</>}
                                </p>
                            </div>

                            <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <motion.div 
                                    initial={{ width: "0%" }}
                                    animate={{ width: "100%" }}
                                    transition={{ duration: 5, ease: "linear" }}
                                    className="h-full bg-emerald-500"
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
};

export default AddDriver;
