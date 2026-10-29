const mongoose = require('mongoose');
const Event = require('../models/Event');
const Booking = require('../models/Booking');

const eventFields = ['title', 'description', 'date', 'location', 'category', 'totalSeats', 'ticketPrice', 'image'];
const invalidId = (id) => !mongoose.isValidObjectId(id);
const isValidImageUrl = (value) => {
    if (!value) return true;
    try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch (error) {
        return false;
    }
};

exports.getEvents = async (req, res) => {
    try {
        const filters = {};
        if (req.query.category) filters.category = req.query.category;
        if (req.query.search) {
            const search = String(req.query.search).trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filters.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } }
            ];
        }
        if (req.query.upcoming === 'true') filters.date = { $gte: new Date() };
        const events = await Event.find(filters).sort({ date: 1 }).limit(200).lean();
        res.json(events);
    } catch (error) {
        res.status(500).json({ message: 'Unable to load events' });
    }
};

exports.getEventById = async (req, res) => {
    if (invalidId(req.params.id)) return res.status(400).json({ message: 'Invalid event id' });
    try {
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ message: 'Event not found' });
        res.json(event);
    } catch (error) {
        res.status(500).json({ message: 'Unable to load event' });
    }
};

exports.createEvent = async (req, res) => {
    try {
        const { title, description, date, location, category, totalSeats, ticketPrice, image } = req.body;
        if (!title || !description || !date || !location || !category ||
            !Number.isInteger(Number(totalSeats)) || Number(totalSeats) < 1 ||
            !Number.isFinite(Number(ticketPrice ?? 0)) || Number(ticketPrice ?? 0) < 0 ||
            Number.isNaN(new Date(date).getTime()) || new Date(date) <= new Date()) {
            return res.status(400).json({ message: 'Provide a future date, event details, positive seat count, and a valid ticket price' });
        }
        if (!isValidImageUrl(image)) return res.status(400).json({ message: 'Event image must use an http or https URL' });
        const event = await Event.create({
            title: String(title).trim(),
            description: String(description).trim(),
            date,
            location: String(location).trim(),
            category: String(category).trim(),
            totalSeats: Number(totalSeats),
            availableSeats: Number(totalSeats),
            ticketPrice: Number(ticketPrice ?? 0),
            image: image ? String(image).trim() : '',
            createdBy: req.user.id
        });
        res.status(201).json(event);
    } catch (error) {
        if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
        res.status(500).json({ message: 'Unable to create event' });
    }
};

exports.updateEvent = async (req, res) => {
    if (invalidId(req.params.id)) return res.status(400).json({ message: 'Invalid event id' });
    try {
        const updates = {};
        for (const field of eventFields) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) updates[field] = req.body[field];
        }
        if (Object.keys(updates).length === 0) return res.status(400).json({ message: 'No event fields provided' });
        if (updates.title !== undefined) updates.title = String(updates.title).trim();
        if (updates.description !== undefined) updates.description = String(updates.description).trim();
        if (updates.location !== undefined) updates.location = String(updates.location).trim();
        if (updates.category !== undefined) updates.category = String(updates.category).trim();
        if (updates.image !== undefined) updates.image = String(updates.image).trim();
        if (updates.image !== undefined && !isValidImageUrl(updates.image)) {
            return res.status(400).json({ message: 'Event image must use an http or https URL' });
        }
        if (updates.totalSeats !== undefined) {
            const seats = Number(updates.totalSeats);
            if (!Number.isInteger(seats) || seats < 1) return res.status(400).json({ message: 'Seat count must be a positive whole number' });
            const current = await Event.findById(req.params.id);
            if (!current) return res.status(404).json({ message: 'Event not found' });
            const reservedSeats = current.totalSeats - current.availableSeats;
            if (seats < reservedSeats) return res.status(400).json({ message: 'Seat count cannot be lower than the number of confirmed bookings' });
            updates.availableSeats = seats - reservedSeats;
        }
        if (updates.ticketPrice !== undefined && (!Number.isFinite(Number(updates.ticketPrice)) || Number(updates.ticketPrice) < 0)) {
            return res.status(400).json({ message: 'Ticket price must be zero or more' });
        }
        if (updates.date !== undefined && (Number.isNaN(new Date(updates.date).getTime()) || new Date(updates.date) <= new Date())) {
            return res.status(400).json({ message: 'Event date must be in the future' });
        }
        const event = await Event.findByIdAndUpdate(req.params.id, updates, { returnDocument: 'after', runValidators: true });
        if (!event) return res.status(404).json({ message: 'Event not found' });
        res.json(event);
    } catch (error) {
        if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
        res.status(500).json({ message: 'Unable to update event' });
    }
};

exports.deleteEvent = async (req, res) => {
    if (invalidId(req.params.id)) return res.status(400).json({ message: 'Invalid event id' });
    try {
        const activeBookings = await Booking.exists({
            eventId: req.params.id,
            status: { $in: ['pending', 'confirmed'] }
        });
        if (activeBookings) return res.status(409).json({ message: 'Cancel active bookings before deleting this event' });
        const event = await Event.findByIdAndDelete(req.params.id);
        if (!event) return res.status(404).json({ message: 'Event not found' });
        res.json({ message: 'Event deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Unable to delete event' });
    }
};
