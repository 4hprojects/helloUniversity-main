const User = require('../models/User');

const isLoggedIn = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
};

const isVerified = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
};

const isNotLoggedIn = (req, res, next) => {
    if (!req.session.userId) {
        next();
    } else {
        res.redirect('/dashboard');
    }
};

const isAdmin = async (req, res, next) => {
    try {
        if (!req.session.userId) {
            return res.redirect('/login');
        }

        const user = await User.findById(req.session.userId);
        
        if (!user || !user.isAdmin) {
            return res.status(403).render('error', { 
                message: 'Access Denied: Admin privileges required' 
            });
        }

        next();
    } catch (error) {
        console.error('Admin check error:', error);
        res.status(500).render('error', { 
            message: 'An error occurred' 
        });
    }
};

module.exports = { isLoggedIn, isVerified, isNotLoggedIn, isAdmin };