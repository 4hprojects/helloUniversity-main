const express = require('express');
const router = express.Router();
const { isLoggedIn, isNotLoggedIn } = require('../middleware/authMiddleware');

// GET: Home page
router.get('/', (req, res) => {
    res.render('index');
});

// GET: Login page
router.get('/login', isNotLoggedIn, (req, res) => {
    res.render('login', { errors: [] });
});

// GET: Signup page
router.get('/signup', isNotLoggedIn, (req, res) => {
    res.render('signup', { errors: [], success: null, email: null });
});

// GET: Dashboard page (Protected)
router.get('/dashboard', isLoggedIn, (req, res) => {
    res.render('dashboard', { userEmail: req.session.userEmail });
});

module.exports = router;