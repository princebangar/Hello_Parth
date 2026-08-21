import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..', '..');
const uploadPath = process.env.UPLOAD_PATH || 'uploads/';

const parseOrigins = (value) =>
    String(value || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

const fallbackCorsOrigins = [
    ...parseOrigins(process.env.SOCKET_CORS_ORIGIN),
    ...parseOrigins(process.env.FRONTEND_URL),
];
const uniqueCorsOrigins = [...new Set(fallbackCorsOrigins)];
const resolvedCorsOrigin = uniqueCorsOrigins.length > 0 ? uniqueCorsOrigins.join(',') : '*';

export const config = {
    // Basic server config
    port: process.env.PORT || 5000,
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',

    // Database
    mongodbUri: process.env.MONGO_URI || process.env.MONGODB_URI,
    mongodbDnsServers: process.env.MONGODB_DNS_SERVERS || '8.8.8.8,1.1.1.1',
    mongodbServerSelectionTimeoutMs: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 30000),
    mongodbConnectTimeoutMs: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 30000),

    // JWT
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',

    // OTP
    otpExpiry: process.env.OTP_EXPIRY || '5m',
    otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
    otpExpiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES || 10),
    otpExpirySeconds: Number(process.env.OTP_EXPIRY_SECONDS || 300),
    otpRateLimit: Number(process.env.OTP_RATE_LIMIT || 3),
    otpRateWindow: Number(process.env.OTP_RATE_WINDOW || 600),
    useDefaultOtp: process.env.USE_DEFAULT_OTP === 'true',
    useDefaultTestPhone: process.env.USE_DEFAULT_TEST_PHONE === 'true',
    defaultTestPhone: String(process.env.DEFAULT_TEST_PHONE || '').replace(/\D/g, '').slice(-10),

    // SMS providers (shared food + taxi)
    smsHubEnabled: process.env.SMS_HUB_ENABLED === 'true',
    msg91Enabled: process.env.MSG91_ENABLED === 'true',
    msg91AuthKey: (process.env.MSG91_AUTH_KEY || '').trim(),
    msg91SenderId: (process.env.MSG91_SENDER_ID || '').trim(),
    msg91TemplateId: (process.env.MSG91_TEMPLATE_ID || '').trim(),

    // SMS India Hub
    smsIndiaHubUsername: (process.env.SMS_INDIA_HUB_USERNAME || '').trim(),
    smsApiKey: (process.env.SMS_INDIA_HUB_API_KEY || '').trim(),
    smsSenderId: (process.env.SMS_INDIA_HUB_SENDER_ID || 'BGADEC').trim(),
    smsPeId: (process.env.SMS_INDIA_HUB_PE_ID || '1001164203633432409').trim(),
    smsDltTemplateId: (process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID || '1007282516644508833').trim(),

    // Rate limiting
    rateLimitWindowMinutes: Number(process.env.RATE_LIMIT_WINDOW || 15),
    rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX || 100),
    authRateLimitWindowMinutes: Number(process.env.AUTH_RATE_LIMIT_WINDOW || 15),
    authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 30),

    // Security
    bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS || 10),

    // Uploads (local disk / remote Hostinger /var/www/uploads — no Cloudinary)
    uploadPath,
    uploadsRoot: path.isAbsolute(uploadPath)
        ? path.normalize(uploadPath)
        : path.resolve(backendRoot, uploadPath),
    assetBaseUrl: String(
        process.env.ASSET_BASE_URL ||
        process.env.API_BASE_URL ||
        `http://localhost:${process.env.PORT || 5000}`
    ).replace(/\/+$/, ''),
    uploadRemoteOrigin: String(process.env.UPLOAD_REMOTE_ORIGIN || '').replace(/\/+$/, ''),
    uploadInternalSecret: process.env.UPLOAD_INTERNAL_SECRET || process.env.JWT_ACCESS_SECRET || '',
    serveUploadsFromNode: process.env.SERVE_UPLOADS_FROM_NODE === 'true',
    requestJsonLimit: process.env.REQUEST_JSON_LIMIT || '2mb',
    requestUrlencodedLimit: process.env.REQUEST_URLENCODED_LIMIT || '2mb',

    // Redis
    redisEnabled: process.env.REDIS_ENABLED === 'true',
    redisUrl: process.env.REDIS_URL,

    // BullMQ
    bullmqEnabled: process.env.BULLMQ_ENABLED === 'true',

    // Firebase / FCM
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
    firebaseDatabaseUrl: process.env.VITE_FIREBASE_DATABASE_URL,
    firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT,
    firebaseWebApiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
    firebaseWebAuthDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
    firebaseWebStorageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET,
    firebaseWebMessagingSenderId:
        process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID,
    firebaseWebAppId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID,
    firebaseWebMeasurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || process.env.FIREBASE_MEASUREMENT_ID,
    firebaseWebVapidKey: process.env.VITE_FIREBASE_VAPID_KEY || process.env.FIREBASE_VAPID_KEY,

    // Socket.io
    socketCorsOrigin: resolvedCorsOrigin,

    // Razorpay (payments)
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET, // ✅ NEW

    // Email (SMTP) – for admin forgot password OTP etc.
    emailHost: process.env.EMAIL_HOST,
    emailPort: Number(process.env.EMAIL_PORT) || 587,
    emailUser: process.env.EMAIL_USER,
    emailPass: process.env.EMAIL_PASS ? String(process.env.EMAIL_PASS).replace(/\s/g, '') : '',
    emailFrom: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@example.com'
};

// Taxi Module Compatibility Export
export const env = {
    ...config,
    // Taxi modules use `env.corsOrigin`; keep it in sync with socket CORS origin.
    corsOrigin: config.socketCorsOrigin,
    mongoUri: config.mongodbUri,
    jwtSecret: config.jwtAccessSecret,
    jwtExpiresIn: config.jwtAccessExpiresIn,
    firebase: {
        databaseURL: config.firebaseDatabaseUrl,
        serviceAccountPath: config.firebaseServiceAccountPath,
        serviceAccountJson: config.firebaseServiceAccount,
    },
    sms: {
        useDefaultOtp: config.useDefaultOtp ? 'true' : 'false',
        useDefaultTestPhone: config.useDefaultTestPhone ? 'true' : 'false',
        otpExpiryMinutes: config.otpExpiryMinutes,
        otpExpirySeconds: config.otpExpirySeconds,
        otpMaxAttempts: config.otpMaxAttempts,
        otpRateLimit: config.otpRateLimit,
        otpRateWindow: config.otpRateWindow,
        defaultTestPhone: config.defaultTestPhone,
        smsHubEnabled: config.smsHubEnabled,
        msg91Enabled: config.msg91Enabled,
        indiaHub: {
            username: config.smsIndiaHubUsername,
            password: process.env.SMS_INDIA_HUB_PASSWORD,
            apiKey: config.smsApiKey,
            senderId: config.smsSenderId,
            peId: config.smsPeId,
            dltTemplateId: config.smsDltTemplateId,
        },
        msg91: {
            authKey: config.msg91AuthKey,
            senderId: config.msg91SenderId,
            templateId: config.msg91TemplateId,
        },
    },
    driverWallet: {
        defaultCashLimit: Number(process.env.DRIVER_WALLET_DEFAULT_CASH_LIMIT || 500),
        commissionPercent: Number(process.env.DRIVER_COMMISSION_PERCENT || 20),
    }
};
