const mongoose = require('mongoose');

const emailQuotaSchema = new mongoose.Schema(
    {
        _id: {
            type: String,
            required: true,
            // Format: "2025-11-11"
        },
        resendCount: {
            type: Number,
            default: 0
        },
        resendFailedCount: {
            type: Number,
            default: 0
        },
        resendFailedAttempts: {
            type: Number,
            default: 0
        },
        mailersendCount: {
            type: Number,
            default: 0
        },
        mailersendFailedCount: {
            type: Number,
            default: 0
        },
        mailersendFailedAttempts: {
            type: Number,
            default: 0
        },
        totalCount: {
            type: Number,
            default: 0
        },
        totalFailedCount: {
            type: Number,
            default: 0
        },
        date: {
            type: Date,
            default: Date.now
        }
    },
    {
        collection: 'emailQuota',
        timestamps: false
    }
);

const EmailQuota = mongoose.model('EmailQuota', emailQuotaSchema, 'emailQuota');

module.exports = EmailQuota;