const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const axios = require('axios');
const { Resend } = require('resend');
const User = require('../models/User');
const config = require('../config/environment');

// Initialize Resend with config
const resend = new Resend(config.RESEND_API_KEY);

// Get app URL based on NODE_ENV
const getAppUrl = () => {
    if (process.env.NODE_ENV === 'production') {
        return process.env.APP_URL_PROD || 'http://hellouniversity.online';
    }
    return process.env.APP_URL_DEV || 'http://localhost:3000';
};

// Send via Mailersend
const sendViaMailersend = async (email, emailContent) => {
    try {
        // Check rate limit
        const canSend = await checkServiceLimit('mailersend');
        if (!canSend) {
            console.log('❌ [MAILERSEND] Daily limit reached');
            await incrementFailed('mailersend');
            return { success: false, reason: 'Daily limit reached' };
        }

        // Check failed attempts
        const canRetry = await checkFailedAttempts('mailersend');
        if (!canRetry) {
            console.log('❌ [MAILERSEND] Too many failed attempts');
            return { success: false, reason: 'Too many failed attempts' };
        }

        console.log('📧 [MAILERSEND] Attempting to send...');
        
        const response = await axios.post('https://api.mailersend.com/v1/email', {
            from: {
                email: config.SENDER_EMAIL,
                name: 'Hello University'
            },
            to: [{ email: email }],
            subject: emailContent.subject,
            html: emailContent.html
        }, {
            headers: {
                'Authorization': `Bearer ${config.MAILERSEND_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        await incrementSuccess('mailersend');
        console.log('✅ [MAILERSEND] Email sent successfully');
        console.log('✅ [MAILERSEND] Message ID:', response.data?.message_id);
        return { success: true, messageId: response.data?.message_id, service: 'mailersend' };

    } catch (error) {
        await incrementFailed('mailersend');
        console.error('❌ [MAILERSEND] Failed:', error.response?.status);
        console.error('❌ [MAILERSEND] Error:', error.response?.data?.message);
        return { success: false, reason: error.response?.data?.message };
    }
};

// Send via Resend (fallback)
const sendViaResend = async (email, emailContent) => {
    try {
        // Check rate limit
        const canSend = await checkServiceLimit('resend');
        if (!canSend) {
            console.log('❌ [RESEND] Daily limit reached');
            await incrementFailed('resend');
            return { success: false, reason: 'Daily limit reached' };
        }

        // Check failed attempts
        const canRetry = await checkFailedAttempts('resend');
        if (!canRetry) {
            console.log('❌ [RESEND] Too many failed attempts');
            return { success: false, reason: 'Too many failed attempts' };
        }

        console.log('📧 [RESEND] Attempting to send...');
        
        const response = await resend.emails.send({
            from: config.SENDER_EMAIL || 'onboarding@resend.dev',
            to: email,
            subject: emailContent.subject,
            html: emailContent.html
        });

        if (response.error) {
            await incrementFailed('resend');
            console.error('❌ [RESEND] Error:', response.error);
            return { success: false, reason: response.error };
        }

        await incrementSuccess('resend');
        console.log('✅ [RESEND] Email sent successfully');
        console.log('✅ [RESEND] Message ID:', response.data?.id);
        return { success: true, messageId: response.data?.id, service: 'resend' };

    } catch (error) {
        await incrementFailed('resend');
        console.error('❌ [RESEND] Failed:', error.message);
        return { success: false, reason: error.message };
    }
};

// Send verification email with Mailersend → Resend fallback
const sendVerificationEmail = async (email, token) => {
    const verificationUrl = `${config.APP_URL}/verify-email/${token}`;
    
    console.log('\n📧 [EMAIL] Verification URL:', verificationUrl);

    const emailContent = {
        subject: 'Email Verification - Hello University',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #667eea;">Welcome to Hello University!</h2>
                <p>Please verify your email by clicking the button below:</p>
                <a href="${verificationUrl}" style="background-color: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0;">
                    Verify Email
                </a>
                <p>Or copy and paste this link: ${verificationUrl}</p>
                <p><strong>This link will expire in 24 hours.</strong></p>
                <p>If you didn't create this account, please ignore this email.</p>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                <p style="color: #666; font-size: 12px;">Hello University - Quality Education & Learning</p>
            </div>
        `
    };

    try {
        console.log('\n📧 [EMAIL] Attempting to send verification email');
        console.log('📧 [EMAIL] To:', email);
        console.log('📧 [EMAIL] From:', config.SENDER_EMAIL);

        // Try Mailersend first
        console.log('\n📧 [EMAIL] PRIMARY: Trying Mailersend...');
        const mailersendResult = await sendViaMailersend(email, emailContent);

        if (mailersendResult.success) {
            console.log('✅ [EMAIL] Email sent via Mailersend');
            return { success: true, service: 'mailersend', messageId: mailersendResult.messageId };
        }

        // Fallback to Resend
        console.log('\n🔄 [EMAIL] FALLBACK: Trying Resend...');
        const resendResult = await sendViaResend(email, emailContent);

        if (resendResult.success) {
            console.log('✅ [EMAIL] Email sent via Resend');
            return { success: true, service: 'resend', messageId: resendResult.messageId };
        }

        // Both failed
        console.error('❌ [EMAIL] All email services failed');
        return { success: false, reason: 'All email services failed' };

    } catch (error) {
        console.error('❌ [EMAIL] Critical error:', error.message);
        return { success: false, reason: error.message };
    }
};

// POST: Signup
router.post('/signup', async (req, res) => {
    try {
        const { email, password, confirmPassword } = req.body;
        console.log('\n🔐 [SIGNUP] New signup attempt');
        console.log('🔐 [SIGNUP] Email:', email);

        const errors = [];

        if (!email || !password || !confirmPassword) {
            errors.push('All fields are required');
            console.log('⚠️ [SIGNUP] Missing fields');
            return res.render('signup', { errors });
        }

        if (password !== confirmPassword) {
            errors.push('Passwords do not match');
            console.log('⚠️ [SIGNUP] Password mismatch');
            return res.render('signup', { errors });
        }

        if (password.length < 6) {
            errors.push('Password must be at least 6 characters');
            console.log('⚠️ [SIGNUP] Password too short');
            return res.render('signup', { errors });
        }

        const normalizedEmail = email.toLowerCase().trim();
        let existingUser = await User.findOne({ 
            emaildb: { $regex: `^${normalizedEmail}$`, $options: 'i' }
        });

        if (!existingUser) {
            existingUser = await User.findOne({ 
                email: { $regex: `^${normalizedEmail}$`, $options: 'i' }
            });
        }

        if (existingUser) {
            errors.push('Email already registered');
            console.log('❌ [SIGNUP] Email already exists:', email);
            return res.render('signup', { errors });
        }

        console.log('🔐 [SIGNUP] Hashing password...');
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('✅ [SIGNUP] Password hashed');

        console.log('🔐 [SIGNUP] Generating verification token');
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const newUser = new User({
            emaildb: normalizedEmail,
            email: normalizedEmail,
            password: hashedPassword,
            verificationToken,
            verificationTokenExpiry,
            isVerified: false
        });

        await newUser.save();
        console.log('✅ [SIGNUP] User created in database:', newUser.emaildb);
        console.log('✅ [SIGNUP] User ID:', newUser._id);

        // Send verification email
        const emailResult = await sendVerificationEmail(normalizedEmail, verificationToken);

        if (!emailResult.success) {
            console.log('❌ [SIGNUP] Failed to send verification email');
            return res.render('signup', { 
                errors: [`Signup successful but failed to send verification email: ${emailResult.reason}`] 
            });
        }

        console.log('✅ [SIGNUP] Signup successful for:', normalizedEmail);
        console.log('📧 [SIGNUP] Email sent via:', emailResult.service);
        return res.render('signup-success', { email: normalizedEmail });

    } catch (error) {
        console.error('❌ [SIGNUP] Critical error:', error.message);
        res.render('signup', { 
            errors: ['An error occurred. Please try again.'] 
        });
    }
});

// POST: Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('\n🔓 [LOGIN] Login attempt');
        console.log('🔓 [LOGIN] Email:', email);

        const errors = [];

        if (!email || !password) {
            errors.push('Email and password are required');
            console.log('⚠️ [LOGIN] Missing email or password');
            return res.render('login', { errors });
        }

        const normalizedEmail = email.toLowerCase().trim();
        console.log('🔓 [LOGIN] Normalized email:', normalizedEmail);

        console.log('🔓 [LOGIN] Searching database for user...');
        let user = await User.findOne({ 
            emaildb: { $regex: `^${normalizedEmail}$`, $options: 'i' }
        });

        if (!user) {
            user = await User.findOne({ 
                email: { $regex: `^${normalizedEmail}$`, $options: 'i' }
            });
        }

        if (!user) {
            console.log('❌ [LOGIN] User not found:', normalizedEmail);
            return res.render('login', { 
                errors: ['Email not found. Please sign up first.'] 
            });
        }

        console.log('✅ [LOGIN] User found:', user.emaildb || user.email);
        console.log('🔓 [LOGIN] User ID:', user._id);
        console.log('✓ [LOGIN] User verified status:', user.isVerified);

        if (!user.password) {
            console.log('❌ [LOGIN] User has no password hash (corrupted record)');
            return res.render('login', { 
                errors: ['Account error. Please contact support.'] 
            });
        }

        console.log('🔓 [LOGIN] Comparing passwords...');
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            console.log('❌ [LOGIN] Password mismatch');
            return res.render('login', { 
                errors: ['Invalid email or password'] 
            });
        }

        console.log('✅ [LOGIN] Password correct');

        if (!user.isVerified) {
            console.log('⚠️ [LOGIN] User not verified:', user.emaildb || user.email);
            
            if (!user.verificationToken) {
                console.log('🔐 [LOGIN] Migrated user detected - generating verification token');
                user.verificationToken = crypto.randomBytes(32).toString('hex');
                user.verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
                await user.save();
                console.log('✅ [LOGIN] Verification token generated');
            }

            console.log('ℹ️ [LOGIN] Redirecting to verification page');
            req.session.tempEmail = user.emaildb || user.email;
            req.session.tempUserId = user._id;
            return res.redirect('/verify-account');
        }

        console.log('✅ [LOGIN] User is verified');

        req.session.userId = user._id;
        req.session.userEmail = user.emaildb || user.email;
        req.session.isAdmin = user.isAdmin || false;

        console.log('✅ [LOGIN] Session created');
        console.log('✅ [LOGIN] Login successful!');

        res.redirect('/dashboard');

    } catch (error) {
        console.error('❌ [LOGIN] Critical error:', error.message);
        res.render('login', { 
            errors: ['An error occurred. Please try again later.'] 
        });
    }
});

module.exports = router;