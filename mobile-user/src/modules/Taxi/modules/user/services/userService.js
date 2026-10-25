import api from '../../../shared/api/axiosInstance';

export const userService = {
  getAppModules: async (params, config = {}) => {
    const response = await api.get('/users/app-modules', { params, ...config });
    return response;
  },
  getIntercityPackages: async () => {
    const response = await api.get('/users/intercity-packages');
    return response;
  },
  // Outstation / intercity to ANY destination: one distance-priced fare per vehicle (Set Price > Outstation Ride).
  getIntercityQuote: async (params) => {
    const response = await api.get('/users/intercity-quote', { params });
    return response?.data || response;
  },
  getServiceLocations: async () => {
    const response = await api.get('/users/service-locations');
    return response;
  },
  getAvailablePromos: async (params) => {
    const response = await api.get('/promos/available', { params });
    return response;
  },
  validatePromo: async (payload) => {
    const response = await api.post('/promos/validate', payload);
    return response;
  },
};
