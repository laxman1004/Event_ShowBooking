const express = require('express');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();


const { protect, admin } = require('../middleware/auth');

const { bookEvent, confirmBooking, getMyBookings, cancelBooking, sendBookingOTP } 
  = require('../controllers/bookingController');


router.post('/send-otp', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ message: 'Too many code requests. Please try again later.' })
}), protect, sendBookingOTP);
router.post('/', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ message: 'Too many booking attempts. Please try again later.' })
}), protect, bookEvent);
router.put('/:id/confirm', protect, admin, confirmBooking);
router.get('/my', protect, getMyBookings);
router.delete('/:id', protect, cancelBooking);

module.exports = router;