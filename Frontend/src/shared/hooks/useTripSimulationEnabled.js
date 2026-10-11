import usePublicCustomization from './usePublicCustomization.js';

/**
 * Whether the captain "route simulation" test tool may be shown (Global admin > Customization Settings > Trip Simulation).
 * Off unless the admin turns it on (development builds always show it). Until the first answer arrives it stays hidden.
 */
const selectSimulation = (settings) => settings.trip_simulation_enabled === true;

export default function useTripSimulationEnabled() {
  return usePublicCustomization(selectSimulation);
}
