const express = require('express');
const router = express.Router();
const ListingController = require('../controllers/listingController');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/authMiddleware');

// Public metadata and browse endpoints
router.get('/meta/categories-and-cities', ListingController.getMeta);
router.get('/', ListingController.getAllListings);

// Protected owner dashboard listings
router.get('/owner/mine', authMiddleware, ListingController.getMyListings);

// Single listing details (optional auth so we know if viewer is owner)
router.get('/:id', optionalAuthMiddleware, ListingController.getListingById);

// Protected CRUD
router.post('/', authMiddleware, ListingController.createListing);
router.put('/:id', authMiddleware, ListingController.updateListing);
router.patch('/:id/status', authMiddleware, ListingController.toggleStatus);
router.delete('/:id', authMiddleware, ListingController.deleteListing);

module.exports = router;
