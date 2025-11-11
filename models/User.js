const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        emaildb: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        email: {
            type: String,
            default: null
        },
        firstName: String,
        lastName: String,
        password: {
            type: String,
            required: false
        },
        isVerified: {
            type: Boolean,
            default: false
        },
        verificationToken: {
            type: String,
            default: null
        },
        verificationTokenExpiry: {
            type: Date,
            default: null
        },
        isAdmin: {
            type: Boolean,
            default: false
        },
        role: String,
        studentIDNumber: String,
        invalidLoginAttempts: Number,
        accountLockedUntil: Date,
        invalidResetAttempts: Number,
        accountDisabled: Boolean,
        lastLoginTime: Date
    },
    {
        timestamps: true,
        collection: 'tblUser'
    }
);

const User = mongoose.model('User', userSchema, 'tblUser');

module.exports = User;