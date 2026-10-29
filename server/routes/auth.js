const express = require('express');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();
const {register,
       login,
       verifyOtp
    } = require('../controllers/authController');

router.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ message: 'Too many authentication attempts. Please try again later.' })
}));

router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOtp);

module.exports = router;
