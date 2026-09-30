import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { BusService } from '../src/modules/taxi/admin/models/BusService.js';
import { fetchRoadDistance } from '../src/modules/taxi/services/googleDistanceService.js';

dotenv.config();

/** Re-reads Google road distance for every bus route that has origin + destination coordinates. */
const run = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGODB_URI / MONGO_URI in environment.');
  await mongoose.connect(uri, process.env.MONGODB_DB_NAME ? { dbName: process.env.MONGODB_DB_NAME } : undefined);

  const buses = await BusService.find({});
  for (const bus of buses) {
    for (const legKey of ['route', 'returnRoute']) {
      const leg = bus[legKey];
      if (!leg?.originCoords || !leg?.destinationCoords) continue;
      const road = await fetchRoadDistance(leg.originCoords, leg.destinationCoords);
      if (!road) {
        console.log(`${bus.busName} [${legKey}] ${leg.originCity} -> ${leg.destinationCity}: Google gave no answer, kept "${leg.distanceKm}"`);
        continue;
      }
      console.log(`${bus.busName} [${legKey}] ${leg.originCity} -> ${leg.destinationCity}: "${leg.distanceKm}" -> "${road.km} km"`);
      leg.distanceKm = `${road.km} km`;
    }
    await bus.save();
  }
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
