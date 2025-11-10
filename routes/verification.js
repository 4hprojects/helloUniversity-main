const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const User = require('../models/User');
require('dotenv').config();

// Sendgrid configuration
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

// Send verification email using Sendgrid or Resend
const sendVerificationEmail = async (email, token) => {
    const verificationUrl = `http://localhost:3000/verify-email/${token}`;
    
    resetEmailCount();

    const emailContent = {
        from: process.env.SENDER_EMAIL,
        to: email,
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
        console.log('📧 [EMAIL] Emails sent today:', emailsSentToday);

        // Check if we've reached 95 emails limit
        if (emailsSentToday >= 95) {
            console.log('⚠️ [EMAIL] Sendgrid limit (95) reached, using Resend as fallback');
            return await sendViaResend(email, emailContent);
        }

        // Try Sendgrid first
        console.log('📧 [EMAIL] Using Sendgrid (Primary)');
        await sgMail.send(emailContent);
        emailsSentToday++;
        
        console.log('✅ [EMAIL] Email sent via Sendgrid');
        console.log('📊 [EMAIL] Total sent today:', emailsSentToday);
        return true;

    } catch (error) {
        console.error('❌ [EMAIL] Sendgrid error:', error.message);
        console.log('🔄 [EMAIL] Falling back to Resend...');
        
        // Fallback to Resend
        return await sendViaResend(email, emailContent);
    }
};

// Send via Resend (backup)
const sendViaResend = async (email, emailContent) => {
    try {
        console.log('📧 [EMAIL] Using Resend (Fallback)');
        
        const response = await axios.post('https://api.resend.com/emails', {
            from: emailContent.from,
            to: emailContent.to,
            subject: emailContent.subject,
            html: emailContent.html
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ [EMAIL] Email sent via Resend (Fallback)');
        console.log('✅ [EMAIL] Response ID:', response.data.id);
        return true;

    } catch (error) {
        console.error('❌ [EMAIL] Resend error:', error.message);
        console.error('❌ [EMAIL] Resend response:', error.response?.data);
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

        const user = await User.findOne({ email });

        if (!user) {
            console.log('❌ [VERIFY REQUEST] User not found:', email);
            return res.render('verify-account', { 
                error: 'Email not found in our system',
                email: null,
                message: null
            });
        }

        // Check if already verified
        if (user.isVerified) {
            console.log('ℹ️ [VERIFY REQUEST] User already verified:', email);
            return res.render('verify-account', { 
                message: 'Your account is already verified! You can now login.',
                email: null,
                error: null
            });
        }

        // Check if token is still valid (not expired)
        const now = new Date();
        if (user.verificationTokenExpiry && user.verificationTokenExpiry > now) {
            console.log('ℹ️ [VERIFY REQUEST] Token still valid for:', email);
            console.log('📧 [VERIFY REQUEST] Expires at:', user.verificationTokenExpiry);
            
            const timeRemaining = Math.ceil((user.verificationTokenExpiry - now) / (1000 * 60)); // minutes
            return res.render('verify-account', { 
                message: `A verification email was already sent to ${email}. It will expire in ${timeRemaining} minutes. Please check your inbox (and spam folder).`,
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
        await user.save();

        console.log('✅ [VERIFY REQUEST] Token saved for:', email);
        console.log('📧 [VERIFY REQUEST] Email count:', user.verificationEmailCount);

        // Send verification email using Sendgrid/Resend
        const emailSent = await sendVerificationEmail(email, verificationToken);

        if (!emailSent) {
            console.log('❌ [VERIFY REQUEST] Failed to send email via both services');
            return res.render('verify-account', { 
                error: 'Failed to send verification email. Please try again later.',
                email: null,
                message: null
            });
        }

        console.log('✅ [VERIFY REQUEST] Verification email sent successfully');
        return res.render('verify-account', { 
            message: `Verification email sent to ${email}. Please check your inbox and click the verification link.`,
            email: null,
            error: null
        });

    } catch (error) {
        console.error('❌ [VERIFY REQUEST] Critical error:', error.message);
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
        console.log('📧 [VERIFY] Token:', token);

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

        console.log('✅ [VERIFY] Valid token found for user:', user.email);

        user.isVerified = true;
        user.verificationToken = null;
        user.verificationTokenExpiry = null;
        await user.save();

        console.log('✅ [VERIFY] User verified successfully:', user.email);
        res.render('verify-success');

    } catch (error) {
        console.error('❌ [VERIFY] Error:', error.message);
        res.render('verify-error', { 
            message: 'An error occurred during verification' 
        });
    }
});

module.exports = router;