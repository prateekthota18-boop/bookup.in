import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore } from '../data/store';
import { ACTIONS } from '../data/actions';
import BrandLogo from '../components/ui/BrandLogo';
import PillButton from '../components/ui/PillButton';
import './Landing.css';

const PARTNERS = ['Layers', 'Intercom', 'Segment', 'Notion', 'Linear', 'Vercel', 'Stripe'];

const TESTIMONIALS = [
  {
    quote: "CalUp feels friendly and lightweight. It didn't need a tutorial and my clients love it.",
    author: "Nina Linda",
    role: "Yoga Studio Owner",
    bg: "lime-soft",
  },
  {
    quote: "The dashboard is clean and calming. I instantly know what today looks like in 2 seconds.",
    author: "Andi Pratama",
    role: "Auto Detailing Specialist",
    bg: "white",
  },
  {
    quote: "No more endless WhatsApp messages to book appointments. Clients simply pick a time and confirm.",
    author: "Rizky Kayansyah",
    role: "Barbershop Founder",
    bg: "lime-soft",
  },
  {
    quote: "Google Meet link generation and instant confirmation emails saved me 10 hours every week.",
    author: "Dr. Arjun Patel",
    role: "Consulting Physician",
    bg: "white",
  },
];

const ARTICLES = [
  {
    tag: "Product Update",
    title: "Instant Confirmation & Reminders are Live",
    desc: "Clients get instant calendar invites with Google Meet links, completely eliminating no-shows.",
    date: "Sep 2026",
  },
  {
    tag: "Business Guide",
    title: "Weekly Schedule Overview for Busy Owners",
    desc: "How service professionals organize their daily client capacity with zero stress.",
    date: "Aug 2026",
  },
  {
    tag: "Workflow",
    title: "Why Single-Link Booking Converts 3x Higher",
    desc: "Removing friction from appointment scheduling keeps your clients returning.",
    date: "Jul 2026",
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { dispatch } = useStore();
  const [activeTab, setActiveTab] = useState('features');

  const handleStartTrial = () => {
    dispatch({ type: ACTIONS.ENTER_DEMO });
    navigate('/dashboard');
  };

  return (
    <div className="landing-janjiyuk">
      {/* --- TOPBAR / NAVBAR --- */}
      <header className="landing-nav-wrap">
        <div className="landing-nav">
          <BrandLogo size="md" />

          <nav className="landing-nav-links hide-mobile">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#solutions">Solutions</a>
            <a href="#testimonials">Reviews</a>
            <a href="#articles">Updates</a>
          </nav>

          <div className="landing-nav-actions">
            <Link to="/signup" className="btn btn-ghost hide-mobile">
              Signup
            </Link>
            <PillButton variant="primary" size="sm" arrow onClick={() => navigate('/login')}>
              Login
            </PillButton>
          </div>
        </div>
      </header>

      {/* --- HERO SECTION --- */}
      <section className="landing-hero-section">
        <div className="hero-lime-container animate-fade-in-up">
          {/* Social Proof Avatar Pill */}
          <div className="hero-social-proof">
            <div className="avatar-stack">
              <span className="avatar-mini">🧑🏽‍💼</span>
              <span className="avatar-mini">👩🏻‍⚕️</span>
              <span className="avatar-mini">💈</span>
              <span className="avatar-mini">💇🏼‍♀️</span>
            </div>
            <span>Loved by tons of Business Owners</span>
          </div>

          {/* Bold Sans Headline with Italic-Serif Accent Phrase */}
          <h1 className="hero-headline">
            A Friendly Way to <br className="hide-mobile" />
            <em className="headline-accent">Book Your Day</em>
          </h1>

          <p className="hero-subline">
            Simple scheduling for service businesses. Share your personal booking link,
            accept clients in seconds, and stay organized without the back-and-forth.
          </p>

          <div className="hero-cta-row">
            <PillButton variant="primary" size="lg" arrow onClick={handleStartTrial}>
              Start Free Trial
            </PillButton>
            <button className="hero-ghost-btn" onClick={handleStartTrial}>
              ⚡ View Live Demo
            </button>
          </div>

          {/* Hero Flanked Preview Cards + Dashboard Mockup Container */}
          <div className="hero-mockup-wrapper">
            {/* Left Flanking Card (Dark Booking Preview) */}
            <div className="flank-card flank-left hide-mobile animate-scale-in">
              <div className="flank-card-header">
                <span className="flank-badge">Booking page</span>
              </div>
              <div className="flank-sun-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#C6F135" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              </div>
              <div className="flank-card-title">Photo & Studio</div>
              <div className="flank-card-desc">Fast, familiar booking for clients</div>
            </div>

            {/* Center Device Frame Holding the Dashboard View */}
            <div className="center-device-frame" onClick={handleStartTrial} title="Click to launch interactive dashboard">
              <div className="device-top-bar">
                <span className="device-dot red" />
                <span className="device-dot yellow" />
                <span className="device-dot green" />
                <span className="device-address">calup.in/dashboard</span>
              </div>
              <div className="device-screen-content">
                {/* Mini Dashboard representation */}
                <div className="mini-dash-layout">
                  <div className="mini-sidebar">
                    <span className="mini-logo-dot" />
                    <span className="mini-nav-dot active" />
                    <span className="mini-nav-dot" />
                    <span className="mini-nav-dot" />
                    <span className="mini-nav-dot" />
                  </div>
                  <div className="mini-main">
                    <div className="mini-topbar">
                      <span className="mini-chip">Dashboard</span>
                      <span className="mini-search-bar" />
                    </div>
                    <div className="mini-grid">
                      <div className="mini-stat-card">
                        <div className="mini-label">Bookings</div>
                        <div className="mini-val">12 ↑</div>
                      </div>
                      <div className="mini-stat-card">
                        <div className="mini-label">Active Staff</div>
                        <div className="mini-val">4 / 5</div>
                      </div>
                      <div className="mini-cal-card">
                        <div className="mini-cal-title">October</div>
                        <div className="mini-cal-dots" />
                      </div>
                    </div>
                    <div className="mini-schedule-strip">
                      <div className="mini-schedule-row highlighted">14:00 · Rendy · Haircut · +91 98765...</div>
                      <div className="mini-schedule-row">15:00 · Vincent · Styling · +91 98765...</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Flanking Card (White Booking Preview) */}
            <div className="flank-card flank-right hide-mobile animate-scale-in">
              <div className="flank-card-header">
                <span className="flank-badge light">Booking page</span>
              </div>
              <div className="flank-sun-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0E0E0E" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              </div>
              <div className="flank-card-title">Consultation</div>
              <div className="flank-card-desc">Google Meet & calendar sync</div>
            </div>
          </div>
        </div>
      </section>

      {/* --- FLOATING NUMBERED BADGES SECTION --- */}
      <section className="landing-portal-section" id="how-it-works">
        <div className="container">
          <div className="portal-header text-center">
            <h2 className="portal-title">
              Everything You Need to Manage <br />
              <em className="headline-accent">Appointments</em>
            </h2>
            <p className="portal-sub">No complex setup. No complicated apps. Just easy scheduling.</p>
          </div>

          <div className="portal-graphic-container">
            {/* Center Dark Blob/Portal */}
            <div className="portal-blob">
              <div className="portal-inner-ring" />
            </div>

            {/* Floating Numbered Badges around blob */}
            <div className="portal-badge badge-pos-01">
              <span className="badge-num">01</span>
              <span className="badge-text">Share One Link</span>
            </div>
            <div className="portal-badge badge-pos-12">
              <span className="badge-num">12</span>
              <span className="badge-text">Smart Availability</span>
            </div>
            <div className="portal-badge badge-pos-25">
              <span className="badge-num">25</span>
              <span className="badge-text">Auto Confirmation</span>
            </div>
            <div className="portal-badge badge-pos-31">
              <span className="badge-num">31</span>
              <span className="badge-text">Instant Sync</span>
            </div>
          </div>
        </div>
      </section>

      {/* --- PARTNER LOGO STRIP --- */}
      <section className="landing-partners-section">
        <div className="container">
          <div className="partners-row">
            {PARTNERS.map(p => (
              <span key={p} className="partner-logo-item">
                {p}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* --- BUILT FOR SERVICE-BASED BUSINESSES (3-CARD GRID) --- */}
      <section className="landing-solutions-section" id="solutions">
        <div className="container">
          <div className="section-title-wrap text-center">
            <h2>
              Built for Service-Based <em className="headline-accent">Businesses</em>
            </h2>
            <p>From private studios to busy clinics, manage every client effortlessly.</p>
          </div>

          <div className="solutions-3card-grid">
            {/* Card 1: Dark Card */}
            <div className="solution-card card-black">
              <div className="solution-card-tag">Smart Calendar & Time-Slots</div>
              <h3>Automated Slot Management</h3>
              <p>Configure weekly business hours, break buffers, and advance notice rules in 3 clicks.</p>
              <div className="solution-mini-preview dark-preview">
                <div className="preview-row"><span>09:00</span> · Available</div>
                <div className="preview-row"><span>11:30</span> · Available</div>
                <div className="preview-row active"><span>14:00</span> · Booked ✓</div>
              </div>
            </div>

            {/* Card 2: Lime Card */}
            <div className="solution-card card-lime">
              <div className="solution-card-tag">Instant Delivery</div>
              <h3>Automated Notifications</h3>
              <p>Clients receive confirmation emails with Google Meet invites and self-serve reschedule links.</p>
              <div className="solution-mini-preview lime-preview">
                <div className="preview-bubble">
                  <strong>Session Confirmed!</strong>
                  <div>Google Meet link attached 📅</div>
                </div>
              </div>
            </div>

            {/* Card 3: White Card */}
            <div className="solution-card card-white">
              <div className="solution-card-tag">Self-Service</div>
              <h3>Customer Management</h3>
              <p>Zero friction. Clients manage their appointments securely without needing an account or password.</p>
              <div className="solution-mini-preview white-preview">
                <div className="preview-action-pill">📅 Reschedule</div>
                <div className="preview-action-pill">✕ Cancel</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- TRUST & STAT BLOCK --- */}
      <section className="landing-trust-section">
        <div className="container">
          <div className="trust-card">
            <div className="trust-quote-col">
              <p className="trust-quote">
                “Before using CalUp, we struggled with missed appointments and chaotic back-and-forth messaging.
                Now clients book instantly through one link, and our schedule stays 100% full.”
              </p>
              <div className="trust-author">
                <strong>Riko & Maya</strong> — Studio Co-founders
              </div>
            </div>

            <div className="trust-video-col">
              <div className="trust-video-thumb">
                <img
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&auto=format&fit=crop&q=80"
                  alt="Customer video review"
                  className="trust-img"
                />
                <div className="video-play-btn">▶</div>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="stats-metric-row">
            <div className="stat-metric-item">
              <div className="stat-num">1,200+</div>
              <div className="stat-label">Appointments Handled</div>
            </div>
            <div className="stat-metric-item">
              <div className="stat-num">98%</div>
              <div className="stat-label">Client Satisfaction</div>
            </div>
            <div className="stat-metric-item">
              <div className="stat-num">3X</div>
              <div className="stat-label">Faster Booking</div>
            </div>
            <div className="stat-metric-item">
              <div className="stat-num">0</div>
              <div className="stat-label">App Downloads Needed</div>
            </div>
          </div>
        </div>
      </section>

      {/* --- TESTIMONIAL GRID --- */}
      <section className="landing-reviews-section" id="testimonials">
        <div className="container">
          <div className="section-title-wrap text-center">
            <h2>
              Loved by Professionals Everywhere
            </h2>
            <p>Here is what service business owners say about using CalUp.</p>
          </div>

          <div className="testimonial-grid">
            {TESTIMONIALS.map((t, idx) => (
              <div key={idx} className={`testimonial-card ${t.bg}`}>
                <p className="testimonial-quote">“{t.quote}”</p>
                <div className="testimonial-meta">
                  <div className="avatar-circle">{t.author.charAt(0)}</div>
                  <div>
                    <div className="testimonial-author">{t.author}</div>
                    <div className="testimonial-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- LATEST UPDATES / NEWS --- */}
      <section className="landing-articles-section" id="articles">
        <div className="container">
          <div className="section-title-wrap text-center">
            <h2>
              Latest from <em className="headline-accent">CalUp</em>
            </h2>
            <p>Product improvements and guides to help your service business thrive.</p>
          </div>

          <div className="articles-grid">
            {ARTICLES.map((art, idx) => (
              <div key={idx} className="article-card">
                <span className="article-tag">{art.tag}</span>
                <h4 className="article-title">{art.title}</h4>
                <p className="article-desc">{art.desc}</p>
                <div className="article-footer">
                  <span className="article-date">{art.date}</span>
                  <span className="article-link">Read more →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- PRE-FOOTER CTA CARD --- */}
      <section className="landing-cta-section">
        <div className="container">
          <div className="prefooter-lime-card">
            <h2>
              Ready to Make Booking Feel <em className="headline-accent">Easy?</em>
            </h2>
            <p>Set up your booking page in 3 minutes. Share one link and get booked today.</p>
            <PillButton variant="primary" size="lg" arrow onClick={handleStartTrial}>
              Get Started with CalUp
            </PillButton>
          </div>
        </div>
      </section>

      {/* --- BLACK FOOTER --- */}
      <footer className="landing-footer">
        <div className="container">
          <div className="footer-top-row">
            <div className="footer-brand-col">
              <BrandLogo size="lg" light />
              <p className="footer-tagline">
                The friendly scheduling platform for modern service businesses.
              </p>
            </div>

            <div className="footer-links-col">
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#solutions">Solutions</a>
              <Link to="/login">Provider Login</Link>
              <Link to="/signup">Create Account</Link>
            </div>

            <div className="footer-links-col">
              <h4>Company</h4>
              <a href="#about">About</a>
              <a href="#testimonials">Reviews</a>
              <a href="#articles">Blog</a>
              <a href="mailto:support@calup.in">Contact Support</a>
            </div>
          </div>

          <div className="footer-bottom-row">
            <p>© {new Date().getFullYear()} CalUp Technologies. All rights reserved.</p>
            <div className="footer-legal">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
