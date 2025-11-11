const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const { sendVerificationEmail } = require('./verification');

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

        // ✅ SEND VERIFICATION EMAIL WITH AUTO-SENDER
        const emailResult = await sendVerificationEmail(normalizedEmail, verificationToken, true);

        if (!emailResult) {
            console.log('❌ [SIGNUP] Failed to send verification email');
            return res.render('signup', { 
                errors: ['Signup successful but failed to send verification email. Please use the resend option.'] 
            });
        }

        console.log('✅ [SIGNUP] Signup successful for:', normalizedEmail);
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