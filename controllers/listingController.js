const ListingModel = require('../models/listingModel');

const ListingController = {
  /**
   * Browse active listings with search & filtering
   * GET /api/listings
   */
  async getAllListings(req, res) {
    try {
      const { q, category, city, minPrice, maxPrice, sort, page, limit } = req.query;

      const result = ListingModel.findAll({
        search: q,
        category,
        city,
        minPrice,
        maxPrice,
        sort,
        page,
        limit
      });

      return res.json({
        success: true,
        ...result
      });
    } catch (err) {
      console.error('Fetch listings error:', err);
      return res.status(500).json({
        success: false,
        code: 'FETCH_LISTINGS_FAILED',
        message: 'Failed to retrieve listings.'
      });
    }
  },

  /**
   * Get single listing details
   * GET /api/listings/:id
   */
  async getListingById(req, res) {
    try {
      const { id } = req.params;
      const listing = ListingModel.findById(Number(id));

      if (!listing) {
        return res.status(404).json({
          success: false,
          code: 'LISTING_NOT_FOUND',
          message: 'Equipment listing not found.'
        });
      }

      // EC-2.5: Inactive listing handling
      const currentUserId = req.user ? req.user.id : null;
      const isOwner = currentUserId === listing.owner_id;

      if (listing.is_active === 0) {
        if (!isOwner) {
          listing.booking_disabled = true;
          listing.status_message = 'This equipment is currently inactive and not accepting booking requests.';
        } else {
          listing.status_message = 'Notice: This listing is currently Inactive and hidden from the public browse catalog.';
        }
      }

      return res.json({
        success: true,
        isOwner,
        listing
      });
    } catch (err) {
      console.error('Get listing error:', err);
      return res.status(500).json({
        success: false,
        code: 'GET_LISTING_FAILED',
        message: 'Failed to retrieve equipment details.'
      });
    }
  },

  /**
   * Create a new listing
   * POST /api/listings
   */
  async createListing(req, res) {
    try {
      const { title, description, category, price_per_day, city, images, rental_terms } = req.body;
      const owner_id = req.user.id;

      // 1. Required fields validation
      if (!title || !description || !category || price_per_day === undefined || !city) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_FIELDS',
          message: 'Title, description, category, price per day, and city are required.'
        });
      }

      // 2. EC-2.3: Price validation (min ₹50, max ₹500,000, finite number)
      const price = Number(price_per_day);
      if (!Number.isFinite(price) || price < 50 || price > 500000) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_PRICE',
          message: 'Daily rental price must be a valid amount between ₹50 and ₹5,00,000.'
        });
      }

      // 3. Title length validation
      if (title.trim().length < 3 || title.trim().length > 120) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_TITLE_LENGTH',
          message: 'Title must be between 3 and 120 characters long.'
        });
      }

      // 4. EC-2.7: Images formatting and limit (max 5)
      let parsedImages = [];
      if (Array.isArray(images)) {
        parsedImages = images.filter(url => typeof url === 'string' && url.trim().length > 0).slice(0, 5);
      } else if (typeof images === 'string' && images.trim()) {
        try {
          const parsed = JSON.parse(images);
          parsedImages = Array.isArray(parsed) ? parsed.slice(0, 5) : [images.trim()];
        } catch {
          parsedImages = [images.trim()];
        }
      }

      const listing = ListingModel.create({
        owner_id,
        title,
        description,
        category,
        price_per_day: price,
        city,
        images: parsedImages,
        rental_terms
      });

      return res.status(201).json({
        success: true,
        message: 'Listing published successfully!',
        listing
      });
    } catch (err) {
      console.error('Create listing error:', err);
      return res.status(500).json({
        success: false,
        code: 'CREATE_LISTING_FAILED',
        message: 'Failed to publish listing.'
      });
    }
  },

  /**
   * Update existing listing
   * PUT /api/listings/:id
   */
  async updateListing(req, res) {
    try {
      const { id } = req.params;
      const { title, description, category, price_per_day, city, images, rental_terms } = req.body;
      const currentUserId = req.user.id;

      const listing = ListingModel.findById(Number(id));
      if (!listing) {
        return res.status(404).json({
          success: false,
          code: 'LISTING_NOT_FOUND',
          message: 'Listing not found.'
        });
      }

      // EC-2.4: IDOR Protection (Only owner can update)
      if (listing.owner_id !== currentUserId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'You are not authorized to update this listing.'
        });
      }

      // Price validation
      const price = Number(price_per_day);
      if (!Number.isFinite(price) || price < 50 || price > 500000) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_PRICE',
          message: 'Daily rental price must be between ₹50 and ₹5,00,000.'
        });
      }

      let parsedImages = [];
      if (Array.isArray(images)) {
        parsedImages = images.slice(0, 5);
      } else if (typeof images === 'string') {
        try {
          const parsed = JSON.parse(images);
          parsedImages = Array.isArray(parsed) ? parsed.slice(0, 5) : [images];
        } catch {
          parsedImages = [images];
        }
      }

      const updated = ListingModel.update(Number(id), {
        title: title || listing.title,
        description: description || listing.description,
        category: category || listing.category,
        price_per_day: price,
        city: city || listing.city,
        images: parsedImages,
        rental_terms: rental_terms !== undefined ? rental_terms : listing.rental_terms
      });

      return res.json({
        success: true,
        message: 'Listing updated successfully!',
        listing: updated
      });
    } catch (err) {
      console.error('Update listing error:', err);
      return res.status(500).json({
        success: false,
        code: 'UPDATE_LISTING_FAILED',
        message: 'Failed to update listing.'
      });
    }
  },

  /**
   * Toggle Active / Inactive status
   * PATCH /api/listings/:id/status
   */
  async toggleStatus(req, res) {
    try {
      const { id } = req.params;
      const { is_active } = req.body;
      const currentUserId = req.user.id;

      const listing = ListingModel.findById(Number(id));
      if (!listing) {
        return res.status(404).json({
          success: false,
          code: 'LISTING_NOT_FOUND',
          message: 'Listing not found.'
        });
      }

      // EC-2.4: IDOR Protection
      if (listing.owner_id !== currentUserId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'You are not authorized to modify this listing.'
        });
      }

      const updated = ListingModel.toggleActive(Number(id), is_active);

      return res.json({
        success: true,
        message: `Listing is now ${updated.is_active ? 'Active' : 'Inactive'}.`,
        is_active: updated.is_active
      });
    } catch (err) {
      console.error('Toggle status error:', err);
      return res.status(500).json({
        success: false,
        code: 'TOGGLE_STATUS_FAILED',
        message: 'Failed to update listing status.'
      });
    }
  },

  /**
   * Delete a listing with upcoming booking safeguards
   * DELETE /api/listings/:id
   */
  async deleteListing(req, res) {
    try {
      const { id } = req.params;
      const currentUserId = req.user.id;

      const listing = ListingModel.findById(Number(id));
      if (!listing) {
        return res.status(404).json({
          success: false,
          code: 'LISTING_NOT_FOUND',
          message: 'Listing not found.'
        });
      }

      // EC-2.4: IDOR Protection
      if (listing.owner_id !== currentUserId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'You are not authorized to delete this listing.'
        });
      }

      // EC-2.1: Critical Safeguard - check upcoming bookings
      if (ListingModel.hasUpcomingBookings(Number(id))) {
        return res.status(400).json({
          success: false,
          code: 'HAS_UPCOMING_BOOKINGS',
          message: 'Cannot delete this listing because it has active or upcoming bookings. You can deactivate it instead to hide it from search.'
        });
      }

      ListingModel.delete(Number(id));

      return res.json({
        success: true,
        message: 'Listing deleted successfully.'
      });
    } catch (err) {
      console.error('Delete listing error:', err);
      return res.status(500).json({
        success: false,
        code: 'DELETE_LISTING_FAILED',
        message: 'Failed to delete listing.'
      });
    }
  },

  /**
   * Get all listings owned by authenticated user
   * GET /api/listings/owner/mine
   */
  async getMyListings(req, res) {
    try {
      const ownerId = req.user.id;
      const listings = ListingModel.findByOwner(ownerId);

      return res.json({
        success: true,
        count: listings.length,
        listings
      });
    } catch (err) {
      console.error('Get my listings error:', err);
      return res.status(500).json({
        success: false,
        code: 'GET_MY_LISTINGS_FAILED',
        message: 'Failed to retrieve your listings.'
      });
    }
  },

  /**
   * Get distinct categories and cities metadata for filter dropdowns
   * GET /api/listings/meta/categories-and-cities
   */
  async getMeta(req, res) {
    try {
      const meta = ListingModel.getCategoriesAndCities();
      return res.json({
        success: true,
        ...meta
      });
    } catch (err) {
      console.error('Get meta error:', err);
      return res.status(500).json({
        success: false,
        code: 'META_FETCH_FAILED',
        message: 'Failed to fetch categories and cities.'
      });
    }
  }
};

module.exports = ListingController;
