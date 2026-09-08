/**
 * BookUp — Landing Page
 * Premium SaaS landing page for the Indian market
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, ACTIONS } from '../data/store';
import './Landing.css';

const FEATURES = [
  {
    icon: '📋',
    title: 'Create your services',
    desc: 'Add your services with pricing in ₹, duration, and optional UPI deposit.'
  },
  {
    icon: '🕐',
    title: 'Set your availability',
    desc: 'Choose your working hours for each day. No calendar sync needed.'
  },
  {
    icon: '🔗',
    title: 'Share your booking link',
    desc: 'One link — share it on WhatsApp, Instagram, or anywhere your clients are.'
  },
  {
    icon: '💰',
    title: 'Get booked & get paid',
    desc: 'Clients book and pay a UPI deposit instantly. No more no-shows.'
  },
];

const BENEFITS = [
  {
    icon: '💬',
    title: 'WhatsApp-first',
    desc: 'Share your booking link on WhatsApp in two taps. Clients book without downloading any app.'
  },
  {
    icon: '📱',
    title: 'UPI deposits',
    desc: 'Collect a small deposit via UPI to confirm bookings. No card, no gateway hassle.'
  },
  {
    icon: '🛡️',
    title: 'No-show protection',
    desc: 'Late cancellation? No-show? The deposit is forfeited. Your time is protected.'
  },
  {
    icon: '📊',
    title: 'Simple dashboard',
    desc: 'See all your appointments, revenue, and cancellation trends in one clean view.'
  },
  {
    icon: '🔔',
    title: 'Automated reminders',
    desc: 'WhatsApp reminders 24h and 2h before the appointment. Fewer no-shows, happier clients.'
  },
  {
    icon: '⚡',
    title: 'Zero setup time',
    desc: 'Your booking page is live in under 5 minutes. No tech skills needed.'
  },
];

const PRICING = [
  {
    name: 'Free',
    price: '₹0',
    period: '/month',
    desc: 'Get started with the basics',
    features: [
      '1 booking page',
      'Basic scheduling',
      'Up to 3 services',
      'Appointment management',
      'Basic booking link',
    ],
    cta: 'Get Started Free',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '₹499',
    period: '/month',
    desc: 'Everything you need to grow',
    features: [
      'Unlimited services',
      'Custom booking page',
      'WhatsApp reminders',
      'UPI deposits & cancellation policies',
      'No-show protection',
      'Analytics & revenue reports',
      'Revenue protection',
      'Priority support',
    ],
    cta: 'Start Pro Trial',
    highlighted: true,
  },
];

const FAQ_ITEMS = [
  {
    q: 'How does UPI deposit collection work?',
    a: 'When a client books, they pay a small deposit via UPI (like Google Pay, PhonePe, or Paytm). If they show up, the deposit is adjusted against the full payment. If they cancel late or don\'t show, the deposit is forfeited — protecting your revenue.'
  },
  {
    q: 'Do my clients need to create an account?',
    a: 'No! Clients simply open your booking link, pick a service and time, enter their name and phone number, and book. No app download, no sign-up.'
  },
  {
    q: 'Can I share my booking link on WhatsApp and Instagram?',
    a: 'Yes! Your booking link (e.g. bookup.in/book/your-name) works everywhere — WhatsApp, Instagram bio, Facebook, email, SMS, or even printed on a visiting card.'
  },
  {
    q: 'What happens if a client doesn\'t show up?',
    a: 'If a client doesn\'t show up or cancels after the cancellation window, their deposit is forfeited automatically. You set the rules — cancellation window, deposit amount, and no-show fee.'
  },
  {
    q: 'Is BookUp only for fitness trainers?',
    a: 'Not at all! BookUp works for any appointment-based professional — tutors, consultants, salon professionals, therapists, photographers, astrologers, and more.'
  },
  {
    q: 'Can I use BookUp on my phone?',
    a: 'Absolutely. BookUp is fully mobile-optimised. Manage your schedule, view appointments, and update services right from your phone browser.'
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { dispatch } = useStore();
  const [openFaq, setOpenFaq] = useState(null);

  const handleDemo = () => {
    dispatch({ type: ACTIONS.ENTER_DEMO });
    navigate('/dashboard');
  };

  const handleSignup = () => {
    navigate('/signup');
  };

  return (
    <div className="landing">
      {/* Navigation */}
      <nav className="landing-nav">
        <div className="container">
          <div className="landing-nav-inner">
            <a href="/" className="landing-logo">
              <span className="logo-icon">B</span>
              <span className="logo-text">BookUp</span>
            </a>
            <div className="landing-nav-links hide-mobile">
              <a href="#how-it-works">How it works</a>
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="landing-nav-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/login')}>Log in</button>
              <button className="btn btn-primary btn-sm" onClick={handleSignup}>Get Started</button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="container">
          <div className="hero-content">
            <div className="hero-badge">🇮🇳 Built for India</div>
            <h1 className="hero-title">India's simplest way to let clients book you.</h1>
            <p className="hero-subtitle">
              Set your availability, share one booking link on WhatsApp or Instagram, and get booked — with UPI deposits that stop no-shows.
            </p>
            <div className="hero-actions">
              <button className="btn btn-primary btn-lg" onClick={handleSignup}>
                Create Your Booking Page
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </button>
              <button className="btn btn-secondary btn-lg" onClick={handleDemo}>
                View Demo
              </button>
            </div>
            <p className="hero-note">Free to start · No credit card required · Live in 5 minutes</p>
          </div>

          {/* Hero Preview Card */}
          <div className="hero-preview">
            <div className="phone-frame">
              <div className="phone-notch"></div>
              <div className="booking-preview">
                <div className="bp-header">
                  <div className="bp-avatar">PS</div>
                  <div>
                    <div className="bp-name">Priya Sharma</div>
                    <div className="bp-biz">Alex Fitness Studio</div>
                  </div>
                </div>
                <div className="bp-service-card">
                  <div className="bp-service-name">Personal Training</div>
                  <div className="bp-service-meta">60 min · ₹1,000</div>
                  <div className="bp-service-deposit">₹200 deposit to confirm</div>
                </div>
                <div className="bp-service-card bp-service-card-alt">
                  <div className="bp-service-name">Fitness Consultation</div>
                  <div className="bp-service-meta">45 min · ₹750</div>
                </div>
                <div className="bp-service-card bp-service-card-alt">
                  <div className="bp-service-name">Follow-up Session</div>
                  <div className="bp-service-meta">30 min · ₹500</div>
                </div>
                <div className="bp-powered">Powered by BookUp</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section" id="how-it-works">
        <div className="container">
          <div className="section-head">
            <h2>How BookUp works</h2>
            <p>From zero to booked in under 5 minutes.</p>
          </div>
          <div className="steps-grid">
            {FEATURES.map((f, i) => (
              <div className="step-card" key={i}>
                <div className="step-number">{i + 1}</div>
                <span className="step-icon">{f.icon}</span>
                <h4>{f.title}</h4>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Booking Page Preview — WhatsApp style */}
      <section className="section section-dark">
        <div className="container">
          <div className="section-head">
            <h2>Your booking link, shared on WhatsApp</h2>
            <p>Clients tap the link, pick a service and time, and book — all without leaving their chat.</p>
          </div>
          <div className="whatsapp-preview">
            <div className="wa-chat">
              <div className="wa-message wa-message-sent">
                <div className="wa-text">Hi! I'd like to book a training session 🏋️</div>
                <div className="wa-time">10:24 AM ✓✓</div>
              </div>
              <div className="wa-message wa-message-received">
                <div className="wa-text">
                  Sure! You can book directly from my booking page 👇<br /><br />
                  <a className="wa-link">bookup.in/book/priya-sharma</a>
                </div>
                <div className="wa-time">10:25 AM</div>
              </div>
              <div className="wa-message wa-message-received">
                <div className="wa-link-preview">
                  <div className="wa-lp-badge">bookup.in</div>
                  <div className="wa-lp-title">Book with Priya Sharma</div>
                  <div className="wa-lp-desc">Alex Fitness Studio · Personal Training, Consultation & more</div>
                </div>
                <div className="wa-time">10:25 AM</div>
              </div>
              <div className="wa-message wa-message-sent">
                <div className="wa-text">Done! Booked for Tuesday 10 AM 🎉</div>
                <div className="wa-time">10:28 AM ✓✓</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section" id="features">
        <div className="container">
          <div className="section-head">
            <h2>Built for how India actually books</h2>
            <p>WhatsApp sharing, UPI deposits, no-show protection — not email invites and credit card forms.</p>
          </div>
          <div className="benefits-grid">
            {BENEFITS.map((b, i) => (
              <div className="benefit-card" key={i}>
                <span className="benefit-icon">{b.icon}</span>
                <h4>{b.title}</h4>
                <p>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* No-show Protection */}
      <section className="section section-highlight">
        <div className="container">
          <div className="protection-content">
            <div className="protection-text">
              <div className="protection-badge">🛡️ Revenue Protection</div>
              <h2>Stop losing money to no-shows</h2>
              <p>
                In India, most service bookings happen with zero upfront payment. Clients cancel at the last minute or simply don't show up — and you lose your time slot and income.
              </p>
              <p>
                BookUp fixes this with a simple UPI deposit. Clients pay ₹100–₹500 via UPI to confirm their booking. Show up? It's adjusted. Don't show? It's forfeited.
              </p>
              <div className="protection-stats">
                <div className="protection-stat">
                  <div className="protection-stat-value">73%</div>
                  <div className="protection-stat-label">fewer no-shows with deposits</div>
                </div>
                <div className="protection-stat">
                  <div className="protection-stat-value">₹3,500</div>
                  <div className="protection-stat-label">avg. revenue protected/month</div>
                </div>
              </div>
            </div>
            <div className="protection-visual">
              <div className="policy-preview-card">
                <div className="ppc-header">Cancellation Policy</div>
                <div className="ppc-rule ppc-rule-green">
                  <span className="ppc-icon">✅</span>
                  <span>Cancel more than 12 hours before: <strong>full deposit refund</strong></span>
                </div>
                <div className="ppc-rule ppc-rule-red">
                  <span className="ppc-icon">⚠️</span>
                  <span>Late cancellation or no-show: <strong>₹200 deposit forfeited</strong></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Analytics Preview */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>Know your numbers</h2>
            <p>Track appointments, revenue, no-show rates, and deposits collected — all in one dashboard.</p>
          </div>
          <div className="analytics-preview-grid">
            <div className="ap-card">
              <div className="ap-label">This month</div>
              <div className="ap-value">48 appointments</div>
              <div className="ap-change positive">↑ 12% from last month</div>
            </div>
            <div className="ap-card">
              <div className="ap-label">Revenue</div>
              <div className="ap-value">₹42,500</div>
              <div className="ap-change positive">↑ 8% from last month</div>
            </div>
            <div className="ap-card">
              <div className="ap-label">No-show rate</div>
              <div className="ap-value">4.2%</div>
              <div className="ap-change positive">↓ 2.1% from last month</div>
            </div>
            <div className="ap-card">
              <div className="ap-label">Revenue protected</div>
              <div className="ap-value">₹3,500</div>
              <div className="ap-change">via deposit forfeiture</div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="section section-dark" id="pricing">
        <div className="container">
          <div className="section-head">
            <h2>Simple, transparent pricing</h2>
            <p>Start free. Upgrade when you're ready.</p>
          </div>
          <div className="pricing-grid">
            {PRICING.map((plan, i) => (
              <div className={`pricing-card ${plan.highlighted ? 'pricing-card-highlighted' : ''}`} key={i}>
                {plan.highlighted && <div className="pricing-badge">Most Popular</div>}
                <div className="pricing-header">
                  <h3>{plan.name}</h3>
                  <div className="pricing-price">
                    <span className="pricing-amount">{plan.price}</span>
                    <span className="pricing-period">{plan.period}</span>
                  </div>
                  <p className="pricing-desc">{plan.desc}</p>
                </div>
                <ul className="pricing-features">
                  {plan.features.map((f, j) => (
                    <li key={j}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  className={`btn btn-block ${plan.highlighted ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={handleSignup}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section" id="faq">
        <div className="container">
          <div className="section-head">
            <h2>Frequently asked questions</h2>
          </div>
          <div className="faq-list">
            {FAQ_ITEMS.map((item, i) => (
              <div className={`faq-item ${openFaq === i ? 'faq-open' : ''}`} key={i}>
                <button className="faq-question" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{item.q}</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="faq-chevron">
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="faq-answer">
                    <p>{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section section-cta">
        <div className="container">
          <div className="cta-content">
            <h2>Ready to stop losing bookings?</h2>
            <p>Create your booking page in under 5 minutes. Share it on WhatsApp. Get booked.</p>
            <div className="hero-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary btn-lg" onClick={handleSignup}>
                Create Your Booking Page
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </button>
              <button className="btn btn-secondary btn-lg" onClick={handleDemo}>
                View Demo
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <a href="/" className="landing-logo">
                <span className="logo-icon">B</span>
                <span className="logo-text">BookUp</span>
              </a>
              <p>India's simplest scheduling & booking platform for service professionals.</p>
            </div>
            <div className="footer-links">
              <div className="footer-col">
                <h5>Product</h5>
                <a href="#features">Features</a>
                <a href="#pricing">Pricing</a>
                <a href="#faq">FAQ</a>
              </div>
              <div className="footer-col">
                <h5>Company</h5>
                <a href="#">About</a>
                <a href="#">Blog</a>
                <a href="#">Contact</a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© 2026 BookUp. Made with ❤️ in India.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
