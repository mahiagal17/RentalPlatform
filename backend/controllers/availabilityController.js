const AvailabilityService = require('../services/availabilityService');
const ListingModel = require('../models/listingModel');

const AvailabilityController = {
  /**
   * Get unavailable date ranges (booked + blocked) for calendar display
   * GET /api/listings/:id/availability
   */
  async getAvailability(req, res) {
    try {
      const listingId = Number(req.params.id);
      const listing = ListingModel.findById(listingId);
      if (!listing) {
        return res.status(404).json({
          success: false,
          code: 'LISTING_NOT_FOUND',
          message: 'Equipment listing not found.'
        });
      }

      const unavailableRanges = AvailabilityService.getUnavailableRanges(listingId);

      return res.json({
        success: true,
        listingId,
        unavailableRanges
      });
    } catch (err) {
      console.error('Get availability error:', err);
      return res.status(500).json({
        success: false,
        code: 'AVAILABILITY_FETCH_FAILED',
        message: 'Failed to retrieve availability.'
      });
    }
  },

  /**
   * Validate a specific date range and calculate total rental price
   * POST /api/listings/:id/check-availability
   */
  async checkAvailability(req, res) {
    try {
      const listingId = Number(req.params.id);
      const { startDate, endDate } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_DATES',
          message: 'Both start date and end date are required.'
        });
      }

      const check = AvailabilityService.checkAvailability(listingId, startDate, endDate);

      if (!check.valid) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_DATES',
          message: check.error
        });
      }

      if (!check.available) {
        return res.status(200).json({
          success: true,
          available: false,
          message: check.message,
          conflict: check.conflict
        });
      }

      return res.json({
        success: true,
        available: true,
        days: check.days,
        pricePerDay: check.pricePerDay,
        totalPrice: check.totalPrice,
        startDate: check.startDate,
        endDate: check.endDate
      });
    } catch (err) {
      console.error('Check availability error:', err);
      return res.status(500).json({
        success: false,
        code: 'CHECK_AVAILABILITY_FAILED',
        message: 'Failed to verify dates.'
      });
    }
  },

  /**
   * Owner blocks specific date range for maintenance/repair (EC-3.8)
   * POST /api/listings/:id/blocked-dates
   */
  async blockDates(req, res) {
    try {
      const listingId = Number(req.params.id);
      const ownerId = req.user.id;
      const { startDate, endDate, reason } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_DATES',
          message: 'Start date and end date are required.'
        });
      }

      const blocked = AvailabilityService.blockDates(listingId, ownerId, { startDate, endDate, reason });

      return res.status(201).json({
        success: true,
        message: 'Dates blocked successfully for maintenance.',
        blocked
      });
    } catch (err) {
      console.error('Block dates error:', err);
      if (err.code === 'CONFIRMED_BOOKING_EXISTS') {
        return res.status(400).json({
          success: false,
          code: err.code,
          message: err.message
        });
      }
      return res.status(400).json({
        success: false,
        code: 'BLOCK_DATES_FAILED',
        message: err.message || 'Failed to block dates.'
      });
    }
  },

  /**
   * Owner removes a blocked date range
   * DELETE /api/listings/:id/blocked-dates/:blockId
   */
  async unblockDates(req, res) {
    try {
      const listingId = Number(req.params.id);
      const blockId = Number(req.params.blockId);
      const ownerId = req.user.id;

      const success = AvailabilityService.unblockDates(listingId, ownerId, blockId);
      if (!success) {
        return res.status(404).json({
          success: false,
          code: 'BLOCK_NOT_FOUND',
          message: 'Blocked date record not found or not owned by you.'
        });
      }

      return res.json({
        success: true,
        message: 'Blocked dates removed successfully.'
      });
    } catch (err) {
      console.error('Unblock dates error:', err);
      return res.status(400).json({
        success: false,
        code: 'UNBLOCK_DATES_FAILED',
        message: err.message || 'Failed to unblock dates.'
      });
    }
  }
};

module.exports = AvailabilityController;
