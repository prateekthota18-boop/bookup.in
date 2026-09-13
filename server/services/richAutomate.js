/**
 * BookUp — RichAutomate WhatsApp Service (Phase 4)
 *
 * Provides official integration with RichAutomate WhatsApp API:
 * - POST /api/v1/send-template
 * - GET  /api/v1/message-status/:message_id
 *
 * Hard constraints:
 * - Never throws unhandled errors that could disrupt booking flow.
 * - Formats phone numbers to international standard (E.164 digits without + prefix).
 * - Masks API keys in logs.
 * - Handles API key absence gracefully.
 */

import { config } from '../config.js';

const RICH_AUTOMATE_BASE_URL = 'https://richautomate.in/api/v1';

// Template identifiers configured in RichAutomate dashboard
export const WHATSAPP_TEMPLATES = {
  CONFIRMATION_CUSTOMER: process.env.RICH_AUTOMATE_TEMPLATE_CONFIRMATION_CUSTOMER || 'customer_booking_confirmation',
  CONFIRMATION_PROVIDER: process.env.RICH_AUTOMATE_TEMPLATE_CONFIRMATION_PROVIDER || 'provider_booking_notification',
  REMINDER_CUSTOMER: process.env.RICH_AUTOMATE_TEMPLATE_REMINDER_CUSTOMER || 'customer_booking_reminder',
};

/**
 * Normalizes phone numbers to standard E.164 digits (without leading +)
 * Handles Indian (+91 / 0) and international numbers cleanly.
 *
 * @param {string} phone
 * @returns {string} normalized digits or empty string if invalid
 */
export function normalizePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return '';

  // Remove all non-digit characters except leading +
  const trimmed = phone.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (!digitsOnly) return '';

  // Standard Indian 10-digit mobile number (e.g. 9876543210 -> 919876543210)
  if (digitsOnly.length === 10) {
    return `91${digitsOnly}`;
  }

  // 11 digits starting with 0 (e.g. 09876543210 -> 919876543210)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    return `91${digitsOnly.substring(1)}`;
  }

  // 12 digits starting with 91 (already formatted with India country code)
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return digitsOnly;
  }

  // International numbers (between 10 and 15 digits)
  if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
    return digitsOnly;
  }

  // Return digits as fallback if plausible
  return digitsOnly;
}

export class RichAutomateService {
  constructor(apiKey = null) {
    this._apiKey = apiKey;
    this.baseUrl = RICH_AUTOMATE_BASE_URL;
  }

  get apiKey() {
    return this._apiKey !== null ? this._apiKey : (process.env.RICH_AUTOMATE_API_KEY || config.richAutomateApiKey || '');
  }

  set apiKey(val) {
    this._apiKey = val;
  }

  /**
   * Check if the service has a valid API key configured
   */
  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Send WhatsApp template message via RichAutomate
   *
   * @param {Object} params
   * @param {string} params.phone - Customer or provider phone number
   * @param {string} params.template - Template name as registered in RichAutomate
   * @param {string} [params.language='en'] - Template language code
   * @param {Array<string>} [params.variables=[]] - Positional replacement parameters
   * @param {string} [params.headerMediaType] - Optional media type (image/document/video)
   * @param {string} [params.headerMediaUrl] - Optional media URL
   * @param {string} [params.filename] - Optional document filename
   * @returns {Promise<{ success: boolean, messageId?: string, error?: string, raw?: any }>}
   */
  async sendTemplate({
    phone,
    template,
    language = 'en',
    variables = [],
    headerMediaType,
    headerMediaUrl,
    filename,
  }) {
    const formattedPhone = normalizePhoneNumber(phone);

    if (!formattedPhone) {
      console.warn(`[RichAutomate] Invalid recipient phone number provided: ${phone}`);
      return { success: false, error: 'Invalid recipient phone number format' };
    }

    if (!template) {
      return { success: false, error: 'Template name is required' };
    }

    if (!this.isConfigured()) {
      console.warn('[RichAutomate] API key not configured. Skipping live WhatsApp send.');
      return {
        success: false,
        error: 'RichAutomate API key is not configured',
        skipped: true,
      };
    }

    const payload = {
      phone: formattedPhone,
      template,
      language,
      variables: (variables || []).map(v => String(v ?? '')),
    };

    if (headerMediaType) payload.header_media_type = headerMediaType;
    if (headerMediaUrl) payload.header_media_url = headerMediaUrl;
    if (filename) payload.filename = filename;

    try {
      const response = await fetch(`${this.baseUrl}/send-template`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data?.error || data?.message || `HTTP ${response.status} ${response.statusText}`;
        console.error(`[RichAutomate] Template send failed (${response.status}):`, errorMsg);
        return {
          success: false,
          error: errorMsg,
          raw: data,
        };
      }

      const messageId = data?.message_id || data?.id || null;
      return {
        success: true,
        messageId,
        raw: data,
      };
    } catch (err) {
      console.error('[RichAutomate] Network/Fetch error during template send:', err.message);
      return {
        success: false,
        error: err.message || 'Unknown network error occurred',
      };
    }
  }

  /**
   * Check status of a sent message
   *
   * @param {string} messageId - RichAutomate message_id
   * @returns {Promise<{ success: boolean, status?: string, error?: string }>}
   */
  async getMessageStatus(messageId) {
    if (!messageId) {
      return { success: false, error: 'Message ID is required' };
    }

    if (!this.isConfigured()) {
      return { success: false, error: 'RichAutomate API key is not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/message-status/${encodeURIComponent(messageId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          success: false,
          error: data?.error || data?.message || `HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        status: data?.status || 'unknown',
        error: data?.error || null,
        raw: data,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Send WhatsApp confirmation to Customer
   * Variables: [Service, Provider, Date, Time, Duration, ManageUrl]
   */
  async sendCustomerConfirmation({
    phone,
    customerName,
    serviceName,
    providerName,
    bookingDate,
    startTime,
    duration,
    managementUrl,
  }) {
    const formattedDuration = duration ? `${duration} mins` : '60 mins';
    const variables = [
      customerName || 'Valued Customer',
      serviceName || 'Appointment',
      providerName || 'Provider',
      bookingDate || '',
      startTime || '',
      formattedDuration,
      managementUrl || '',
    ];

    return this.sendTemplate({
      phone,
      template: WHATSAPP_TEMPLATES.CONFIRMATION_CUSTOMER,
      variables,
    });
  }

  /**
   * Send WhatsApp new-booking notification to Provider
   * Variables: [CustomerName, Service, Date, Time, Duration]
   */
  async sendProviderNotification({
    phone,
    customerName,
    serviceName,
    bookingDate,
    startTime,
    duration,
  }) {
    const formattedDuration = duration ? `${duration} mins` : '60 mins';
    const variables = [
      customerName || 'A customer',
      serviceName || 'Appointment',
      bookingDate || '',
      startTime || '',
      formattedDuration,
    ];

    return this.sendTemplate({
      phone,
      template: WHATSAPP_TEMPLATES.CONFIRMATION_PROVIDER,
      variables,
    });
  }

  /**
   * Send 2-hour reminder to Customer
   * Variables: [CustomerName, Service, Provider, Date, Time, ManageUrl]
   */
  async sendCustomerReminder({
    phone,
    customerName,
    serviceName,
    providerName,
    bookingDate,
    startTime,
    managementUrl,
  }) {
    const variables = [
      customerName || 'Valued Customer',
      serviceName || 'Appointment',
      providerName || 'Provider',
      bookingDate || '',
      startTime || '',
      managementUrl || '',
    ];

    return this.sendTemplate({
      phone,
      template: WHATSAPP_TEMPLATES.REMINDER_CUSTOMER,
      variables,
    });
  }
}

export const richAutomateService = new RichAutomateService();
