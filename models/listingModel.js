const { getDb } = require('../database/db');

// Helper to escape SQL LIKE wildcard characters (EC-2.6)
function escapeLikeString(str) {
  return str.replace(/[%_\\]/g, '\\$&');
}

const ListingModel = {
  /**
   * Create a new listing
   */
  create({ owner_id, title, description, category, price_per_day, city, images, rental_terms }) {
    const db = getDb();
    const imgsJson = Array.isArray(images) ? JSON.stringify(images) : (images || '[]');

    const stmt = db.prepare(`
      INSERT INTO listings (owner_id, title, description, category, price_per_day, city, images, rental_terms, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const result = stmt.run(
      owner_id,
      title.trim(),
      description.trim(),
      category.trim(),
      price_per_day,
      city.trim(),
      imgsJson,
      rental_terms ? rental_terms.trim() : ''
    );

    return this.findById(Number(result.lastInsertRowid));
  },

  /**
   * Find listing by ID with owner information
   */
  findById(id) {
    if (!id) return null;
    const db = getDb();

    const stmt = db.prepare(`
      SELECT 
        l.id, l.owner_id, l.title, l.description, l.category, 
        l.price_per_day, l.city, l.images, l.rental_terms, l.is_active, 
        l.created_at, l.updated_at,
        u.name as owner_name, u.phone as owner_phone, u.city as owner_city
      FROM listings l
      JOIN users u ON l.owner_id = u.id
      WHERE l.id = ?
    `);

    const row = stmt.get(id);
    if (!row) return null;

    // Parse images array safely
    let parsedImages = [];
    try {
      parsedImages = JSON.parse(row.images || '[]');
      if (!Array.isArray(parsedImages)) parsedImages = [row.images];
    } catch {
      parsedImages = row.images ? [row.images] : [];
    }

    return {
      ...row,
      images: parsedImages
    };
  },

  /**
   * Update listing details
   */
  update(id, { title, description, category, price_per_day, city, images, rental_terms }) {
    const db = getDb();
    const imgsJson = Array.isArray(images) ? JSON.stringify(images) : (images || '[]');

    const stmt = db.prepare(`
      UPDATE listings
      SET title = ?, description = ?, category = ?, price_per_day = ?, 
          city = ?, images = ?, rental_terms = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      title.trim(),
      description.trim(),
      category.trim(),
      price_per_day,
      city.trim(),
      imgsJson,
      rental_terms ? rental_terms.trim() : '',
      id
    );

    return this.findById(id);
  },

  /**
   * Toggle active/inactive status
   */
  toggleActive(id, isActive) {
    const db = getDb();
    const statusVal = isActive ? 1 : 0;
    const stmt = db.prepare(`
      UPDATE listings 
      SET is_active = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    stmt.run(statusVal, id);
    return this.findById(id);
  },

  /**
   * Check if listing has upcoming or active bookings (EC-2.1)
   */
  hasUpcomingBookings(listingId) {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    const stmt = db.prepare(`
      SELECT COUNT(*) as count 
      FROM bookings
      WHERE listing_id = ?
        AND status IN ('Pending', 'Confirmed')
        AND end_date >= ?
    `);

    const res = stmt.get(listingId, today);
    return res && res.count > 0;
  },

  /**
   * Delete a listing (preserves integrity)
   */
  delete(id) {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM listings WHERE id = ?');
    const res = stmt.run(id);
    return res.changes > 0;
  },

  /**
   * Browse active listings with keyword search and filters
   */
  findAll({ search, category, city, minPrice, maxPrice, sort = 'newest', page = 1, limit = 12 }) {
    const db = getDb();
    const conditions = ['l.is_active = 1'];
    const params = [];

    // Keyword search on title and description with escaped LIKE wildcards (EC-2.6)
    if (search && search.trim()) {
      const escaped = escapeLikeString(search.trim());
      conditions.push(`(l.title LIKE ? ESCAPE '\\' OR l.description LIKE ? ESCAPE '\\')`);
      params.push(`%${escaped}%`, `%${escaped}%`);
    }

    if (category && category.trim()) {
      conditions.push('l.category = ?');
      params.push(category.trim());
    }

    if (city && city.trim()) {
      conditions.push('l.city = ? COLLATE NOCASE');
      params.push(city.trim());
    }

    if (minPrice && Number(minPrice) > 0) {
      conditions.push('l.price_per_day >= ?');
      params.push(Number(minPrice));
    }

    if (maxPrice && Number(maxPrice) > 0) {
      conditions.push('l.price_per_day <= ?');
      params.push(Number(maxPrice));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Sorting
    let orderBy = 'l.created_at DESC';
    if (sort === 'price_asc') orderBy = 'l.price_per_day ASC';
    else if (sort === 'price_desc') orderBy = 'l.price_per_day DESC';
    else if (sort === 'newest') orderBy = 'l.created_at DESC';

    // Count total matches
    const countStmt = db.prepare(`
      SELECT COUNT(*) as total
      FROM listings l
      ${whereClause}
    `);
    const totalCount = countStmt.get(...params).total;

    // Pagination
    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
    const queryStmt = db.prepare(`
      SELECT 
        l.id, l.owner_id, l.title, l.description, l.category, 
        l.price_per_day, l.city, l.images, l.is_active, l.created_at,
        u.name as owner_name, u.city as owner_city
      FROM listings l
      JOIN users u ON l.owner_id = u.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `);

    const rows = queryStmt.all(...params, Number(limit), Number(offset));

    const listings = rows.map(r => {
      let imgs = [];
      try {
        imgs = JSON.parse(r.images || '[]');
        if (!Array.isArray(imgs)) imgs = [r.images];
      } catch {
        imgs = r.images ? [r.images] : [];
      }
      return { ...r, images: imgs };
    });

    return {
      total: totalCount,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(totalCount / limit) || 1,
      listings
    };
  },

  /**
   * Find all listings for a specific owner (dashboard)
   */
  findByOwner(ownerId) {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT 
        l.id, l.title, l.description, l.category, l.price_per_day, 
        l.city, l.images, l.is_active, l.created_at,
        (SELECT COUNT(*) FROM bookings b WHERE b.listing_id = l.id) as total_bookings,
        (SELECT COUNT(*) FROM bookings b WHERE b.listing_id = l.id AND b.status = 'Pending') as pending_bookings
      FROM listings l
      WHERE l.owner_id = ?
      ORDER BY l.created_at DESC
    `);

    const rows = stmt.all(ownerId);
    return rows.map(r => {
      let imgs = [];
      try {
        imgs = JSON.parse(r.images || '[]');
        if (!Array.isArray(imgs)) imgs = [r.images];
      } catch {
        imgs = r.images ? [r.images] : [];
      }
      return { ...r, images: imgs };
    });
  },

  /**
   * Get distinct categories and cities
   */
  getCategoriesAndCities() {
    const db = getDb();
    const categories = db.prepare('SELECT DISTINCT category FROM listings WHERE is_active = 1 ORDER BY category ASC').all().map(r => r.category);
    const cities = db.prepare('SELECT DISTINCT city FROM listings WHERE is_active = 1 ORDER BY city ASC').all().map(r => r.city);

    return { categories, cities };
  }
};

module.exports = ListingModel;
