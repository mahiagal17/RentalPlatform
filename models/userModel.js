const bcrypt = require('bcryptjs');
const { getDb } = require('../database/db');

const UserModel = {
  /**
   * Find user by email (case-insensitive)
   */
  findByEmail(email) {
    if (!email) return null;
    const db = getDb();
    const cleanEmail = email.trim().toLowerCase();
    const stmt = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE');
    return stmt.get(cleanEmail) || null;
  },

  /**
   * Find user by ID (excludes password)
   */
  findById(id) {
    if (!id) return null;
    const db = getDb();
    const stmt = db.prepare(`
      SELECT id, name, email, phone, city, created_at, updated_at
      FROM users
      WHERE id = ?
    `);
    return stmt.get(id) || null;
  },

  /**
   * Create a new user with hashed password
   */
  create({ name, email, phone, city, password }) {
    const db = getDb();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanName = name.trim();
    const cleanCity = city.trim();

    // Password hashing with 10 salt rounds
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    const stmt = db.prepare(`
      INSERT INTO users (name, email, phone, city, password)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(cleanName, cleanEmail, cleanPhone, cleanCity, hashedPassword);
    return {
      id: Number(result.lastInsertRowid),
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      city: cleanCity
    };
  },

  /**
   * Verify password
   */
  verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compareSync(plainPassword, hashedPassword);
  },

  /**
   * Update user profile (name, phone, city)
   */
  updateProfile(id, { name, phone, city }) {
    const db = getDb();
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanCity = city.trim();

    const stmt = db.prepare(`
      UPDATE users
      SET name = ?, phone = ?, city = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(cleanName, cleanPhone, cleanCity, id);
    return this.findById(id);
  }
};

module.exports = UserModel;
