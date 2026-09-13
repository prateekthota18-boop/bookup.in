/**
 * BookUp — Email Notification Service (Phase 4b)
 * Production Gmail SMTP transport via Nodemailer for:
 * 1. Customer booking confirmations (with attached RFC 5545 .ics invite)
 * 2. Provider new-booking notifications
 * 3. 2-Hour customer upcoming appointment reminders
 *
 * Fault Isolation:
 * - Never throws unhandled exceptions that could roll back bookings.
 * - Safely skips if GMAIL_USER / GMAIL_APP_PASSWORD are not configured.
 * - Never logs or exposes GMAIL_APP_PASSWORD in plaintext.
 */

import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { generateIcsCalendar } from '../utils/ics.js';

export class EmailService {
  constructor(options = {}) {
    this._user = options.user !== undefined ? options.user : null;
    this._pass = options.pass !== undefined ? options.pass : null;
    this._transporter = options.transporter || null;
  }

  get user() {
    return this._user !== null ? this._user : (process.env.GMAIL_USER || config.gmailUser || '');
  }

  get pass() {
    return this._pass !== null ? this._pass : (process.env.GMAIL_APP_PASSWORD || config.gmailAppPassword || '');
  }

  isConfigured() {
    const u = this.user;
    const p = this.pass;
    return Boolean(u && u.trim().length > 0 && p && p.trim().length > 0);
  }

  getTransporter() {
    if (this._transporter) {
      return this._transporter;
    }

    if (!this.isConfigured()) {
      return null;
    }

    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.user.trim(),
        pass: this.pass.trim(),
      },
    });
  }

  /**
   * 1. Send Customer Booking Confirmation with .ics Calendar Invite
   */
  async sendCustomerConfirmationEmail({
    to,
    customerName,
    serviceName,
    providerName,
    bookingDate,
    startTime,
    duration,
    meetLink = '',
    managementUrl = '',
    bookingId = '',
    timeZone = 'Asia/Kolkata',
  }) {
    if (!to || !to.includes('@')) {
      return { success: false, skipped: true, error: 'Missing or invalid customer email address' };
    }

    if (!this.isConfigured()) {
      console.warn('[EmailService] Gmail credentials not configured. Skipping customer confirmation email.');
      return { success: false, skipped: true, error: 'Gmail SMTP credentials not configured' };
    }

    try {
      const transporter = this.getTransporter();
      const icsContent = generateIcsCalendar({
        serviceName,
        providerName,
        bookingDate,
        startTime,
        duration,
        meetLink,
        managementUrl,
        bookingId,
        timeZone,
      });

      const subject = `Booking Confirmed: ${serviceName} with ${providerName}`;
      const meetButton = meetLink
        ? `<div style="margin: 24px 0 16px;">
             <a href="${meetLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
               Join Google Meet
             </a>
           </div>
           <p style="font-size: 13px; color: #64748b; margin-top: 4px;">Meeting link: <a href="${meetLink}" style="color: #2563eb;">${meetLink}</a></p>`
        : `<p style="margin: 16px 0; color: #64748b; font-size: 14px;"><em>Google Meet video link will be sent prior to the session.</em></p>`;

      const manageSection = managementUrl
        ? `<div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #64748b;">
             Need to reschedule or cancel?
             <br />
             <a href="${managementUrl}" style="color: #2563eb; font-weight: 500; text-decoration: underline;">Manage your appointment here</a>
           </div>`
        : '';

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 32px 16px; color: #1e293b;">
          <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="display: flex; align-items: center; margin-bottom: 24px;">
              <span style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">BookUp</span>
            </div>
            
            <h1 style="font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 12px;">You're booked!</h1>
            <p style="font-size: 15px; line-height: 1.5; color: #334155; margin: 0 0 20px;">
              Hi ${customerName || 'there'}, your appointment with <strong>${providerName}</strong> has been confirmed.
            </p>

            <div style="background-color: #f1f5f9; border-radius: 8px; padding: 18px 20px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="padding: 6px 0; color: #64748b; width: 30%;">Service</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${serviceName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Coach</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${providerName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Date</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${bookingDate}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Time</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${startTime} (${duration} mins)</td>
                </tr>
              </table>
            </div>

            ${meetButton}

            <p style="font-size: 13px; color: #64748b; margin: 16px 0 0;">
              📎 A calendar invitation (<code>invite.ics</code>) is attached to this email so you can add this session to your calendar.
            </p>

            ${manageSection}
          </div>
        </body>
        </html>
      `;

      const text = `
Booking Confirmed!

Hi ${customerName || 'there'}, your appointment has been confirmed:
- Service: ${serviceName}
- Coach: ${providerName}
- Date: ${bookingDate}
- Time: ${startTime} (${duration} mins)
${meetLink ? `- Google Meet Link: ${meetLink}` : ''}
${managementUrl ? `- Manage Appointment: ${managementUrl}` : ''}

A calendar invite (.ics) has been attached to this email.
      `.trim();

      const info = await transporter.sendMail({
        from: `"BookUp" <${this.user.trim()}>`,
        to: to.trim(),
        subject,
        text,
        html,
        attachments: [
          {
            filename: 'invite.ics',
            content: icsContent,
            contentType: 'text/calendar; charset=utf-8; method=REQUEST',
          },
        ],
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err) {
      console.error('[EmailService] Customer confirmation email failed:', err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * 2. Send Provider New Booking Notification Email (No .ics attachment)
   */
  async sendProviderNotificationEmail({
    to,
    providerName,
    customerName,
    customerEmail = '',
    customerPhone = '',
    serviceName,
    bookingDate,
    startTime,
    duration,
    meetLink = '',
  }) {
    if (!to || !to.includes('@')) {
      return { success: false, skipped: true, error: 'Missing or invalid provider email address' };
    }

    if (!this.isConfigured()) {
      console.warn('[EmailService] Gmail credentials not configured. Skipping provider notification email.');
      return { success: false, skipped: true, error: 'Gmail SMTP credentials not configured' };
    }

    try {
      const transporter = this.getTransporter();
      const subject = `New Booking: ${customerName} — ${serviceName} (${bookingDate} at ${startTime})`;

      const meetSection = meetLink
        ? `<div style="margin: 20px 0 12px;">
             <a href="${meetLink}" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
               Open Google Meet
             </a>
             <p style="font-size: 13px; color: #64748b; margin-top: 6px;">Meeting Link: <a href="${meetLink}" style="color: #2563eb;">${meetLink}</a></p>
           </div>`
        : `<p style="color: #64748b; font-size: 14px;"><em>No video conference link attached.</em></p>`;

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 32px 16px; color: #1e293b;">
          <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="margin-bottom: 20px;">
              <span style="font-size: 18px; font-weight: 700; color: #0f172a;">BookUp</span>
            </div>
            
            <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 8px;">New Appointment Booked</h1>
            <p style="font-size: 15px; color: #334155; margin: 0 0 20px;">
              Hi ${providerName || 'Coach'}, you have a new appointment with <strong>${customerName}</strong>.
            </p>

            <div style="background-color: #f1f5f9; border-radius: 8px; padding: 18px 20px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="padding: 6px 0; color: #64748b; width: 30%;">Client</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${customerName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Client Email</td>
                  <td style="padding: 6px 0; color: #0f172a;">${customerEmail || 'Not provided'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Client Phone</td>
                  <td style="padding: 6px 0; color: #0f172a;">${customerPhone || 'Not provided'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Service</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${serviceName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Date & Time</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${bookingDate} at ${startTime} (${duration} mins)</td>
                </tr>
              </table>
            </div>

            ${meetSection}
          </div>
        </body>
        </html>
      `;

      const text = `
New Booking Confirmed!

Client: ${customerName}
Client Email: ${customerEmail || 'N/A'}
Client Phone: ${customerPhone || 'N/A'}
Service: ${serviceName}
Date: ${bookingDate}
Time: ${startTime} (${duration} mins)
${meetLink ? `Google Meet Link: ${meetLink}` : ''}
      `.trim();

      const info = await transporter.sendMail({
        from: `"BookUp" <${this.user.trim()}>`,
        to: to.trim(),
        subject,
        text,
        html,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err) {
      console.error('[EmailService] Provider notification email failed:', err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * 3. Send 2-Hour Upcoming Appointment Reminder Email (No .ics attachment)
   */
  async sendReminderEmail({
    to,
    customerName,
    serviceName,
    providerName,
    bookingDate,
    startTime,
    duration,
    meetLink = '',
    managementUrl = '',
  }) {
    if (!to || !to.includes('@')) {
      return { success: false, skipped: true, error: 'Missing or invalid customer email address' };
    }

    if (!this.isConfigured()) {
      console.warn('[EmailService] Gmail credentials not configured. Skipping reminder email.');
      return { success: false, skipped: true, error: 'Gmail SMTP credentials not configured' };
    }

    try {
      const transporter = this.getTransporter();
      const subject = `Reminder: ${serviceName} with ${providerName} starts soon`;

      const meetButton = meetLink
        ? `<div style="margin: 24px 0 16px;">
             <a href="${meetLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
               Join Google Meet
             </a>
           </div>
           <p style="font-size: 13px; color: #64748b; margin-top: 4px;">Meeting link: <a href="${meetLink}" style="color: #2563eb;">${meetLink}</a></p>`
        : `<p style="margin: 16px 0; color: #64748b; font-size: 14px;"><em>Google Meet video link will be sent shortly.</em></p>`;

      const manageSection = managementUrl
        ? `<div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #64748b;">
             Need to manage this appointment?
             <br />
             <a href="${managementUrl}" style="color: #2563eb; font-weight: 500; text-decoration: underline;">View details & manage here</a>
           </div>`
        : '';

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 32px 16px; color: #1e293b;">
          <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="display: flex; align-items: center; margin-bottom: 24px;">
              <span style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">BookUp</span>
            </div>
            
            <h1 style="font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 12px;">Upcoming Session Reminder</h1>
            <p style="font-size: 15px; line-height: 1.5; color: #334155; margin: 0 0 20px;">
              Hi ${customerName || 'there'}, this is a quick reminder that your session with <strong>${providerName}</strong> is coming up in approximately 2 hours.
            </p>

            <div style="background-color: #f1f5f9; border-radius: 8px; padding: 18px 20px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="padding: 6px 0; color: #64748b; width: 30%;">Service</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${serviceName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Coach</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${providerName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Date</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${bookingDate}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Time</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${startTime} (${duration} mins)</td>
                </tr>
              </table>
            </div>

            ${meetButton}

            ${manageSection}
          </div>
        </body>
        </html>
      `;

      const text = `
Upcoming Appointment Reminder

Hi ${customerName || 'there'}, your session with ${providerName} starts in approximately 2 hours:
- Service: ${serviceName}
- Date: ${bookingDate}
- Time: ${startTime} (${duration} mins)
${meetLink ? `- Google Meet Link: ${meetLink}` : ''}
${managementUrl ? `- Manage Appointment: ${managementUrl}` : ''}
      `.trim();

      const info = await transporter.sendMail({
        from: `"BookUp" <${this.user.trim()}>`,
        to: to.trim(),
        subject,
        text,
        html,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err) {
      console.error('[EmailService] Reminder email failed:', err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  }
}

export const emailService = new EmailService();
