const { getDb } = require('../database/db');
const ListingModel = require('../models/listingModel');

// Helper to get today's local date string (YYYY-MM-DD) avoiding UTC shifts (EC-3.4)
function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to calculate inclusive days between two YYYY-MM-DD strings (EC-3.1)
function calculateInclusiveDays(startDateStr, endDateStr) {
  const [sY, sM, sD] = startDateStr.split('-').map(Number);
  const [eY, eM, eD] = endDateStr.split('-').map(Number);
  const start = new Date(sY, sM - 1, sD);
  const end = new Date(eY, eM - 1, eD);
  const diffTime = end.getTime() - start.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

// Helper to validate YYYY-MM-DD format
function isValidDateFormat(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

const AvailabilityService = {
  getTodayString,
  calculateInclusiveDays,

  /**
   * Get all unavailable date ranges for a listing (booked + blocked)
   * GET /api/listings/:id/availability
   */
  getUnavailableRanges(listingId) {
    const db = getDb();
    const today = getTodayString();

    // 1. Get active bookings (Pending and Confirmed) whose end_date is today or later
    // Rejected and Cancelled bookings are automatically excluded (EC-3.7)
    const bookingRows = db.prepare(`
      SELECT id, start_date, end_date, status
      FROM bookings
      WHERE listing_id = ?
        AND status IN ('Pending', 'Confirmed')
        AND end_date >= ?
      ORDER BY start_date ASC
    `).all(listingId, today);

    // 2. Get owner blocked maintenance ranges
    const blockedRows = db.prepare(`
      SELECT id, start_date, end_date, reason
      FROM blocked_dates
      WHERE listing_id = ?
        AND end_date >= ?
      ORDER BY start_date ASC
    `).all(listingId, today);

    const unavailableRanges = [
      ...bookingRows.map(b => ({
        id: b.id,
        start: b.start_date,
        end: b.end_date,
        type: 'booked',
        status: b.status,
        label: b.status === 'Confirmed' ? 'Reserved' : 'Pending Booking'
      })),
      ...blockedRows.map(b => ({
        id: b.id,
        start: b.start_date,
        end: b.end_date,
        type: 'blocked',
        status: 'Maintenance',
        reason: b.reason || 'Maintenance / Personal Use',
        label: 'Unavailable / Maintenance'
      }))
    ];

    return unavailableRanges;
  },

  /**
   * Validate date range availability and compute pricing
   * POST /api/listings/:id/check-availability
   */
  checkAvailability(listingId, startDate, endDate) {
    // 1. Format validation
    if (!isValidDateFormat(startDate) || !isValidDateFormat(endDate)) {
      return {
        valid: false,
        error: 'Dates must be in valid YYYY-MM-DD format.'
      };
    }

    const today = getTodayString();

    // 2. Past date check (EC-3.6)
    if (startDate < today) {
      return {
        valid: false,
        error: 'Start date cannot be in the past.'
      };
    }

    // 3. Inverted date check (EC-3.2)
    if (startDate > endDate) {
      return {
        valid: false,
        error: 'End date must be on or after the start date.'
      };
    }

    const listing = ListingModel.findById(listingId);
    if (!listing) {
      return {
        valid: false,
        error: 'Listing not found.'
      };
    }

    // 4. Inclusive days calculation (EC-3.1)
    const days = calculateInclusiveDays(startDate, endDate);
    const totalPrice = days * listing.price_per_day;

    const db = getDb();

    // 5. Check overlapping active bookings (EC-3.3)
    // Formula: existing_start <= requested_end AND existing_end >= requested_start
    const conflictingBooking = db.prepare(`
      SELECT id, start_date, end_date, status
      FROM bookings
      WHERE listing_id = ?
        AND status IN ('Pending', 'Confirmed')
        AND start_date <= ?
        AND end_date >= ?
      LIMIT 1
    `).get(listingId, endDate, startDate);

    if (conflictingBooking) {
      return {
        valid: true,
        available: false,
        conflict: {
          type: 'booking',
          status: conflictingBooking.status,
          start: conflictingBooking.start_date,
          end: conflictingBooking.end_date
        },
        message: `Selected dates conflict with an existing ${conflictingBooking.status.toLowerCase()} booking (${conflictingBooking.start_date} to ${conflictingBooking.end_date}).`
      };
    }

    // 6. Check overlapping blocked maintenance dates
    const conflictingBlock = db.prepare(`
      SELECT id, start_date, end_date, reason
      FROM blocked_dates
      WHERE listing_id = ?
        AND start_date <= ?
        AND end_date >= ?
      LIMIT 1
    `).get(listingId, endDate, startDate);

    if (conflictingBlock) {
      return {
        valid: true,
        available: false,
        conflict: {
          type: 'blocked',
          start: conflictingBlock.start_date,
          end: conflictingBlock.end_date,
          reason: conflictingBlock.reason
        },
        message: `Selected dates conflict with scheduled equipment maintenance (${conflictingBlock.start_date} to ${conflictingBlock.end_date}).`
      };
    }

    return {
      valid: true,
      available: true,
      days,
      pricePerDay: listing.price_per_day,
      totalPrice,
      startDate,
      endDate
    };
  },

  /**
   * Owner blocks dates for maintenance/repair (EC-3.8)
   */
  blockDates(listingId, ownerId, { startDate, endDate, reason }) {
    const listing = ListingModel.findById(listingId);
    if (!listing) throw new Error('Listing not found');
    if (listing.owner_id !== ownerId) throw new Error('Only the listing owner can block dates');

    if (!isValidDateFormat(startDate) || !isValidDateFormat(endDate)) {
      throw new Error('Dates must be in valid YYYY-MM-DD format');
    }

    if (startDate > endDate) {
      throw new Error('End date must be on or after start date');
    }

    const today = getTodayString();
    if (startDate < today) {
      throw new Error('Cannot block dates in the past');
    }

    const db = getDb();

    // EC-3.8: Owner cannot block dates that overlap with an existing Confirmed renter booking
    const confirmedBooking = db.prepare(`
      SELECT id, start_date, end_date 
      FROM bookings
      WHERE listing_id = ?
        AND status = 'Confirmed'
        AND start_date <= ?
        AND end_date >= ?
      LIMIT 1
    `).get(listingId, endDate, startDate);

    if (confirmedBooking) {
      const err = new Error(`Cannot block dates because a confirmed booking already exists for ${confirmedBooking.start_date} to ${confirmedBooking.end_date}.`);
      err.code = 'CONFIRMED_BOOKING_EXISTS';
      throw err;
    }

    const stmt = db.prepare(`
      INSERT INTO blocked_dates (listing_id, start_date, end_date, reason)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(listingId, startDate, endDate, reason ? reason.trim() : 'Scheduled maintenance');
    return {
      id: Number(result.lastInsertRowid),
      listingId,
      startDate,
      endDate,
      reason: reason || 'Scheduled maintenance'
    };
  },

  /**
   * Owner unblocks dates
   */
  unblockDates(listingId, ownerId, blockId) {
    const listing = ListingModel.findById(listingId);
    if (!listing) throw new Error('Listing not found');
    if (listing.owner_id !== ownerId) throw new Error('Only the listing owner can unblock dates');

    const db = getDb();
    const stmt = db.prepare(`
      DELETE FROM blocked_dates 
      WHERE id = ? AND listing_id = ?
    `);
    const res = stmt.run(blockId, listingId);
    return res.changes > 0;
  }
};

module.exports = AvailabilityService;
