const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const { JWT_SECRET } = require('../middleware/authMiddleware');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const AuthController = {
  /**
   * Register new user
   */
  async register(req, res) {
    try {
      const { name, email, phone, city, password } = req.body;

      // 1. Required fields check
      if (!name || !email || !phone || !city || !password) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_FIELDS',
          message: 'All fields (name, email, phone, city, password) are required.'
        });
      }

      // 2. Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const cleanEmail = email.trim().toLowerCase();
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_EMAIL',
          message: 'Please enter a valid email address.'
        });
      }

      // 3. Validate password length (Bcrypt truncation guard: min 8, max 72 chars)
      if (password.length < 8 || password.length > 72) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_PASSWORD_LENGTH',
          message: 'Password must be between 8 and 72 characters long.'
        });
      }

      // 4. Validate phone format (Indian 10-digit or valid international format)
      const cleanedPhone = phone.replace(/[\s\-\(\)]/g, '');
      const phoneRegex = /^(\+91|91|0)?[6-9]\d{9}$/;
      if (!phoneRegex.test(cleanedPhone) && cleanedPhone.length < 10) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_PHONE',
          message: 'Please enter a valid 10-digit mobile number.'
        });
      }

      // 5. Check if email already registered (Case-insensitive check)
      const existingUser = UserModel.findByEmail(cleanEmail);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email address already exists. Please log in instead.'
        });
      }

      // 6. Create user in database
      const newUser = UserModel.create({
        name: name.trim(),
        email: cleanEmail,
        phone: cleanedPhone,
        city: city.trim(),
        password
      });

      // 7. Generate JWT
      const token = jwt.sign(
        { id: newUser.id, email: newUser.email, name: newUser.name },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      return res.status(201).json({
        success: true,
        message: 'Account registered successfully!',
        token,
        user: newUser
      });
    } catch (err) {
      console.error('Registration error:', err);
      return res.status(500).json({
        success: false,
        code: 'REGISTRATION_FAILED',
        message: 'Failed to create account. Please try again.'
      });
    }
  },

  /**
   * Login user
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_CREDENTIALS',
          message: 'Please provide both email and password.'
        });
      }

      const cleanEmail = email.trim().toLowerCase();
      const user = UserModel.findByEmail(cleanEmail);

      // Generic error response to prevent user enumeration
      if (!user || !UserModel.verifyPassword(password, user.password)) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.'
        });
      }

      // Generate JWT
      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      const safeUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        city: user.city,
        created_at: user.created_at
      };

      return res.json({
        success: true,
        message: 'Login successful!',
        token,
        user: safeUser
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({
        success: false,
        code: 'LOGIN_FAILED',
        message: 'Authentication failed. Please try again.'
      });
    }
  },

  /**
   * Get current authenticated user profile
   */
  async getMe(req, res) {
    try {
      const user = UserModel.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          code: 'USER_NOT_FOUND',
          message: 'User profile not found.'
        });
      }

      return res.json({
        success: true,
        user
      });
    } catch (err) {
      console.error('Get profile error:', err);
      return res.status(500).json({
        success: false,
        code: 'PROFILE_FETCH_FAILED',
        message: 'Unable to retrieve user profile.'
      });
    }
  },

  /**
   * Update profile (IDOR protected: strictly uses req.user.id)
   */
  async updateProfile(req, res) {
    try {
      const { name, phone, city } = req.body;
      const userId = req.user.id; // Strictly from verified JWT

      if (!name || !phone || !city) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_FIELDS',
          message: 'Name, phone, and city are required to update profile.'
        });
      }

      const cleanedPhone = phone.replace(/[\s\-\(\)]/g, '');
      const updatedUser = UserModel.updateProfile(userId, {
        name: name.trim(),
        phone: cleanedPhone,
        city: city.trim()
      });

      return res.json({
        success: true,
        message: 'Profile updated successfully!',
        user: updatedUser
      });
    } catch (err) {
      console.error('Update profile error:', err);
      return res.status(500).json({
        success: false,
        code: 'PROFILE_UPDATE_FAILED',
        message: 'Failed to update profile.'
      });
    }
  },

  /**
   * Logout (client terminates token)
   */
  logout(req, res) {
    return res.json({
      success: true,
      message: 'Logged out successfully.'
    });
  }
};

module.exports = AuthController;
