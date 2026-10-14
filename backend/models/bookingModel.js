const { getDb } = require('../database/db');
const AvailabilityService = require('../services/availabilityService');

const BookingModel = {
  /**
   * Automatically transition concluded confirmed bookings to 'Completed' (EC-4.7)
   */
  autoCompleteConcludedBookings() {
    const db = getDb();
    const today = AvailabilityService.getTodayString();
    const stmt = db.prepare(`
      UPDATE bookings
      SET status = 'Completed', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'Confirmed' AND end_date < ?
    `);
    const result = stmt.run(today);
    return result.changes;
  },

  /**
   * Atomic booking creation with concurrency lock and overlap validation (EC-3.5, EC-4.4)
   */
  create({ listingId, renterId, ownerId, startDate, endDate, daysCount, pricePerDay, totalPrice, termsAccepted, renterNotes }) {
    const db = getDb();

    // Use BEGIN IMMEDIATE transaction for atomic collision check and insertion (EC-3.5)
    db.exec('BEGIN IMMEDIATE');
    try {
      // 1. Check for overlapping active bookings (Pending or Confirmed)
      const existingBooking = db.prepare(`
        SELECT id, start_date, end_date, status
        FROM bookings
        WHERE listing_id = ?
          AND status IN ('Pending', 'Confirmed')
          AND start_date <= ?
          AND end_date >= ?
        LIMIT 1
      `).get(listingId, endDate, startDate);

      if (existingBooking) {
        const error = new Error(`Dates overlap with an existing ${existingBooking.status.toLowerCase()} booking (${existingBooking.start_date} to ${existingBooking.end_date}).`);
        error.code = 'COLLISION';
        throw error;
      }

      // 2. Check for overlapping owner maintenance blocked dates
      const existingBlock = db.prepare(`
        SELECT id, start_date, end_date, reason
        FROM blocked_dates
        WHERE listing_id = ?
          AND start_date <= ?
          AND end_date >= ?
        LIMIT 1
      `).get(listingId, endDate, startDate);

      if (existingBlock) {
        const error = new Error(`Dates overlap with scheduled equipment maintenance (${existingBlock.start_date} to ${existingBlock.end_date}).`);
        error.code = 'COLLISION';
        throw error;
      }

      // 3. Insert new booking
      const stmt = db.prepare(`
        INSERT INTO bookings (
          listing_id, renter_id, owner_id,
          start_date, end_date, days_count,
          price_per_day, total_price, status,
          terms_accepted, renter_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)
      `);

      const result = stmt.run(
        listingId,
        renterId,
        ownerId,
        startDate,
        endDate,
        daysCount,
        pricePerDay,
        totalPrice,
        termsAccepted ? 1 : 0,
        renterNotes ? renterNotes.trim() : null
      );

      const bookingId = Number(result.lastInsertRowid);
      db.exec('COMMIT');
      return BookingModel.findById(bookingId);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  },

  /**
   * Find booking by ID with joined user and listing data
   */
  findById(id) {
    const db = getDb();
    const row = db.prepare(`
      SELECT 
        b.*,
        l.title as listing_title,
        l.category as listing_category,
        l.city as listing_city,
        l.images as listing_images,
        l.rental_terms as listing_terms,
        r.name as renter_name,
        r.email as renter_email,
        r.phone as renter_phone,
        r.city as renter_city,
        o.name as owner_name,
        o.email as owner_email,
        o.phone as owner_phone,
        o.city as owner_city
      FROM bookings b
      JOIN listings l ON b.listing_id = l.id
      JOIN users r ON b.renter_id = r.id
      JOIN users o ON b.owner_id = o.id
      WHERE b.id = ?
    `).get(id);

    if (!row) return null;

    let images = [];
    if (row.listing_images) {
      try { images = JSON.parse(row.listing_images); } catch { images = [row.listing_images]; }
    }

    const today = AvailabilityService.getTodayString();
    const canCancel = (row.status === 'Pending' || row.status === 'Confirmed') && row.start_date > today;

    return {
      ...row,
      listing_images: images,
      primary_image: images[0] || 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=600&q=80',
      can_cancel: canCancel
    };
  },

  /**
   * Get all bookings for a renter (My Bookings)
   */
  findByRenter(renterId) {
    this.autoCompleteConcludedBookings();
    const db = getDb();
    const rows = db.prepare(`
      SELECT 
        b.*,
        l.title as listing_title,
        l.category as listing_category,
        l.city as listing_city,
        l.images as listing_images,
        o.name as owner_name,
        o.phone as owner_phone,
        o.email as owner_email,
        o.city as owner_city
      FROM bookings b
      JOIN listings l ON b.listing_id = l.id
      JOIN users o ON b.owner_id = o.id
      WHERE b.renter_id = ?
      ORDER BY b.created_at DESC
    `).all(renterId);

    const today = AvailabilityService.getTodayString();

    return rows.map(r => {
      let images = [];
      if (r.listing_images) {
        try { images = JSON.parse(r.listing_images); } catch { images = [r.listing_images]; }
      }
      return {
        ...r,
        listing_images: images,
        primary_image: images[0] || 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=600&q=80',
        can_cancel: (r.status === 'Pending' || r.status === 'Confirmed') && r.start_date > today
      };
    });
  },

  /**
   * Get all incoming requests for an owner (Booking Requests)
   */
  findByOwner(ownerId) {
    this.autoCompleteConcludedBookings();
    const db = getDb();
    const rows = db.prepare(`
      SELECT 
        b.*,
        l.title as listing_title,
        l.category as listing_category,
        l.images as listing_images,
        r.name as renter_name,
        r.email as renter_email,
        r.phone as renter_phone,
        r.city as renter_city
      FROM bookings b
      JOIN listings l ON b.listing_id = l.id
      JOIN users r ON b.renter_id = r.id
      WHERE b.owner_id = ?
      ORDER BY b.created_at DESC
    `).all(ownerId);

    return rows.map(r => {
      let images = [];
      if (r.listing_images) {
        try { images = JSON.parse(r.listing_images); } catch { images = [r.listing_images]; }
      }
      return {
        ...r,
        listing_images: images,
        primary_image: images[0] || 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=600&q=80'
      };
    });
  },

  /**
   * Owner accepts pending booking (EC-4.4)
   */
  accept(bookingId, ownerId) {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE bookings
      SET status = 'Confirmed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND owner_id = ? AND status = 'Pending'
    `);
    const res = stmt.run(bookingId, ownerId);
    return res.changes > 0;
  },

  /**
   * Owner rejects pending booking (EC-4.4)
   */
  reject(bookingId, ownerId) {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE bookings
      SET status = 'Rejected', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND owner_id = ? AND status = 'Pending'
    `);
    const res = stmt.run(bookingId, ownerId);
    return res.changes > 0;
  },

  /**
   * Renter cancels booking prior to start date (EC-4.3, EC-4.4)
   */
  cancel(bookingId, renterId) {
    const db = getDb();
    const today = AvailabilityService.getTodayString();

    // Check booking existence and ownership
    const booking = db.prepare('SELECT id, renter_id, status, start_date FROM bookings WHERE id = ?').get(bookingId);
    if (!booking) {
      const err = new Error('Booking not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (booking.renter_id !== renterId) {
      const err = new Error('You are not authorized to cancel this booking');
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (booking.status !== 'Pending' && booking.status !== 'Confirmed') {
      const err = new Error(`Cannot cancel a booking with status '${booking.status}'`);
      err.code = 'INVALID_STATUS';
      throw err;
    }

    // EC-4.3: Late cancellation guard (cannot cancel on or after start date)
    if (booking.start_date <= today) {
      const err = new Error('Bookings can only be cancelled before the scheduled start date.');
      err.code = 'CANCELLATION_WINDOW_CLOSED';
      throw err;
    }

    const stmt = db.prepare(`
      UPDATE bookings
      SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND renter_id = ? AND status IN ('Pending', 'Confirmed') AND start_date > ?
    `);
    const res = stmt.run(bookingId, renterId, today);
    return res.changes > 0;
  }
};

module.exports = BookingModel;
