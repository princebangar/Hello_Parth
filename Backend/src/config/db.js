import mongoose from 'mongoose';
import dns from 'node:dns';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

export const connectDB = async () => {
    try {
        const dnsServers = String(config.mongodbDnsServers || '8.8.8.8,1.1.1.1')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

        if (dnsServers.length > 0) {
            try {
                dns.setServers(dnsServers);
                logger.info(`Using custom DNS servers for MongoDB lookup: ${dnsServers.join(', ')}`);
            } catch (dnsError) {
                logger.warn(`Failed to set custom DNS servers: ${dnsError.message}`);
            }
        }

        const conn = await mongoose.connect(config.mongodbUri, {
            serverSelectionTimeoutMS: config.mongodbServerSelectionTimeoutMs,
            connectTimeoutMS: config.mongodbConnectTimeoutMs,
            // A screen fires 10-20 requests at once. With an empty pool each one opens its own TLS connection to
            // Atlas first (~100-200 ms); keeping some connections ready makes the burst start immediately.
            minPoolSize: 8,
            maxIdleTimeMS: 5 * 60 * 1000,
            family: 4, // Prefer IPv4 where local resolvers have IPv6/SRV issues.
        });
        logger.info(`MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        logger.error(`MongoDB connection error: ${error.message}`);
        process.exit(1);
    }
};

/**
 * Close MongoDB connection (e.g. graceful shutdown).
 * @returns {Promise<void>}
 */
export const disconnectDB = async () => {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
};

export const connectDatabase = connectDB;