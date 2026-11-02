# YorBalance — Saree & Silk Shop Ledger & Billing Application

A professional, responsive multi-tenant ledger, billing, and dues management application tailored specifically for **saree, silk, and handloom textile merchants**. Built according to the comprehensive **HLD and LLD specification**.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite, TypeScript | Single Page Application (PWA ready), mobile-first responsive layout |
| **Styling** | Tailwind CSS | Indian saree & silk merchant aesthetic (rich crimson/maroon, gold, and slate) |
| **Authentication** | Firebase Authentication | Email/Password, Google Sign-in, Password Reset |
| **API & Backend** | Node.js, Express, TypeScript | Modular REST API (deployable on Firebase Cloud Functions or standalone) |
| **Database** | PostgreSQL | Multi-tenant schema, UUID keys, integer paise currency, basis-points GST |
| **Shared Domain** | TypeScript npm workspace (`@yorbalance/shared`) | Shared validation, GSTIN Mod-36 checksum, and intra/inter-state tax calculations |

---

## 📦 Project Structure (npm workspaces)

```text
YorBalance/
├── shared/                       # Pure TypeScript shared domain logic
│   ├── src/
│   │   ├── gst.ts                # GSTIN regex, Mod-36 checksum validator, phone & invoice normalizers
│   │   ├── states.ts             # All 36 Indian states & UTs with official 2-digit GST codes
│   │   ├── tax.ts                # Intra-state (CGST+SGST) vs Inter-state (IGST) math in paise
│   │   └── types.ts              # Shop, User, Verification, and payload interfaces
│   └── package.json
│
├── functions/                    # Node.js + Express Backend API
│   ├── src/
│   │   ├── app.ts                # Express application setup
│   │   ├── server.ts             # Standalone development server (Port 5000)
│   │   ├── index.ts              # Firebase Cloud Function HTTPS export
│   │   ├── middleware/auth.ts    # Firebase ID Token verification & Admin role checks
│   │   ├── db/
│   │   │   ├── index.ts          # PostgreSQL pool client + in-memory store for offline dev
│   │   │   └── migrations/       # Forward-only SQL migrations (001_initial_schema.sql)
│   │   ├── routes/
│   │   │   ├── auth.ts           # /api/v1/auth: register-shop, me, resubmit
│   │   │   └── admin.ts          # /api/v1/admin: shops review queue, approve/reject decision
│   │   └── tests/auth.test.ts    # Integration tests for auth and approval flow
│   └── package.json
│
├── web/                          # React + Vite + Tailwind CSS Frontend
│   ├── src/
│   │   ├── components/           # UI Atoms (Button, Input, Select, Badge, Alert, Modal, Navbar)
│   │   │   ├── ProtectedRoute.tsx# Shop approval gate (blocks unapproved merchants)
│   │   │   └── AdminRoute.tsx    # Admin security gate
│   │   ├── context/AuthContext.tsx# Firebase Auth & Session state provider
│   │   ├── lib/                  # api.ts (REST client) and firebase.ts (SDK initialization)
│   │   └── pages/
│   │       ├── LoginPage.tsx              # Merchant login (Email, Google, Password toggle)
│   │       ├── RegisterShopPage.tsx       # Live GSTIN validation, state derivation, GST %
│   │       ├── ForgotPasswordPage.tsx     # Password reset dispatch
│   │       ├── PendingApprovalPage.tsx    # Verification queue & rejection resubmit form
│   │       ├── AdminLoginPage.tsx         # Dedicated restricted admin login
│   │       ├── AdminDashboardPage.tsx     # Review pending shops, approve or reject with reason
│   │       └── DashboardPlaceholderPage.tsx # Approved shop welcome & Phase 2 transition
│   └── package.json
│
└── package.json                  # Root workspace definition
```

---

## 🚀 Getting Started Locally

### 1. Prerequisites
- **Node.js**: v18 or later (tested on v24)
- **npm**: v9 or later (tested on v11)

### 2. Install Dependencies
Run from the root directory:
```bash
npm install --install-links
```

### 3. Build Shared Packages
```bash
npm run build --workspace=shared
```

### 4. Run Unit and Integration Tests
```bash
npm test --workspaces
```
- **9 Unit Tests** in `@yorbalance/shared`: GSTIN checksum, format validation, phone/invoice normalizers, intra-state CGST+SGST, inter-state IGST, and odd-paise rounding.
- **5 Integration Tests** in `@yorbalance/functions`: API health check, unauthenticated rejection, shop registration, admin queue retrieval, and admin approval decision.

### 5. Start the Development Servers
Start both backend API and frontend in parallel:
```bash
# Terminal 1: Start API server (http://localhost:5000)
npm run dev:api

# Terminal 2: Start Vite Web app (http://localhost:5173)
npm run dev:web
```
Or simultaneously from root:
```bash
npm run dev
```

---

## 🛡️ Phase 1 User Journeys Implemented

### Merchant Journey
1. **Register Shop (`/register-shop`)**:
   - Enter Shop Name, Proprietor Name, Mobile Number, Email, and Shop Address.
   - Enter a 15-character **GSTIN** (e.g. `29AAAAA0000A1Z5`). The validator live-computes the **Mod-36 Luhn Checksum** and automatically maps the first 2 digits to the official State (e.g., `29` -> Karnataka).
   - Select default GST rate (default 5% for silk sarees).
   - Enter password (minimum 8 characters) and confirm password.
   - On submission, the shop is saved in PostgreSQL with status **`PENDING`**.
2. **Pending Approval (`/pending-approval`)**:
   - The merchant is routed to this screen. Access to the ledger and dues is locked until approved.
   - If rejected by the admin, the merchant sees the **exact rejection reason** and can update the flagged details directly in an inline form and resubmit.
3. **Approved Shop (`/dashboard`)**:
   - Once approved by the administrator, the merchant is granted entry to the Shop Dashboard.

### Administrator Journey
1. **Admin Login (`/admin-login`)**:
   - Administrative credentials are not publicly registrable.
   - For local development, use:
     - **Email**: `admin@yorbalance.com`
     - **Password**: `admin123`
2. **Admin Verification Portal (`/admin`)**:
   - Displays all registered shops with tabs: `Pending Review`, `Approved`, `Rejected`, and `All`.
   - Admin reviews shop details, GSTIN, proprietor name, contact numbers, and address.
   - **Approve**: Instantly sets status to `APPROVED`, unlocking the ledger for that merchant.
   - **Reject**: Prompts for a specific reason, logs the round in `shop_verifications`, and notifies the shop.

---

## ⏭️ Ready for Phase 2: Dashboard Development
With Phase 1 complete, verified, and tested, the project is ready for **Phase 2 — Dashboard**:
- Summary cards (Total Transactions, Pending Dues, Settled, Total Value, Net Balance)
- Sales vs Purchases and Monthly Sales interactive charts (Recharts)
- Recent Transactions table
- Circular swipe navigation setup (Party → Sales → Purchases)
