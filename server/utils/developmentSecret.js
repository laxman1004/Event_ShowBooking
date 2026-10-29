const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

function getDevelopmentSecret(secretPath = path.join(__dirname, '..', '.dev-jwt-secret')) {
    try {
        const existingSecret = fs.readFileSync(secretPath, 'utf8').trim();
        if (existingSecret) return existingSecret;
        throw new Error('Development JWT secret file is empty');
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    const secret = randomBytes(32).toString('hex');
    try {
        fs.writeFileSync(secretPath, `${secret}\n`, { flag: 'wx', mode: 0o600 });
        return secret;
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const existingSecret = fs.readFileSync(secretPath, 'utf8').trim();
        if (!existingSecret) throw new Error('Development JWT secret file is empty');
        return existingSecret;
    }
}

module.exports = { getDevelopmentSecret };
