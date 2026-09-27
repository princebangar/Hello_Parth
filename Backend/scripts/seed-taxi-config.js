/**
 * Seeds the baseline Taxi configuration that the apps need before any ride, parcel, intercity,
 * bus or pooling booking can work (vehicle types, prices, app modules, goods types, bus/pooling
 * routes, support titles, payout methods, feature switches).
 *
 * Safe to re-run: every record is looked up by its natural key first and only created when missing.
 * Prices below are sensible Indore defaults - review and edit them in the admin panel.
 *
 * Usage (from Backend/):
 *   npm run seed:taxi-config
 *   MONGODB_URI=<other db> npm run seed:taxi-config
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import * as adminService from '../src/modules/taxi/admin/services/adminService.js';
import { Vehicle } from '../src/modules/taxi/admin/models/Vehicle.js';
import { SetPrice } from '../src/modules/taxi/admin/models/SetPrice.js';
import { GoodsType } from '../src/modules/taxi/admin/models/GoodsType.js';
import { RentalPackageType } from '../src/modules/taxi/admin/models/RentalPackageType.js';
import { TaxiAppModule } from '../src/modules/taxi/admin/models/TaxiAppModule.js';
import { PaymentMethod } from '../src/modules/taxi/admin/models/PaymentMethod.js';
import { PoolingVehicle } from '../src/modules/taxi/admin/models/PoolingVehicle.js';
import { PoolingRoute } from '../src/modules/taxi/admin/models/PoolingRoute.js';
import { BusService } from '../src/modules/taxi/admin/models/BusService.js';
import { ServiceLocation } from '../src/modules/taxi/admin/models/ServiceLocation.js';
import { Zone } from '../src/modules/taxi/driver/models/Zone.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { SupportTicketTitle } from '../src/modules/taxi/support/models/SupportTicketTitle.js';

dotenv.config();

const log = (message) => console.log(message);
const created = (label) => log(`  + created ${label}`);
const existing = (label) => log(`  = exists  ${label}`);

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------------------------------------------------------------------------------------------
// Vehicle types
// ---------------------------------------------------------------------------------------------
const RIDE_VEHICLES = [
  { name: 'Bike', icon_types: 'bike', capacity: 1, short_description: 'Beat the traffic', price: { base_price: 25, base_distance: 2, price_per_distance: 7, time_price: 0.5, waiting_charge: 1 } },
  { name: 'Auto', icon_types: 'auto', capacity: 3, short_description: 'Affordable auto rides', price: { base_price: 35, base_distance: 2, price_per_distance: 11, time_price: 0.75, waiting_charge: 1.5 } },
  { name: 'Sedan', icon_types: 'car', capacity: 4, short_description: 'Comfortable AC cab', price: { base_price: 60, base_distance: 2, price_per_distance: 15, time_price: 1, waiting_charge: 2 } },
  { name: 'SUV', icon_types: 'suv', capacity: 6, short_description: 'Spacious ride for groups', price: { base_price: 90, base_distance: 2, price_per_distance: 20, time_price: 1.25, waiting_charge: 3 } },
];

const PARCEL_VEHICLE = {
  name: 'Delivery',
  short_description: 'Send parcels across the city',
  delivery_category: '2wheeler',
  delivery_distance_pricing: { enabled: true, base_price: 40, free_distance: 3, distance_price: 9, free_time: 0, time_price: 0 },
  service_tax: 5,
};

const ensureVehicle = async (spec) => {
  let vehicle = await Vehicle.findOne({ name: spec.name, transport_type: 'taxi' });
  if (vehicle) {
    existing(`vehicle ${spec.name}`);
    return vehicle;
  }

  vehicle = await adminService.createVehicleType({
    name: spec.name,
    transport_type: 'taxi',
    dispatch_type: 'normal',
    icon_types: spec.icon_types,
    capacity: spec.capacity,
    short_description: spec.short_description,
    admin_commission_type_from_driver: 1,
    admin_commission_from_driver: 15,
    status: 1,
  });
  created(`vehicle ${spec.name}`);
  return Vehicle.findById(vehicle._id);
};

const ensureParcelVehicle = async () => {
  let vehicle = await Vehicle.findOne({ name: PARCEL_VEHICLE.name });

  if (!vehicle) {
    const createdVehicle = await adminService.createVehicleType({
      ...PARCEL_VEHICLE,
      transport_type: 'delivery',
      icon_types: 'bike',
      capacity: 1,
      admin_commission_type_from_driver: 1,
      admin_commission_from_driver: 15,
      status: 1,
    });
    created(`vehicle ${PARCEL_VEHICLE.name} (delivery)`);
    return Vehicle.findById(createdVehicle._id);
  }

  const needsUpdate =
    vehicle.transport_type !== 'delivery' || !vehicle.delivery_distance_pricing?.enabled || !vehicle.delivery_distance_pricing?.base_price;
  if (needsUpdate) {
    await adminService.updateVehicleType(vehicle._id, {
      transport_type: 'delivery',
      icon_types: 'bike',
      delivery_category: PARCEL_VEHICLE.delivery_category,
      delivery_distance_pricing: PARCEL_VEHICLE.delivery_distance_pricing,
      service_tax: PARCEL_VEHICLE.service_tax,
    });
    log(`  ~ updated vehicle ${PARCEL_VEHICLE.name}: now a delivery vehicle with pricing`);
  } else {
    existing(`vehicle ${PARCEL_VEHICLE.name}`);
  }

  return Vehicle.findById(vehicle._id);
};

// ---------------------------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------------------------
const ensureRidePrice = async ({ zone, serviceLocation, vehicle, price }) => {
  const found = await SetPrice.findOne({ zone_id: zone._id, vehicle_type: vehicle._id, pricing_scope: 'ride' });
  if (found) {
    existing(`ride price ${vehicle.name}`);
    return;
  }

  await adminService.createSetPrice({
    zone_id: zone._id,
    service_location_id: serviceLocation._id,
    vehicle_type: vehicle._id,
    transport_type: 'taxi',
    pricing_scope: 'ride',
    payment_type: ['cash', 'online'],
    service_tax: 5,
    admin_commission_type_from_driver: 1,
    admin_commission_from_driver: 15,
    free_waiting_before: 3,
    free_waiting_after: 0,
    ...price,
  });
  created(`ride price ${vehicle.name}`);
};

const INTERCITY_DESTINATIONS = [
  { destination: 'Ujjain', sedan: { base_price: 900, free_distance: 55, distance_price: 14 }, suv: { base_price: 1300, free_distance: 55, distance_price: 18 } },
  { destination: 'Bhopal', sedan: { base_price: 2600, free_distance: 190, distance_price: 14 }, suv: { base_price: 3600, free_distance: 190, distance_price: 18 } },
  { destination: 'Omkareshwar', sedan: { base_price: 1800, free_distance: 80, distance_price: 14 }, suv: { base_price: 2500, free_distance: 80, distance_price: 18 } },
];

const ensureIntercityPackages = async ({ serviceLocation, sedan, suv }) => {
  let packageType = await RentalPackageType.findOne({ name: 'One Way Trip', transport_type: 'taxi' });
  if (!packageType) {
    packageType = await adminService.createRentalPackageType({ name: 'One Way Trip', transport_type: 'taxi', short_description: 'Drop-only outstation trip' });
    created('package type One Way Trip');
  } else {
    existing('package type One Way Trip');
  }

  for (const item of INTERCITY_DESTINATIONS) {
    const found = await SetPrice.findOne({
      pricing_scope: 'package',
      service_location_id: serviceLocation._id,
      package_type_id: packageType._id,
      package_destination: item.destination,
    });
    if (found) {
      existing(`intercity ${serviceLocation.name} -> ${item.destination}`);
      continue;
    }

    const row = (vehicle, prices) => ({
      vehicle_type: vehicle._id,
      free_time: 0,
      time_price: 0,
      service_tax: 5,
      admin_commission_type_from_driver: 1,
      admin_commission_from_driver: 15,
      ...prices,
    });

    await adminService.createSetPrice({
      pricing_scope: 'package',
      service_location_id: serviceLocation._id,
      transport_type: 'taxi',
      package_type_id: packageType._id,
      package_destination: item.destination,
      package_availability: 'available',
      package_vehicle_prices: [row(sedan, item.sedan), row(suv, item.suv)],
      payment_type: ['cash', 'online'],
    });
    created(`intercity ${serviceLocation.name} -> ${item.destination}`);
  }
};

// ---------------------------------------------------------------------------------------------
// Home screen modules, goods types, payout methods, support titles
// ---------------------------------------------------------------------------------------------
const APP_MODULES = [
  { name: 'Bike', transport_type: 'taxi', service_type: 'normal', order_by: 2, short_description: 'Beat the traffic' },
  { name: 'Parcel', transport_type: 'delivery', service_type: 'normal', order_by: 3, short_description: 'Send anything' },
  { name: 'Intercity', transport_type: 'taxi', service_type: 'outstation', order_by: 4, short_description: 'Outstation one-way trips' },
  { name: 'Bus', transport_type: 'bus', service_type: 'bus', order_by: 5, short_description: 'Book bus seats' },
  { name: 'Car Pooling', transport_type: 'pooling', service_type: 'pooling', order_by: 6, short_description: 'Share a ride, split the fare' },
];

const ensureAppModules = async () => {
  for (const spec of APP_MODULES) {
    if (await TaxiAppModule.findOne({ name: spec.name })) {
      existing(`app module ${spec.name}`);
      continue;
    }
    await adminService.createAppModule({ ...spec, active: 1 });
    created(`app module ${spec.name}`);
  }
};

const GOODS_TYPES = ['Documents', 'Food & Beverages', 'Clothing', 'Electronics', 'Groceries', 'Medicines', 'Household Items', 'Other'];

const ensureGoodsTypes = async () => {
  for (const name of GOODS_TYPES) {
    if (await GoodsType.findOne({ goods_type_name: name })) {
      existing(`goods type ${name}`);
      continue;
    }
    await adminService.createGoodsType({ goods_type_name: name, goods_types_for: 'both' });
    created(`goods type ${name}`);
  }
};

const PAYMENT_METHODS = [
  { name: 'Bank Transfer', fields: [{ type: 'text', name: 'Account Holder Name', is_required: true }, { type: 'text', name: 'Account Number', is_required: true }, { type: 'text', name: 'IFSC Code', is_required: true }] },
  { name: 'UPI', fields: [{ type: 'text', name: 'UPI ID', placeholder: 'name@bank', is_required: true }] },
];

const ensurePaymentMethods = async () => {
  for (const spec of PAYMENT_METHODS) {
    if (await PaymentMethod.findOne({ name: spec.name })) {
      existing(`payout method ${spec.name}`);
      continue;
    }
    await adminService.createPaymentMethod(spec);
    created(`payout method ${spec.name}`);
  }
};

const SUPPORT_TITLES = {
  user: ['Ride issue', 'Payment or refund', 'Driver behaviour', 'Bus / pooling booking', 'App problem', 'Other'],
  driver: ['Payment or payout', 'Wallet recharge', 'Document verification', 'Trip issue', 'App problem', 'Other'],
  owner: ['Fleet or vehicle', 'Payout', 'Document verification', 'Other'],
};

const ensureSupportTitles = async () => {
  for (const [userType, titles] of Object.entries(SUPPORT_TITLES)) {
    for (const title of titles) {
      if (await SupportTicketTitle.findOne({ title, userType })) {
        continue;
      }
      await SupportTicketTitle.create({ title, userType, supportType: 'general', active: true });
      created(`support title [${userType}] ${title}`);
    }
  }
};

// ---------------------------------------------------------------------------------------------
// Bus
// ---------------------------------------------------------------------------------------------
const CITY_COORDS = {
  indore: { lat: 22.7196, lng: 75.8577 },
  bhopal: { lat: 23.2599, lng: 77.4126 },
  ujjain: { lat: 23.1765, lng: 75.7885 },
  dewas: { lat: 22.9676, lng: 76.0534 },
};

const ensureBusReady = async () => {
  const buses = await BusService.find({});
  if (buses.length === 0) {
    log('  ! no bus service exists - create one from Admin > Bus Service');
    return;
  }

  for (const bus of buses) {
    const stops = bus.route?.stops || [];
    const incomplete = stops.some((stop) => !String(stop.city || '').trim() || !String(stop.pointName || '').trim());
    const patch = {};

    if (incomplete && stops.length >= 2) {
      patch.route = {
        stops: stops.map((stop, index) => {
          const isLast = index === stops.length - 1;
          return {
            id: stop.id,
            city: stop.city || (isLast ? bus.route.destinationCity : bus.route.originCity),
            pointName: stop.pointName || (isLast ? `${bus.route.destinationCity} Bus Stand` : `${bus.route.originCity} Bus Stand`),
            stopType: isLast ? 'drop' : stop.stopType || 'pickup',
            arrivalTime: stop.arrivalTime,
            departureTime: stop.departureTime,
          };
        }),
      };
    }

    const originKey = String(bus.route?.originCity || '').trim().toLowerCase();
    const destinationKey = String(bus.route?.destinationCity || '').trim().toLowerCase();
    const hasOriginCoords = Number.isFinite(bus.route?.originCoords?.lat);
    const hasDestinationCoords = Number.isFinite(bus.route?.destinationCoords?.lat);
    if ((!hasOriginCoords && CITY_COORDS[originKey]) || (!hasDestinationCoords && CITY_COORDS[destinationKey])) {
      patch.route = {
        ...(patch.route || {}),
        ...(!hasOriginCoords && CITY_COORDS[originKey] ? { originCoords: CITY_COORDS[originKey] } : {}),
        ...(!hasDestinationCoords && CITY_COORDS[destinationKey] ? { destinationCoords: CITY_COORDS[destinationKey] } : {}),
      };
    }

    if (bus.status !== 'active') {
      patch.status = 'active';
    }

    if (Object.keys(patch).length === 0) {
      existing(`bus service ${bus.busName}`);
      continue;
    }

    await adminService.updateBusService(bus._id, patch);
    log(`  ~ updated bus service ${bus.busName}: ${Object.keys(patch).join(', ')}`);
  }
};

// ---------------------------------------------------------------------------------------------
// Car pooling
// ---------------------------------------------------------------------------------------------
const buildPoolingLayout = () => {
  // 3 columns x 3 rows: driver + one front seat, then two rows of three -> 7 passenger seats.
  const layout = [
    { r: 0, c: 0, type: 'driver' },
    { r: 0, c: 1, type: 'seat' },
    { r: 0, c: 2, type: 'empty' },
  ];
  for (let r = 1; r <= 2; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      layout.push({ r, c, type: 'seat' });
    }
  }
  return { rows: 3, cols: 3, layout };
};

const ensurePooling = async () => {
  let vehicle = await PoolingVehicle.findOne({ vehicleNumber: 'MP09PL1001' });
  if (!vehicle) {
    vehicle = await PoolingVehicle.create({
      name: 'Ertiga Pool 1',
      vehicleModel: 'Maruti Ertiga',
      vehicleNumber: 'MP09PL1001',
      driverName: 'Pool Driver',
      driverPhone: '9000000001',
      color: 'White',
      capacity: 7,
      adminCommissionPercentage: 10,
      ownerCommissionPercentage: 0,
      serviceTaxPercentage: 5,
      vehicleType: 'van',
      blueprint: buildPoolingLayout(),
      status: 'active',
      approve: true,
      poolingEnabled: true,
    });
    created('pooling vehicle Ertiga Pool 1');
  } else {
    existing('pooling vehicle Ertiga Pool 1');
  }

  if (await PoolingRoute.findOne({ routeCode: 'IND-BPL-01' })) {
    existing('pooling route Indore -> Bhopal');
    return;
  }

  await adminService.createPoolingRoute({
    routeName: 'Indore to Bhopal Pool',
    routeCode: 'IND-BPL-01',
    originLabel: 'Indore',
    destinationLabel: 'Bhopal',
    description: 'Daily shared cab between Indore and Bhopal',
    assignedVehicleTypeIds: [String(vehicle._id)],
    pickupPoints: [
      { id: 'pool-pick-1', name: 'Sarwate Bus Stand', address: 'Sarwate Bus Stand, Indore', stopType: 'pickup', sequence: 1, etaMinutes: 0, latitude: 22.7196, longitude: 75.8577 },
      { id: 'pool-pick-2', name: 'Vijay Nagar Square', address: 'Vijay Nagar, Indore', stopType: 'pickup', sequence: 2, etaMinutes: 15, latitude: 22.7533, longitude: 75.8937 },
    ],
    dropPoints: [
      { id: 'pool-drop-1', name: 'ISBT Bhopal', address: 'ISBT, Bhopal', stopType: 'drop', sequence: 1, etaMinutes: 270, latitude: 23.2599, longitude: 77.4126 },
      { id: 'pool-drop-2', name: 'MP Nagar', address: 'MP Nagar, Bhopal', stopType: 'drop', sequence: 2, etaMinutes: 285, latitude: 23.2332, longitude: 77.4343 },
    ],
    schedules: [
      { id: 'pool-sch-morning', label: 'Morning', departureTime: '07:00', arrivalTime: '11:30', activeDays: DAYS, status: 'active' },
      { id: 'pool-sch-evening', label: 'Evening', departureTime: '18:00', arrivalTime: '22:30', activeDays: DAYS, status: 'active' },
    ],
    farePerSeat: 450,
    maxSeatsPerBooking: 4,
    maxAdvanceBookingHours: 720,
    boardingBufferMinutes: 15,
    status: 'active',
  });
  created('pooling route Indore -> Bhopal');
};

// ---------------------------------------------------------------------------------------------
// Existing default driver -> point at a real taxi vehicle type
// ---------------------------------------------------------------------------------------------
const repointDriversFromParcelVehicle = async ({ parcelVehicle, sedan }) => {
  const result = await Driver.updateMany(
    { vehicleTypeId: parcelVehicle._id, registerFor: { $ne: 'delivery' } },
    { $set: { vehicleTypeId: sedan._id, vehicleType: 'car', vehicleIconType: 'car' } },
  );
  if (result.modifiedCount) {
    log(`  ~ moved ${result.modifiedCount} taxi driver(s) from "${parcelVehicle.name}" to "${sedan.name}"`);
  }
};

// ---------------------------------------------------------------------------------------------
const run = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error('Missing MONGODB_URI in environment.');
  }
  await mongoose.connect(uri);
  log(`Seeding taxi config into database "${mongoose.connection.name}"`);

  const serviceLocation = await ServiceLocation.findOne({ name: 'Indore' });
  const zone = await Zone.findOne({ name: 'Indore' });
  if (!serviceLocation || !zone) {
    throw new Error('Service location "Indore" and its zone must exist first (Admin > Service Location / Zone).');
  }

  log('\nVehicle types');
  const vehicles = {};
  for (const spec of RIDE_VEHICLES) {
    vehicles[spec.name] = await ensureVehicle(spec);
  }
  const parcelVehicle = await ensureParcelVehicle();

  log('\nRide prices (Indore zone)');
  for (const spec of RIDE_VEHICLES) {
    await ensureRidePrice({ zone, serviceLocation, vehicle: vehicles[spec.name], price: spec.price });
  }

  log('\nIntercity packages');
  await ensureIntercityPackages({ serviceLocation, sedan: vehicles.Sedan, suv: vehicles.SUV });

  log('\nHome screen modules');
  await ensureAppModules();

  log('\nGoods types');
  await ensureGoodsTypes();

  log('\nPayout methods');
  await ensurePaymentMethods();

  log('\nSupport ticket titles');
  await ensureSupportTitles();

  log('\nFeature switches');
  await adminService.updateGeneralSettings('transport_ride', { enable_bus_service: '1' });
  log('  ~ enable_bus_service = 1');

  log('\nBus');
  await ensureBusReady();

  log('\nCar pooling');
  await ensurePooling();

  log('\nExisting drivers');
  await repointDriversFromParcelVehicle({ parcelVehicle, sedan: vehicles.Sedan });

  log('\nDone.');
};

run()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
