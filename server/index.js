require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const mongoose = require('mongoose');
const { getDevelopmentSecret } = require('./utils/developmentSecret');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const bookingRoutes = require('./routes/booking');

const app = express();
const port = Number(process.env.PORT) || 5000;
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push('http://127.0.0.1:5173');
}

app.disable('x-powered-by');
if (process.env.TRUST_PROXY) {
    const proxyHops = Number(process.env.TRUST_PROXY);
    app.set('trust proxy', Number.isInteger(proxyHops) && proxyHops >= 0 ? proxyHops : process.env.TRUST_PROXY);
}
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            imgSrc: ["'self'", 'data:', 'https:']
        }
    }
}));
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origin is not allowed by CORS'));
    }
}));
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ message: 'Too many requests. Please try again later.' })
}));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method) &&
        (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) {
        return res.status(400).json({ message: 'Request body must be a JSON object' });
    }
    next();
});

app.get('/api/health', (req, res) => {
    const databaseReady = mongoose.connection.readyState === 1;
    res.status(databaseReady ? 200 : 503).json({
        status: databaseReady ? 'ok' : 'starting',
        database: databaseReady ? 'connected' : 'disconnected'
    });
});
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/bookings', bookingRoutes);
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        return res.status(400).json({ message: 'Request body must be valid JSON' });
    }
    if (error.message === 'Origin is not allowed by CORS') {
        return res.status(403).json({ message: 'Origin is not allowed' });
    }
    console.error('Unhandled request error:', error.message);
    return res.status(500).json({ message: 'Internal server error' });
});

async function start() {
    if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
    const isProduction = process.env.NODE_ENV === 'production';
    if (!process.env.MONGODB_URI && !isProduction) {
        process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/eventshow';
        console.warn('MONGODB_URI is not set; using the local development database.');
    }
    if (!process.env.JWT_SECRET && !isProduction) {
        process.env.JWT_SECRET = getDevelopmentSecret();
        console.warn('JWT_SECRET is not set; using the local development secret.');
    }
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
    if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
        throw new Error('JWT_SECRET must be set to a random value of at least 32 characters in production');
    }
    if (isProduction && (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)) {
        throw new Error('EMAIL_USER and EMAIL_PASS are required in production');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    const host = process.env.HOST || (isProduction ? '0.0.0.0' : '127.0.0.1');
    const server = app.listen(port, host, () => console.log(`EventShow API listening on ${host}:${port}`));

    const shutdown = async (signal) => {
        console.log(`${signal} received; closing server`);
        server.close(async () => {
            await mongoose.disconnect();
            process.exit(0);
        });
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
    start().catch((error) => {
        console.error('Unable to start EventShow API:', error.message);
        process.exit(1);
    });
}

module.exports = { app, start };
