# BookUp (bookup-in.vercel.app) 🇮🇳

> **India's Simplest Scheduling & Online Booking Platform for Solo Service Professionals.**  
> Inspired by Calendly's simplicity, but designed around how Indian providers and customers actually communicate and pay — **WhatsApp-first, UPI-first, and mobile-first**.

---

## 🌟 Key Features

- **⚡ Dynamic 15-Minute Slot Engine**: Recomputed live per service duration and dynamic buffer times. Prevents overlapping bookings, respects provider operating hours, and handles minimum-notice windows.
- **🔄 Early Completion Auto-Release**: Providers can wrap up appointments early to auto-release remaining time for new client bookings.
- **📱 Mobile-First Public Booking (`/book/:slug`)**: Clean, frictionless one-handed booking for clients without requiring logins.
- **💳 UPI Deposit Collection**: Collect booking deposits via simulated UPI QR code / VPA to protect against no-shows and late cancellations.
- **💬 WhatsApp-First Communication**: Integrated WhatsApp confirmation bubbles, appointment reminders, and one-click `wa.me` share links.
- **📅 Google Calendar Integration (Optional Add-on)**: Pluggable `CalendarProvider` with simulated OAuth, two-way sync badge, and external busy conflict blocking.
- **🛡️ Provider Dashboard**: Complete overview with revenue KPIs, appointment management (confirm, complete, reschedule, no-show deposit forfeiture), service CRUD, weekly availability editor, and analytics trends.
- **✨ Content Safeguards**: Profile completeness meter, bio length validation, and anti-gibberish checks.

---

## 🛠️ Tech Stack

- **Frontend**: React (Vite)
- **Routing**: React Router v7
- **Styling**: Vanilla CSS with custom properties & design tokens
- **Data & State**: React Context + `useReducer` with `localStorage` persistence
- **Charts**: Chart.js & `react-chartjs-2`
- **Architecture**: Decoupled `CalendarProvider` & `NotificationProvider` abstractions

---

## 🚀 Getting Started Locally

1. **Clone the repository**:
   ```bash
   git clone https://github.com/prateekthota18-boop/bookup.in.git
   cd bookup.in
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the local dev server**:
   ```bash
   npm run dev
   ```

4. **Open in browser**:
   Navigate to `http://localhost:5173` and click **"View Demo"** to explore with pre-seeded demo data.

---

## 📄 License
MIT
