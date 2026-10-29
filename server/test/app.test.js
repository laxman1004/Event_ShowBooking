const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../index');

let server;
let baseUrl;

before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
});

test('health endpoint reports database readiness', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.deepEqual(body, { status: 'starting', database: 'disconnected' });
});

test('event lookup rejects malformed identifiers', async () => {
    const response = await fetch(`${baseUrl}/api/events/not-an-object-id`);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message: 'Invalid event id' });
});

test('registration validates input before writing', async () => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).message, /valid name, email, and password/i);
});

test('JSON endpoints reject non-object request bodies', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([])
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message: 'Request body must be a JSON object' });
});

test('protected booking routes require a bearer token', async () => {
    const response = await fetch(`${baseUrl}/api/bookings/my`);

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: 'Not authorized, no token' });
});

test('API responses include security headers', async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});
