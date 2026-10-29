const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sendOTPEmail } = require('../utils/email');

test('development mode provides a local verification code without SMTP', async () => {
    const previous = {
        nodeEnv: process.env.NODE_ENV,
        emailUser: process.env.EMAIL_USER,
        emailPass: process.env.EMAIL_PASS
    };

    try {
        process.env.NODE_ENV = 'development';
        delete process.env.EMAIL_USER;
        delete process.env.EMAIL_PASS;

        const result = await sendOTPEmail('person@example.test', '123456', 'account_verification');

        assert.deepEqual(result, { delivered: false, developmentCode: '123456' });
    } finally {
        if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous.nodeEnv;
        if (previous.emailUser === undefined) delete process.env.EMAIL_USER;
        else process.env.EMAIL_USER = previous.emailUser;
        if (previous.emailPass === undefined) delete process.env.EMAIL_PASS;
        else process.env.EMAIL_PASS = previous.emailPass;
    }
});

test('production mode never exposes an OTP when SMTP is missing', async () => {
    const previous = {
        nodeEnv: process.env.NODE_ENV,
        emailUser: process.env.EMAIL_USER,
        emailPass: process.env.EMAIL_PASS
    };

    try {
        process.env.NODE_ENV = 'production';
        delete process.env.EMAIL_USER;
        delete process.env.EMAIL_PASS;

        await assert.rejects(
            sendOTPEmail('person@example.test', '123456', 'account_verification'),
            /Email transport is not configured/
        );
    } finally {
        if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous.nodeEnv;
        if (previous.emailUser === undefined) delete process.env.EMAIL_USER;
        else process.env.EMAIL_USER = previous.emailUser;
        if (previous.emailPass === undefined) delete process.env.EMAIL_PASS;
        else process.env.EMAIL_PASS = previous.emailPass;
    }
});
