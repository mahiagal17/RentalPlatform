const express = require('express');
const router = express.Router();
const BookingController = require('../controllers/bookingController');
const { authMiddleware } = require('../middleware/authMiddleware');

// All booking routes require authentication
router.use(authMiddleware);

// Renter endpoints
router.post('/', BookingController.createBooking);
router.get('/my-bookings', BookingController.getMyBookings);

// Owner requests endpoint
router.get('/requests', BookingController.getOwnerRequests);

// Single booking view
router.get('/:id', BookingController.getBookingById);

// Owner actions
router.patch('/:id/accept', BookingController.acceptBooking);
router.patch('/:id/reject', BookingController.rejectBooking);

// Renter action
router.patch('/:id/cancel', BookingController.cancelBooking);

module.exports = router;
