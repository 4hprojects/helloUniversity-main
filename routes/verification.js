const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const { Resend } = require('resend');
const User = require('../models/User');
const config = require('../config/environment');

// Initialize Resend with config
const resend = new Resend(config.RESEND_API_KEY);

let emailsSentToday = 0;
let emailResetTime = new Date().toDateString();

// Reset email count at midnight
const resetEmailCount = () => {
    const today = new Date().toDateString();
    if (today !== emailResetTime) {
        emailsSentToday = 0;
        emailResetTime = today;
        console.log('🔄 [EMAIL] Daily email count reset');
    }
};

// Send via Mailersend
const sendViaMailersend = async (email, emailContent) => {
    try {
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

        console.log('✅ [MAILERSEND] Email sent successfully');
        console.log('✅ [MAILERSEND] Message ID:', response.data?.message_id);
        return true;

    } catch (error) {
        console.error('❌ [MAILERSEND] Failed:', error.response?.status);
        console.error('❌ [MAILERSEND] Error:', error.response?.data?.message);
        return false;
    }
};

// Send via Resend (fallback)
const sendViaResend = async (email, emailContent) => {
    try {
        console.log('📧 [RESEND] Attempting to send...');
        
        const response = await resend.emails.send({
            from: config.SENDER_EMAIL || 'onboarding@resend.dev',
            to: email,
            subject: emailContent.subject,
            html: emailContent.html
        });

        if (response.error) {
            console.error('❌ [RESEND] Error:', response.error);
            return false;
        }

        console.log('✅ [RESEND] Email sent successfully');
        console.log('✅ [RESEND] Message ID:', response.data?.id);
        return true;

    } catch (error) {
        console.error('❌ [RESEND] Failed:', error.message);
        return false;
    }
};

// Send verification email with Mailersend → Resend fallback
const sendVerificationEmail = async (email, token) => {
    const verificationUrl = `${config.APP_URL}/verify-email/${token}`;
    
    resetEmailCount();

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
        const mailersendSent = await sendViaMailersend(email, emailContent);

        if (mailersendSent) {
            console.log('✅ [EMAIL] Email sent via Mailersend');
            return true;
        }

        // Fallback to Resend
        console.log('\n🔄 [EMAIL] FALLBACK: Trying Resend...');
        const resendSent = await sendViaResend(email, emailContent);

        if (resendSent) {
            console.log('✅ [EMAIL] Email sent via Resend');
            return true;
        }

        // Both failed
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

        // Check if token is still valid
        const now = new Date();
        if (user.verificationTokenExpiry && user.verificationTokenExpiry > now) {
            console.log('ℹ️ [VERIFY REQUEST] Token still valid for:', user.emaildb || user.email);
            console.log('📧 [VERIFY REQUEST] Expires at:', user.verificationTokenExpiry);
            
            const timeRemaining = Math.ceil((user.verificationTokenExpiry - now) / (1000 * 60));
            return res.render('verify-account', { 
                message: `A verification email was already sent to ${user.emaildb || user.email}. It will expire in ${timeRemaining} minutes. Please check your inbox and spam folder.`,
                email: null,
                error: null
            });
        }

        // Generate new verification token
        console.log('🔐 [VERIFY REQUEST] Generating new verification token');
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

        user.verificationToken = verificationToken;
        user.verificationTokenExpiry = verificationTokenExpiry;
        user.lastVerificationEmailSent = new Date();
        user.verificationEmailCount = (user.verificationEmailCount || 0) + 1;
        user.isVerified = user.isVerified || false;
        
        await user.save();

        console.log('✅ [VERIFY REQUEST] Token saved');
        console.log('📧 [VERIFY REQUEST] Email count:', user.verificationEmailCount);

        // Send verification email
        const emailSent = await sendVerificationEmail(user.emaildb || user.email, verificationToken);

        if (!emailSent) {
            console.log('❌ [VERIFY REQUEST] Failed to send email with all services');
            return res.render('verify-account', { 
                error: 'Failed to send verification email. Please try again later.',
                email: null,
                message: null
            });
        }

        console.log('✅ [VERIFY REQUEST] Verification email sent successfully');
        return res.render('verify-account', { 
            message: `Verification email sent to ${user.emaildb || user.email}. Please check your inbox (and spam folder) and click the verification link.`,
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