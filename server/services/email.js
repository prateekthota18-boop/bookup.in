/**
 * Calup — Email Notification Service
 * Production HTTPS-based email delivery via Resend API (https://resend.com) for:
 * 1. Customer booking confirmations (with attached RFC 5545 .ics invite)
 * 2. Provider new-booking notifications
 * 3. 2-Hour customer upcoming appointment reminders
 *
 * Fault Isolation:
 * - Never throws unhandled exceptions that could roll back bookings.
 * - Safely skips if RESEND_API_KEY is not configured.
 * - Never logs or exposes API keys in plaintext.
 */

import { Resend } from 'resend';
import { config } from '../config.js';
import { generateIcsCalendar } from '../utils/ics.js';

export class EmailService {
  constructor(options = {}) {
    this._apiKey = options.apiKey !== undefined ? options.apiKey : null;
    this._fromEmail = options.fromEmail !== undefined ? options.fromEmail : null;
    this._client = options.client || null;
  }

  get apiKey() {
    return this._apiKey !== null ? this._apiKey : (process.env.RESEND_API_KEY || config.resendApiKey || '');
  }

  get fromEmail() {
    return this._fromEmail !== null ? this._fromEmail : (process.env.RESEND_FROM_EMAIL || config.resendFromEmail || 'Calup <bookings@calup.in>');
  }

  isConfigured() {
    const key = this.apiKey;
    return Boolean(key && key.trim().length > 0);
  }

  getClient() {
    if (this._client) {
      return this._client;
    }

    if (!this.isConfigured()) {
      return null;
    }

    return new Resend(this.apiKey.trim());
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
      console.error(`[EmailService] Resend API key not configured. Customer confirmation email not sent. Provider: "${providerName || 'Unknown'}", Recipient: "${to}"`);
      return { success: false, skipped: true, error: 'Resend API key not configured' };
    }

    try {
      const client = this.getClient();
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
        : `<p style="margin: 16px 0; color: #64748b; font-size: 14px;"><em>Your coach has not connected Google Calendar yet. The coach will share the link prior to the session.</em></p>`;

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
              <span style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">Calup</span>
            </div>
            
            <h1 style="font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 12px;">Booking Confirmed</h1>
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
${meetLink ? `- Google Meet Link: ${meetLink}` : '- Your coach will share the link prior to the session.'}
${managementUrl ? `- Manage Appointment: ${managementUrl}` : ''}

A calendar invite (.ics) has been attached to this email.
      `.trim();

      const { data, error } = await client.emails.send({
        from: this.fromEmail,
        to: [to.trim()],
        subject,
        text,
        html,
        attachments: [
          {
            filename: 'invite.ics',
            content: Buffer.from(icsContent),
            contentType: 'text/calendar; charset=utf-8; method=REQUEST',
          },
        ],
      });

      if (error) {
        console.error(`[EmailService] Resend customer confirmation failed. Provider: "${providerName || 'Unknown'}", Recipient: "${to}", Error: ${error.message || JSON.stringify(error)}`);
        return {
          success: false,
          error: error.message || String(error),
        };
      }

      return {
        success: true,
        messageId: data?.id || null,
      };
    } catch (err) {
      console.error(`[EmailService] Customer confirmation email exception. Provider: "${providerName || 'Unknown'}", Recipient: "${to}", Error: ${err.message || err}`);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * 1b. Send Coach Booking Confirmed Notification (confirm-payment)
   */
  async sendCoachBookingConfirmedEmail({
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
      console.error(`[EmailService] Resend API key not configured. Coach confirmation email not sent. Provider: "${providerName || 'Unknown'}", Recipient: "${to}"`);
      return { success: false, skipped: true, error: 'Resend API key not configured' };
    }

    try {
      const client = this.getClient();
      const subject = `Booking Confirmed: ${customerName} — ${serviceName}`;

      const meetSection = meetLink
        ? `<div style="margin: 20px 0 12px;">
             <a href="${meetLink}" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
               Open Google Meet
             </a>
             <p style="font-size: 13px; color: #64748b; margin-top: 6px;">Meeting Link: <a href="${meetLink}" style="color: #2563eb;">${meetLink}</a></p>
           </div>`
        : `<p style="color: #64748b; font-size: 14px;"><em>Google Calendar is not connected. Please share your meeting link directly with the client.</em></p>`;

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
              <span style="font-size: 18px; font-weight: 700; color: #0f172a;">Calup</span>
            </div>
            
            <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 8px;">Booking Confirmed</h1>
            <p style="font-size: 15px; color: #334155; margin: 0 0 20px;">
              Hi ${providerName || 'Coach'}, your appointment with <strong>${customerName}</strong> has been confirmed.
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
Booking Confirmed!

Hi ${providerName || 'Coach'}, your appointment with ${customerName} has been confirmed:
- Client: ${customerName}
- Client Email: ${customerEmail || 'N/A'}
- Client Phone: ${customerPhone || 'N/A'}
- Service: ${serviceName}
- Date: ${bookingDate}
- Time: ${startTime} (${duration} mins)
${meetLink ? `- Google Meet Link: ${meetLink}` : '- Google Calendar is not connected. Please share your meeting link directly with the client.'}
      `.trim();

      const { data, error } = await client.emails.send({
        from: this.fromEmail,
        to: [to.trim()],
        subject,
        text,
        html,
      });

      if (error) {
        console.error(`[EmailService] Resend coach confirmation failed. Provider: "${providerName || 'Unknown'}", Recipient: "${to}", Error: ${error.message || JSON.stringify(error)}`);
        return { success: false, error: error.message || String(error) };
      }

      return { success: true, messageId: data?.id || null };
    } catch (err) {
      console.error(`[EmailService] Coach confirmation email exception. Provider: "${providerName || 'Unknown'}", Recipient: "${to}", Error: ${err.message || err}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * 1c. Send Coach New Booking Awaiting Payment Notification (POST /api/public/bookings)
   * Client details, service, date/time. No .ics, no meet link.
   */
  async sendCoachBookingAwaitingPaymentEmail({
    to,
    providerName,
    customerName,
    customerEmail = '',
    customerPhone = '',
    serviceName,
    bookingDate,
    startTime,
    duration,
    amount = 0,
  }) {
    if (!to || !to.includes('@')) {
      return { success: false, skipped: true, error: 'Missing or invalid provider email address' };
    }

    if (!this.isConfigured()) {
      console.error(`[EmailService] Resend API key not configured. Coach awaiting payment email not sent. Provider: "${providerName || 'Unknown'}", Recipient: "${to}"`);
      return { success: false, skipped: true, error: 'Resend API key not configured' };
    }

    try {
      const client = this.getClient();
      const subject = `New booking - awaiting payment: ${customerName} — ${serviceName}`;

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
              <span style="font-size: 18px; font-weight: 700; color: #0f172a;">Calup</span>
            </div>
            
            <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 8px;">New booking - awaiting payment</h1>
            <p style="font-size: 15px; color: #334155; margin: 0 0 20px;">
              Hi ${providerName || 'Coach'}, you have a new booking awaiting payment verification from <strong>${customerName}</strong>.
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
                ${amount ? `<tr><td style="padding: 6px 0; color: #64748b;">Amount</td><td style="padding: 6px 0; color: #0f172a; font-weight: 600;">₹${amount}</td></tr>` : ''}
              </table>
            </div>

            <p style="font-size: 13px; color: #64748b; margin-top: 16px;">
              The slot is reserved. Once the client marks the payment as paid and submits details, you will be notified to verify and confirm.
            </p>
          </div>
        </body>
        </html>
      `;

      const text = `
New booking - awaiting payment

Hi ${providerName || 'Coach'}, you have a new booking awaiting payment from ${customerName}:
- Client: ${customerName}
- Client Email: ${customerEmail || 'N/A'}
- Client Phone: ${customerPhone || 'N/A'}
- Service: ${serviceName}
- Date & Time: ${bookingDate} at ${startTime} (${duration} mins)
${amount ? `- Amount: ₹${amount}` : ''}

The slot is reserved. You will be notified once the client submits payment details.
      `.trim();

      const { data, error } = await client.emails.send({
        from: this.fromEmail,
        to: [to.trim()],
        subject,
        text,
        html,
      });

      if (error) {
        console.error(`[EmailService] Resend coach awaiting payment notification failed. Provider: "${providerName || 'Unknown'}", Recipient: "${to}", Error: ${error.message || JSON.stringify(error)}`);
        return { success: false, error: error.message || String(error) };
      }

      return { success: true, messageId: data?.id || null };
    } catch (err) {
      console.error(`[EmailService] Coach awaiting payment email exception. Provider: "${providerName || 'Unknown'}", Recipient: "${to}", Error: ${err.message || err}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * 1d. Send Customer Booking Received Notification (POST /api/public/bookings)
   * Slot is reserved and coach will confirm shortly. NO "You're booked!", NO .ics attachment.
   */
  async sendCustomerBookingPendingEmail({
    to,
    customerName,
    serviceName,
    providerName,
    bookingDate,
    startTime,
    duration,
  }) {
    if (!to || !to.includes('@')) {
      return { success: false, skipped: true, error: 'Missing or invalid customer email address' };
    }

    if (!this.isConfigured()) {
      console.error(`[EmailService] Resend API key not configured. Customer booking pending email not sent. Provider: "${providerName || 'Unknown'}", Recipient: "${to}"`);
      return { success: false, skipped: true, error: 'Resend API key not configured' };
    }

    try {
      const client = this.getClient();
      const subject = `Booking received - payment verification pending: ${serviceName} with ${providerName}`;

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
            <div style="margin-bottom: 24px;">
              <span style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">Calup</span>
            </div>
            
            <h1 style="font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 12px;">Booking received - payment verification pending</h1>
            <p style="font-size: 15px; line-height: 1.5; color: #334155; margin: 0 0 20px;">
              Hi ${customerName || 'there'}, your slot is reserved and the coach will confirm shortly.
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

            <p style="font-size: 14px; line-height: 1.5; color: #475569; margin: 20px 0 0;">
              Please make sure you have paid the coach directly and marked it as paid. Once your coach confirms the payment, you will receive an official booking confirmation with meeting links.
            </p>
          </div>
        </body>
        </html>
      `;

      const text = `
Booking received - payment verification pending

Hi ${customerName || 'there'}, your slot is reserved and the coach will confirm shortly:
- Service: ${serviceName}
- Coach: ${providerName}
- Date: ${bookingDate}
- Time: ${startTime} (${duration} mins)

Once your coach confirms the payment, you will receive a booking confirmation email with session details.
      `.trim();

      const { data, error } = await client.emails.send({
        from: this.fromEmail,
        to: [to.trim()],
        subject,
        text,
        html,
      });

      if (error) {
        console.error(`[EmailService] Resend customer booking pending failed. Provider: "${providerName || 'Unknown'}", Recipient: "${to}", Error: ${error.message || JSON.stringify(error)}`);
        return { success: false, error: error.message || String(error) };
      }

      return { success: true, messageId: data?.id || null };
    } catch (err) {
      console.error(`[EmailService] Customer booking pending email exception. Provider: "${providerName || 'Unknown'}", Recipient: "${to}", Error: ${err.message || err}`);
      return { success: false, error: err.message };
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
      console.error(`[EmailService] Resend API key not configured. Provider notification email not sent. Provider: "${providerName || 'Unknown'}", Recipient: "${to}"`);
      return { success: false, skipped: true, error: 'Resend API key not configured' };
    }

    try {
      const client = this.getClient();
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
              <span style="font-size: 18px; font-weight: 700; color: #0f172a;">Calup</span>
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

      const { data, error } = await client.emails.send({
        from: this.fromEmail,
        to: [to.trim()],
        subject,
        text,
        html,
      });

      if (error) {
        console.error(`[EmailService] Resend provider notification failed. Provider: "${providerName || 'Unknown'}", Recipient: "${to}", Error: ${error.message || JSON.stringify(error)}`);
        return {
          success: false,
          error: error.message || String(error),
        };
      }

      return {
        success: true,
        messageId: data?.id || null,
      };
    } catch (err) {
      console.error(`[EmailService] Provider notification email exception. Provider: "${providerName || 'Unknown'}", Recipient: "${to}", Error: ${err.message || err}`);
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
      console.error(`[EmailService] Resend API key not configured. Reminder email not sent. Provider: "${providerName || 'Unknown'}", Recipient: "${to}"`);
      return { success: false, skipped: true, error: 'Resend API key not configured' };
    }

    try {
      const client = this.getClient();
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
              <span style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">Calup</span>
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

      const { data, error } = await client.emails.send({
        from: this.fromEmail,
        to: [to.trim()],
        subject,
        text,
        html,
      });

      if (error) {
        console.error(`[EmailService] Resend reminder email failed. Provider: "${providerName || 'Unknown'}", Recipient: "${to}", Error: ${error.message || JSON.stringify(error)}`);
        return {
          success: false,
          error: error.message || String(error),
        };
      }

      return {
        success: true,
        messageId: data?.id || null,
      };
    } catch (err) {
      console.error(`[EmailService] Reminder email exception. Provider: "${providerName || 'Unknown'}", Recipient: "${to}", Error: ${err.message || err}`);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * 4. Send Provider Notification Email when Customer Submits Payment & Screenshot
   */
  async sendPaymentSubmittedEmailToProvider({
    to,
    providerName,
    customerName,
    customerEmail = '',
    customerPhone = '',
    serviceName,
    bookingDate,
    startTime,
    amount,
    screenshotUrl = '',
    dashboardUrl = '',
  }) {
    if (!to || !to.includes('@')) {
      return { success: false, skipped: true, error: 'Missing or invalid provider email address' };
    }

    if (!this.isConfigured()) {
      console.error(`[EmailService] Resend API key not configured. Payment submission email not sent. Provider: "${providerName || 'Unknown'}", Recipient: "${to}"`);
      return { success: false, skipped: true, error: 'Resend API key not configured' };
    }

    try {
      const client = this.getClient();
      const subject = `Payment Submitted: ${customerName} paid ₹${amount} for ${serviceName}`;

      const screenshotSection = screenshotUrl
        ? `<div style="margin: 20px 0 16px; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
             <div style="font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 8px;">📷 Payment Screenshot Attached:</div>
             <a href="${screenshotUrl}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; font-weight: 600; text-decoration: underline; font-size: 14px;">
               View Uploaded Payment Screenshot ↗
             </a>
           </div>`
        : `<p style="color: #64748b; font-size: 13px;"><em>No screenshot image was attached by client.</em></p>`;

      const dashboardButton = dashboardUrl
        ? `<div style="margin: 24px 0 16px;">
             <a href="${dashboardUrl}" style="background-color: #166534; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
               Review & Confirm Payment in Dashboard
             </a>
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
            <div style="margin-bottom: 20px;">
              <span style="font-size: 18px; font-weight: 700; color: #0f172a;">Calup</span>
            </div>
            
            <h1 style="font-size: 20px; font-weight: 700; color: #166534; margin: 0 0 8px;">Payment Details Submitted</h1>
            <p style="font-size: 15px; color: #334155; margin: 0 0 20px;">
              Hi ${providerName || 'Coach'}, <strong>${customerName}</strong> has submitted payment details for their upcoming session. Please verify the payment in your UPI app and confirm or reject it in your Calup dashboard.
            </p>

            <div style="background-color: #f1f5f9; border-radius: 8px; padding: 18px 20px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="padding: 6px 0; color: #64748b; width: 35%;">Client</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${customerName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Client Phone</td>
                  <td style="padding: 6px 0; color: #0f172a;">${customerPhone || 'Not provided'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Client Email</td>
                  <td style="padding: 6px 0; color: #0f172a;">${customerEmail || 'Not provided'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Service</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${serviceName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Session Date & Time</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${bookingDate} at ${startTime}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Amount Paid</td>
                  <td style="padding: 6px 0; color: #166534; font-weight: 700; font-size: 16px;">₹${amount}</td>
                </tr>
              </table>
            </div>

            ${screenshotSection}

            ${dashboardButton}

            <p style="font-size: 12px; color: #64748b; margin-top: 24px;">
              Once verified in your UPI app, click above to confirm the booking or reject if the payment was not received.
            </p>
          </div>
        </body>
        </html>
      `;

      const text = `
Payment Details Submitted!

Hi ${providerName || 'Coach'}, ${customerName} has submitted payment details:
- Client: ${customerName} (${customerPhone})
- Service: ${serviceName}
- Date & Time: ${bookingDate} at ${startTime}
- Amount: ₹${amount}
${screenshotUrl ? `- Screenshot: ${screenshotUrl}` : ''}
${dashboardUrl ? `- Review in Dashboard: ${dashboardUrl}` : ''}
      `.trim();

      const { data, error } = await client.emails.send({
        from: this.fromEmail,
        to: [to.trim()],
        subject,
        text,
        html,
      });

      if (error) {
        console.error(`[EmailService] Resend payment submission notification failed. Provider: "${providerName || 'Unknown'}", Recipient: "${to}", Error: ${error.message || JSON.stringify(error)}`);
        return { success: false, error: error.message || String(error) };
      }

      return { success: true, messageId: data?.id || null };
    } catch (err) {
      console.error(`[EmailService] Payment submission notification email exception. Provider: "${providerName || 'Unknown'}", Recipient: "${to}", Error: ${err.message || err}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * 5. Send Customer Payment Rejected Notification (POST /api/bookings/:id/reject-payment)
   * "Payment could not be verified - please contact <coach name>" with coach contact details. NO .ics.
   */
  async sendPaymentRejectedEmailToCustomer({
    to,
    customerName,
    serviceName,
    providerName,
    bookingDate,
    startTime,
    providerEmail = '',
    providerPhone = '',
    providerWhatsApp = '',
    reason = '',
  }) {
    if (!to || !to.includes('@')) {
      return { success: false, skipped: true, error: 'Missing or invalid customer email address' };
    }

    if (!this.isConfigured()) {
      console.error(`[EmailService] Resend API key not configured. Customer payment rejection email not sent. Provider: "${providerName || 'Unknown'}", Recipient: "${to}"`);
      return { success: false, skipped: true, error: 'Resend API key not configured' };
    }

    try {
      const client = this.getClient();
      const subject = `Payment could not be verified - please contact ${providerName}`;

      const contactSection = `
        <div style="background-color: #f1f5f9; border-radius: 8px; padding: 18px 20px; margin: 20px 0;">
          <div style="font-weight: 600; color: #0f172a; margin-bottom: 10px;">Coach Contact Details:</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 4px 0; color: #64748b; width: 30%;">Coach</td>
              <td style="padding: 4px 0; color: #0f172a; font-weight: 600;">${providerName}</td>
            </tr>
            ${providerEmail ? `<tr><td style="padding: 4px 0; color: #64748b;">Email</td><td style="padding: 4px 0; color: #0f172a;"><a href="mailto:${providerEmail}" style="color: #2563eb;">${providerEmail}</a></td></tr>` : ''}
            ${providerPhone ? `<tr><td style="padding: 4px 0; color: #64748b;">Phone</td><td style="padding: 4px 0; color: #0f172a;"><a href="tel:${providerPhone}" style="color: #2563eb;">${providerPhone}</a></td></tr>` : ''}
            ${providerWhatsApp && providerWhatsApp !== providerPhone ? `<tr><td style="padding: 4px 0; color: #64748b;">WhatsApp</td><td style="padding: 4px 0; color: #0f172a;">${providerWhatsApp}</td></tr>` : ''}
          </table>
        </div>
      `;

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
            <div style="margin-bottom: 24px;">
              <span style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">Calup</span>
            </div>
            
            <h1 style="font-size: 22px; font-weight: 700; color: #dc2626; margin: 0 0 12px;">Payment could not be verified</h1>
            <p style="font-size: 15px; line-height: 1.5; color: #334155; margin: 0 0 20px;">
              Hi ${customerName || 'there'}, your payment for <strong>${serviceName}</strong> on <strong>${bookingDate}</strong> at <strong>${startTime}</strong> could not be verified, and the reserved time slot has been released.
            </p>

            ${reason ? `<div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px 16px; margin: 16px 0; font-size: 14px; color: #991b1b;"><strong>Reason:</strong> ${reason}</div>` : ''}

            <p style="font-size: 14px; color: #334155; margin: 16px 0 8px;">
              Please contact <strong>${providerName}</strong> directly if you believe this is an error or to arrange alternative payment:
            </p>

            ${contactSection}
          </div>
        </body>
        </html>
      `;

      const text = `
Payment could not be verified - please contact ${providerName}

Hi ${customerName || 'there'},

Your payment for ${serviceName} on ${bookingDate} at ${startTime} could not be verified, and the reserved time slot has been released.
${reason ? `Reason: ${reason}\n` : ''}
Please contact ${providerName} directly:
- Email: ${providerEmail || 'N/A'}
- Phone: ${providerPhone || 'N/A'}
      `.trim();

      const { data, error } = await client.emails.send({
        from: this.fromEmail,
        to: [to.trim()],
        subject,
        text,
        html,
      });

      if (error) {
        console.error(`[EmailService] Resend customer payment rejection failed. Provider: "${providerName || 'Unknown'}", Recipient: "${to}", Error: ${error.message || JSON.stringify(error)}`);
        return { success: false, error: error.message || String(error) };
      }

      return { success: true, messageId: data?.id || null };
    } catch (err) {
      console.error(`[EmailService] Customer payment rejection email exception. Provider: "${providerName || 'Unknown'}", Recipient: "${to}", Error: ${err.message || err}`);
      return { success: false, error: err.message };
    }
  }
}

export const emailService = new EmailService();
