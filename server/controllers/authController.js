const User = require('../models/User');
const OTP = require('../models/OTP');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendOTPEmail } = require('../utils/email');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const generateToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

exports.register = async (req, res) => {
    try {
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const password = typeof req.body.password === 'string' ? req.body.password : '';
        if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
            return res.status(400).json({ message: 'Enter a valid name, email, and password with at least 8 characters' });
        }
        const user = await User.findOne({ email });
        if (user) return res.status(409).json({ message: 'User already exists' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const createdUser = await User.create({
            name,
            email,
            password: hashedPassword,
            role: 'user',
            isVerified: false
        });

        const otp = generateOTP();
        let emailResult;
        try {
            await OTP.deleteMany({ email, action: 'account_verification' });
            await OTP.create({ email, otp, action: 'account_verification' });
            emailResult = await sendOTPEmail(email, otp, 'account_verification');
        } catch (emailError) {
            await OTP.deleteMany({ email, action: 'account_verification' });
            await User.deleteOne({ _id: createdUser._id });
            console.error('Registration email delivery failed:', emailError.message);
            return res.status(503).json({ message: 'Email delivery is unavailable. Registration was not completed.' });
        }

        res.status(201).json({
            message: emailResult.delivered
                ? 'OTP sent to email. Please verify.'
                : 'Email is not configured; use the development code to verify your account.',
            email: createdUser.email,
            ...(emailResult.developmentCode ? { developmentCode: emailResult.developmentCode } : {})
        });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'User already exists' });
        res.status(500).json({ message: 'Unable to register right now' });
    }
};

exports.login = async (req, res) => {
    try {
        const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const password = typeof req.body.password === 'string' ? req.body.password : '';
        if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
        const user = await User.findOne({ email }).select('+password');
        if (!user) return res.status(400).json({ message: 'Invalid credentials, Please sign up first' });

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        if (!user.isVerified && user.role !== 'admin') {
            const otp = generateOTP();
            let emailResult;
            try {
                await OTP.findOneAndDelete({ email: user.email, action: 'account_verification' });
                await OTP.create({ email: user.email, otp, action: 'account_verification' });
                emailResult = await sendOTPEmail(user.email, otp, 'account_verification');
            } catch (emailError) {
                console.error('Verification email delivery failed:', emailError.message);
                return res.status(503).json({ message: 'Email delivery is unavailable. Please try again later.' });
            }
            return res.status(403).json({
                message: 'Account not verified',
                needsVerification: true,
                email: user.email,
                ...(emailResult.developmentCode ? { developmentCode: emailResult.developmentCode } : {})
            });
        }

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id, user.role)
        });
    } catch (error) {
        res.status(500).json({ message: 'Unable to log in right now' });
    }
};

exports.verifyOtp = async (req, res) => {
    try {
        const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';
        const validOTP = await OTP.findOneAndDelete({
            email,
            otp,
            action: 'account_verification',
            createdAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) }
        });

        if (!validOTP) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        const user = await User.findOneAndUpdate({ email }, { isVerified: true }, { returnDocument: 'after' });
        if (!user) return res.status(404).json({ message: 'Account not found' });

        res.json({
            message: 'Account verified successfully.',
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id, user.role)
        });
    } catch (error) {
        res.status(500).json({ message: 'Unable to verify this account right now' });
    }
};
