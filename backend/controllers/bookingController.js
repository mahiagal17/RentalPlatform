const BookingModel = require('../models/bookingModel');
const ListingModel = require('../models/listingModel');
const AvailabilityService = require('../services/availabilityService');

const BookingController = {
  /**
   * Submit a new booking reservation (Renter)
   * POST /api/bookings
   */
  async createBooking(req, res) {
    try {
      const renterId = req.user.id;
      const { listingId, startDate, endDate, termsAccepted, renterNotes } = req.body;

      if (!listingId || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_FIELDS',
          message: 'Listing ID, start date, and end date are required.'
        });
      }

      // EC-4.6: Mandatory rental terms acceptance
      if (termsAccepted !== true && termsAccepted !== 1 && termsAccepted !== 'true') {
        return res.status(400).json({
          success: false,
          code: 'TERMS_NOT_ACCEPTED',
          message: 'You must review and accept the equipment rental terms before proceeding.'
        });
      }

      // Fetch authoritative listing details
      const listing = ListingModel.findById(Number(listingId));
      if (!listing) {
        return res.status(404).json({
          success: false,
          code: 'LISTING_NOT_FOUND',
          message: 'The requested equipment listing was not found.'
        });
      }

      // EC-4.1: Self-booking prevention guard
      if (listing.owner_id === renterId) {
        return res.status(400).json({
          success: false,
          code: 'SELF_BOOKING_PROHIBITED',
          message: 'You cannot book your own equipment listing.'
        });
      }

      // EC-4.2: Inactive listing check
      if (listing.is_active !== 1) {
        return res.status(400).json({
          success: false,
          code: 'LISTING_INACTIVE',
          message: 'This equipment listing is currently inactive and cannot accept new bookings.'
        });
      }

      // Format & Date Ordering Validation (EC-3.2, EC-3.6)
      const today = AvailabilityService.getTodayString();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_DATE_FORMAT',
          message: 'Dates must be in valid YYYY-MM-DD format.'
        });
      }

      if (startDate < today) {
        return res.status(400).json({
          success: false,
          code: 'PAST_DATE_NOT_ALLOWED',
          message: 'Start date cannot be in the past.'
        });
      }

      if (startDate > endDate) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_DATE_RANGE',
          message: 'End date must be on or after the start date.'
        });
      }

      // Authoritative day count & price calculation on server (EC-3.1, EC-4.5)
      const daysCount = AvailabilityService.calculateInclusiveDays(startDate, endDate);
      const pricePerDay = listing.price_per_day;
      const totalPrice = daysCount * pricePerDay;

      // Attempt atomic booking creation (EC-3.5)
      const booking = BookingModel.create({
        listingId: Number(listingId),
        renterId,
        ownerId: listing.owner_id,
        startDate,
        endDate,
        daysCount,
        pricePerDay,
        totalPrice,
        termsAccepted: true,
        renterNotes
      });

      return res.status(201).json({
        success: true,
        message: 'Booking request submitted successfully! Awaiting owner confirmation.',
        booking
      });
    } catch (err) {
      console.error('Create booking error:', err);
      if (err.code === 'COLLISION') {
        return res.status(409).json({
          success: false,
          code: 'DATE_COLLISION',
          message: err.message
        });
      }
      return res.status(500).json({
        success: false,
        code: 'CREATE_BOOKING_FAILED',
        message: err.message || 'Failed to submit booking request.'
      });
    }
  },

  /**
   * Get all bookings submitted by the authenticated renter
   * GET /api/bookings/my-bookings
   */
  async getMyBookings(req, res) {
    try {
      const renterId = req.user.id;
      const bookings = BookingModel.findByRenter(renterId);

      return res.json({
        success: true,
        count: bookings.length,
        bookings
      });
    } catch (err) {
      console.error('Get my bookings error:', err);
      return res.status(500).json({
        success: false,
        code: 'FETCH_BOOKINGS_FAILED',
        message: 'Failed to retrieve your bookings.'
      });
    }
  },

  /**
   * Get all incoming booking requests for the authenticated owner
   * GET /api/bookings/requests
   */
  async getOwnerRequests(req, res) {
    try {
      const ownerId = req.user.id;
      const requests = BookingModel.findByOwner(ownerId);

      return res.json({
        success: true,
        count: requests.length,
        requests
      });
    } catch (err) {
      console.error('Get owner requests error:', err);
      return res.status(500).json({
        success: false,
        code: 'FETCH_REQUESTS_FAILED',
        message: 'Failed to retrieve booking requests.'
      });
    }
  },

  /**
   * Get single booking details
   * GET /api/bookings/:id
   */
  async getBookingById(req, res) {
    try {
      const bookingId = Number(req.params.id);
      const booking = BookingModel.findById(bookingId);

      if (!booking) {
        return res.status(404).json({
          success: false,
          code: 'BOOKING_NOT_FOUND',
          message: 'Booking not found.'
        });
      }

      // Security check: only renter or owner can view
      if (booking.renter_id !== req.user.id && booking.owner_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'You are not authorized to view this booking.'
        });
      }

      return res.json({
        success: true,
        booking
      });
    } catch (err) {
      console.error('Get booking error:', err);
      return res.status(500).json({
        success: false,
        code: 'GET_BOOKING_FAILED',
        message: 'Failed to retrieve booking.'
      });
    }
  },

  /**
   * Owner accepts pending booking request (EC-4.4)
   * PATCH /api/bookings/:id/accept
   */
  async acceptBooking(req, res) {
    try {
      const bookingId = Number(req.params.id);
      const ownerId = req.user.id;

      const success = BookingModel.accept(bookingId, ownerId);
      if (!success) {
        return res.status(400).json({
          success: false,
          code: 'CANNOT_ACCEPT',
          message: 'Booking cannot be accepted. It might already be processed, cancelled, or not owned by you.'
        });
      }

      const updated = BookingModel.findById(bookingId);
      return res.json({
        success: true,
        message: 'Booking request confirmed successfully! Equipment dates are now officially reserved.',
        booking: updated
      });
    } catch (err) {
      console.error('Accept booking error:', err);
      return res.status(500).json({
        success: false,
        code: 'ACCEPT_FAILED',
        message: 'Failed to accept booking.'
      });
    }
  },

  /**
   * Owner rejects pending booking request (EC-4.4)
   * PATCH /api/bookings/:id/reject
   */
  async rejectBooking(req, res) {
    try {
      const bookingId = Number(req.params.id);
      const ownerId = req.user.id;

      const success = BookingModel.reject(bookingId, ownerId);
      if (!success) {
        return res.status(400).json({
          success: false,
          code: 'CANNOT_REJECT',
          message: 'Booking cannot be rejected. It might already be processed, cancelled, or not owned by you.'
        });
      }

      const updated = BookingModel.findById(bookingId);
      return res.json({
        success: true,
        message: 'Booking request rejected. The calendar dates have been freed.',
        booking: updated
      });
    } catch (err) {
      console.error('Reject booking error:', err);
      return res.status(500).json({
        success: false,
        code: 'REJECT_FAILED',
        message: 'Failed to reject booking.'
      });
    }
  },

  /**
   * Renter cancels booking before start date (EC-4.3, EC-4.4)
   * PATCH /api/bookings/:id/cancel
   */
  async cancelBooking(req, res) {
    try {
      const bookingId = Number(req.params.id);
      const renterId = req.user.id;

      const success = BookingModel.cancel(bookingId, renterId);
      if (!success) {
        return res.status(400).json({
          success: false,
          code: 'CANNOT_CANCEL',
          message: 'Booking could not be cancelled.'
        });
      }

      const updated = BookingModel.findById(bookingId);
      return res.json({
        success: true,
        message: 'Booking cancelled successfully. Equipment dates are now available for other creators.',
        booking: updated
      });
    } catch (err) {
      console.error('Cancel booking error:', err);
      if (err.code === 'CANCELLATION_WINDOW_CLOSED') {
        return res.status(400).json({
          success: false,
          code: err.code,
          message: err.message
        });
      }
      if (err.code === 'FORBIDDEN') {
        return res.status(403).json({
          success: false,
          code: err.code,
          message: err.message
        });
      }
      return res.status(400).json({
        success: false,
        code: err.code || 'CANCEL_FAILED',
        message: err.message || 'Failed to cancel booking.'
      });
    }
  }
};

module.exports = BookingController;
