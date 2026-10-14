const { getDb } = require('./db');

function initDatabase() {
  const db = getDb();

  db.exec(`
    -- 1. Users Table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT NOT NULL,
      city TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

    -- 2. Listings Table
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      price_per_day REAL NOT NULL CHECK(price_per_day > 0),
      city TEXT NOT NULL,
      images TEXT, -- JSON array of image URLs
      rental_terms TEXT,
      is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(owner_id);
    CREATE INDEX IF NOT EXISTS idx_listings_active_cat ON listings(is_active, category);
    CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city);

    -- 3. Bookings Table
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      renter_id INTEGER NOT NULL,
      owner_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days_count INTEGER NOT NULL,
      price_per_day REAL NOT NULL,
      total_price REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Confirmed', 'Rejected', 'Cancelled', 'Completed')),
      terms_accepted INTEGER NOT NULL CHECK(terms_accepted = 1),
      renter_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
      FOREIGN KEY (renter_id) REFERENCES users(id),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_listing_status ON bookings(listing_id, status);
    CREATE INDEX IF NOT EXISTS idx_bookings_renter ON bookings(renter_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_owner ON bookings(owner_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(start_date, end_date);

    -- 4. Blocked Dates Table (Owner manual blackout dates)
    CREATE TABLE IF NOT EXISTS blocked_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_blocked_dates_listing ON blocked_dates(listing_id, start_date, end_date);
  `);

  console.log('✅ SQLite database schema initialized successfully.');
}

if (require.main === module) {
  initDatabase();
}

module.exports = { initDatabase };
