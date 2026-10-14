const express = require('express');
const router = express.Router({ mergeParams: true });
const AvailabilityController = require('../controllers/availabilityController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Public availability check and calendar view
router.get('/:id/availability', AvailabilityController.getAvailability);
router.post('/:id/check-availability', AvailabilityController.checkAvailability);

// Protected owner blackout/maintenance dates
router.post('/:id/blocked-dates', authMiddleware, AvailabilityController.blockDates);
router.delete('/:id/blocked-dates/:blockId', authMiddleware, AvailabilityController.unblockDates);

module.exports = router;
