# Edge Cases: Module 1 - Authentication & Profile

## 1. Overview
This document specifies all edge cases, failure modes, security considerations, and mitigation strategies for **Module 1 (Authentication & Profile)**. Handling these edge cases ensures robust user onboarding, session integrity, and security across the platform.

---

## 2. Edge Cases Specification

### EC-1.1: Case-Insensitive & Whitespace Email Duplication
- **Scenario:**
  - A user registers with `alex@example.com`.
  - Later, another registration attempts `Alex@example.com` or `  alex@example.com  `.
- **Potential Impact:**
  - Duplicate user accounts, authentication collisions, or password reset confusion.
- **Expected Behavior:**
  - The system treats email addresses as case-insensitive and trimmed. The second registration must be rejected with `409 Conflict`.
- **Mitigation Strategy:**
  1. Frontend and backend trim whitespace from email inputs: `email = email.trim().toLowerCase()`.
  2. Database column definition in SQLite uses case-insensitive collation:
     ```sql
     email TEXT NOT NULL UNIQUE COLLATE NOCASE
     ```
  3. API returns descriptive JSON error: `{ "success": false, "message": "An account with this email address already exists." }`.
- **Verification Step:**
  - Register `test@domain.com`. Attempt to register `TEST@DOMAIN.COM`. Verify HTTP 409 error is returned.

---

### EC-1.2: Passwords with Unicode, Emojis, or Bcrypt 72-Byte Truncation
- **Scenario:**
  - Standard `bcrypt` truncates passwords after 72 bytes. A user entering an extremely long passphrase or multibyte characters (like emojis 🔐) might encounter unexpected character truncation.
- **Potential Impact:**
  - Two different passphrases sharing the same initial 72 bytes could result in a matching hash, or password hashing could fail silently.
- **Expected Behavior:**
  - Enforce clear password length boundaries (minimum 8 characters, maximum 72 characters).
- **Mitigation Strategy:**
  1. Validate length on both client and server before hashing:
     ```javascript
     if (!password || password.length < 8 || password.length > 72) {
       return res.status(400).json({ error: "Password must be between 8 and 72 characters long." });
     }
     ```
  2. Test with UTF-8 passwords to ensure encoding consistency.
- **Verification Step:**
  - Submit a password of 5 characters (expect rejection), 73 characters (expect rejection), and a valid UTF-8 passphrase with emojis (expect success and authenticable login).

---

### EC-1.3: Tampered, Expired, or Malformed JWT Tokens
- **Scenario:**
  - Client sends an expired token, a token signed with an invalid secret, a truncated header, or arbitrary text in `Authorization: Bearer <token>`.
- **Potential Impact:**
  - Unauthorized access, application crashes due to uncaught token decoding exceptions.
- **Expected Behavior:**
  - The backend auth middleware cleanly intercepts errors without throwing unhandled exceptions, returns `401 Unauthorized`, and instructs the frontend to clear credentials.
- **Mitigation Strategy:**
  ```javascript
  function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, code: 'NO_TOKEN', message: 'Authentication required' });
    }
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, code: 'TOKEN_EXPIRED', message: 'Session expired. Please log in again.' });
      }
      return res.status(401).json({ success: false, code: 'INVALID_TOKEN', message: 'Invalid authentication token.' });
    }
  }
  ```
- **Verification Step:**
  - Make a request with a manipulated token signature. Verify response is `401 Unauthorized` with code `INVALID_TOKEN`.

---

### EC-1.4: Session Expiration While User is Filling Out Long Forms
- **Scenario:**
  - An owner spends 20 minutes drafting equipment details or terms, or a renter selects dates. During this time, the JWT expires. Submitting the form fails with 401.
- **Potential Impact:**
  - Frustrating user experience if all entered form data is wiped on redirect.
- **Expected Behavior:**
  - The frontend catches the 401 error, preserves form draft data in `sessionStorage`, prompts the user with a login modal or redirects to login with a `returnUrl`, and restores form inputs upon re-authenticating.
- **Mitigation Strategy:**
  1. Frontend API wrapper checks for `TOKEN_EXPIRED`.
  2. Saves form state to `sessionStorage.setItem('pending_listing_draft', JSON.stringify(formData))`.
  3. After login, checks for draft and pre-populates fields.
- **Verification Step:**
  - Manually clear token in `localStorage`, attempt form submission, verify draft persistence.

---

### EC-1.5: Phone Number Formatting & Invalid Digits
- **Scenario:**
  - User submits phone numbers formatted with dashes, spaces, country codes, or alphabetic typos (e.g. `+91 98765-43210`, `9876543210`, `12345`, `abcdefghij`).
- **Potential Impact:**
  - Renters and owners cannot contact each other to coordinate equipment pickup.
- **Expected Behavior:**
  - Normalize phone numbers to standard 10-digit Indian mobile format or international E.164 format, rejecting invalid sequences.
- **Mitigation Strategy:**
  1. Server regex validation:
     ```javascript
     const cleanedPhone = phone.replace(/[\s\-\(\)]/g, '');
     const phoneRegex = /^(\+91|91|0)?[6-9]\d{9}$/;
     if (!phoneRegex.test(cleanedPhone)) {
       return res.status(400).json({ error: "Please enter a valid 10-digit mobile number." });
     }
     ```
  2. Persist normalized format for consistent rendering.
- **Verification Step:**
  - Test registration with `0000000000` and `9876543210`. Verify invalid numbers are rejected.

---

### EC-1.6: IDOR (Insecure Direct Object Reference) on Profile Updates
- **Scenario:**
  - User A sends `PUT /api/users/profile` with payload `{ "userId": 2, "name": "Hacked Name" }` targeting User B.
- **Potential Impact:**
  - Unauthorized tampering with other users' accounts.
- **Expected Behavior:**
  - Profile updates must ignore any client-supplied `userId` and strictly use `req.user.id` extracted from the verified JWT payload.
- **Mitigation Strategy:**
  ```javascript
  // controllers/userController.js
  const targetUserId = req.user.id; // Strictly from auth token
  updateUserProfile(targetUserId, { name, phone, city });
  ```
- **Verification Step:**
  - Authenticate as User 1. Issue PUT request with `{ id: 2, name: 'Attacker' }`. Confirm User 2 remains untouched and User 1 is updated.

---

### EC-1.7: Brute-Force Password Guessing & User Enumeration
- **Scenario:**
  - Automated script repeatedly hits `/api/auth/login` to guess passwords or enumerate existing emails.
- **Potential Impact:**
  - Account takeover or user email harvesting.
- **Expected Behavior:**
  - Return identical generic error message for non-existent emails and wrong passwords ("Invalid email or password").
  - Rate limit login attempts per IP.
- **Mitigation Strategy:**
  1. Express rate-limiter: Max 5 failed attempts per 15-minute window per IP.
  2. Generic error response for both unknown user and password mismatch:
     ```javascript
     if (!user || !(await bcrypt.compare(password, user.password))) {
       return res.status(401).json({ success: false, message: "Invalid email or password." });
     }
     ```
- **Verification Step:**
  - Test login with non-existent email and wrong password for existing email; verify identical HTTP status (`401`) and response message.

---

## 3. Summary Matrix

| ID | Edge Case | Severity | Handling Layer | Status Code |
|---|---|---|---|---|
| EC-1.1 | Case/Whitespace Duplicate Email | High | Controller + DB Unique Collation | `409 Conflict` |
| EC-1.2 | Password Length & Truncation | High | Client + Server Validation | `400 Bad Request` |
| EC-1.3 | Expired / Tampered JWT | Critical | Auth Middleware | `401 Unauthorized` |
| EC-1.4 | Form Expiration During Edit | Medium | Frontend Storage + Modal Auth | `401 Unauthorized` |
| EC-1.5 | Malformed Phone Number | Medium | Regex Sanitizer & Validator | `400 Bad Request` |
| EC-1.6 | IDOR on Profile Updates | Critical | Controller (`req.user.id`) | `200 OK` (User's own) |
| EC-1.7 | Brute Force & Enumeration | High | Rate Limiter + Generic Error | `401 Unauthorized` / `429 Too Many Requests` |
