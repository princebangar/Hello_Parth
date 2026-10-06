import bikeImg from '../../../assets/icons/bike.png';
import autoImg from '../../../assets/icons/auto.png';
import carImg from '../../../assets/icons/car.png';
import suvImg from '../../../assets/icons/SUV.png';
import hatchbackImg from '../../../assets/icons/Hatchback.png';
import luxuryImg from '../../../assets/icons/Luxury.png';
import deliveryImg from '../../../assets/icons/Delivery.png';
import truckImg from '../../../assets/icons/truck.png';

/**
 * Picture for a vehicle type that has no image uploaded by the admin, picked from its name so every type
 * (Bike, Auto, Sedan, SUV, Delivery, ...) gets its own icon instead of all sharing one generic car.
 */
export const getVehicleTypeFallbackImage = (name = '') => {
  const value = String(name || '').toLowerCase();
  if (/bike|scooter|scooty|motor/.test(value)) return bikeImg;
  if (/auto|rickshaw|e-?rick/.test(value)) return autoImg;
  if (/delivery|parcel|goods/.test(value)) return deliveryImg;
  if (/truck|lorry|pickup|lcv/.test(value)) return truckImg;
  if (/luxury|premium/.test(value)) return luxuryImg;
  if (/suv|xl|innova|ertiga|van|muv/.test(value)) return suvImg;
  if (/hatch|micro|mini/.test(value)) return hatchbackImg;
  return carImg;
};
