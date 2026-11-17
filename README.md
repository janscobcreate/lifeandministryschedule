# Life and Ministry Schedule

A responsive website for organising **weekly Life and Ministry meeting assignments** and sharing a public, read-only link with congregation members.

## What is included

- A **public weekly schedule** with a left-hand menu that starts at the current week and lists future published weeks.
- A password-protected **administrator editor**. Visitors do not need accounts. Admin sign-in appears only at **`/admin`**; it is not displayed on the public link.
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

6. Open **http://localhost:3000** in your browser. Open **http://localhost:3000/admin** to log in and add or edit weeks.

**No `npm install` is required to test locally.** The default development database is `data/schedule.json`, created on first run. The JSON file is deliberately excluded from Git.

### How to prepare the schedule

1. Go to **`/admin`** on your website and enter the password from `.env`.
2. Select **16–22 Nov**, or whichever current/upcoming week you need, on the left.
3. Click **Edit this week**.
4. Enter the chairman and each part's assigned participant. Use **Add field ministry assignment** and **Add Christian living assignment** to change section lengths. The Bible study stays last.
5. Use **# Auto-number** for a clean sequence, or change any part number yourself.
6. Click **Save draft** to keep it private, or **Publish week** to make it public.
7. Click **Copy public link** and post that address in your WhatsApp/Telegram group.

Members opening the public root link (`/`) see only the current and future **published** weeks; they cannot edit the schedule. The public schedule has larger text for readability. Only visit `/admin` yourself to edit and publish. A hidden admin link is not a substitute for a strong password.

## Put it online completely free (GitHub + Neon + Render)

Use **Render Free Web Service** for the Node.js website, **Neon Free PostgreSQL** for the persistent database, and **GitHub Free** to store the code. Do not use a temporary local JSON file when hosted: Render's filesystem resets whenever its free web service restarts, redeploys or spins down. **Render's own free PostgreSQL databases expire after 30 days**, so use Neon instead. Free-plan allowances and terms may change.

### 1. Upload code to GitHub

1. Make a free account at https://github.com and create a repository named `life-and-ministry-schedule` (private is fine).
2. Extract the ZIP. Choose **Add file > Upload files** and drag the **contents** of the extracted `life-and-ministry-schedule` folder into the repository, preserving `public/` and `tests/`. Commit the changes.
3. Check that `package.json`, `server.js` and `store.js` appear at repository root (or remember the subfolder name for Render's Root Directory).
4. **Never upload `.env`, database credentials or the local `data/schedule.json`.** These are excluded from Git, but be careful when using GitHub's upload form.

### 2. Create a free database at Neon

1. Sign up at https://console.neon.tech and select **Free**.
2. Click **Create Project**, call it `life-ministry-schedule`, and finish setup.
3. Open **Connect** in the Neon console and copy its complete **PostgreSQL connection string** (a URL starting with `postgresql://`, normally ending with `?sslmode=require`).
4. Keep this database URL secret. It belongs only in Render's environment variables.

### 3. Deploy using Render Free

1. Sign up at https://dashboard.render.com.
2. Select **New > Web Service**, connect your GitHub account, and choose the `life-and-ministry-schedule` repository.
3. Configure:

   | Setting | Value |
   |---|---|
   | Name | `life-and-ministry-schedule` (or another available name) |
   | Language / Runtime | Node |
   | Branch | `main` |
   | Root Directory | Leave empty if `package.json` is at repo root |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | **Free** |

4. Add **Environment Variables** on Render. Use these exact keys:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Complete private PostgreSQL URL copied from Neon |
   | `ADMIN_PASSWORD` | Your own strong, unique admin password |
   | `SESSION_SECRET` | A randomly generated secret of **at least 32 characters** (keep it private) |
   | `NODE_ENV` | `production` |

5. Click **Deploy Web Service**. After a successful deploy, Render gives you a public HTTPS URL such as `https://life-and-ministry-schedule.onrender.com` (actual name varies).
6. Open your URL with **`/admin`** at the end to sign in and edit a week, then select **Publish week** and share **Copy public link** with members.

Database tables and the current plus next 11 weeks are automatically created on first start. There is no manual SQL import. If an assignment is a draft, the public will not see it until you publish.

### Free-plan limitations

- Render Free web services sleep after roughly **15 minutes of inactivity**, so the first opening after a quiet period may need about a minute to load.
- Render provides a monthly Free-instance-hour allowance, with additional build/bandwidth limits. Free services can be suspended if limits are exceeded. Keep your plan set to **Free** and do not add a paid card or upgrade if your budget is strictly zero.
- Neon Free has usage and storage limits but is more suitable than Render's 30-day-expiring free Postgres database for this app. Create occasional backups of important assignments.
- Anyone with the public link can see names and assignments that you publish. Only the admin with the password can edit.

Docs: https://render.com/docs/free ; https://render.com/docs/your-first-deploy ; https://neon.com/docs/introduction/free-tier

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
