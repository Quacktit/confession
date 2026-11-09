# unspokenadc

Run: `npm install` then `npm start` (http://localhost:3000, opens on the confessions page).

## Environment variables
Required in production:
- `JWT_SECRET` - long random string
- `ADMIN_KEY` - admin password for /admin.html (20+ characters)
- `EMAIL_ENC_KEY` - 64 hex characters (keep a backup; lose it and stored emails are unreadable)
- `MONGO_URI` - MongoDB connection string (keeps data across deploys)

Password reset emails (free option, Google Apps Script relay):
- `MAIL_WEBHOOK_URL`, `MAIL_WEBHOOK_SECRET`, `APP_URL` (e.g. https://your-app.onrender.com)

Alternative: `BREVO_API_KEY`, `MAIL_FROM`, `APP_URL`.
Optional: `PORT`, `ALLOWED_DOMAIN` (restrict signups to a college email domain).
