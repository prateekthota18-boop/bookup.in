/**
 * BookUp — Mock WhatsApp Provider
 * Simulates WhatsApp messaging with real-world Indian templates & formatting
 */

import { NotificationProvider } from './NotificationProvider';

export class MockWhatsAppProvider extends NotificationProvider {
  formatDateIndian(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return dateStr;
    }
  }

  formatTimeAmPm(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  generateConfirmationMessage(booking, provider) {
    const custName = booking.customerName || 'there';
    const svcName = booking.serviceName || 'Session';
    const provName = provider?.name || 'your provider';
    const dateFormatted = this.formatDateIndian(booking.date);
    const startFormatted = this.formatTimeAmPm(booking.startTime);
    const endFormatted = this.formatTimeAmPm(booking.endTime);
    const depositNote = booking.depositAmount > 0
      ? `\n💳 UPI Deposit Paid: ₹${booking.depositAmount}`
      : '';

    return `Hi ${custName}! 👋\n\nYour ${svcName} with ${provName} is confirmed for ${dateFormatted}, ${startFormatted}–${endFormatted}.${depositNote}\n\n📍 Mode: In-person / Online\n⚠️ Reply CANCEL to cancel (free cancellation up to 12 hrs before).\n\nSee you soon!`;
  }

  generateCancellationMessage(booking, provider) {
    const custName = booking.customerName || 'there';
    const svcName = booking.serviceName || 'Session';
    const provName = provider?.name || 'your provider';
    const dateFormatted = this.formatDateIndian(booking.date);
    const refundNote = booking.depositAmount > 0
      ? `\n💰 Your deposit of ₹${booking.depositAmount} has been refunded to your UPI account.`
      : '';

    return `Hi ${custName},\n\nYour ${svcName} with ${provName} scheduled for ${dateFormatted} has been cancelled.${refundNote}\n\nYou can book another session anytime at ${provider?.slug ? `bookup.in/${provider.slug}` : 'our booking page'}.`;
  }

  generateRescheduleMessage(booking, provider) {
    const custName = booking.customerName || 'there';
    const svcName = booking.serviceName || 'Session';
    const provName = provider?.name || 'your provider';
    const dateFormatted = this.formatDateIndian(booking.date);
    const startFormatted = this.formatTimeAmPm(booking.startTime);

    return `Hi ${custName},\n\nYour ${svcName} with ${provName} has been rescheduled to ${dateFormatted} at ${startFormatted}.\n\nLooking forward to seeing you!`;
  }

  generateReminderMessage(booking, provider, hoursBefore = 24) {
    const custName = booking.customerName || 'there';
    const svcName = booking.serviceName || 'Session';
    const provName = provider?.name || 'your provider';
    const startFormatted = this.formatTimeAmPm(booking.startTime);

    return `Hi ${custName}! ⏰ Reminder: Your ${svcName} with ${provName} is scheduled for ${hoursBefore === 24 ? 'tomorrow' : 'in 2 hours'} at ${startFormatted}.\n\nPlease arrive 5 minutes early.`;
  }

  async sendBookingConfirmation(booking, provider) {
    const messageBody = this.generateConfirmationMessage(booking, provider);
    return {
      success: true,
      messageId: `wa_${Date.now()}`,
      messageBody,
      timestamp: new Date().toISOString(),
    };
  }

  async sendCancellationNotice(booking, provider) {
    const messageBody = this.generateCancellationMessage(booking, provider);
    return {
      success: true,
      messageId: `wa_cancel_${Date.now()}`,
      messageBody,
      timestamp: new Date().toISOString(),
    };
  }

  async sendRescheduleNotice(booking, provider) {
    const messageBody = this.generateRescheduleMessage(booking, provider);
    return {
      success: true,
      messageId: `wa_resched_${Date.now()}`,
      messageBody,
      timestamp: new Date().toISOString(),
    };
  }
}

export const whatsAppService = new MockWhatsAppProvider();
