import React, { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PoolingVehicleForm from '../../../admin/pages/pooling/PoolingVehicleForm';
import useOnboardingExitGuard from '../../../../../../shared/hooks/useOnboardingExitGuard';
import OnboardingExitModal from '../../../../../../shared/components/OnboardingExitModal';
import {
  clearDriverRegistrationSession,
  completePoolingDriverOnboarding,
  getStoredDriverRegistrationSession,
  persistDriverAuthSession,
  saveDriverRegistrationSession,
  savePoolingDriverOnboardingDetails,
  uploadPoolingDriverOnboardingImage,
} from '../../services/registrationService';

const PoolingDriverOnboarding = () => {
  const navigate = useNavigate();
  const session = getStoredDriverRegistrationSession();
  const registrationId = String(session.registrationId || '').trim();
  const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);
  const finishedRef = useRef(false);
  const hasInputRef = useRef(false);

  // Back arrow / phone back button: leave straight away if the form is empty, otherwise ask first.
  const { showExitModal, handleBack, handleStay, handleExit } = useOnboardingExitGuard({
    isFirstStep: true,
    hasUnsavedProgress: () => hasInputRef.current,
    onExit: () => navigate('/taxi/driver/login', { replace: true }),
  });

  useEffect(() => {
    if (finishedRef.current) {
      return;
    }

    if (!registrationId || !phone) {
      navigate('/taxi/driver/login', { replace: true });
    }
  }, [navigate, phone, registrationId]);

  const poolingOnboardingService = useMemo(() => ({
    uploadImage: async (image) => uploadPoolingDriverOnboardingImage(image),
    createPoolingVehicle: async (payload) => {
      if (!registrationId || !phone) {
        throw new Error('Pooling onboarding session not found');
      }

      await savePoolingDriverOnboardingDetails({
        registrationId,
        phone,
        ...payload,
      });

      return completePoolingDriverOnboarding({
        registrationId,
        phone,
      });
    },
  }), [phone, registrationId]);

  if (!registrationId || !phone) {
    return null;
  }

  return (
    <>
    <PoolingVehicleForm
      service={poolingOnboardingService}
      onBack={handleBack}
      variant="driver"
      onProgressChange={(value) => { hasInputRef.current = value; }}
      backPath="/taxi/driver/login"
      backLabel="Back to Login"
      pageLabel="Pooling Driver Onboarding"
      initialFormData={{
        driverName: session.fullName || '',
        driverPhone: phone,
        name: session.poolingVehicleName || '',
        vehicleModel: session.poolingVehicleModel || '',
        vehicleNumber: session.poolingVehicleNumber || '',
        color: session.poolingVehicleColor || '',
        vehicleType: session.poolingVehicleType || 'sedan',
        images: Array.isArray(session.poolingVehicleImages) ? session.poolingVehicleImages : [],
        blueprint: session.poolingVehicleBlueprint || undefined,
      }}
      hidePricingFields
      lockDriverPhone
      placeCreateActionAtEnd
      createActionLabel="Submit For Approval"
      createSuccessMessage="Pooling request submitted"
      onSaveSuccess={async (response, payload) => {
        saveDriverRegistrationSession({
          fullName: payload.driverName || '',
          poolingVehicleName: payload.name || '',
          poolingVehicleModel: payload.vehicleModel || '',
          poolingVehicleNumber: payload.vehicleNumber || '',
          poolingVehicleColor: payload.color || '',
          poolingVehicleType: payload.vehicleType || 'sedan',
          poolingVehicleImages: Array.isArray(payload.images) ? payload.images : [],
          poolingVehicleBlueprint: payload.blueprint || null,
        });

        const result = response?.data?.data || response?.data || response;
        if (result?.token) {
          persistDriverAuthSession({ token: result.token, role: 'pooling_driver' });
        }
        finishedRef.current = true;
        clearDriverRegistrationSession();
        navigate('/taxi/driver/pooling/status', { replace: true });
      }}
    />
    <OnboardingExitModal
      open={showExitModal}
      onStay={handleStay}
      onExit={handleExit}
      theme="taxi"
      title="Exit registration?"
      message="Are you sure you want to exit? The details you entered will not be submitted."
      stayLabel="Cancel"
      exitLabel="Exit"
    />
    </>
  );
};

export default PoolingDriverOnboarding;
