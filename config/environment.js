require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

const config = {
    // Environment
    NODE_ENV,
    isProd,
    isDev: !isProd,
    PORT: process.env.PORT || 3000,

    // Email Services
    SENDER_EMAIL: isProd 
        ? process.env.SENDER_EMAIL_PROD 
        : process.env.SENDER_EMAIL_DEV,
    
    MAILERSEND_API_KEY: isProd 
        ? process.env.MAILERSEND_API_KEY_PROD 
        : process.env.MAILERSEND_API_KEY_DEV,
    
    RESEND_API_KEY: isProd 
        ? process.env.RESEND_API_KEY_PROD 
        : process.env.RESEND_API_KEY_DEV,

    // Rate Limits
    MAILERSEND_DAILY_LIMIT: isProd 
        ? parseInt(process.env.MAILERSEND_DAILY_LIMIT_PROD || 80)
        : parseInt(process.env.MAILERSEND_DAILY_LIMIT_DEV || 100),
    
    RESEND_DAILY_LIMIT: isProd 
        ? parseInt(process.env.RESEND_DAILY_LIMIT_PROD || 80)
        : parseInt(process.env.RESEND_DAILY_LIMIT_DEV || 100),
    
    MAX_FAILED_ATTEMPTS: isProd 
        ? parseInt(process.env.MAX_FAILED_ATTEMPTS_PROD || 3)
        : parseInt(process.env.MAX_FAILED_ATTEMPTS_DEV || 10),

    // URLs
    APP_URL: isProd 
        ? process.env.APP_URL_PROD 
        : process.env.APP_URL_DEV,

    // Database
    MONGODB_URI: process.env.MONGODB_URI,
    SESSION_SECRET: process.env.SESSION_SECRET
};

module.exports = config;