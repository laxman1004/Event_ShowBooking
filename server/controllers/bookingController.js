const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Event = require('../models/Event');
const OTP = require('../models/OTP');
const { sendBookingEmail, sendOTPEmail } = require('../utils/email');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
const invalidId = (id) => !mongoose.isValidObjectId(id);

exports.sendBookingOTP = async (req, res) => {
    try {
        const otp = generateOTP();
        await OTP.findOneAndDelete({ email: req.user.email, action: 'event_booking' });
        await OTP.create({ email: req.user.email, otp, action: 'event_booking' });
        let emailResult;
        try {
            emailResult = await sendOTPEmail(req.user.email, otp, 'event_booking');
        } catch (emailError) {
            await OTP.deleteOne({ email: req.user.email, otp, action: 'event_booking' });
            console.error('Booking OTP email delivery failed:', emailError.message);
            return res.status(503).json({ message: 'Email delivery is unavailable. Please try again later.' });
        }
        res.json({
            message: emailResult.delivered
                ? 'OTP sent successfully'
                : 'Email is not configured; use the development code to verify your booking.',
            ...(emailResult.developmentCode ? { developmentCode: emailResult.developmentCode } : {})
        });
    } catch (error) {
        res.status(500).json({ message: 'Unable to send a booking code' });
    }
};

exports.bookEvent = async (req, res) => {
    try {
        const { eventId } = req.body;
        const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';
        if (invalidId(eventId)) return res.status(400).json({ message: 'Invalid event id' });
        if (!/^\d{6}$/.test(otp)) return res.status(400).json({ message: 'Enter the 6-digit booking code' });

        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ message: 'Event not found' });
        if (event.date <= new Date()) return res.status(400).json({ message: 'This event has already taken place' });
        if (event.availableSeats <= 0) return res.status(409).json({ message: 'No seats available' });

        const existingBooking = await Booking.findOne({ userId: req.user.id, eventId });
        if (existingBooking && existingBooking.status !== 'cancelled') {
            return res.status(409).json({ message: 'Already booked or pending' });
        }

        const validOTP = await OTP.findOneAndDelete({
            email: req.user.email,
            otp,
            action: 'event_booking',
            createdAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) }
        });
        if (!validOTP) return res.status(400).json({ message: 'Invalid or expired OTP for booking' });

        const booking = await Booking.create({
            userId: req.user.id,
            eventId,
            status: 'pending',
            paymentStatus: 'not_paid',
            amount: event.ticketPrice
        });
        res.status(201).json({ message: 'Booking request submitted', booking });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'Already booked or pending' });
        res.status(500).json({ message: 'Unable to create booking' });
    }
};

exports.confirmBooking = async (req, res) => {
    try {
        if (invalidId(req.params.id)) return res.status(400).json({ message: 'Invalid booking id' });
        const paymentStatus = req.body.paymentStatus || 'not_paid';
        if (!['paid', 'not_paid'].includes(paymentStatus)) {
            return res.status(400).json({ message: 'Invalid payment status' });
        }

        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (booking.status !== 'pending') return res.status(409).json({ message: 'Only pending bookings can be confirmed' });

        const event = await Event.findOneAndUpdate(
            { _id: booking.eventId, availableSeats: { $gt: 0 }, date: { $gt: new Date() } },
            { $inc: { availableSeats: -1 } },
            { returnDocument: 'after' }
        );
        if (!event) return res.status(409).json({ message: 'No seats available or event has already taken place' });

        const updatedBooking = await Booking.findOneAndUpdate(
            { _id: booking._id, status: 'pending' },
            { $set: { status: 'confirmed', paymentStatus } },
            { returnDocument: 'after' }
        ).populate('userId', 'name email').populate('eventId');

        if (!updatedBooking) {
            await Event.updateOne({ _id: event._id }, { $inc: { availableSeats: 1 } });
            return res.status(409).json({ message: 'Booking has already been updated' });
        }

        try {
            await sendBookingEmail(updatedBooking.userId.email, updatedBooking.userId.name, updatedBooking.eventId.title);
        } catch (emailError) {
            console.error('Booking confirmation email delivery failed:', emailError.message);
            return res.json({ message: 'Booking confirmed, but the confirmation email could not be delivered', booking: updatedBooking });
        }
        res.json({ message: 'Booking confirmed successfully', booking: updatedBooking });
    } catch (error) {
        res.status(500).json({ message: 'Unable to confirm booking' });
    }
};

exports.getMyBookings = async (req, res) => {
    try {
        const bookings = req.user.role === 'admin'
            ? await Booking.find().populate('eventId').populate('userId', 'name email').sort({ createdAt: -1 }).limit(500)
            : await Booking.find({ userId: req.user.id }).populate('eventId').sort({ createdAt: -1 }).limit(100);
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: 'Unable to load bookings' });
    }
};

exports.cancelBooking = async (req, res) => {
    try {
        if (invalidId(req.params.id)) return res.status(400).json({ message: 'Invalid booking id' });
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (booking.userId.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        if (booking.status === 'cancelled') return res.status(409).json({ message: 'Already cancelled' });

        const wasConfirmed = booking.status === 'confirmed';
        const cancelled = await Booking.findOneAndUpdate(
            { _id: booking._id, status: booking.status },
            { $set: { status: 'cancelled' } },
            { returnDocument: 'after' }
        );
        if (!cancelled) return res.status(409).json({ message: 'Booking has already been updated' });
        if (wasConfirmed) {
            await Event.updateOne(
                { _id: booking.eventId, $expr: { $lt: ['$availableSeats', '$totalSeats'] } },
                { $inc: { availableSeats: 1 } }
            );
        }
        res.json({ message: 'Booking cancelled successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Unable to cancel booking' });
    }
};
