const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✓ MongoDB connected'))
    .catch(err => console.log('✗ MongoDB connection error:', err));

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', './views');

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI
    }),
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false
    }
}));

// Import routes
const authRoutes = require('./routes/auth');
const pageRoutes = require('./routes/pages');
const adminRoutes = require('./routes/admin');
const verificationRoutes = require('./routes/verification');

// Use routes
app.use('/', pageRoutes);
app.use('/', authRoutes);
app.use('/', adminRoutes);
app.use('/', verificationRoutes);

app.listen(PORT, () => {
    console.log(`✓ Server running at http://localhost:${PORT}`);
});