/**
 * Seeds the admin-side master data the Taxi apps need for a complete end-to-end run and that is empty on a fresh
 * install: KYC documents (driver + owner), vehicle preferences, promo codes, one customer pass, app languages.
 *
 * Safe to re-run: every record is looked up by its natural key first and only created when missing.
 * Values are sensible defaults - review/edit them in the admin panel before go-live.
 *
 * Usage (from Backend/):
 *   npm run seed:taxi-e2e-data
 *   MONGODB_URI=<other db> npm run seed:taxi-e2e-data
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import * as adminService from '../src/modules/taxi/admin/services/adminService.js';
import * as promoService from '../src/modules/taxi/admin/promotions/services/promotionsService.js';
import { DriverNeededDocument } from '../src/modules/taxi/admin/models/DriverNeededDocument.js';
import { OwnerNeededDocument } from '../src/modules/taxi/admin/models/OwnerNeededDocument.js';
import { UserPreference } from '../src/modules/taxi/admin/models/UserPreference.js';
import { Vehicle } from '../src/modules/taxi/admin/models/Vehicle.js';
import { AppLanguage } from '../src/modules/taxi/admin/models/AppLanguage.js';
import { SubscriptionPlan } from '../src/modules/taxi/admin/models/SubscriptionPlan.js';
import { PromoCode } from '../src/modules/taxi/admin/promotions/models/PromoCode.js';
import { ServiceLocation } from '../src/modules/taxi/admin/models/ServiceLocation.js';

dotenv.config();

const log = (message) => console.log(message);

const DRIVER_DOCUMENTS = [
  { name: 'Driving Licence', account_type: 'both', image_type: 'front_back', has_identify_number: true, has_expiry_date: true, is_required: true },
  { name: 'Aadhaar Card', account_type: 'both', image_type: 'front_back', has_identify_number: true, has_expiry_date: false, is_required: true },
  { name: 'Vehicle RC', account_type: 'individual', image_type: 'front_back', has_identify_number: true, has_expiry_date: true, is_required: true },
  { name: 'Vehicle Insurance', account_type: 'individual', image_type: 'front', has_identify_number: false, has_expiry_date: true, is_required: true },
];

const OWNER_DOCUMENTS = [
  { name: 'PAN Card', image_type: 'front', has_identify_number: true, has_expiry_date: false, is_required: true },
  { name: 'Aadhaar Card', image_type: 'front_back', has_identify_number: true, has_expiry_date: false, is_required: true },
  { name: 'GST Certificate', image_type: 'front', has_identify_number: true, has_expiry_date: false, is_required: false },
];

const PREFERENCES = [
  { name: 'AC Cab', vehicles: ['Sedan', 'SUV'] },
  { name: 'Child Seat', vehicles: ['Sedan', 'SUV'] },
  { name: 'Pet Friendly', vehicles: ['Sedan', 'SUV'] },
  { name: 'Extra Luggage Space', vehicles: ['SUV'] },
];

const LANGUAGES = [
  { name: 'English', code: 'en', default_status: 1 },
  { name: 'Hindi', code: 'hi', default_status: 0 },
];

const inOneYear = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

const ensureDriverDocuments = async () => {
  // earlier run stored camelCase keys that showed up as labels like RCNUMBER - the label falls back to "<name> Number" when blank
  await DriverNeededDocument.updateMany({ template_type: 'document', identify_number_key: { $in: ['licenseNumber', 'aadhaarNumber', 'rcNumber'] } }, { $set: { identify_number_key: '' } });
  for (const spec of DRIVER_DOCUMENTS) {
    const existing = await DriverNeededDocument.findOne({ name: spec.name, template_type: 'document' }).lean();
    if (existing) {
      log(`  = ${spec.name} (exists)`);
      continue;
    }
    await adminService.createDriverNeededDocument({ ...spec, is_editable: true, active: true, verification_type: 'none' });
    log(`  + ${spec.name}`);
  }
};

const ensureOwnerDocuments = async () => {
  for (const spec of OWNER_DOCUMENTS) {
    const existing = await OwnerNeededDocument.findOne({ name: spec.name }).lean();
    if (existing) {
      log(`  = ${spec.name} (exists)`);
      continue;
    }
    await adminService.createOwnerNeededDocument({ ...spec, is_editable: true, active: true });
    log(`  + ${spec.name}`);
  }
};

const ensurePreferences = async () => {
  for (const spec of PREFERENCES) {
    let preference = await UserPreference.findOne({ name: spec.name }).lean();
    if (preference) {
      log(`  = ${spec.name} (exists)`);
    } else {
      preference = await adminService.createPreference({ name: spec.name });
      log(`  + ${spec.name}`);
    }
    for (const vehicleName of spec.vehicles) {
      const vehicle = await Vehicle.findOne({ name: vehicleName, transport_type: 'taxi' });
      if (!vehicle) {
        continue;
      }
      const ids = (vehicle.vehicle_preference || []).map(String);
      if (!ids.includes(String(preference._id))) {
        await Vehicle.updateOne({ _id: vehicle._id }, { $addToSet: { vehicle_preference: preference._id } });
        log(`      -> attached to ${vehicleName}`);
      }
    }
  }
};

const ensurePromos = async (serviceLocation) => {
  const base = {
    service_location_id: String(serviceLocation._id),
    transport_type: 'taxi',
    from: today(),
    to: inOneYear(),
    active: true,
  };
  const promos = [
    { ...base, code: 'WELCOME50', audience: 'first_time', discount_percentage: 50, maximum_discount_amount: 75, minimum_trip_amount: 60, uses_per_user: 1 },
    { ...base, code: 'RIDE10', audience: 'all', discount_percentage: 10, maximum_discount_amount: 30, minimum_trip_amount: 80, uses_per_user: 5 },
  ];
  for (const promo of promos) {
    if (await PromoCode.findOne({ code: promo.code }).lean()) {
      log(`  = ${promo.code} (exists)`);
      continue;
    }
    await promoService.createPromoCode(promo);
    log(`  + ${promo.code}`);
  }
};

const ensureCustomerPass = async () => {
  const sedan = await Vehicle.findOne({ name: 'Sedan', transport_type: 'taxi' }).lean();
  if (!sedan) {
    log('  ! Sedan vehicle type missing, skipped');
    return;
  }
  const name = 'Sedan 10-Ride Pass';
  if (await SubscriptionPlan.findOne({ audience: 'user', name }).lean()) {
    log(`  = ${name} (exists)`);
    return;
  }
  await adminService.createCustomerSubscriptionPlan({
    name,
    description: '10 Sedan city rides in 30 days',
    amount: 999,
    duration: 30,
    benefit_type: 'limited',
    ride_limit: 10,
    vehicle_type_id: String(sedan._id),
    transport_type: 'taxi',
    how_it_works: 'Buy the pass from your wallet. Sedan city rides are covered until the ride limit or the validity ends.',
  });
  log(`  + ${name}`);
};

const ensureLanguages = async () => {
  for (const spec of LANGUAGES) {
    if (await AppLanguage.findOne({ code: spec.code }).lean()) {
      log(`  = ${spec.name} (exists)`);
      continue;
    }
    await adminService.createLanguage(spec);
    log(`  + ${spec.name}`);
  }
};

const run = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error('Missing MONGODB_URI in environment.');
  }
  await mongoose.connect(uri);
  log(`Seeding taxi e2e data into database "${mongoose.connection.name}"`);

  const serviceLocation = await ServiceLocation.findOne({ name: 'Indore' }).lean();
  if (!serviceLocation) {
    throw new Error('Service location "Indore" must exist first (Admin > Price Management > Service Location).');
  }

  log('\nDriver KYC documents');
  await ensureDriverDocuments();
  log('\nOwner KYC documents');
  await ensureOwnerDocuments();
  log('\nVehicle preferences');
  await ensurePreferences();
  log('\nPromo codes');
  await ensurePromos(serviceLocation);
  log('\nCustomer pass');
  await ensureCustomerPass();
  log('\nApp languages');
  await ensureLanguages();
  log('\nDone.');
};

run()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
