import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BusFront, ChevronRight, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  clearDriverRegistrationSession,
  completeDriverOnboarding,
  getDriverOnboardingSignupOptions,
  getStoredDriverRegistrationSession,
  persistDriverAuthSession,
  saveDriverOnboardingRoleDetails,
  saveDriverRegistrationSession,
  toPlainData,
} from '../../services/registrationService';

const unwrap = (response) => response?.data?.data || response?.data || response;

const ROLE_META = {
  bus_driver: {
    Icon: BusFront,
    color: 'text-blue-600',  
  },
};

const ROLE_STEPS = {
  bus_driver: [
    {
      key: 'bus-flow',
      badge: 'Step 2 of 4',
      title: 'Choose Bus Flow',
      subtitle: 'Join an existing bus service or create a new one with the full builder.',
    },
    {
      key: 'note',
      badge: 'Step 3 of 4',
      title: 'Add Request Note',
      subtitle: 'Tell the admin anything helpful before they review your signup.',
    },
    {
      key: 'review',
      badge: 'Step 4 of 4',
      title: 'Review & Submit',
      subtitle: 'Check your bus details and send the request.',
    },
  ],
};

const RoleSpecificOnboarding = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const session = getStoredDriverRegistrationSession();
  const role = String(session.role || '').toLowerCase();
  const meta = ROLE_META[role];
  const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);
  const registrationId = String(session.registrationId || '').trim();
  const steps = ROLE_STEPS[role] || [];

  const finishedRef = useRef(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState({
    busServices: [],
  });
  const [formData, setFormData] = useState(() => ({
    busSignupMode: session.roleDetails?.createNewBus ? 'create' : session.roleDetails?.busServiceId ? 'existing' : '',
    busServiceId: session.roleDetails?.busServiceId || '',
    requestNote: session.roleDetails?.requestNote || '',
    operatorName: session.roleDetails?.operatorName || '',
    busName: session.roleDetails?.busName || '',
    serviceNumber: session.roleDetails?.serviceNumber || '',
    originCity: session.roleDetails?.originCity || '',
    destinationCity: session.roleDetails?.destinationCity || '',
  }));
  const [stepIndex, setStepIndex] = useState(() => {
    if (typeof session.roleSignupStep === 'number' && session.roleSignupStep >= 0) {
      return session.roleSignupStep;
    }

    if (role === 'bus_driver') {
      if (session.roleDetails?.createNewBus && session.roleDetails?.busDraft) {
        return session.roleDetails?.requestNote ? 2 : 1;
      }
      if (session.roleDetails?.busServiceId) {
        return session.roleDetails?.requestNote ? 2 : 1;
      }
      return 0;
    }

    return 0;
  });

  useEffect(() => {
    if (finishedRef.current) {
      return undefined;
    }

    if (!phone || !registrationId || !meta) {
      navigate(`${routePrefix}/login`, { replace: true });
      return undefined;
    }

    let active = true;

    const loadOptions = async () => {
      try {
        setLoadingOptions(true);
        const response = await getDriverOnboardingSignupOptions();
        if (!active) return;
        setOptions(unwrap(response));
      } catch (requestError) {
        if (!active) return;
        setError(requestError?.message || 'Unable to load signup options');
      } finally {
        if (active) {
          setLoadingOptions(false);
        }
      }
    };

    loadOptions();
    return () => {
      active = false;
    };
  }, [meta, navigate, phone, registrationId, routePrefix]);

  useEffect(() => {
    if (finishedRef.current) {
      return;
    }

    saveDriverRegistrationSession({
      ...session,
      roleDetails: {
        ...(session.roleDetails || {}),
        ...formData,
      },
      roleSignupStep: stepIndex,
    });
  }, [formData, session, stepIndex]);

  const filteredBusServices = useMemo(() => {
    const term = String(search || '').trim().toLowerCase();
    const items = Array.isArray(options.busServices) ? options.busServices : [];
    if (!term) return items;
    return items.filter((item) =>
      [item.operatorName, item.busName, item.serviceNumber, item.routeName, item.originCity, item.destinationCity]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [options.busServices, search]);

  const createdBusDraft = session?.roleDetails?.busDraft || null;

  const selectedBusService = useMemo(
    () =>
      (options.busServices || []).find((item) => String(item.id) === String(formData.busServiceId)) || null,
    [formData.busServiceId, options.busServices],
  );

  const canCreateBusDraft = Boolean(
    String(createdBusDraft?.operatorName || '').trim()
      && String(createdBusDraft?.busName || '').trim()
      && String(createdBusDraft?.route?.originCity || '').trim()
      && String(createdBusDraft?.route?.destinationCity || '').trim(),
  );

  const currentStep = steps[stepIndex] || steps[0] || null;
  const isLastStep = stepIndex === steps.length - 1;
  const isBusDriverCreateMode = role === 'bus_driver' && formData.busSignupMode === 'create';

  const headerTitle =
    role === 'bus_driver' && stepIndex === 0
      ? !formData.busSignupMode
        ? 'Choose Bus Flow'
        : formData.busSignupMode === 'create'
          ? 'Create Bus Service'
          : 'Join Existing Bus'
      : currentStep?.title || '';
  const headerSubtitle =
    role === 'bus_driver' && stepIndex === 0
      ? !formData.busSignupMode
        ? 'Choose whether this driver joins an existing bus service or creates a new one.'
        : formData.busSignupMode === 'create'
          ? 'Open the full bus builder and use the same admin-style flow for layout, route, and schedules.'
          : 'Search and select the bus service you want to join.'
      : currentStep?.subtitle || '';

  const canSubmit = isBusDriverCreateMode
    ? canCreateBusDraft
    : Boolean(formData.busServiceId);

  const canMoveForward =
    role === 'bus_driver'
      ? stepIndex === 0
        ? (
            formData.busSignupMode === 'create'
              ? canCreateBusDraft
              : formData.busSignupMode === 'existing'
                ? Boolean(formData.busServiceId)
                : false
          )
        : canSubmit
      : canSubmit;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    try {
      const roleDetails = {
        createNewBus: isBusDriverCreateMode,
        busServiceId: formData.busServiceId,
        requestNote: formData.requestNote,
        busDraft: createdBusDraft,
        operatorName: formData.operatorName,
        busName: formData.busName,
        serviceNumber: formData.serviceNumber,
        originCity: formData.originCity,
        destinationCity: formData.destinationCity,
      };

      await saveDriverOnboardingRoleDetails({
        registrationId,
        phone,
        roleDetails,
      });

      const response = await completeDriverOnboarding({ registrationId, phone });
      const payload = unwrap(response);

      if (payload?.token) {
        persistDriverAuthSession({ token: payload.token, role });
      }

      saveDriverRegistrationSession({
        ...session,
        roleDetails,
        completedRegistration: payload || null,
      });
      const routeState = { role, completedRegistration: toPlainData(payload) };
      finishedRef.current = true;
      clearDriverRegistrationSession();
      navigate('/taxi/driver/registration-status', { replace: true, state: routeState });
    } catch (requestError) {
      setError(requestError?.message || 'Unable to submit this signup request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex((current) => current - 1);
      return;
    }
    navigate(`${routePrefix}/step-personal`);
  };

  const handleNext = () => {
    if (isLastStep || !canMoveForward) {
      return;
    }
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  };

  const openBusBuilder = () => {
    setFormData((current) => ({ ...current, busSignupMode: 'create', busServiceId: '' }));
    navigate('/taxi/driver/role-signup/bus-builder/create?step=1');
  };

  if (!meta || !currentStep) {
    return null;
  }

  return (
    <div
      className="min-h-screen overflow-x-clip bg-[linear-gradient(180deg,#f6efe4_0%,#fcfaf6_28%,#ffffff_100%)] px-5 pb-36 pt-8 select-none"
      style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >
      <main className="mx-auto max-w-sm space-y-6">
        <header className="contents space-y-5 [&>:last-child]:mb-6">
          <div className="sticky top-0 z-30 -mx-5 flex items-center justify-between bg-[#f6efe4]/90 px-5 py-3 backdrop-blur-md">
            <button
              type="button"
              onClick={handleBack}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/70 bg-white/80 text-slate-900 shadow-sm"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="rounded-full border border-slate-900/5 bg-slate-900/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
              {currentStep.badge}
            </div>
          </div>

          <div className="space-y-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-[1.25rem] bg-white shadow-sm ${meta.color}`}>
              <meta.Icon size={22} />
            </div>
            <h1 className="font-['Outfit'] text-[42px] font-black leading-[1] tracking-[-0.04em] text-slate-900">
              {headerTitle}
            </h1>
            <p className="text-[15px] font-bold leading-relaxed text-slate-500 opacity-80">
              {headerSubtitle}
            </p>
          </div>
        </header>

        <section className="space-y-4 rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-1 flex gap-2">
            {steps.map((step, index) => (
              <div
                key={step.key}
                className={`h-2 flex-1 rounded-full ${index <= stepIndex ? 'bg-slate-900' : 'bg-slate-200'}`}
              />
            ))}
          </div>

          {role === 'bus_driver' && stepIndex === 0 ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData((current) => ({ ...current, busSignupMode: 'existing' }))}
                  className={`rounded-2xl border px-4 py-4 text-sm font-black transition ${
                    formData.busSignupMode === 'existing'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-900'
                  }`}
                >
                  Join Existing
                </button>
                <button
                  type="button"
                  onClick={openBusBuilder}
                  className={`rounded-2xl border px-4 py-4 text-sm font-black transition ${
                    formData.busSignupMode === 'create'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-900'
                  }`}
                >
                  Create New
                </button>
              </div>

              {!formData.busSignupMode ? (
                <div className="space-y-3">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">How bus signup works</p>
                    <p className="mt-2 text-sm font-bold text-slate-900">
                      Choose an existing bus service if it is already listed, or create a new one with the same full flow used in admin.
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-blue-100 bg-blue-50/70 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">Full Builder Included</p>
                    <p className="mt-2 text-sm font-bold text-slate-900">
                      New bus creation opens the full multi-step builder for bus basics, media, seat layout, route, and schedules.
                    </p>
                  </div>
                </div>
              ) : null}

              {formData.busSignupMode === 'existing' ? (
                <>
                  <div className="rounded-[22px] border border-emerald-100 bg-emerald-50/70 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Existing Bus Services</p>
                    <p className="mt-2 text-sm font-bold text-slate-900">
                      Select any existing bus service if you're joining one that's already listed.
                    </p>
                  </div>

                  <div className="relative">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search bus service"
                      className="w-full rounded-2xl border border-slate-200 py-4 pl-11 pr-4 text-sm font-bold text-slate-900 outline-none"
                    />
                  </div>

                  <div className="space-y-3">
                    {filteredBusServices.map((item) => {
                      const isSelected = String(formData.busServiceId) === String(item.id);

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setFormData((current) => ({ ...current, busServiceId: item.id }))}
                          className={`w-full rounded-[22px] border p-4 text-left transition ${
                            isSelected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-900'
                          }`}
                        >
                          <p className="text-sm font-black">{`${item.operatorName} - ${item.busName}`}</p>
                          <p className={`mt-1 text-xs font-bold ${isSelected ? 'text-white/70' : 'text-slate-500'}`}>
                            {`${item.originCity || 'Origin'} to ${item.destinationCity || 'Destination'}${item.serviceNumber ? ` - ${item.serviceNumber}` : ''}`}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {!filteredBusServices.length && !loadingOptions ? (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-500">
                      No bus services found for this search.
                    </div>
                  ) : null}
                </>
              ) : null}

              {formData.busSignupMode === 'create' ? (
                <div className="space-y-3">
                  <div className="rounded-[22px] border border-blue-100 bg-blue-50/70 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">Create New Bus Service</p>
                    <p className="mt-2 text-sm font-bold text-slate-900">
                      Open the full builder to set up the bus basics, media, seat layout, route, and schedules.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={openBusBuilder}
                    className="flex w-full items-center justify-center gap-3 rounded-[1.8rem] bg-slate-900 px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_20px_40px_rgba(0,0,0,0.12)]"
                  >
                    Open Full Bus Builder
                    <ChevronRight size={18} />
                  </button>

                  {createdBusDraft ? (
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Saved Bus Draft</p>
                      <p className="mt-2 text-sm font-black text-slate-900">
                        {createdBusDraft.operatorName || 'Operator'} - {createdBusDraft.busName || 'Bus'}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {createdBusDraft.route?.originCity || 'Origin'} to {createdBusDraft.route?.destinationCity || 'Destination'}
                        {createdBusDraft.serviceNumber ? ` - ${createdBusDraft.serviceNumber}` : ''}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-500">
                      No bus draft saved yet. Open the builder and save your bus first.
                    </div>
                  )}

                  {canCreateBusDraft ? (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="flex w-full items-center justify-center gap-3 rounded-[1.8rem] border border-slate-200 bg-white px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-slate-900"
                    >
                      Continue With This Draft
                      <ChevronRight size={18} />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {role === 'bus_driver' && stepIndex === 1 ? (
            <>
              {formData.busSignupMode === 'existing' && selectedBusService ? (
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Selected Bus</p>
                  <p className="mt-2 text-sm font-black text-slate-900">
                    {selectedBusService.operatorName} - {selectedBusService.busName}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {selectedBusService.originCity || 'Origin'} to {selectedBusService.destinationCity || 'Destination'}
                    {selectedBusService.serviceNumber ? ` - ${selectedBusService.serviceNumber}` : ''}
                  </p>
                </div>
              ) : null}

              {formData.busSignupMode === 'create' ? (
                <div className="space-y-3">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">New Bus Draft</p>
                    <p className="mt-2 text-sm font-black text-slate-900">
                      {createdBusDraft?.operatorName || 'Operator'} - {createdBusDraft?.busName || 'Bus'}
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {createdBusDraft?.route?.originCity || 'Origin'} to {createdBusDraft?.route?.destinationCity || 'Destination'}
                      {createdBusDraft?.serviceNumber ? ` - ${createdBusDraft.serviceNumber}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openBusBuilder}
                    className="flex w-full items-center justify-center gap-3 rounded-[1.8rem] border border-slate-200 bg-white px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-slate-900"
                  >
                    Edit Bus Draft
                    <ChevronRight size={18} />
                  </button>
                </div>
              ) : null}

              <textarea
                value={formData.requestNote}
                onChange={(event) => setFormData((current) => ({ ...current, requestNote: event.target.value }))}
                placeholder="Optional note for the admin"
                rows={5}
                className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-sm font-bold text-slate-900 outline-none"
              />
              <p className="text-xs font-semibold text-slate-500">
                Example: mention your city, shift preference, or who asked you to join this bus service.
              </p>
            </>
          ) : null}

          {role === 'bus_driver' && stepIndex === 2 ? (
            <div className="space-y-4">
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  {isBusDriverCreateMode ? 'New Bus Service' : 'Bus Service'}
                </p>
                <p className="mt-2 text-sm font-black text-slate-900">
                  {isBusDriverCreateMode
                    ? `${createdBusDraft?.operatorName || 'Operator'} - ${createdBusDraft?.busName || 'Bus'}`
                    : selectedBusService
                      ? `${selectedBusService.operatorName} - ${selectedBusService.busName}`
                      : 'No bus selected'}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {isBusDriverCreateMode
                    ? `${createdBusDraft?.route?.originCity || 'Origin'} to ${createdBusDraft?.route?.destinationCity || 'Destination'}${createdBusDraft?.serviceNumber ? ` - ${createdBusDraft.serviceNumber}` : ''}`
                    : selectedBusService
                      ? `${selectedBusService.originCity || 'Origin'} to ${selectedBusService.destinationCity || 'Destination'}${selectedBusService.serviceNumber ? ` - ${selectedBusService.serviceNumber}` : ''}`
                      : 'Go back and choose a bus service first.'}
                </p>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Admin Note</p>
                <p className="mt-2 text-sm font-bold text-slate-900">{formData.requestNote.trim() || 'No note added'}</p>
              </div>
            </div>
          ) : null}

        </section>

        {loadingOptions ? (
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm font-bold text-slate-500">
            Loading signup options...
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
            {error}
          </div>
        ) : null}
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent p-8">
        <div className="mx-auto flex max-w-sm gap-3">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={submitting}
              className="flex h-16 items-center justify-center rounded-[1.8rem] border border-slate-200 bg-white px-5 text-[14px] font-black text-slate-700"
            >
              Back
            </button>
          ) : null}

          {isLastStep ? (
            <motion.button
              whileHover={canSubmit && !submitting ? { scale: 1.02 } : {}}
              whileTap={canSubmit && !submitting ? { scale: 0.98 } : {}}
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting || loadingOptions}
              className={`flex h-16 flex-1 items-center justify-center gap-3 rounded-[1.8rem] text-[15px] font-black tracking-tight transition-all ${
                canSubmit && !loadingOptions
                  ? 'bg-slate-900 text-white shadow-[0_20px_40px_rgba(0,0,0,0.2)]'
                  : 'bg-slate-200 text-slate-400'
              }`}
            >
              {submitting ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              ) : (
                <>
                  <span className="uppercase tracking-widest">Submit Request</span>
                  <ChevronRight size={18} />
                </>
              )}
            </motion.button>
          ) : (
            <motion.button
              whileHover={canMoveForward && !submitting ? { scale: 1.02 } : {}}
              whileTap={canMoveForward && !submitting ? { scale: 0.98 } : {}}
              type="button"
              onClick={handleNext}
              disabled={!canMoveForward || submitting || loadingOptions}
              className={`flex h-16 flex-1 items-center justify-center gap-3 rounded-[1.8rem] text-[15px] font-black tracking-tight transition-all ${
                canMoveForward && !loadingOptions
                  ? 'bg-slate-900 text-white shadow-[0_20px_40px_rgba(0,0,0,0.2)]'
                  : 'bg-slate-200 text-slate-400'
              }`}
            >
              <span className="uppercase tracking-widest">Next Step</span>
              <ChevronRight size={18} />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoleSpecificOnboarding;
