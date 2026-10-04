# Implementation Plan: Module 1 - Authentication & Profile

## 1. Overview
The **Authentication & Profile** module provides secure user onboarding, authentication, session management, and profile access for the camera equipment rental platform. A single user account can act as both an equipment owner and a renter.

---

## 2. Requirements & Scope

### 2.1 Core Requirements
- **User Registration:**
  - Collect user `name`, `email`, `phone`, `city`, and `password`.
  - Validate email format and uniqueness.
  - Require password with a minimum length (e.g., 6–8 characters).
  - Securely hash passwords before storing in SQLite using `bcrypt` (10–12 salt rounds).
- **User Login:**
  - Authenticate using `email` and `password`.
  - Issue a secure JSON Web Token (JWT) or secure session cookie.
  - Return authenticated user payload (`id`, `name`, `email`, `phone`, `city`).
- **Session Management & Route Protection:**
  - Express authentication middleware (`authMiddleware`) to protect private endpoints.
  - Frontend auth state manager to gate protected pages (e.g., `/my-listings`, `/my-bookings`, `/booking-requests`, `/listings/new`).
- **Logout:**
  - Invalidate or clear stored token/cookie on client and server.

### 2.2 Optional Requirements (from SRS)
- **Profile Management:**
  - Dedicated `/profile` page.
  - View current profile details.
  - Update user name, phone number, and city.
  - Optional password update with current password verification.

---

## 3. Database Design

### 3.1 SQLite Schema (`users` table)
```sql
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
```

### 3.2 Model / Data Access Functions
- `createUser({ name, email, phone, city, hashedPassword })`
- `findUserByEmail(email)`
- `findUserById(id)`
- `updateUserProfile(id, { name, phone, city })`
- `updateUserPassword(id, hashedPassword)`

---

## 4. Backend Architecture & API Specifications

### 4.1 Dependencies
- `bcryptjs`: Password hashing without native binary compilation issues on Windows.
- `jsonwebtoken`: Signing and verifying stateless auth tokens.
- `cookie-parser`: Optional cookie support for seamless browser auth.

### 4.2 API Endpoints

#### `POST /api/auth/register`
- **Access:** Public
- **Request Body:**
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+919876543210",
    "city": "Mumbai",
    "password": "securePassword123"
  }
  ```
- **Validation:**
  - All fields required.
  - Email regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
  - Phone format: 10+ digits.
  - Check existing email: return `409 Conflict` if duplicate.
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Registration successful",
    "token": "eyJhbGciOi...",
    "user": {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+919876543210",
      "city": "Mumbai"
    }
  }
  ```

#### `POST /api/auth/login`
- **Access:** Public
- **Request Body:**
  ```json
  {
    "email": "jane@example.com",
    "password": "securePassword123"
  }
  ```
- **Validation & Logic:**
  - Find user by email.
  - Compare password using `bcrypt.compare`.
  - Return `401 Unauthorized` if email not found or password incorrect.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Login successful",
    "token": "eyJhbGciOi...",
    "user": {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+919876543210",
      "city": "Mumbai"
    }
  }
  ```

#### `GET /api/auth/me`
- **Access:** Protected (`authMiddleware`)
- **Headers:** `Authorization: Bearer <token>`
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "user": {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+919876543210",
      "city": "Mumbai"
    }
  }
  ```

#### `POST /api/auth/logout`
- **Access:** Protected
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Logged out successfully"
  }
  ```

#### `PUT /api/users/profile` (Optional Feature)
- **Access:** Protected (`authMiddleware`)
- **Request Body:**
  ```json
  {
    "name": "Jane Doe Updated",
    "phone": "+919988776655",
    "city": "Bengaluru"
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Profile updated successfully",
    "user": {
      "id": 1,
      "name": "Jane Doe Updated",
      "email": "jane@example.com",
      "phone": "+919988776655",
      "city": "Bengaluru"
    }
  }
  ```

---

## 5. Frontend UI & UX Design

### 5.1 Views & Pages
1. **`public/register.html`**:
   - Modern registration card with brand logo.
   - Fields: Full Name, Email, Phone, City, Password, Confirm Password.
   - Client-side validation with real-time feedback.
   - Link to login page.
2. **`public/login.html`**:
   - Clean login card with email and password inputs.
   - "Remember Me" toggle.
   - Error banner for invalid credentials.
   - Link to register page.
3. **`public/profile.html`**:
   - User details card displaying account info, member since date.
   - Edit form for contact info and city.
   - Logout button.
4. **Global Header / Navigation (`navbar.js`)**:
   - Dynamic navbar state:
     - Unauthenticated: "Browse", "Login", "Sign Up" button.
     - Authenticated: "Browse", "Add Listing", "My Listings", "My Bookings", "Requests", User Avatar/Dropdown with "Profile" & "Logout".

### 5.2 Client-side Auth Utilities (`public/js/auth.js`)
- `getToken()` / `setToken(token)` / `removeToken()`: Centralized token handling.
- `getCurrentUser()`: Cached user profile data.
- `requireAuth(redirectUrl)`: Route protection redirecting unauthenticated users to `/login.html?redirect=...`.
- `logout()`: Clears state and redirects to home.

---

## 6. Security Considerations
- **Password Protection:** Never return password hashes in any API response.
- **Salt Rounds:** Use `bcryptjs` with minimum 10 rounds.
- **JWT Expiration:** Set a reasonable expiration (e.g., 7 days) and sign with a strong secret key in `.env` (`JWT_SECRET`).
- **Input Sanitization:** Trim strings, lowercase emails, escape HTML in frontend rendering.
- **CORS & Rate Limiting:** Configure Express headers and basic auth route rate limiting to deter brute-force login attempts.

---

## 7. Step-by-Step Implementation Tasks

- [ ] **Step 1: Setup Backend Auth Infrastructure**
  - Install `bcryptjs` and `jsonwebtoken`.
  - Define `users` table migration in database init script.
  - Implement `models/userModel.js` with CRUD methods.
- [ ] **Step 2: Implement Auth Controller & Middleware**
  - Create `controllers/authController.js` (register, login, me, updateProfile).
  - Implement `middleware/authMiddleware.js` to extract and verify Bearer token.
  - Register `/api/auth` and `/api/users` routes in `server.js`.
- [ ] **Step 3: Build Frontend Auth Pages & Components**
  - Create responsive `register.html` with styling matching design system.
  - Create `login.html` with error toast / banner handling.
  - Create `profile.html` with edit capabilities.
- [ ] **Step 4: Integrate Client-Side Session Handling**
  - Implement `public/js/auth.js` helper module.
  - Update `navbar.js` to dynamically toggle navigation items based on login status.
- [ ] **Step 5: Testing & Verification**
  - Verify registration with valid and invalid payloads.
  - Verify duplicate email handling.
  - Verify successful login and token generation.
  - Verify token rejection for expired or malformed tokens.
  - Verify protected route redirects for unauthenticated visitors.
