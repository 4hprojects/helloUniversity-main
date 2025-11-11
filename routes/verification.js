const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const { Resend } = require('resend');
const User = require('../models/User');
const config = require('../config/environment');
const {
    checkServiceLimit,
    checkFailedAttempts,
    incrementSuccess,
    incrementFailed
} = require('../services/emailQuotaService');

// Initialize Resend with config
const resend = new Resend(config.RESEND_API_KEY);

// Send via Mailersend - WITH PROPER QUOTA TRACKING
const sendViaMailersend = async (email, emailContent, senderEmail = config.SENDER_EMAIL) => {
    const canSend = await checkServiceLimit('mailersend');
    if (!canSend) {
        console.log('❌ [MAILERSEND] Daily limit reached');
        await incrementFailed('mailersend');
        return false;
    }

    const canRetry = await checkFailedAttempts('mailersend');
    if (!canRetry) {
        console.log('❌ [MAILERSEND] Too many failed attempts');
        return false;
    }

    try {
        console.log('📧 [MAILERSEND] Attempting to send from:', senderEmail);
        
        const response = await axios.post('https://api.mailersend.com/v1/email', {
            from: {
                email: senderEmail,
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

        console.log('✅ [MAILERSEND] Email sent successfully');
        console.log('✅ [MAILERSEND] Message ID:', response.data?.message_id);
        await incrementSuccess('mailersend');
        return true;

    } catch (error) {
        console.error('❌ [MAILERSEND] Failed:', error.response?.status);
        console.error('❌ [MAILERSEND] Error:', error.response?.data?.message);
        await incrementFailed('mailersend');
        return false;
    }
};

// Send via Resend (fallback) - WITH QUOTA TRACKING
const sendViaResend = async (email, emailContent, senderEmail = config.SENDER_EMAIL) => {
    const canSend = await checkServiceLimit('resend');
    if (!canSend) {
        console.log('❌ [RESEND] Daily limit reached');
        await incrementFailed('resend');
        return false;
    }

    const canRetry = await checkFailedAttempts('resend');
    if (!canRetry) {
        console.log('❌ [RESEND] Too many failed attempts');
        return false;
    }

    try {
        console.log('📧 [RESEND] Attempting to send from:', senderEmail);
        
        const response = await resend.emails.send({
            from: senderEmail,
            to: email,
            subject: emailContent.subject,
            html: emailContent.html
        });

        if (response.error) {
            console.error('❌ [RESEND] Error:', response.error);
            await incrementFailed('resend');
            return false;
        }

        console.log('✅ [RESEND] Email sent successfully');
        console.log('✅ [RESEND] Message ID:', response.data?.id);
        await incrementSuccess('resend');
        return true;

    } catch (error) {
        console.error('❌ [RESEND] Failed:', error.message);
        await incrementFailed('resend');
        return false;
    }
};

// Send verification email with Mailersend → Resend fallback
// useAutoSender: true = try multiple senders, false/undefined = use config.SENDER_EMAIL only
const sendVerificationEmail = async (email, token, useAutoSender = true) => {
    const verificationUrl = `${config.APP_URL}/verify-email/${token}`;

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
        console.log('📧 [EMAIL] Auto-sender mode:', useAutoSender ? '🔄 YES (multiple senders)' : '❌ NO (config only)');

        if (useAutoSender) {
            // ✅ TRY MULTIPLE SENDERS (for /request-verification)
            const senderEmails = [
                'noreply@hellouniversity.online',
                'hellouniversityonline@gmail.com',
                'onboarding@resend.dev',
                config.SENDER_EMAIL
            ];

            console.log('📧 [EMAIL] Senders to try:', senderEmails);

            // Try Mailersend with each sender
            console.log('\n📧 [EMAIL] PRIMARY: Trying Mailersend...');
            for (const sender of senderEmails) {
                const result = await sendViaMailersend(email, emailContent, sender);
                if (result) {
                    console.log('✅ [EMAIL] Email sent via Mailersend from:', sender);
                    return true;
                }
            }

            // Fallback to Resend with each sender
            console.log('\n🔄 [EMAIL] FALLBACK: Trying Resend...');
            for (const sender of senderEmails) {
                const result = await sendViaResend(email, emailContent, sender);
                if (result) {
                    console.log('✅ [EMAIL] Email sent via Resend from:', sender);
                    return true;
                }
            }
        } else {
            // ✅ USE CONFIG SENDER ONLY (for signup via auth.js)
            console.log('📧 [EMAIL] From:', config.SENDER_EMAIL);

            // Try Mailersend first
            console.log('\n📧 [EMAIL] PRIMARY: Trying Mailersend...');
            const mailersendSent = await sendViaMailersend(email, emailContent, config.SENDER_EMAIL);

            if (mailersendSent) {
                console.log('✅ [EMAIL] Email sent via Mailersend');
                return true;
            }

            // Fallback to Resend
            console.log('\n🔄 [EMAIL] FALLBACK: Trying Resend...');
            const resendSent = await sendViaResend(email, emailContent, config.SENDER_EMAIL);

            if (resendSent) {
                console.log('✅ [EMAIL] Email sent via Resend');
                return true;
            }
        }

        // All failed
        console.error('❌ [EMAIL] All email services failed');
        return false;

    } catch (error) {
        console.error('❌ [EMAIL] Critical error:', error.message);
        return false;
    }
};

// GET: Verification status page
router.get('/verify-account', async (req, res) => {
    try {
        console.log('\n📧 [VERIFY PAGE] User accessing verification page');
        res.render('verify-account', { message: null, email: null, error: null });
    } catch (error) {
        console.error('❌ [VERIFY PAGE] Error:', error.message);
        res.render('error', { message: 'An error occurred' });
    }
});

// POST: Request verification email
router.post('/request-verification', async (req, res) => {
    try {
        const { email } = req.body;
        console.log('\n📧 [VERIFY REQUEST] Verification email request');
        console.log('📧 [VERIFY REQUEST] Email:', email);

        if (!email) {
            console.log('⚠️ [VERIFY REQUEST] Email not provided');
            return res.render('verify-account', { 
                error: 'Please enter your email address',
                email: null,
                message: null
            });
        }

        // Normalize email
        const normalizedEmail = email.toLowerCase().trim();
        console.log('📧 [VERIFY REQUEST] Normalized email:', normalizedEmail);

        // Search emaildb first, then fallback to email
        let user = await User.findOne({ 
            emaildb: { $regex: `^${normalizedEmail}$`, $options: 'i' }
        });

        if (!user) {
            user = await User.findOne({ 
                email: { $regex: `^${normalizedEmail}$`, $options: 'i' }
            });
        }

        if (!user) {
            console.log('❌ [VERIFY REQUEST] User not found:', normalizedEmail);
            return res.render('verify-account', { 
                error: 'Email not found. Please sign up first.',
                email: null,
                message: null
            });
        }

        console.log('✅ [VERIFY REQUEST] User found:', user.emaildb || user.email);

        // Check if already verified
        if (user.isVerified) {
            console.log('ℹ️ [VERIFY REQUEST] User already verified:', user.emaildb || user.email);
            return res.render('verify-account', { 
                message: 'Your account is already verified! You can now login.',
                email: null,
                error: null
            });
        }

        // ✅ ALWAYS SEND EMAIL OR GENERATE NEW TOKEN IF EXPIRED
        const now = new Date();
        let needsNewToken = false;

        // Check if token exists and is still valid
        if (!user.verificationToken || !user.verificationTokenExpiry || user.verificationTokenExpiry <= now) {
            console.log('🔐 [VERIFY REQUEST] Token expired or missing - generating new token');
            needsNewToken = true;
        } else {
            const timeRemaining = Math.ceil((user.verificationTokenExpiry - now) / (1000 * 60));
            console.log('ℹ️ [VERIFY REQUEST] Token still valid for:', timeRemaining, 'minutes');
        }

        // Generate new token if needed
        if (needsNewToken) {
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

            user.verificationToken = verificationToken;
            user.verificationTokenExpiry = verificationTokenExpiry;
            user.lastVerificationEmailSent = new Date();
            user.verificationEmailCount = (user.verificationEmailCount || 0) + 1;
            
            await user.save();

            console.log('✅ [VERIFY REQUEST] New token generated');
            console.log('📧 [VERIFY REQUEST] Email count:', user.verificationEmailCount);
        } else {
            // Token is still valid, just increment send count
            user.lastVerificationEmailSent = new Date();
            user.verificationEmailCount = (user.verificationEmailCount || 0) + 1;
            await user.save();
            console.log('📧 [VERIFY REQUEST] Resending verification email (token still valid)');
        }

        // ✅ SEND EMAIL WITH AUTO-SENDER (true = try multiple senders)
        console.log('\n📧 [VERIFY REQUEST] Sending verification email with auto-detection...');
        const emailSent = await sendVerificationEmail(user.emaildb || user.email, user.verificationToken, true);

        if (!emailSent) {
            console.log('❌ [VERIFY REQUEST] Failed to send email with all services and senders');
            return res.render('verify-account', { 
                error: 'Failed to send verification email. Please try again later.',
                email: null,
                message: null
            });
        }

        console.log('✅ [VERIFY REQUEST] Verification email sent successfully');
        return res.render('verify-account', { 
            message: `✅ Verification email sent to ${user.emaildb || user.email}. Please check your inbox (and spam folder) and click the verification link.`,
            email: null,
            error: null
        });

    } catch (error) {
        console.error('❌ [VERIFY REQUEST] Critical error:', error.message);
        console.error('❌ [VERIFY REQUEST] Stack:', error.stack);
        res.render('verify-account', { 
            error: 'An error occurred. Please try again.',
            email: null,
            message: null
        });
    }
});

// GET: Email verification
router.get('/verify-email/:token', async (req, res) => {
    try {
        const { token } = req.params;
        console.log('\n📧 [VERIFY] Email verification attempt');
        console.log('📧 [VERIFY] Token:', token.substring(0, 10) + '...');

        const user = await User.findOne({
            verificationToken: token,
            verificationTokenExpiry: { $gt: Date.now() }
        });

        if (!user) {
            console.log('❌ [VERIFY] Invalid or expired token');
            return res.render('verify-error', { 
                message: 'Invalid or expired verification link' 
            });
        }

        console.log('✅ [VERIFY] Valid token found for user:', user.emaildb || user.email);

        user.isVerified = true;
        user.verificationToken = null;
        user.verificationTokenExpiry = null;
        await user.save();

        console.log('✅ [VERIFY] User verified successfully:', user.emaildb || user.email);
        res.render('verify-success');

    } catch (error) {
        console.error('❌ [VERIFY] Error:', error.message);
        res.render('verify-error', { 
            message: 'An error occurred during verification' 
        });
    }
});

// DEBUG: Check verification tokens
router.get('/debug/verify-tokens', async (req, res) => {
    try {
        console.log('\n📋 [DEBUG] Checking verification tokens...');
        
        const usersWithTokens = await User.find({ 
            verificationToken: { $ne: null }
        }).select('emaildb verificationToken verificationTokenExpiry isVerified');
        
        console.log('📋 [DEBUG] Users with active verification tokens:');
        usersWithTokens.forEach((user, index) => {
            console.log(`${index + 1}. Email: ${user.emaildb} | Verified: ${user.isVerified} | Token: ${user.verificationToken?.substring(0, 10)}... | Expires: ${user.verificationTokenExpiry}`);
        });

        res.json({ 
            totalWithTokens: usersWithTokens.length,
            users: usersWithTokens.map(u => ({
                email: u.emaildb,
                isVerified: u.isVerified,
                tokenGenerated: !!u.verificationToken,
                expiresAt: u.verificationTokenExpiry
            }))
        });
    } catch (error) {
        console.error('❌ [DEBUG] Error:', error.message);
        res.json({ error: error.message });
    }
});

module.exports = router;