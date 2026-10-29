# EventShow

EventShow is an event discovery and booking site built with React/Vite, Express, and MongoDB/Mongoose. It includes public event discovery, account verification, event booking requests, a personal ticket list, and admin tools for publishing events and confirming or cancelling bookings.

## Requirements

- Node.js 20 or newer
- MongoDB (local or hosted)
- An SMTP/email account for email verification and booking codes

## Local setup

1. Configure the API:

   ```powershell
   cd server
   Copy-Item .env.example .env
   ```

   Set `MONGODB_URI`, a random `JWT_SECRET`, and `EMAIL_USER`/`EMAIL_PASS` in `server/.env`. Gmail requires an app password. `CLIENT_URL` defaults to `http://localhost:5173`.

2. Install API dependencies and optionally load local demo data:

   ```powershell
   npm install
   npm run seed
   npm run dev
   ```

   The seed is idempotent and does not delete or overwrite existing records. It creates local-only demo accounts: `admin@eventshow.com` and `user@eventshow.com`, both with password `password123`. Never use these accounts or credentials in production.

   For a quick local start, the API defaults to `mongodb://127.0.0.1:27017/eventshow`, binds only to localhost, and creates a local JWT secret when no `.env` exists. The secret is kept in the ignored `server/.dev-jwt-secret` file so local sessions survive API restarts. Start a local MongoDB service first. With no SMTP credentials in development, verification codes are automatically filled into the verification forms; configure email to deliver real messages. Production still requires explicit MongoDB, JWT, and email configuration.

3. In a second terminal, install and start the client:

   ```powershell
   cd client
   Copy-Item .env.example .env
   npm install
   npm run dev
   ```

   Open `http://localhost:5173`. Vite proxies `/api` to the local API at `http://localhost:5000`. Set `VITE_API_URL` when the API is hosted elsewhere.

## Production notes

- Set `NODE_ENV=production`, `MONGODB_URI`, `CLIENT_URL`, and a unique `JWT_SECRET` of at least 32 characters. Keep credentials in the hosting provider's secret manager, not in source control.
- If the API is behind a trusted reverse proxy, set `TRUST_PROXY` to the actual proxy hop count required by your hosting setup so IP-based request limits use the right client address.
- Configure a real SMTP provider; account verification and booking-code flows intentionally fail clearly if email is unavailable.
- Build the frontend with `npm run build` in `client` and serve the generated `client/dist` using a static host. Deploy the Express API separately and set `VITE_API_URL` to its public `/api` URL before building.
- `/api/health` reports API and database readiness.
- The API applies Helmet security headers, a general request limit, stricter authentication and booking limits, and allows HTTPS-hosted event images. For multi-instance deployments, configure a shared rate-limit store rather than the default per-process memory store.
- The project does not include a payment processor. Booking confirmations remain marked `not_paid`; connect and verify a payment provider before accepting online payments or marking tickets as paid.
- Demo seeding is blocked when `NODE_ENV=production`.
