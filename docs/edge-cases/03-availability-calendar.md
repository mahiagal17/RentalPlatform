# Edge Cases: Module 3 - Availability Calendar

## 1. Overview
The **Availability Calendar** is the central mechanism preventing conflicting reservations and double-bookings. This document outlines edge cases involving dates, timezones, concurrent requests, range selections, and calendar re-releases.

---

## 2. Edge Cases Specification

### EC-3.1: Single-Day Rental (Start Date Equals End Date)
- **Scenario:**
  - Renter selects a single day (e.g., `start_date = '2026-10-15'` and `end_date = '2026-10-15'`).
- **Potential Impact:**
  - If day difference calculation uses `end - start` without inclusive addition, duration could calculate as `0` days, resulting in `total_price = 0`.
- **Expected Behavior:**
  - As defined in SRS, start and end dates are inclusive. Single-day rentals count as exactly 1 day.
  - The calendar must block that specific date so no other user can book it.
- **Mitigation Strategy:**
  1. Formula:
     $$\text{days} = \text{Math.round}((\text{parse}(end) - \text{parse}(start)) / 86400000) + 1$$
     For single day: $(0) + 1 = 1 \text{ day}$.
  2. Overlap query logic:
     $$\text{start\_date} \le \text{'2026-10-15'} \quad \text{AND} \quad \text{end\_date} \ge \text{'2026-10-15'}$$
     Matches the existing booking and blocks it.
- **Verification Step:**
  - Book gear for Oct 15 to Oct 15 at ₹2000/day. Verify calculated days = 1, total price = ₹2000, and Oct 15 is disabled for subsequent bookings.

---

### EC-3.2: Inverted Date Range Submission (End Date Prior to Start Date)
- **Scenario:**
  - Malicious client or buggy UI submits `start_date = '2026-10-20'` and `end_date = '2026-10-15'`.
- **Potential Impact:**
  - Negative day count, negative prices, or failure in overlap detection queries.
- **Expected Behavior:**
  - The API rejects the request with `400 Bad Request` before performing database checks.
- **Mitigation Strategy:**
  ```javascript
  if (startDate > endDate) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_DATE_RANGE',
      message: 'End date must be on or after the start date.'
    });
  }
  ```
- **Verification Step:**
  - Send POST request with start date Oct 20 and end date Oct 15. Verify HTTP 400 response.

---

### EC-3.3: Selection Bridging Across Unavailable Intervening Dates
- **Scenario:**
  - Listing has a confirmed booking from Oct 12 to Oct 14.
  - A renter attempts to book from Oct 10 to Oct 16.
- **Potential Impact:**
  - If the calendar only checks start and end endpoints, it could overlook that Oct 12–14 in the middle is already booked.
- **Expected Behavior:**
  - The system detects the intersection and rejects the booking. The calendar UI prevents selecting a range that spans across any disabled dates.
- **Mitigation Strategy:**
  - The standard overlap equation handles this natively:
    $$\text{existing\_start} \le \text{req\_end} \quad \text{AND} \quad \text{existing\_end} \ge \text{req\_start}$$
    Oct 12 $\le$ Oct 16 (True) AND Oct 14 $\ge$ Oct 10 (True) $\rightarrow$ Collision detected!
  - Frontend calendar validation checks every date between `startDate` and `endDate`; if any date has `.disabled` or `.booked`, the range is rejected before submission.
- **Verification Step:**
  - Have an existing booking for Oct 12–14. Attempt to book Oct 10–16. Verify rejection with `409 Conflict`.

---

### EC-3.4: Timezone Drift and Midnight Rollover (UTC vs Local Time)
- **Scenario:**
  - A user in India (UTC+5:30) selects a date at 11:30 PM.
  - If dates are converted using JavaScript's `new Date("2026-10-15").toISOString()`, it converts to `2026-10-14T18:30:00.000Z`, causing an off-by-one day error.
- **Potential Impact:**
  - Renter books for the wrong day; calendar highlights previous or next day.
- **Expected Behavior:**
  - All date operations (DB, API, frontend) use pure ISO-8601 calendar strings (`YYYY-MM-DD`) without UTC timezone transformations.
- **Mitigation Strategy:**
  1. Store dates as `TEXT` in SQLite: `'2026-10-15'`.
  2. Perform date arithmetic using string manipulation or split arrays:
     ```javascript
     function parseYMD(dateStr) {
       const [year, month, day] = dateStr.split('-').map(Number);
       return new Date(year, month - 1, day); // Local midnight
     }
     ```
- **Verification Step:**
  - Select dates around 11:45 PM. Ensure the saved dates in SQLite match the exact selected date string.

---

### EC-3.5: Concurrent Booking Requests (Race Condition)
- **Scenario:**
  - Two renters simultaneously submit booking requests for the same item on Oct 20–22.
  - Both requests pass the read check before either write finishes.
- **Potential Impact:**
  - Double booking created for the same dates.
- **Expected Behavior:**
  - Only one booking is accepted; the other is rejected with `409 Conflict`.
- **Mitigation Strategy:**
  - Wrap the overlap check and insertion inside an immediate SQLite transaction:
    ```javascript
    const bookTransaction = db.transaction((bookingData) => {
      const existing = db.prepare(`
        SELECT id FROM bookings
        WHERE listing_id = ?
          AND status IN ('Pending', 'Confirmed')
          AND start_date <= ? AND end_date >= ?
      `).get(bookingData.listingId, bookingData.endDate, bookingData.startDate);

      if (existing) {
        throw new Error('COLLISION');
      }

      return db.prepare(`
        INSERT INTO bookings (listing_id, renter_id, owner_id, start_date, end_date, total_price, status)
        VALUES (?, ?, ?, ?, ?, ?, 'Pending')
      `).run(...);
    });

    try {
      const result = bookTransaction(data);
      res.status(201).json({ success: true, bookingId: result.lastInsertRowid });
    } catch (err) {
      if (err.message === 'COLLISION') {
        return res.status(409).json({ success: false, message: 'These dates were just booked by another user.' });
      }
      throw err;
    }
    ```
- **Verification Step:**
  - Fire two parallel asynchronous requests with identical dates. Verify exactly one succeeds with 201 and one fails with 409.

---

### EC-3.6: Selection of Past Dates
- **Scenario:**
  - A user modifies client-side HTML or posts directly to `/api/bookings` with dates in the past (e.g. `2026-01-01`).
- **Potential Impact:**
  - Erroneous past records, skewed revenue reports.
- **Expected Behavior:**
  - Server and client validate `startDate >= todayFormattedString`.
- **Mitigation Strategy:**
  ```javascript
  const today = new Date().toISOString().split('T')[0];
  if (startDate < today) {
    return res.status(400).json({ error: "Cannot book dates in the past." });
  }
  ```
- **Verification Step:**
  - Send booking with yesterday's date. Confirm rejection with HTTP 400.

---

### EC-3.7: Date Re-release Synchronization upon Rejection or Cancellation
- **Scenario:**
  - A booking for Oct 25–28 is in `Pending` status.
  - The owner rejects it, or the renter cancels it.
- **Potential Impact:**
  - Dates remain erroneously locked if the query or cache doesn't filter by active statuses.
- **Expected Behavior:**
  - Dates become immediately free for new bookings as soon as the status transitions to `Rejected` or `Cancelled`.
- **Mitigation Strategy:**
  - Availability query strictly checks `status IN ('Pending', 'Confirmed')`.
  - Rejected/Cancelled bookings are immediately omitted from the unavailable list without requiring manual cache invalidation.
- **Verification Step:**
  - Reject a booking. Immediately query `/api/listings/:id/availability`. Verify the previously booked dates are absent from `unavailableRanges`.

---

### EC-3.8: Owner Date Blocking Overlapping with Existing Confirmed Bookings
- **Scenario:**
  - An owner attempts to block dates for maintenance on dates where a renter already has an accepted/confirmed booking.
- **Potential Impact:**
  - Conflict between confirmed customer reservation and owner's blocked schedule.
- **Expected Behavior:**
  - Owner date blocking request is rejected if it overlaps with any existing `Confirmed` booking.
- **Mitigation Strategy:**
  - When owner posts to `/api/listings/:id/blocked-dates`, verify that no `Confirmed` bookings intersect the proposed block period.
- **Verification Step:**
  - Confirm a booking for Oct 10–12. Attempt to block dates Oct 11–15 as owner. Verify rejection.

---

## 3. Summary Matrix

| ID | Edge Case | Severity | Handling Layer | Status Code |
|---|---|---|---|---|
| EC-3.1 | Single-Day Booking (`start == end`) | Medium | Math Formula + Overlap Query | `201 Created` (1-day charge) |
| EC-3.2 | Inverted Dates (`start > end`) | High | Input Validator | `400 Bad Request` |
| EC-3.3 | Bridging Unavailable Gap | Critical | Calendar UI + Overlap Logic | `409 Conflict` |
| EC-3.4 | Timezone / UTC Drift | High | Strict `YYYY-MM-DD` Strings | Prevents date drift |
| EC-3.5 | Concurrent Double Booking Race | Critical | SQLite Transaction Block | `409 Conflict` (for 2nd request) |
| EC-3.6 | Past Date Selection | Medium | Date String Comparison | `400 Bad Request` |
| EC-3.7 | Date Re-release on Cancel/Reject | High | Dynamic Query Status Filter | Instant Availability |
| EC-3.8 | Owner Blocking Over Confirmed Dates | Medium | Booking Check on Block Request | `400 Bad Request` |
