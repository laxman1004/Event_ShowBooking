const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getDevelopmentSecret } = require('../utils/developmentSecret');

test('development JWT secret remains stable across server starts', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eventshow-secret-'));
    const secretPath = path.join(directory, '.dev-jwt-secret');

    try {
        const firstSecret = getDevelopmentSecret(secretPath);
        const secondSecret = getDevelopmentSecret(secretPath);

        assert.equal(firstSecret.length, 64);
        assert.equal(secondSecret, firstSecret);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
