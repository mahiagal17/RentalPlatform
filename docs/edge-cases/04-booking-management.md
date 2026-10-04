# Edge Cases: Module 4 - Booking Management

## 1. Overview
The **Booking Management** module controls financial calculations, authorization guards, state machine transitions, and dashboard interactions. This document specifies edge cases related to lifecycle events, unauthorized state changes, pricing drift, and terms validation.

---

## 2. Edge Cases Specification

### EC-4.1: Self-Booking (Owner Attempting to Rent Their Own Gear)
- **Scenario:**
  - An owner navigates to their own listing and submits a booking request (either via UI or direct API call).
- **Potential Impact:**
  - Artificial inflation of booking numbers, locking inventory against real renters, or confusion in dashboards.
- **Expected Behavior:**
  - Forbidden. The API rejects the request with `400 Bad Request`.
  - The UI on `listing-detail.html` replaces the "Request to Book" button with an "Edit Your Listing" button or disables the form with a badge *"This is your listing"*.
- **Mitigation Strategy:**
  ```javascript
  if (listing.owner_id === req.user.id) {
    return res.status(400).json({
      success: false,
      code: 'SELF_BOOKING_PROHIBITED',
      message: 'You cannot book your own equipment listing.'
    });
  }
  ```
- **Verification Step:**
  - Log in as the owner of Listing 1. Attempt `POST /api/bookings` with `listingId: 1`. Verify HTTP 400 rejection.

---

### EC-4.2: Booking an Inactive Listing
- **Scenario:**
  - An owner deactivates a listing (`is_active = 0`) while a renter has the page open and clicks "Request to Book".
- **Potential Impact:**
  - Creating reservations for equipment that the owner intentionally took offline.
- **Expected Behavior:**
  - The backend verifies active status before creating the booking record and returns an informative error.
- **Mitigation Strategy:**
  ```javascript
  if (listing.is_active !== 1) {
    return res.status(400).json({
      success: false,
      code: 'LISTING_INACTIVE',
      message: 'This listing is currently inactive and cannot accept new bookings.'
    });
  }
  ```
- **Verification Step:**
  - Toggle listing to inactive. Submit booking request from another account. Verify rejection.

---

### EC-4.3: Late Cancellation (Attempting to Cancel on or After Start Date)
- **Scenario:**
  - A renter attempts to cancel a booking on the day of pickup or midway through the rental period (`start_date <= today`).
- **Potential Impact:**
  - Financial loss and schedule disruption for the owner who already reserved the equipment.
- **Expected Behavior:**
  - As stated in SRS: *"The renter can cancel a booking before the start date."*
  - Cancellation is rejected on or after the start date.
- **Mitigation Strategy:**
  ```javascript
  const today = new Date().toISOString().split('T')[0];
  if (booking.start_date <= today) {
    return res.status(400).json({
      success: false,
      code: 'CANCELLATION_WINDOW_CLOSED',
      message: 'Bookings can only be cancelled before the scheduled start date.'
    });
  }
  ```
  - On frontend `my-bookings.html`, the "Cancel Booking" button is only displayed or enabled if `booking.start_date > today`.
- **Verification Step:**
  - Create a booking starting today. Attempt `PATCH /api/bookings/:id/cancel`. Verify rejection with HTTP 400.

---

### EC-4.4: Duplicate / Out-of-Sequence State Transitions (Double Action)
- **Scenario:**
  - An owner rapidly clicks "Accept" twice, or tries to "Accept" a booking that was already "Rejected" or "Cancelled".
- **Potential Impact:**
  - Corrupted booking state or conflicting notifications.
- **Expected Behavior:**
  - Only `Pending` bookings can be Accepted or Rejected.
  - Only `Pending` or `Confirmed` bookings can be Cancelled.
  - Enforce atomic state transitions in SQL.
- **Mitigation Strategy:**
  ```javascript
  // controllers/bookingController.js (Accept Booking)
  const stmt = db.prepare(`
    UPDATE bookings 
    SET status = 'Confirmed', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND owner_id = ? AND status = 'Pending'
  `);
  const result = stmt.run(bookingId, req.user.id);
  if (result.changes === 0) {
    return res.status(400).json({
      success: false,
      message: 'Booking cannot be accepted because it is no longer pending.'
    });
  }
  ```
- **Verification Step:**
  - Reject a booking. Send `PATCH /api/bookings/:id/accept`. Verify rejection.

---

### EC-4.5: Price Drift Between Browsing and Booking Submission
- **Scenario:**
  - Owner changes daily rental rate from ₹2,000 to ₹3,500 while renter has the listing page open.
  - Renter submits form expecting old total.
  - Or, a malicious client sends tampered `total_price: 1` in the JSON payload.
- **Potential Impact:**
  - Financial discrepancy, renter underpaying or overpaying.
- **Expected Behavior:**
  - The server NEVER trusts client-submitted `total_price`.
  - The server always reads the latest `price_per_day` directly from the database and recalculates `total_price` dynamically.
- **Mitigation Strategy:**
  ```javascript
  // Calculate authoritatively on the backend
  const days = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  const authoritativeTotalPrice = days * listing.price_per_day;
  ```
- **Verification Step:**
  - Send POST request with `total_price: 10`. Verify the database record stores the correct calculated amount (`days * listing.price_per_day`).

---

### EC-4.6: Bypassing Rental Terms Acceptance Checkbox
- **Scenario:**
  - Client sends `termsAccepted: false` or omits the parameter via raw API request.
- **Potential Impact:**
  - Legal compliance failure (renter rented gear without acknowledging terms).
- **Expected Behavior:**
  - Server validation requires `termsAccepted === true` and rejects otherwise.
- **Mitigation Strategy:**
  ```javascript
  if (!req.body.termsAccepted) {
    return res.status(400).json({
      success: false,
      code: 'TERMS_NOT_ACCEPTED',
      message: 'You must accept the rental terms before submitting a booking request.'
    });
  }
  ```
- **Verification Step:**
  - Send booking payload with `termsAccepted: false`. Verify rejection with HTTP 400.

---

### EC-4.7: Automatic Progression to 'Completed' Status
- **Scenario:**
  - A confirmed booking concludes (`end_date < today`). Without an automated update, it remains `Confirmed` indefinitely.
- **Potential Impact:**
  - Cluttered active dashboards for both renter and owner; misleading metrics.
- **Expected Behavior:**
  - Status automatically reflects as `Completed` once the rental end date has passed.
- **Mitigation Strategy:**
  - When fetching bookings for dashboards, execute an automatic progression query:
    ```sql
    UPDATE bookings 
    SET status = 'Completed', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'Confirmed' AND end_date < DATE('now');
    ```
- **Verification Step:**
  - Simulate a confirmed booking with an end date in the past. Fetch "My Bookings" and verify its status is displayed as `Completed`.

---

## 3. Summary Matrix

| ID | Edge Case | Severity | Handling Layer | Status Code |
|---|---|---|---|---|
| EC-4.1 | Self-Booking Attempt | High | Controller Guard (`owner_id === renter_id`) | `400 Bad Request` |
| EC-4.2 | Booking Inactive Item | Medium | Listing Status Check | `400 Bad Request` |
| EC-4.3 | Late Cancellation (`start_date <= today`) | High | Date Check Guard | `400 Bad Request` |
| EC-4.4 | Duplicate State Transitions | Critical | Atomic SQL `WHERE status = 'Pending'` | `400 Bad Request` |
| EC-4.5 | Price Tampering / Drift | Critical | Server-Side Recalculation | Authoritative Price Saved |
| EC-4.6 | Missing Terms Acceptance | High | Validation Middleware | `400 Bad Request` |
| EC-4.7 | Completion of Concluded Bookings | Low | Lazy / Query-Time Auto Progression | `200 OK` (Completed) |
