const EmailQuota = require('../models/EmailQuota');
const config = require('../config/environment');

// Get today's date in YYYY-MM-DD format
const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
};

// Get or create today's quota record
const getTodayQuota = async () => {
    const todayDate = getTodayDate();
    
    let quota = await EmailQuota.findById(todayDate);
    
    if (!quota) {
        quota = new EmailQuota({
            _id: todayDate,
            resendCount: 0,
            resendFailedCount: 0,
            resendFailedAttempts: 0,
            mailersendCount: 0,
            mailersendFailedCount: 0,
            mailersendFailedAttempts: 0,
            totalCount: 0,
            totalFailedCount: 0
        });
        await quota.save();
        console.log('📊 [QUOTA] Created new daily quota for:', todayDate);
    }
    
    return quota;
};

// Check if service has hit daily limit
const checkServiceLimit = async (service) => {
    const quota = await getTodayQuota();
    const limit = service === 'resend' 
        ? config.RESEND_DAILY_LIMIT
        : config.MAILERSEND_DAILY_LIMIT;
    
    const count = service === 'resend' ? quota.resendCount : quota.mailersendCount;
    
    if (count >= limit) {
        console.log(`⚠️ [QUOTA] ${service} daily limit reached: ${count}/${limit}`);
        return false;
    }
    
    console.log(`✓ [QUOTA] ${service} within limit: ${count}/${limit}`);
    return true;
};

// Check if service has too many failed attempts
const checkFailedAttempts = async (service) => {
    const quota = await getTodayQuota();
    const maxAttempts = config.MAX_FAILED_ATTEMPTS;
    
    const failedAttempts = service === 'resend' 
        ? quota.resendFailedAttempts 
        : quota.mailersendFailedAttempts;
    
    if (failedAttempts >= maxAttempts) {
        console.log(`❌ [QUOTA] ${service} failed attempts exceeded: ${failedAttempts}/${maxAttempts}`);
        return false;
    }
    
    console.log(`✓ [QUOTA] ${service} failed attempts ok: ${failedAttempts}/${maxAttempts}`);
    return true;
};

// Increment successful send
const incrementSuccess = async (service) => {
    const quota = await getTodayQuota();
    
    if (service === 'resend') {
        quota.resendCount += 1;
        quota.resendFailedAttempts = 0; // Reset failed attempts on success
    } else {
        quota.mailersendCount += 1;
        quota.mailersendFailedAttempts = 0; // Reset failed attempts on success
    }
    
    quota.totalCount = quota.resendCount + quota.mailersendCount;
    
    await quota.save();
    
    console.log(`📊 [QUOTA] Incremented ${service} success count`);
    console.log(`📊 [QUOTA] Daily totals - Resend: ${quota.resendCount}, Mailersend: ${quota.mailersendCount}, Total: ${quota.totalCount}`);
};

// Increment failed attempt
const incrementFailed = async (service) => {
    const quota = await getTodayQuota();
    
    if (service === 'resend') {
        quota.resendFailedCount += 1;
        quota.resendFailedAttempts += 1;
    } else {
        quota.mailersendFailedCount += 1;
        quota.mailersendFailedAttempts += 1;
    }
    
    quota.totalFailedCount = quota.resendFailedCount + quota.mailersendFailedCount;
    
    await quota.save();
    
    console.log(`📊 [QUOTA] Incremented ${service} failed count`);
    console.log(`📊 [QUOTA] Failed totals - Resend: ${quota.resendFailedCount}, Mailersend: ${quota.mailersendFailedCount}, Total: ${quota.totalFailedCount}`);
};

// Get quota report for a specific date
const getQuotaReport = async (date = null) => {
    const queryDate = date || getTodayDate();
    return await EmailQuota.findById(queryDate);
};

module.exports = {
    getTodayDate,
    getTodayQuota,
    checkServiceLimit,
    checkFailedAttempts,
    incrementSuccess,
    incrementFailed,
    getQuotaReport
};