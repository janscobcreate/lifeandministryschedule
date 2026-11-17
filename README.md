# Life and Ministry Schedule

A responsive website for organising **weekly Life and Ministry meeting assignments** and sharing a public, read-only link with congregation members.

## What is included

- A **public weekly schedule** with a left-hand menu that starts at the current week and lists future published weeks.
- A password-protected **administrator editor**. Visitors do not need accounts.
- A **chairman** field for every week.
- **Treasures from God's Word:** 10-minute Talk, 10-minute Spiritual Gems, 5-minute Bible Reading; assignment number, title/topic and assignee fields.
- **Apply Yourself to the Field Ministry:** add/remove/reorder assignments, with number, title, topic, duration, assignee and assistant for every part.
- **Living as Christians:** add/remove/reorder parts; the final entry is always Congregation Bible Study, with separate conductor and reader fields.
- **Auto-number** button (you can also type numbers manually), draft saving, publishing/unpublishing, copy public link, and mobile layout.
- Automatic creation of the current Monday–Sunday week **and the next 11 weeks**, based on Nigeria's `Africa/Lagos` timezone. No fictional people are pre-assigned.
- Published weeks remain visible to the public until they pass. Previous weeks can be accessed by the administrator.

## Run it on your computer (Windows, macOS, or Linux)

1. Install **Node.js 22 or newer** if needed: https://nodejs.org/
2. Unzip the folder and open a terminal inside `life-and-ministry-schedule`.
3. Copy `.env.example` to `.env`.
   - Windows PowerShell: `Copy-Item .env.example .env`
   - macOS/Linux: `cp .env.example .env`
4. Edit `.env` and replace `ADMIN_PASSWORD` with a strong personal password and `SESSION_SECRET` with a long random secret (at least 32 characters).
5. Run:

   ```bash
   node server.js
   ```

6. Open **http://localhost:3000** in your browser. Click **Admin login** to add or edit weeks.

**No `npm install` is required to test locally.** The default development database is `data/schedule.json`, created on first run. The JSON file is deliberately excluded from Git.

### How to prepare the schedule

1. Click **Admin login** and enter the password from `.env`.
2. Select **16–22 Nov**, or whichever current/upcoming week you need, on the left.
3. Click **Edit this week**.
4. Enter the chairman and each part's assigned participant. Use **Add field ministry assignment** and **Add Christian living assignment** to change section lengths. The Bible study stays last.
5. Use **# Auto-number** for a clean sequence, or change any part number yourself.
6. Click **Save draft** to keep it private, or **Publish week** to make it public.
7. Click **Copy public link** and post that address in your WhatsApp/Telegram group.

Members opening the link see only the current and future **published** weeks; they cannot edit the schedule.

## Put it online (for a real shareable link)

**A local `localhost` address cannot be opened by members outside your computer.** You need to deploy the app. A simple option is **Railway + Neon PostgreSQL**:

1. Create a free/paid PostgreSQL database with [Neon](https://neon.tech/) and copy its `DATABASE_URL` connection string.
2. Upload this project to a GitHub repository. Do **not** upload `.env` or `data/schedule.json` (the provided `.gitignore` excludes them).
3. In [Railway](https://railway.com/), create a new service using the GitHub repository.
4. Add these Railway **environment variables**:

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | Your Neon PostgreSQL connection URL, including SSL settings if required |
   | `ADMIN_PASSWORD` | A new strong administrator password |
   | `SESSION_SECRET` | A long random secret (at least 32 characters) |

5. Railway will install the `pg` package from `package.json` and start the app with `npm start` (set **Start Command** to `npm start` if necessary).
6. Open the public domain assigned by Railway. Log in, prepare and publish the first week. Select **Copy public link** and share it.

Database tables are created automatically in PostgreSQL on first start. **Do not rely on the local JSON file for hosted production:** some hosting platforms erase it when redeploying or restarting.

If you prefer to use your own server, Node.js 22 and a PostgreSQL connection are sufficient. Configure HTTPS on the public domain.

## Files

- `server.js` — HTTP API, admin authentication, sessions and security headers.
- `store.js` — week generation, file storage and optional PostgreSQL storage.
- `public/index.html` — website layout and sign-in dialog.
- `public/styles.css` — desktop and mobile design.
- `public/app.js` — weekly navigation, schedule display and editing tools.
- `.env.example` — settings template.
- `tests/basic.test.js` — built-in automated tests (`node --test tests/*.test.js`).

## Important

- Set a strong password and secret, keep the `.env` file confidential, and use HTTPS when publicly hosted.
- This project has **one administrator account** (password-based), with anonymous read-only public access.
- You can host multiple congregations only by deploying separate instances/databases, or extending the data model.
- Names and assignments on a published schedule are intentionally public to anyone with the link.
- No official logos, artwork, or copyrighted publications are included.
