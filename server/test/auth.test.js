const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

test('database errors during authentication are not reported as invalid tokens', async () => {
    const originalFindById = User.findById;
    const originalSecret = process.env.JWT_SECRET;
    const expectedError = new Error('Database unavailable');
    const secret = 'test-secret-with-more-than-thirty-two-characters';
    process.env.JWT_SECRET = secret;
    User.findById = async () => { throw expectedError; };

    let forwardedError;
    const response = {
        statusCode: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json() {
            return this;
        }
    };

    try {
        await protect({
            headers: { authorization: `Bearer ${jwt.sign({ id: '507f1f77bcf86cd799439011' }, secret)}` }
        }, response, (error) => { forwardedError = error; });

        assert.equal(response.statusCode, null);
        assert.equal(forwardedError, expectedError);
    } finally {
        User.findById = originalFindById;
        if (originalSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = originalSecret;
    }
});
