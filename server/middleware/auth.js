const jwt = require('jsonwebtoken');
const User = require('../models/User');

//User  Authentication Middlewre
const protect = async (req, res, next) => {
    const authorization = req.headers.authorization;
    if (authorization && authorization.startsWith('Bearer ')) {
        let decoded;
        try {
            decoded = jwt.verify(authorization.slice(7), process.env.JWT_SECRET);
        } catch (error) {
            return res.status(401).json({ message: 'Not authorized, token failed' });
        }

        try {
            req.user = await User.findById(decoded.id);
            if (!req.user) return res.status(401).json({ message: 'Not authorized, user not found' });
            return next();
        } catch (error) {
            return next(error);
        }
    } else {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }
};

const admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'Not authorized as an admin' });
    }
};

module.exports = { protect, admin };