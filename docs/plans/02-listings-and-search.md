# Implementation Plan: Module 2 - Listings & Search

## 1. Overview
The **Listings & Search** module enables equipment owners to create, manage, and showcase camera gear, while renters can discover, search, filter, and review equipment details.

---

## 2. Requirements & Scope

### 2.1 Core Requirements
- **Listing Creation:**
  - Registered owners can create listings with:
    - `title` (e.g., "Sony Alpha A7 IV Body")
    - `description` (specs, condition, included accessories)
    - `category` (Cameras, Lenses, Lighting, Audio, Tripods & Rigs, Drones, Accessories)
    - `price_per_day` (in ₹, positive number)
    - `city` (location where item is available)
    - `images` (array of image URLs or uploaded image paths)
    - `rental_terms` (text guidelines for renting this item)
    - `is_active` (status toggle, default `1` for active)
- **Listing Modification:**
  - Owner-only authorization: users can only edit listings they created.
- **Listing Deletion Safeguards:**
  - Owner-only authorization for deletion.
  - Critical safeguard: check for upcoming or active bookings (`status IN ('Pending', 'Confirmed') AND end_date >= CURRENT_DATE`). If upcoming bookings exist, reject deletion with an informative message.
- **Active / Inactive Status Toggle:**
  - Owners can quickly toggle a listing's visibility without deleting it.
- **Browse & Search:**
  - Public browse page displaying all active (`is_active = 1`) listings.
  - Search by keyword matching `title` and `description`.
  - Filter by `category`, `city`, and price range (`min_price`, `max_price`).
  - Sorting options (Price: Low to High, Price: High to Low, Newest First).
- **Listing Detail View:**
  - Visual gallery of item photos.
  - Full item specifications, daily rate badge, owner contact info/location.
  - Rental terms display.
  - Integration slot for Availability Calendar (Module 3) and Booking Form (Module 4).
- **Owner Dashboard ("My Listings"):**
  - Dedicated page displaying all equipment owned by the authenticated user.
  - Quick action buttons: Edit, Delete, Toggle Active/Inactive, View Live Listing.
  - Summary metrics: total listings, active listings, count of pending requests.

---

## 3. Database Design

### 3.1 SQLite Schema (`listings` table)
```sql
CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    price_per_day REAL NOT NULL CHECK(price_per_day > 0),
    city TEXT NOT NULL,
    images TEXT, -- Stored as JSON array string: '["img1.jpg", "img2.jpg"]'
    rental_terms TEXT,
    is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(owner_id);
CREATE INDEX IF NOT EXISTS idx_listings_active_category ON listings(is_active, category);
CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city);
CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price_per_day);
```

### 3.2 Model / Data Access Functions (`models/listingModel.js`)
- `createListing(data)`
- `getListingById(id)`
- `updateListing(id, data)`
- `deleteListing(id)`
- `toggleListingActive(id, isActive)`
- `getListings({ search, category, city, minPrice, maxPrice, sort, page, limit })`
- `getListingsByOwner(ownerId)`
- `hasUpcomingBookings(listingId)`

---

## 4. Backend Architecture & API Specifications

### 4.1 API Endpoints

#### `GET /api/listings`
- **Access:** Public
- **Query Parameters:**
  - `q`: Search keyword (matches title or description)
  - `category`: Filter by category (e.g. `Cameras`, `Lenses`)
  - `city`: Filter by city (e.g. `Mumbai`, `Delhi`)
  - `minPrice`: Minimum daily rental rate
  - `maxPrice`: Maximum daily rental rate
  - `sort`: `newest`, `price_asc`, `price_desc`
  - `page`: Page number (default: `1`)
  - `limit`: Items per page (default: `12`)
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "total": 24,
    "page": 1,
    "totalPages": 2,
    "listings": [
      {
        "id": 10,
        "owner_id": 1,
        "owner_name": "Jane Doe",
        "title": "Sony Alpha A7 IV + 24-70mm GM II",
        "description": "Professional 33MP hybrid camera with master zoom lens.",
        "category": "Cameras",
        "price_per_day": 2500,
        "city": "Mumbai",
        "images": ["/uploads/sony-a7iv-1.jpg"],
        "is_active": 1,
        "created_at": "2026-10-01T10:00:00Z"
      }
    ]
  }
  ```

#### `GET /api/listings/:id`
- **Access:** Public
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "listing": {
      "id": 10,
      "owner_id": 1,
      "owner_name": "Jane Doe",
      "owner_phone": "+919876543210",
      "owner_city": "Mumbai",
      "title": "Sony Alpha A7 IV + 24-70mm GM II",
      "description": "Detailed specs...",
      "category": "Cameras",
      "price_per_day": 2500,
      "city": "Mumbai",
      "images": ["/uploads/sony-a7iv-1.jpg", "/uploads/sony-a7iv-2.jpg"],
      "rental_terms": "1. ID proof required...",
      "is_active": 1,
      "created_at": "2026-10-01T10:00:00Z"
    }
  }
  ```

#### `POST /api/listings`
- **Access:** Protected (`authMiddleware`)
- **Request Body:**
  ```json
  {
    "title": "Canon EOS R5 Mirrorless Camera",
    "description": "8K video, 45MP full frame sensor with 2 batteries.",
    "category": "Cameras",
    "price_per_day": 3200,
    "city": "Bengaluru",
    "images": ["https://images.unsplash.com/..."],
    "rental_terms": "Treat with care. Return by 8 PM."
  }
  ```
- **Validation:**
  - `title`, `description`, `category`, `price_per_day`, `city` are required.
  - `price_per_day` must be a positive number.
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Listing published successfully",
    "listingId": 11
  }
  ```

#### `PUT /api/listings/:id`
- **Access:** Protected (`authMiddleware`, Owner check)
- **Validation:** Only owner can update. Returns `403 Forbidden` if user is not the owner.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Listing updated successfully"
  }
  ```

#### `PATCH /api/listings/:id/status`
- **Access:** Protected (Owner check)
- **Request Body:** `{ "is_active": 0 }`
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Listing status updated",
    "is_active": 0
  }
  ```

#### `DELETE /api/listings/:id`
- **Access:** Protected (Owner check)
- **Safety Logic:**
  - Query active/upcoming bookings: `SELECT COUNT(*) AS count FROM bookings WHERE listing_id = ? AND status IN ('Pending', 'Confirmed') AND end_date >= DATE('now')`.
  - If `count > 0`: Return `400 Bad Request` with message: `"Cannot delete listing with upcoming or active bookings. You may deactivate it instead."`
  - Otherwise, delete listing from database.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Listing deleted successfully"
  }
  ```

#### `GET /api/listings/owner/mine`
- **Access:** Protected (`authMiddleware`)
- **Returns:** All listings where `owner_id = req.user.id`, regardless of active state.

#### `GET /api/listings/meta/categories-and-cities`
- **Access:** Public
- **Returns:** Distinct lists of existing categories and cities to populate filter dropdowns dynamically.

---

## 5. Frontend UI & UX Design

### 5.1 Views & Pages
1. **Browse / Home View (`public/index.html` or `public/browse.html`):**
   - Hero banner with quick search input and category pills.
   - Filter sidebar / collapsible mobile filter drawer (Category, City, Price slider/inputs).
   - Results grid with equipment cards:
     - High-quality image preview with aspect ratio preservation.
     - Category badge and location pin.
     - Listing title.
     - Price per day highlighted (`₹2,500 / day`).
     - "View Details" button.
   - Empty state when no listings match filters.
2. **Listing Detail View (`public/listing-detail.html?id=10`):**
   - Media gallery (main photo + thumbnail selector).
   - Header with title, category, city tag, price per day.
   - Equipment overview and description.
   - Rental terms and conditions section.
   - Owner info card with name, city, and verification badge.
   - Sidebar with Availability Calendar and Booking form.
3. **Add / Edit Listing Form (`public/listing-form.html`):**
   - Step-by-step or clean single-page form.
   - Image URL inputs or file upload previews.
   - Title, Category dropdown, Daily Price in ₹, City selector.
   - Description rich textarea.
   - AI Terms Generator integration box (Module 5 integration).
   - "Publish Listing" / "Save Changes" button.
4. **My Listings Dashboard (`public/my-listings.html`):**
   - Header with "Add New Listing" action.
   - Listing cards / table layout displaying thumbnail, title, daily price, active toggle switch.
   - Action buttons: "Edit", "Delete", "View".
   - Delete confirmation modal explaining upcoming booking constraints.

---

## 6. Implementation Steps

- [ ] **Step 1: Database Migration & Model Setup**
  - Implement `listings` table in `database/init.js`.
  - Implement `models/listingModel.js` with search, filter, CRUD, and upcoming booking check queries.
- [ ] **Step 2: Express Routes & Controller**
  - Build `controllers/listingController.js` handling all CRUD endpoints and ownership validations.
  - Implement deletion safeguard query checking active bookings.
  - Configure routes in `routes/listingRoutes.js`.
- [ ] **Step 3: Build Browse & Search Frontend**
  - Build modern listing card CSS in `public/css/listings.css`.
  - Implement search bar and filter listeners in `public/js/browse.js`.
  - Implement pagination / limit controls.
- [ ] **Step 4: Build Listing Detail Page**
  - Create `listing-detail.html` layout.
  - Fetch and render full listing info, image carousel, terms, and owner details via `public/js/listing-detail.js`.
- [ ] **Step 5: Build Listing Form (Add/Edit) & My Listings Dashboard**
  - Create `listing-form.html` and `public/js/listing-form.js` supporting both create and update modes.
  - Create `my-listings.html` and `public/js/my-listings.js` with active toggle and delete actions.
- [ ] **Step 6: Testing & Verification**
  - Verify listing creation with valid/invalid data.
  - Verify unauthorized users cannot edit/delete another user's listings.
  - Verify that listings with active bookings cannot be deleted and show the appropriate error message.
  - Verify search query and category/city filters work smoothly.
