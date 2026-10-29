const nodemailer = require('nodemailer');

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[character]));

const getTransporter = () => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        throw new Error('Email transport is not configured');
    }
    return nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
};

const sendBookingEmail = async (userEmail, userName, eventTitle) => {
    const safeName = escapeHtml(userName);
    const safeTitle = escapeHtml(eventTitle);
    await getTransporter().sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: userEmail,
        subject: `Booking confirmed: ${eventTitle}`,
        html: `<div style="font-family:Arial,sans-serif;padding:24px"><h2>You're in, ${safeName}!</h2><p>Your booking for <strong>${safeTitle}</strong> is confirmed.</p><p>Thanks for choosing EventShow.</p></div>`
    });
};

const sendOTPEmail = async (userEmail, otp, type) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Email transport is not configured');
        }
        return { delivered: false, developmentCode: otp };
    }
    const title = type === 'account_verification' ? 'Verify your EventShow account' : 'EventShow booking verification';
    const message = type === 'account_verification'
        ? 'Use the following code to verify your new EventShow account.'
        : 'Use the following code to verify and submit your event booking.';
    const info = await getTransporter().sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: userEmail,
        subject: title,
        html: `<div style="font-family:Arial,sans-serif;text-align:center;padding:24px"><h2>${title}</h2><p>${message}</p><p style="font-size:30px;font-weight:bold;letter-spacing:8px">${escapeHtml(otp)}</p><p>This code expires in five minutes. If you did not request it, ignore this email.</p></div>`
    });
    return { delivered: true, messageId: info.messageId };
};

module.exports = { sendBookingEmail, sendOTPEmail };
