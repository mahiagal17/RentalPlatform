# Edge Cases: Module 2 - Listings & Search

## 1. Overview
This document specifies the critical edge cases, boundary conditions, data integrity protections, and search resilience strategies for **Module 2 (Listings & Search)**.

---

## 2. Edge Cases Specification

### EC-2.1: Deletion Attempt with Active or Upcoming Bookings
- **Scenario:**
  - An owner attempts to delete a listing that currently has bookings in `Pending` or `Confirmed` status whose rental period has not yet concluded (`end_date >= DATE('now')`).
- **Potential Impact:**
  - Renters lose access to their upcoming reservation details, creating disputes, broken foreign keys, or missing equipment pickup records.
- **Expected Behavior:**
  - The server strictly rejects the deletion request with `400 Bad Request`.
  - Explains why deletion was blocked and recommends deactivating the listing instead (`is_active = 0`).
- **Mitigation Strategy:**
  ```javascript
  const upcomingBookings = db.prepare(`
    SELECT COUNT(*) as count FROM bookings
    WHERE listing_id = ?
      AND status IN ('Pending', 'Confirmed')
      AND end_date >= DATE('now')
  `).get(listingId);

  if (upcomingBookings.count > 0) {
    return res.status(400).json({
      success: false,
      code: 'LISTING_HAS_ACTIVE_BOOKINGS',
      message: 'Cannot delete this listing because it has active or upcoming bookings. You can deactivate the listing to hide it from search instead.'
    });
  }
  ```
- **Verification Step:**
  - Create a booking for Listing A with dates next week. Log in as owner, attempt `DELETE /api/listings/A`. Verify rejection with HTTP 400 and appropriate message.

---

### EC-2.2: Deletion with Historical / Completed Bookings (Audit Preservation)
- **Scenario:**
  - An owner deletes a listing that has past, completed, or cancelled bookings.
- **Potential Impact:**
  - Renter's "My Bookings" page encounters foreign key nulls or database query errors (`SELECT ... JOIN listings`).
- **Expected Behavior:**
  - Historical records for renters must remain intact and viewable even after an item is deleted.
- **Mitigation Strategy:**
  - Implement soft deletion (`deleted_at DATETIME` column or `is_deleted = 1`), OR
  - Ensure booking queries use `LEFT JOIN listings` with fallback values (`listing_title: listing.title || '[Deleted Equipment]'`).
- **Verification Step:**
  - Delete an item with past completed bookings. Navigate to renter's "My Bookings" page. Verify the booking history renders smoothly without crashing.

---

### EC-2.3: Price Manipulation, Negative Values, and Precision Exploits
- **Scenario:**
  - A user submits a listing with `price_per_day: -500`, `price_per_day: 0`, `price_per_day: 0.00001`, `NaN`, or `1e15`.
- **Potential Impact:**
  - Negative rental totals (renter gets paid), division by zero, database overflow, or pricing disputes.
- **Expected Behavior:**
  - Enforce strict validation: price must be a finite, positive number between reasonable minimum and maximum bounds (e.g. ₹50 to ₹500,000 per day), rounded to 2 decimal places or whole rupees.
- **Mitigation Strategy:**
  1. SQLite constraint: `CHECK(price_per_day >= 50 AND price_per_day <= 500000)`
  2. Server validation:
     ```javascript
     const price = Number(req.body.price_per_day);
     if (!Number.isFinite(price) || price < 50 || price > 500000) {
       return res.status(400).json({ error: "Price per day must be between ₹50 and ₹5,00,000." });
     }
     ```
- **Verification Step:**
  - Submit listings with prices `-10`, `0`, `999999999`, and `abc`. Confirm each is rejected with HTTP 400.

---

### EC-2.4: Unauthorized Modification or Deletion (IDOR Protection)
- **Scenario:**
  - Authenticated User A tries to edit or delete User B's listing by sending `PUT /api/listings/99` or `DELETE /api/listings/99`.
- **Potential Impact:**
  - Malicious tampering or unauthorized removal of other users' gear.
- **Expected Behavior:**
  - Strict ownership check returns `403 Forbidden` if `listing.owner_id !== req.user.id`.
- **Mitigation Strategy:**
  ```javascript
  const listing = db.prepare('SELECT owner_id FROM listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'You are not authorized to modify or delete this listing.' });
  }
  ```
- **Verification Step:**
  - Obtain token for User 1. Issue `PUT /api/listings/2` (owned by User 2). Verify HTTP 403 response.

---

### EC-2.5: Direct URL Access to Inactive Listings (`is_active = 0`)
- **Scenario:**
  - An owner sets their listing to inactive (`is_active = 0`). A renter who bookmarked the link or received it directly visits `/listings/:id`.
- **Potential Impact:**
  - Renter sees an active booking form and attempts to book an item the owner took down.
- **Expected Behavior:**
  - If the visitor is the owner: show full page with a prominent banner: *"This listing is currently Inactive and hidden from search."*
  - If the visitor is another user or guest: display *"This listing is currently unavailable for rent"*, and disable the booking calendar and form.
- **Mitigation Strategy:**
  ```javascript
  // controllers/listingController.js
  if (listing.is_active === 0) {
    const isOwner = req.user && req.user.id === listing.owner_id;
    if (!isOwner) {
      listing.booking_disabled = true;
      listing.status_message = "This equipment is currently inactive and not accepting booking requests.";
    }
  }
  ```
- **Verification Step:**
  - Set listing to inactive. Open as guest; verify booking form is disabled and notice is displayed.

---

### EC-2.6: Search Edge Cases (SQL Wildcards, Special Characters, Zero Matches)
- **Scenario:**
  - User enters `%`, `_`, `'`, `\`, `<script>`, or words with no matches into the search bar.
- **Potential Impact:**
  - SQL injection, unescaped SQL `LIKE` wildcards returning all records, XSS injection, or awkward empty pages.
- **Expected Behavior:**
  - Wildcard characters are escaped so `%` searches for literal percent signs.
  - XSS characters are sanitized.
  - Zero results display a polished empty state with suggested actions ("Clear filters" button).
- **Mitigation Strategy:**
  ```javascript
  // Sanitize search query for SQLite LIKE
  function escapeLikeString(str) {
    return str.replace(/[%_\\]/g, '\\$&');
  }
  const safeQuery = `%${escapeLikeString(keyword)}%`;
  const stmt = db.prepare(`
    SELECT * FROM listings 
    WHERE is_active = 1 
      AND (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')
  `);
  ```
- **Verification Step:**
  - Search for `%` and `_`. Verify query does not dump the entire database and handles special characters safely.

---

### EC-2.7: Broken Image Links & Excess Image Payloads
- **Scenario:**
  - Owner provides broken external image URLs, 50 large images, or invalid file formats.
- **Potential Impact:**
  - Broken UI icons (`[x]`), slow page rendering, layout distortion.
- **Expected Behavior:**
  - Enforce a maximum of 5 images per listing.
  - Frontend includes automatic image error fallback (`onerror="this.src='/images/placeholder-camera.jpg'"`).
- **Mitigation Strategy:**
  - Array length validation: `if (images.length > 5) return res.status(400).json({ error: "Maximum 5 images allowed per listing." });`
  - Fallback avatar/gear SVG placeholder.
- **Verification Step:**
  - Provide an invalid image URL `http://example.com/notfound.jpg`. Confirm the UI gracefully falls back to the default equipment placeholder.

---

## 3. Summary Matrix

| ID | Edge Case | Severity | Handling Layer | Status Code |
|---|---|---|---|---|
| EC-2.1 | Deletion with Active Bookings | Critical | Controller Guard + DB Check | `400 Bad Request` |
| EC-2.2 | Deletion with Past History | High | Soft Delete / Left Join Fallback | `200 OK` (Historical preserved) |
| EC-2.3 | Negative / Zero / NaN Price | High | Schema Constraint + Validator | `400 Bad Request` |
| EC-2.4 | Unauthorized Edit / Delete | Critical | Ownership Verification | `403 Forbidden` |
| EC-2.5 | Direct Access to Inactive Item | Medium | Detail View Authorization Guard | `200 OK` (Booking Disabled) |
| EC-2.6 | Wildcards / Special Chars in Search | Medium | SQL LIKE Escaping & XSS Sanitizer | `200 OK` (Safe Empty/Filtered) |
| EC-2.7 | Broken / Excess Images | Low | Limit Validator + Image Fallback | `400 Bad Request` / Fallback UI |
