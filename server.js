const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const config = require('./config/environment');

const app = express();

// HTTPS Redirect (Production only)
if (config.isProd) {
    app.use((req, res, next) => {
        if (req.headers["x-forwarded-proto"] !== "https") {
            return res.redirect("https://" + req.headers.host + req.url);
        }
        next();
    });
    console.log('🔒 HTTPS redirect enabled');
}

// MongoDB Connection
mongoose.connect(config.MONGODB_URI, {
    dbName: 'myDatabase',
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('✓ MongoDB connected');
})
.catch((err) => {
    console.error('✗ MongoDB connection error:', err);
    process.exit(1);
});

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', './views');

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration
app.use(session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: config.MONGODB_URI
    }),
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: config.isProd
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

app.listen(config.PORT, () => {
    const envIcon = config.isProd ? '🚀' : '💻';
    const envLabel = config.isProd ? 'PRODUCTION' : 'DEVELOPMENT';
    
    console.log('\n' + '='.repeat(60));
    console.log(`${envIcon} Server running at ${config.APP_URL}`);
    console.log(`📍 Environment: ${envLabel}`);
    console.log(`🔌 Port: ${config.PORT}`);
    console.log(`📧 Sender Email: ${config.SENDER_EMAIL}`);
    console.log(`📊 Email Limit: ${config.MAILERSEND_DAILY_LIMIT}/day`);
    console.log('='.repeat(60) + '\n');
});