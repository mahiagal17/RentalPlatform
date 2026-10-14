const { generateRentalTerms, LEGAL_DISCLAIMER } = require('../services/geminiService');
const { getDefaultTermsTemplate } = require('../services/defaultTermsTemplate');

const AiController = {
  /**
   * Generate customized rental terms using Gemini AI or fallback
   * POST /api/ai/generate-terms
   */
  async generateTerms(req, res) {
    try {
      const { title, category, pricePerDay, city, description } = req.body;

      const result = await generateRentalTerms({
        title,
        category,
        pricePerDay,
        city,
        description
      });

      return res.json(result);
    } catch (err) {
      console.error('AI Controller error:', err);
      // Even in unhandled controller exception, return default template seamlessly
      return res.json({
        success: true,
        source: 'fallback_error',
        disclaimer: LEGAL_DISCLAIMER,
        terms: getDefaultTermsTemplate(req.body || {}),
        error: err.message
      });
    }
  },

  /**
   * Get standard default template without AI
   * GET /api/ai/default-template
   */
  getDefaultTemplate(req, res) {
    const terms = getDefaultTermsTemplate(req.query || {});
    return res.json({
      success: true,
      source: 'default_template',
      disclaimer: LEGAL_DISCLAIMER,
      terms
    });
  }
};

module.exports = AiController;
