const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
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

// Validation functions
const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

const validatePassword = (password) => {
    return password.length >= 8;
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

// POST: Signup
router.post('/signup', async (req, res) => {
    try {
        console.log('\n🔐 [SIGNUP] New signup attempt');
        console.log('🔐 [SIGNUP] Email:', req.body.email);

        const { email, password, confirmPassword } = req.body;
        const errors = [];

        // Validation
        if (!email || !validateEmail(email)) {
            errors.push('Invalid email address');
            console.log('⚠️ [SIGNUP] Email validation failed:', email);
        }

        if (!password || !validatePassword(password)) {
            errors.push('Password must be at least 8 characters long');
            console.log('⚠️ [SIGNUP] Password validation failed: length <', password?.length);
        }

        if (password !== confirmPassword) {
            errors.push('Passwords do not match');
            console.log('⚠️ [SIGNUP] Password mismatch');
        }

        if (errors.length > 0) {
            console.log('❌ [SIGNUP] Validation errors:', errors);
            return res.render('signup', { errors, email, success: null });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.log('⚠️ [SIGNUP] Email already registered:', email);
            return res.render('signup', { 
                errors: ['Email already registered'], 
                email,
                success: null
            });
        }

        // Hash password
        console.log('🔐 [SIGNUP] Hashing password...');
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('✅ [SIGNUP] Password hashed');

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        console.log('🔐 [SIGNUP] Verification token generated:', verificationToken);

        // Create user
        const newUser = new User({
            email,
            password: hashedPassword,
            verificationToken,
            verificationTokenExpiry,
            isVerified: false
        });

        await newUser.save();
        console.log('✅ [SIGNUP] User created in database:', email);
        console.log('✅ [SIGNUP] User ID:', newUser._id);

        // Send verification email
        const emailSent = await sendVerificationEmail(email, verificationToken);

        if (!emailSent) {
            console.log('❌ [SIGNUP] Failed to send verification email');
            return res.render('signup', { 
                errors: ['Failed to send verification email. Please try again.'], 
                email,
                success: null
            });
        }

        console.log('✅ [SIGNUP] Signup successful for:', email);
        return res.render('signup', { 
            success: 'Signup successful! Check your email to verify your account.',
            errors: [],
            email: null
        });

    } catch (error) {
        console.error('❌ [SIGNUP] Critical error:', error.message);
        console.error('❌ [SIGNUP] Stack:', error.stack);
        res.render('signup', { 
            errors: ['An error occurred. Please try again.'],
            email: null,
            success: null
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

        console.log('🔓 [LOGIN] Looking for user:', email);
        const user = await User.findOne({ email });

        if (!user) {
            console.log('❌ [LOGIN] User not found:', email);
            return res.render('login', { 
                errors: ['Invalid email or password'] 
            });
        }

        console.log('✅ [LOGIN] User found:', email);
        console.log('🔓 [LOGIN] Checking password...');

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            console.log('❌ [LOGIN] Password mismatch for user:', email);
            return res.render('login', { 
                errors: ['Invalid email or password'] 
            });
        }

        console.log('✅ [LOGIN] Password correct');

        if (!user.isVerified) {
            console.log('⚠️ [LOGIN] User not verified:', email);
            return res.render('login', { 
                errors: ['Please verify your email before logging in'] 
            });
        }

        console.log('✅ [LOGIN] User verified');

        // Set session
        req.session.userId = user._id;
        req.session.userEmail = user.email;

        console.log('✅ [LOGIN] Session created for user:', email);
        console.log('✅ [LOGIN] Session ID:', req.session.id);
        console.log('✅ [LOGIN] Login successful!');

        res.redirect('/dashboard');

    } catch (error) {
        console.error('❌ [LOGIN] Critical error:', error.message);
        console.error('❌ [LOGIN] Stack:', error.stack);
        res.render('login', { 
            errors: ['An error occurred. Please try again.'] 
        });
    }
});

// GET: Logout
router.get('/logout', (req, res) => {
    console.log('\n🔓 [LOGOUT] Logout attempt');
    console.log('🔓 [LOGOUT] User:', req.session.userEmail);

    req.session.destroy((err) => {
        if (err) {
            console.error('❌ [LOGOUT] Error destroying session:', err);
            return res.redirect('/dashboard');
        }
        console.log('✅ [LOGOUT] Session destroyed successfully');
        res.redirect('/');
    });
});

module.exports = router;