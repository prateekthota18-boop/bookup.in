-- ==============================================================================
-- BookUp — Phase 4b: Google Meet Link & Email Notifications Migration
-- Adds tracking columns for Google Meet video links, Nodemailer/Gmail SMTP
-- confirmation dispatches to customers and providers, while reusing the existing
-- reminder_sent_at column for single-channel 2-hour reminders.
-- ==============================================================================

-- 1. Add Google Meet link and email delivery tracking columns to public.bookings
alter table public.bookings
  add column if not exists meet_link text default null,
  add column if not exists customer_confirmation_email_sent_at timestamptz default null,
  add column if not exists customer_confirmation_email_msg_id text default null,
  add column if not exists customer_confirmation_email_error text default null,
  add column if not exists provider_notification_email_sent_at timestamptz default null,
  add column if not exists provider_notification_email_msg_id text default null,
  add column if not exists provider_notification_email_error text default null;

-- 2. Documentation comments on new columns
comment on column public.bookings.meet_link is
  'Google Meet video conference URL generated via Google Calendar API conferenceData on booking creation.';

comment on column public.bookings.customer_confirmation_email_sent_at is
  'Timestamp when booking confirmation email with .ics attachment was dispatched to customer via Gmail SMTP.';

comment on column public.bookings.customer_confirmation_email_msg_id is
  'SMTP message ID returned by Nodemailer for customer confirmation email.';

comment on column public.bookings.customer_confirmation_email_error is
  'Error message if customer confirmation email dispatch failed (non-blocking).';

comment on column public.bookings.provider_notification_email_sent_at is
  'Timestamp when new-booking notification email was dispatched to provider via Gmail SMTP.';

comment on column public.bookings.provider_notification_email_msg_id is
  'SMTP message ID returned by Nodemailer for provider notification email.';

comment on column public.bookings.provider_notification_email_error is
  'Error message if provider notification email dispatch failed (non-blocking).';
