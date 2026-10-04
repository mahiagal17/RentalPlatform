# Implementation Plan: Module 4 - Booking Management

## 1. Overview
The **Booking Management** module governs the entire rental lifecycle from reservation request through approval, cancellation, or completion. It enforces business rules including self-booking restrictions, terms acceptance, day/price calculations, and role-based actions for owners and renters.

---

## 2. Requirements & Scope

### 2.1 Core Requirements
- **Booking Creation (Renter):**
  - Select `start_date` and `end_date` from availability calendar.
  - Automatic calculation and display of total rental days (inclusive) and total price (`days * price_per_day`).
  - Mandatory rental terms review and agreement checkbox prior to submission.
  - Prohibit self-booking: a user cannot book a listing they own (`renter_id != owner_id`).
  - Created with initial status of `Pending`.
- **Booking Acceptance & Rejection (Owner):**
  - Owner receives pending requests in a dedicated **Booking Requests** dashboard.
  - Owner can **Accept** the booking $\rightarrow$ status becomes `Confirmed`.
  - Owner can **Reject** the booking $\rightarrow$ status becomes `Rejected`. Rejected dates are freed on the availability calendar.
- **Booking Cancellation (Renter):**
  - Renter can view their bookings in a dedicated **My Bookings** dashboard.
  - Renter can **Cancel** a booking before the start date (`start_date > today`). Cancelled dates are freed on the availability calendar.
- **Booking Lifecycle & Status Flow:**
  - `Pending`: Awaiting owner decision.
  - `Confirmed`: Approved by owner; equipment reserved.
  - `Rejected`: Declined by owner; dates released.
  - `Cancelled`: Terminated by renter before start date; dates released.
  - `Completed`: Rental duration has concluded (`end_date < today` and status was `Confirmed`).
- **Dashboards & Views:**
  - **My Bookings (`/my-bookings`):** Renter's personal view showing all items they have requested/booked, current status, price summary, owner contact, and cancel action.
  - **Booking Requests (`/booking-requests`):** Owner's view displaying incoming rental requests for all their listings, with Accept / Reject actions.

---

## 3. Database Design

### 3.1 SQLite Schema (`bookings` table)
```sql
CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    renter_id INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,
    start_date TEXT NOT NULL, -- YYYY-MM-DD
    end_date TEXT NOT NULL,   -- YYYY-MM-DD
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
```

### 3.2 State Transition Matrix

| Current Status | Allowed Action | Performed By | Condition | Next Status |
|---|---|---|---|---|
| *None* | Create Request | Renter | `renter_id != owner_id`, no overlap, terms checked | `Pending` |
| `Pending` | Accept | Owner | `req.user.id == owner_id` | `Confirmed` |
| `Pending` | Reject | Owner | `req.user.id == owner_id` | `Rejected` |
| `Pending` | Cancel | Renter | `req.user.id == renter_id`, `start_date > today` | `Cancelled` |
| `Confirmed` | Cancel | Renter | `req.user.id == renter_id`, `start_date > today` | `Cancelled` |
| `Confirmed` | Auto-Complete | System / Query | `end_date < today` | `Completed` |

---

## 4. Backend Architecture & API Specifications

### 4.1 API Endpoints

#### `POST /api/bookings`
- **Access:** Protected (`authMiddleware`)
- **Request Body:**
  ```json
  {
    "listingId": 10,
    "startDate": "2026-10-15",
    "endDate": "2026-10-17",
    "termsAccepted": true,
    "renterNotes": "Need for a 3-day short film shoot."
  }
  ```
- **Business Logic & Validations:**
  1. Retrieve listing by `listingId`. If not found, return `404 Not Found`.
  2. Verify listing is active (`is_active == 1`).
  3. **Self-Booking Check:** Check if `req.user.id === listing.owner_id`. If true, return `400 Bad Request` with `"You cannot book your own listing."`
  4. **Terms Check:** Ensure `termsAccepted === true`.
  5. **Date Validation:** Ensure valid dates, `startDate <= endDate`, and `startDate >= today`.
  6. **Overlap Check:** Verify no existing `Pending` or `Confirmed` booking overlaps with `[startDate, endDate]`.
  7. **Price Calculation:**
     $$\text{days} = \lfloor \frac{\text{endDate} - \text{startDate}}{86400000} \rfloor + 1$$
     $$\text{totalPrice} = \text{days} \times \text{listing.price\_per\_day}$$
  8. Insert booking record with `status = 'Pending'`.
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Booking request submitted successfully",
    "booking": {
      "id": 101,
      "listingId": 10,
      "startDate": "2026-10-15",
      "endDate": "2026-10-17",
      "daysCount": 3,
      "totalPrice": 7500,
      "status": "Pending"
    }
  }
  ```

#### `GET /api/bookings/my-bookings`
- **Access:** Protected (`authMiddleware`)
- **Description:** Returns all bookings submitted by the authenticated renter (`renter_id = req.user.id`).
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "bookings": [
      {
        "id": 101,
        "listing_id": 10,
        "listing_title": "Sony Alpha A7 IV",
        "listing_image": "/uploads/sony-a7iv-1.jpg",
        "owner_name": "Jane Doe",
        "owner_phone": "+919876543210",
        "start_date": "2026-10-15",
        "end_date": "2026-10-17",
        "days_count": 3,
        "total_price": 7500,
        "status": "Pending",
        "can_cancel": true,
        "created_at": "2026-10-04T12:00:00Z"
      }
    ]
  }
  ```

#### `GET /api/bookings/requests`
- **Access:** Protected (`authMiddleware`)
- **Description:** Returns all incoming booking requests for listings owned by the authenticated owner (`owner_id = req.user.id`).
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "requests": [
      {
        "id": 101,
        "listing_id": 10,
        "listing_title": "Sony Alpha A7 IV",
        "renter_id": 2,
        "renter_name": "Alex Smith",
        "renter_phone": "+919123456780",
        "renter_city": "Mumbai",
        "start_date": "2026-10-15",
        "end_date": "2026-10-17",
        "days_count": 3,
        "total_price": 7500,
        "status": "Pending",
        "renter_notes": "Need for a 3-day short film shoot.",
        "created_at": "2026-10-04T12:00:00Z"
      }
    ]
  }
  ```

#### `PATCH /api/bookings/:id/accept`
- **Access:** Protected (Owner only)
- **Validation:** Must be in `Pending` state and `owner_id === req.user.id`.
- **Action:** Update status to `'Confirmed'`.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Booking request confirmed",
    "status": "Confirmed"
  }
  ```

#### `PATCH /api/bookings/:id/reject`
- **Access:** Protected (Owner only)
- **Validation:** Must be in `Pending` state and `owner_id === req.user.id`.
- **Action:** Update status to `'Rejected'`.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Booking request rejected",
    "status": "Rejected"
  }
  ```

#### `PATCH /api/bookings/:id/cancel`
- **Access:** Protected (Renter only)
- **Validation:**
  - `renter_id === req.user.id`
  - Current status in `('Pending', 'Confirmed')`
  - `start_date > today` (cannot cancel after rental has started)
- **Action:** Update status to `'Cancelled'`.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Booking cancelled successfully",
    "status": "Cancelled"
  }
  ```

---

## 5. Frontend UI & UX Design

### 5.1 Views & Components
1. **Booking Box on Listing Detail (`listing-detail.html`):**
   - Compact, sticky sidebar on desktop; fixed bottom drawer on mobile.
   - Date range selector connected to calendar.
   - Calculation breakdown:
     - `₹2,500 x 3 days` = `₹7,500`
     - Deposit / settlement notice: *"Payment settled in-person on pickup."*
   - Rental terms agreement checkbox:
     - *"I have read and agree to the Rental Terms for this equipment."*
     - Clickable link to view terms modal.
   - "Request to Book" CTA button (disabled if unauthenticated, own listing, or invalid dates).
2. **My Bookings View (`public/my-bookings.html`):**
   - Filter tabs: All, Active/Upcoming, Completed, Cancelled.
   - Cards showing equipment thumbnail, title, owner contact, date range, total amount, and color-coded status badge:
     - `Pending`: Yellow badge
     - `Confirmed`: Green badge
     - `Rejected`: Red badge
     - `Cancelled`: Gray badge
     - `Completed`: Blue badge
   - "Cancel Booking" button with confirmation modal (only visible if `start_date > today`).
3. **Booking Requests View (`public/booking-requests.html`):**
   - Owner inbox with filter tabs (Pending Requests, History).
   - Rich request card showing renter profile snippet, requested dates, calculated payout, renter notes.
   - Action buttons: "Accept Booking" (primary green), "Reject Booking" (danger outline).
   - Instant optimistic UI update upon action with toast notification.

---

## 6. Implementation Tasks

- [ ] **Step 1: Database Migration & Booking Model**
  - Define `bookings` table in `database/init.js`.
  - Implement `models/bookingModel.js` with CRUD, status updates, overlap queries, and automatic completion checks.
- [ ] **Step 2: Booking Controller & Business Logic**
  - Implement `controllers/bookingController.js`:
    - Create booking with self-booking guard, terms validation, and overlap checks.
    - Accept / Reject handlers for owners.
    - Cancel handler for renters with date guard.
    - Fetch lists for My Bookings and Booking Requests.
- [ ] **Step 3: Connect Frontend Booking Form**
  - Wire up date picker and pricing summary on `listing-detail.html`.
  - Add terms acceptance checkbox with validation.
  - Disable booking button if user is the listing owner.
- [ ] **Step 4: Build My Bookings & Booking Requests Dashboards**
  - Create `my-bookings.html` and `public/js/my-bookings.js`.
  - Create `booking-requests.html` and `public/js/booking-requests.js`.
  - Add cancel confirmation and accept/reject action handlers.
- [ ] **Step 5: Testing & Verification**
  - Verify an owner cannot book their own equipment.
  - Verify booking without checking terms is rejected.
  - Verify total price math across single-day and multi-day bookings.
  - Verify owner accept/reject state transitions and calendar date re-release.
  - Verify renter cannot cancel a booking on or after its start date.
