const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Event = require('./models/Event');

dotenv.config();

const demoUsers = [
    { name: 'Admin User', email: 'admin@eventshow.com', password: 'password123', role: 'admin' },
    { name: 'Demo User', email: 'user@eventshow.com', password: 'password123', role: 'user' }
];

const demoEvents = [
    {
        title: 'React & Node.js Developer Retreat',
        description: 'Join us for a 3-day deep dive into modern full-stack web development. Perfect for developers looking to take their skills to the next level.',
        date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        location: 'Silicon Valley Innovation Center, CA',
        category: 'Technology',
        totalSeats: 200,
        ticketPrice: 0,
        image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&q=80&w=800'
    },
    {
        title: 'Neon Nights EDM Festival',
        description: 'Experience an unforgettable night of EDM, techno, and dazzling light shows with top DJs from around the globe.',
        date: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        location: 'Grand Arena, New York',
        category: 'Music',
        totalSeats: 500,
        ticketPrice: 1500,
        image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800'
    },
    {
        title: 'Global Leaders Business Summit',
        description: 'A premium gathering of CEOs, founders, and investors discussing the future of global commerce and AI integration.',
        date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        location: 'The Ritz-Carlton, London',
        category: 'Business',
        totalSeats: 150,
        ticketPrice: 5000,
        image: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&q=80&w=800'
    },
    {
        title: 'Modern Art Expo',
        description: 'Discover breathtaking contemporary and modern art from underground and trending artists this season.',
        date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        location: 'Downtown Art Museum',
        category: 'Art',
        totalSeats: 300,
        ticketPrice: 200,
        image: 'https://images.unsplash.com/photo-1536924940846-227afb31e2a5?auto=format&fit=crop&q=80&w=800'
    },
    {
        title: 'Startup Pitch Competition',
        description: 'Watch 25 startups pitch for seed funding. Great networking for entrepreneurs and angel investors.',
        date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        location: 'Convention Center, Miami',
        category: 'Business',
        totalSeats: 250,
        ticketPrice: 100,
        image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=800'
    },
    {
        title: 'Cloud Computing Architecture Seminar',
        description: 'A technical breakdown of scalable cloud solutions, multi-region routing, and serverless computing.',
        date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
        location: 'Tech Hub, Seattle',
        category: 'Technology',
        totalSeats: 100,
        ticketPrice: 600,
        image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=800'
    }
];

async function seedDatabase() {
    try {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Demo seed data is disabled in production');
        }
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventshow');

        const salt = await bcrypt.genSalt(10);
        const users = await Promise.all(demoUsers.map(async (user) => {
            const password = await bcrypt.hash(user.password, salt);
            return User.findOneAndUpdate(
                { email: user.email },
                { $setOnInsert: { ...user, password, isVerified: true } },
                { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
            );
        }));
        const admin = users.find((user) => user.role === 'admin');

        await Promise.all(demoEvents.map((event) => Event.findOneAndUpdate(
            { title: event.title, location: event.location },
            { $setOnInsert: { ...event, availableSeats: event.totalSeats, createdBy: admin._id } },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        )));

        console.log('Demo users and events are ready; existing records were left untouched.');
        console.log('Admin: admin@eventshow.com / password123');
        console.log('User:  user@eventshow.com / password123');
    } catch (error) {
        console.error('Unable to seed demo data:', error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

seedDatabase();
