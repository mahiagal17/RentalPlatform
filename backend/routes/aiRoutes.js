const express = require('express');
const router = express.Router();
const AiController = require('../controllers/aiController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Protected route for AI generation
router.post('/generate-terms', authMiddleware, AiController.generateTerms);

// Public route for standard template
router.get('/default-template', AiController.getDefaultTemplate);

module.exports = router;
