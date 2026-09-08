/**
 * BookUp — Notification Provider Interface
 * Decoupled notification abstraction for WhatsApp / SMS / Email
 */

export class NotificationProvider {
  /**
   * Send booking confirmation message
   * @param {Object} booking
   * @param {Object} provider
   * @returns {Promise<{ success: boolean, messageId: string, messageBody: string }>}
   */
  async sendBookingConfirmation(booking, provider) {
    throw new Error('sendBookingConfirmation() must be implemented by subclass');
  }

  /**
   * Send cancellation notice
   * @param {Object} booking
   * @param {Object} provider
   * @returns {Promise<{ success: boolean, messageId: string, messageBody: string }>}
   */
  async sendCancellationNotice(booking, provider) {
    throw new Error('sendCancellationNotice() must be implemented by subclass');
  }

  /**
   * Send reschedule notice
   * @param {Object} booking
   * @param {Object} provider
   * @returns {Promise<{ success: boolean, messageId: string, messageBody: string }>}
   */
  async sendRescheduleNotice(booking, provider) {
    throw new Error('sendRescheduleNotice() must be implemented by subclass');
  }
}
