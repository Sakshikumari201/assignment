# SplitShare — Shared Expense Management App

> **Live Demo**: 🚀 [https://frontend-sakshi19.vercel.app](https://frontend-sakshi19.vercel.app)
> 
> **Backend API**: [https://assignment-production-76ed.up.railway.app](https://assignment-production-76ed.up.railway.app)
> 
> **Health Check**: [https://assignment-production-76ed.up.railway.app/health](https://assignment-production-76ed.up.railway.app/health)

A production-ready, database-backed Shared Expense Management Application built with a ledger-based balance calculation engine, multi-currency conversion support, dynamic membership timelines, and a 15-check CSV anomaly detection pipeline.

---

## 🏗️ Architecture Overview

```
┌─────────────────────┐        HTTP/JSON        ┌──────────────────────┐
│   React + Vite SPA  │ ──────────────────────▶ │  Express.js REST API │
│   (Tailwind CSS)    │ ◀────────────────────── │  (Node.js + Prisma)  │
└─────────────────────┘                          └──────────┬───────────┘
                                                            │ Prisma ORM
                                                 ┌──────────▼───────────┐
                                                 │   PostgreSQL (prod)   │
                                                 │   SQLite (dev auto)   │
                                                 └──────────────────────┘
```

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router, Axios |
| Backend | Node.js, Express.js, Prisma 6 ORM |
| Database | PostgreSQL (production) / SQLite (auto-fallback for dev) |
| Auth | JWT (JSON Web Tokens) + bcrypt password hashing |
| Deployment | Railway (backend + PostgreSQL) + Vercel (frontend) |

---

## ⚡ Local Setup & Installation

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- PostgreSQL (optional — app auto-falls back to SQLite if Postgres is unavailable)

---

### 1. Clone the Repository

```bash
git clone https://github.com/Sakshikumari201/assignment.git
cd assignment
```

---

### 2. Backend Setup

```bash
cd backend
npm install
```

Copy the example env file and configure:

```bash
cp .env.example .env
```

Edit `backend/.env`:

```env
PORT=5000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/shared_expenses?schema=public"
JWT_SECRET="your_secure_jwt_secret_here"
```

Run the automated database setup (auto-detects PostgreSQL; falls back to SQLite):

```bash
npm run db:setup
```

Start the development server:

```bash
npm run dev
```

✅ Backend running at: `http://localhost:5000`

---

### 3. Frontend Setup

```bash
cd ../frontend
npm install
```

Create `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:5000
```

Start the Vite dev server:

```bash
npm run dev
```

✅ Frontend running at: `http://localhost:5173`

---

## 🧪 Test Credentials

The database seeds 6 users with proper membership timelines:

| User | Email | Password | Active Period |
|---|---|---|---|
| Aisha | aisha@example.com | password123 | Jan 2026 – present |
| Rohan | rohan@example.com | password123 | Jan 2026 – present |
| Priya | priya@example.com | password123 | Jan 2026 – present |
| Meera | meera@example.com | password123 | Feb 2026 – Mar 2026 |
| Dev | dev@example.com | password123 | Jan 2026 – present |
| Sam | sam@example.com | password123 | Apr 2026 – present |

---

## 📂 Project Structure

```
assignment/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # 8-model relational schema
│   │   ├── seed.js              # Seeds 6 flatmates + group
│   │   └── setup-db.js          # Auto-setup with SQLite fallback
│   ├── src/
│   │   ├── balances/            # Greedy debt-simplification engine
│   │   ├── controllers/         # Auth, balance, expense, group, import, settlement
│   │   ├── import/              # 15-check CSV anomaly detection pipeline
│   │   ├── middleware/          # JWT auth + error handler
│   │   ├── routes/              # Express route definitions
│   │   ├── utils/               # Custom error classes
│   │   └── index.js             # App entry point
│   ├── uploads/                 # CSV upload temp directory
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/          # Layout, Sidebar
│   │   ├── context/             # AuthContext (JWT storage)
│   │   ├── pages/               # Dashboard, GroupDetail, ExpenseForm, Import, Traceability
│   │   └── services/            # Axios API wrapper
│   └── package.json
├── expenses_export.csv          # Test CSV — 135 rows, 15+ anomaly types
├── IMPORT_REPORT.md             # Import engine output for the test CSV
├── SCOPE.md                     # DB schema + anomaly detection matrix
├── DECISIONS.md                 # Architectural decision log
├── AI_USAGE.md                  # AI tools, prompts, and error corrections
└── render.yaml                  # Render deployment config
```

---

## 🚀 Production Deployment

### Current Deployment
- **Frontend**: [https://frontend-sakshi19.vercel.app](https://frontend-sakshi19.vercel.app) — Vercel
- **Backend**: [https://assignment-production-76ed.up.railway.app](https://assignment-production-76ed.up.railway.app) — Railway
- **Database**: PostgreSQL on Railway

### Deploy Your Own

#### Backend — Railway
1. Go to [railway.app](https://railway.app) → New Project → Add PostgreSQL
2. Add GitHub repo as a service, set Root Directory: `backend`
3. Build Command: `npm install && npx prisma generate`
4. Start Command: `cd backend && npx prisma db push && npm start`
5. Environment variables: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, `FRONTEND_URL`

#### Frontend — Vercel
1. Import repo at [vercel.com](https://vercel.com)
2. **Root Directory**: `frontend`
3. **Build Command**: `npm run build` / **Output Directory**: `dist`
4. Environment variable: `VITE_API_URL` = your Railway backend URL

---

## 🤖 AI Tools Used

Built with assistance from **Antigravity (Google DeepMind)** for pair-programming, schema design, algorithm design, and documentation. See [AI_USAGE.md](./AI_USAGE.md) for detailed usage log.
