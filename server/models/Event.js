const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        minlength: 3,
        maxlength: 120
    },
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 5000
    },
    date: {
        type: Date,
        required: true,
        validate: { validator: (value) => value > new Date(), message: 'Event date must be in the future' }
    },
    location: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    category: {
        type: String,
        required: true,
        trim: true,
        maxlength: 60
    },
    totalSeats: {
        type: Number,
        required: true,
        min: 1,
        validate: Number.isInteger
    },
    availableSeats: {
        type: Number,
        required: true,
        min: 0,
        validate: Number.isInteger
    },
    image: {
        type: String,
        trim: true,
        maxlength: 2048
    },
    ticketPrice: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

eventSchema.index({ date: 1, category: 1 });

module.exports = mongoose.model('Event', eventSchema);