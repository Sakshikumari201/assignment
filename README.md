# SplitShare — Shared Expense Management App

> **Live Demo**: 🚀 [https://splitshare-frontend.vercel.app](https://splitshare-frontend.vercel.app) *(deploy in progress — see setup below to run locally)*
> 
> **Backend API**: [https://splitshare-api.onrender.com](https://splitshare-api.onrender.com)

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
| Deployment | Render (backend) + Vercel (frontend) + Supabase (database) |

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
| Aisha | aisha@example.com | password123 | Jan 2025 – present |
| Rohan | rohan@example.com | password123 | Jan 2025 – present |
| Priya | priya@example.com | password123 | Jan 2025 – present |
| Meera | meera@example.com | password123 | Feb 2025 – Mar 2025 |
| Dev | dev@example.com | password123 | Jan 2025 – present |
| Sam | sam@example.com | password123 | Apr 2025 – present |

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

### Database — Supabase
1. Create project at [supabase.com](https://supabase.com)
2. Go to Settings → Database → copy the **Connection string (URI, Transaction pooler)**
3. Use as `DATABASE_URL` in production

### Backend — Render
1. Create a Web Service at [render.com](https://render.com)
2. Connect this GitHub repository
3. Set **Root Directory**: `backend`
4. **Build Command**: `npm install && npx prisma generate && npx prisma db push`
5. **Start Command**: `npm start`
6. Environment variables:
   - `DATABASE_URL` = `<supabase connection string>`
   - `JWT_SECRET` = `<strong random secret>`
   - `PORT` = `10000`

### Frontend — Vercel
1. Import repo at [vercel.com](https://vercel.com)
2. **Root Directory**: `frontend`
3. **Build Command**: `npm run build`
4. **Output Directory**: `dist`
5. Environment variable:
   - `VITE_API_URL` = `<your render backend URL>`

---

## 🤖 AI Tools Used

Built with assistance from **Antigravity (Google DeepMind)** for pair-programming, schema design, algorithm design, and documentation. See [AI_USAGE.md](./AI_USAGE.md) for detailed usage log.
