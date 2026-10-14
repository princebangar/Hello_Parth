import { sendResponse } from '../../../utils/response.js';
import * as service from './globalHomeBanner.service.js';

export const getHomeBanners = async (_req, res, next) => {
  try {
    return sendResponse(res, 200, 'Home banners fetched successfully', await service.getHomeBanners());
  } catch (error) {
    return next(error);
  }
};

export const updateFoodHomeBanner = async (req, res, next) => {
  try {
    return sendResponse(res, 200, 'Food home banner saved', await service.updateFoodHomeBanner(req.body || {}));
  } catch (error) {
    return next(error);
  }
};

export const updateTaxiHomeBanner = async (req, res, next) => {
  try {
    return sendResponse(res, 200, 'Taxi home banner saved', await service.updateTaxiHomeBanner(req.body || {}));
  } catch (error) {
    return next(error);
  }
};
