# Implementation Plan: Module 3 - Availability Calendar

## 1. Overview
The **Availability Calendar** module provides real-time calendar visibility for equipment listings, preventing double-bookings. It visually disables unavailable dates on the frontend and strictly enforces no-overlap booking validation on the backend.

---

## 2. Requirements & Scope

### 2.1 Core Requirements
- **Visual Calendar Component:**
  - Embedded on the listing detail page (`/listings/:id`).
  - Displays monthly views with next/previous navigation.
  - Visually distinguishes:
    - Available dates (selectable)
    - Past dates (disabled, non-selectable)
    - Booked dates (disabled, non-selectable; includes dates with `Pending` or `Confirmed` status)
    - Blocked dates (disabled, marked as unavailable)
    - Selected booking range (highlighted start to end date)
- **Past Date Restriction:**
  - Dates prior to `today` (server/client local time) are non-selectable.
- **Server-Side Overlap Validation:**
  - Absolute server-side verification: reject any booking request whose date range overlaps with any existing booking for that listing that is currently `Pending` or `Confirmed`.
  - Date overlap condition:
    $$\text{requested\_start} \le \text{existing\_end} \quad \text{AND} \quad \text{requested\_end} \ge \text{existing\_start}$$
- **Date Re-release:**
  - If a booking is `Rejected` by the owner or `Cancelled` by the renter, those dates become immediately free for subsequent bookings.

### 2.2 Optional Requirements (from SRS)
- **Owner Date Blocking:**
  - Owners can manually block out specific date ranges for an item (e.g., when the equipment is undergoing maintenance, repair, or reserved for personal use).
  - Blocked dates are rendered as unavailable on the calendar.

---

## 3. Database Design & Overlap Logic

### 3.1 SQLite Schemas
Bookings are tracked in the `bookings` table. To support owner date blocking (optional requirement), we can either use a dedicated `blocked_dates` table or insert a booking with status `'Blocked'`. A dedicated table ensures cleaner separation:

```sql
-- Optional owner date blocking table
CREATE TABLE IF NOT EXISTS blocked_dates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    start_date TEXT NOT NULL, -- Format: YYYY-MM-DD
    end_date TEXT NOT NULL,   -- Format: YYYY-MM-DD
    reason TEXT,             -- e.g., 'Maintenance', 'Personal Use'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blocked_dates_listing ON blocked_dates(listing_id, start_date, end_date);
```

### 3.2 Overlap Detection Query
To determine if a proposed date range `[?req_start, ?req_end]` is available for `listing_id = ?listing_id`:

```sql
-- 1. Check overlapping active bookings
SELECT id, start_date, end_date, status
FROM bookings
WHERE listing_id = ?
  AND status IN ('Pending', 'Confirmed')
  AND start_date <= ?req_end
  AND end_date >= ?req_start;

-- 2. Check overlapping blocked dates (if owner blocking is enabled)
SELECT id, start_date, end_date, reason
FROM blocked_dates
WHERE listing_id = ?
  AND start_date <= ?req_end
  AND end_date >= ?req_start;
```
If any rows are returned by either query, the requested dates are in conflict and the booking must be rejected.

---

## 4. Backend Architecture & API Specifications

### 4.1 API Endpoints

#### `GET /api/listings/:id/availability`
- **Access:** Public
- **Query Parameters:** `month` (e.g., `2026-10`), `year` (optional filter, default returns all future booked/blocked ranges)
- **Description:** Returns all date ranges that are currently unavailable for this listing.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "listingId": 10,
    "unavailableRanges": [
      {
        "start": "2026-10-10",
        "end": "2026-10-14",
        "type": "booked"
      },
      {
        "start": "2026-10-22",
        "end": "2026-10-25",
        "type": "blocked",
        "reason": "Routine sensor cleaning"
      }
    ]
  }
  ```

#### `POST /api/listings/:id/check-availability`
- **Access:** Public
- **Request Body:**
  ```json
  {
    "startDate": "2026-10-15",
    "endDate": "2026-10-18"
  }
  ```
- **Validation:**
  - `startDate <= endDate`
  - `startDate >= today`
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "available": true,
    "days": 4,
    "pricePerDay": 2500,
    "totalPrice": 10000
  }
  ```
- **Conflict Response (`200 OK` with available=false or `409 Conflict`):**
  ```json
  {
    "success": false,
    "available": false,
    "message": "Selected dates overlap with an existing booking or scheduled maintenance."
  }
  ```

#### `POST /api/listings/:id/blocked-dates` (Optional Feature)
- **Access:** Protected (`authMiddleware`, Owner check)
- **Request Body:**
  ```json
  {
    "startDate": "2026-11-01",
    "endDate": "2026-11-05",
    "reason": "Maintenance and repair"
  }
  ```
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Dates blocked successfully",
    "blockedId": 3
  }
  ```

#### `DELETE /api/listings/:id/blocked-dates/:blockId` (Optional Feature)
- **Access:** Protected (Owner check)
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Blocked dates removed"
  }
  ```

---

## 5. Frontend Calendar Component Design

### 5.1 Vanilla JS Interactive Calendar (`public/js/components/calendar.js`)
A lightweight, dependency-free interactive calendar widget:
- **Navigation:** Month/Year header with `< Prev` and `Next >` buttons.
- **Grid Layout:** 7 columns (Sun–Sat) with appropriate padding days.
- **Cell Styling:**
  - `.calendar-day.past`: Greyed out, cursor: `not-allowed`.
  - `.calendar-day.booked`: Red/diagonal striped indicator, tooltip "Booked", non-clickable.
  - `.calendar-day.blocked`: Orange indicator, tooltip "Maintenance", non-clickable.
  - `.calendar-day.available`: Hoverable, clickable.
  - `.calendar-day.range-start`, `.calendar-day.in-range`, `.calendar-day.range-end`: Highlighted with brand accent color.
- **Selection Workflow:**
  1. Click 1: Selects `startDate`.
  2. Hover: Highlights potential range to hovered date.
  3. Click 2: Selects `endDate`. Validates that no booked/blocked days lie within the selected range.
  4. Automatically synchronizes hidden form fields (`#start_date`, `#end_date`) and updates the booking summary widget with calculated days and total price.

### 5.2 Date Helpers (`public/js/utils/dateUtils.js`)
- `formatDate(date)`: Formats date to `YYYY-MM-DD`.
- `parseDate(str)`: Safely parses date string ignoring timezone drift.
- `calculateInclusiveDays(startDate, endDate)`:
  $$\text{days} = \lfloor \frac{\text{end} - \text{start}}{86400000} \rfloor + 1$$
- `isDateInRange(date, start, end)`: Checks boundary conditions.

---

## 6. Edge Cases & Concurrency Handling

1. **Inclusive Date Interpretation:**
   - Both start date and end date are billable days. E.g., Oct 10 to Oct 12 = 3 days (Oct 10, 11, 12).
2. **Same-Day Turnover:**
   - As per SRS, start and end dates are counted as rental days and cannot overlap with another booking on either boundary day.
3. **Race Condition Prevention:**
   - Two users viewing the page simultaneously might click the same dates.
   - The booking submission endpoint (`POST /api/bookings`) MUST execute inside a database transaction:
     ```javascript
     const db = getDb();
     const checkOverlap = db.prepare(`
       SELECT COUNT(*) as count FROM bookings
       WHERE listing_id = ? AND status IN ('Pending', 'Confirmed')
         AND start_date <= ? AND end_date >= ?
     `);
     ```
   - If overlap exists at the moment of insert, abort and return `409 Conflict`.
4. **Immediate Re-release:**
   - When a booking status transitions from `Pending` $\rightarrow$ `Rejected`, or `Confirmed` $\rightarrow$ `Cancelled`, the status change immediately excludes it from the `status IN ('Pending', 'Confirmed')` filter, making those dates instantly bookable.

---

## 7. Implementation Tasks

- [ ] **Step 1: Setup Availability Controller & Service**
  - Implement `services/availabilityService.js` with date collision algorithms and database queries.
  - Create endpoints in `routes/availabilityRoutes.js` (`/availability`, `/check-availability`, `/blocked-dates`).
- [ ] **Step 2: Build Vanilla JS Calendar Component**
  - Develop `public/js/components/calendar.js` supporting month switching, state rendering, and range selection.
  - Implement styling in `public/css/calendar.css` ensuring accessible high-contrast indicators and mobile touch friendliness.
- [ ] **Step 3: Connect Calendar to Listing Detail & Booking Widget**
  - Embed the calendar component into `listing-detail.html`.
  - Fetch unavailable ranges on page load and render disabled slots.
  - Connect date range selection to booking form inputs and price preview.
- [ ] **Step 4: Implement Owner Date Blocking (Optional)**
  - Add "Manage Availability / Block Dates" modal on `my-listings.html` or listing edit form.
  - Add API endpoints to insert and delete date blocks.
- [ ] **Step 5: Testing & Verification**
  - Verify past dates cannot be clicked.
  - Verify dates for `Pending` and `Confirmed` bookings show as disabled.
  - Verify dates for `Rejected` and `Cancelled` bookings are free and selectable.
  - Verify server rejects concurrent bookings on overlapping ranges.
  - Test inclusive date pricing calculation (e.g., Friday to Sunday = 3 days).
