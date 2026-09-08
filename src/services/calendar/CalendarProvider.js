/**
 * BookUp — Calendar Provider Interface
 * Decoupled calendar abstraction for Google Calendar / Outlook / CalDAV
 */

export class CalendarProvider {
  /**
   * Connect to calendar provider
   * @param {Object} options
   * @returns {Promise<{ success: boolean, email: string }>}
   */
  async connect(options = {}) {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * Disconnect from calendar provider
   * @returns {Promise<boolean>}
   */
  async disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    throw new Error('isConnected() must be implemented by subclass');
  }

  /**
   * Fetch busy time intervals for a given date
   * @param {string} dateStr 'YYYY-MM-DD'
   * @returns {Promise<Array<{ title: string, start: string, end: string }>>}
   */
  async getBusyTimes(dateStr) {
    throw new Error('getBusyTimes() must be implemented by subclass');
  }

  /**
   * Create an event for a booking
   * @param {Object} booking
   * @returns {Promise<{ eventId: string, success: boolean }>}
   */
  async createEvent(booking) {
    throw new Error('createEvent() must be implemented by subclass');
  }
}
