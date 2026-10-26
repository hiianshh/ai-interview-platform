# InterviewAI

InterviewAI is a MERN SaaS foundation for deliberate interview practice. It combines realistic sessions with feedback that helps candidates understand what to improve next.

![InterviewAI dashboard](docs/screenshot-placeholder.png)

## Features

- JWT access and refresh token authentication with bcrypt password hashing
- Resume PDF upload endpoint with extracted skills persisted to MongoDB
- Interview generation by role, experience, category, and difficulty
- One-question-at-a-time mock interview with progress and answer capture
- Feedback model for overall, communication, technical, and confidence scores
- Dashboard score trends, skill breakdown, history, profile, and responsive navigation
- Docker Compose setup for MongoDB, Express API, and Vite frontend

## Stack

React + Vite, Framer Motion, Recharts, Node.js, Express, MongoDB/Mongoose, JWT, bcrypt, Multer, OpenAI-ready services, Cloudinary-ready uploads, Docker.

## Local setup

```bash
npm install
npm install --prefix client
npm install --prefix server
cp server/.env.example server/.env
npm run dev
```

The frontend runs at `http://localhost:5173` and the API at `http://localhost:5001`.

## Docker

```bash
docker compose up --build
```

## Deployment

### Vercel frontend

1. Push the repository to GitHub.
2. In Vercel, import the repository and set the project root to `client`.
3. Vercel detects Vite automatically. Build command: `npm run build`; output directory: `dist`.
4. Add `VITE_API_URL` with the public Render API URL, for example `https://interview-ai-api.onrender.com`.
5. Redeploy after saving the variable. `client/vercel.json` keeps client-side routes working on refresh.

### Render backend

Deploy the `server` directory as a Node web service, or use the included `render.yaml`. Set `MONGODB_URI` to MongoDB Atlas, generate strong JWT secrets, and set `CLIENT_URL` to the deployed Vercel URL. The server listens on Render's injected `PORT`.

## API

`POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me`, `GET /api/admin/login-events`, `PATCH /api/users/me`, `POST /api/resumes`, `POST /api/interviews/generate`, `POST /api/interviews/:id/feedback`, `GET /api/interviews`, and `DELETE /api/interviews/:id`.

## Login activity

Each login attempt is stored in the MongoDB `loginevents` collection with the email, linked user, timestamp, IP address, user-agent, and success status. Promote your own account to admin from `mongosh`:

```bash
mongosh
use interview-ai
db.users.updateOne({ email: "your-email@example.com" }, { $set: { role: "admin" } })
```

After logging in, use the returned access token with `GET /api/admin/login-events` to view the latest 100 events. You can also inspect the collection directly in MongoDB Compass.
