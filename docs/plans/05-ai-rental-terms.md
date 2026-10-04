# Implementation Plan: Module 5 - AI Rental Terms

## 1. Overview
The **AI Rental Terms** module utilizes the **Google Gemini API** on the Node.js backend to automatically generate plain-language, customized rental terms and conditions for camera gear owners. It includes fallback templates for offline/error resilience, editable form integration, and mandatory legal disclaimers.

---

## 2. Requirements & Scope

### 2.1 Core Requirements
- **Interactive AI Generation:**
  - "Generate Rental Terms with AI" button on the Add / Edit Listing page.
  - Passes current item context (Title, Category, Daily Price, Description, City) to the backend.
- **Coverage of Terms:**
  - AI generates concise, clear terms covering:
    1. Permitted Use & Care Instructions
    2. Pickup and Return Time Expectations
    3. Damage, Loss, and Repair Liability
    4. Late Return Fees (sensibly calculated relative to the daily rate)
    5. Cancellation Rules
- **Owner Review & Customization:**
  - Generated terms populate directly into an editable text area.
  - The owner can review, edit, add, or remove clauses before saving the listing.
- **Backend Security & API Key Protection:**
  - The Google Gemini API key (`GEMINI_API_KEY`) is stored strictly in the server `.env` file.
  - The client browser never receives or exposes the API key.
- **Graceful Fallback Mechanism:**
  - If the Gemini API request fails (network error, invalid key, rate limit, quota exceeded, or timeout), the system seamlessly returns a high-quality default rental terms template.
  - Booking and listing functionality continues without interruption.
- **Legal Disclaimer Notice:**
  - Explicit notification displayed next to generated terms:
    > *"Disclaimer: These terms are AI-generated guidelines for convenience and do not constitute formal legal advice. Please review and modify them to suit your requirements."*

---

## 3. Backend Architecture & Gemini Integration

### 3.1 Dependencies & Setup
- `@google/genai` (official Google Gen AI SDK) or `@google/generative-ai`.
- `dotenv`: For loading `GEMINI_API_KEY` securely from `.env`.

### 3.2 Service Implementation (`services/geminiService.js`)
```javascript
const { GoogleGenAI } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

async function generateRentalTerms({ title, category, pricePerDay, city, description }) {
  if (!ai || !apiKey) {
    return {
      terms: getDefaultTermsTemplate({ title, category, pricePerDay, city }),
      source: 'fallback_no_key'
    };
  }

  const prompt = `
You are an assistant for a peer-to-peer camera equipment rental marketplace in India.
Write a clear, simple, and fair set of rental terms and conditions for the following equipment:
- Item: ${title || 'Camera Equipment'}
- Category: ${category || 'Gear'}
- Daily Rental Price: ₹${pricePerDay || 'N/A'} per day
- Location: ${city || 'India'}
- Brief Description: ${description || 'Professional photography equipment'}

Please format the terms into 5 concise, numbered sections:
1. Permitted Use & Care (standard handling, no unauthorized repairs)
2. Pickup & Return Timings (e.g. return by 8:00 PM on the final rental date)
3. Damage & Loss Policy (renter is responsible for repairs or replacement value)
4. Late Return Fee (e.g. ₹${pricePerDay ? Math.round(pricePerDay * 0.5) : 500} per extra hour or full day rate after 2 hours)
5. Cancellation Policy (cancellations before pickup date allowed)

Keep the language professional, polite, easy to understand, and under 250 words. Do not use legal jargon.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        timeout: 10000 // 10 second timeout
      }
    });

    const termsText = response.text?.trim();
    if (!termsText) {
      throw new Error('Empty response from Gemini');
    }

    return {
      terms: termsText,
      source: 'gemini'
    };
  } catch (error) {
    console.error('Gemini API call failed, falling back to default template:', error.message);
    return {
      terms: getDefaultTermsTemplate({ title, category, pricePerDay, city }),
      source: 'fallback_error',
      error: error.message
    };
  }
}
```

### 3.3 Default Fallback Template (`services/defaultTermsTemplate.js`)
When Gemini is unreachable or offline, the server returns this structured template:
```javascript
function getDefaultTermsTemplate({ title, category, pricePerDay, city }) {
  const dailyRate = pricePerDay ? `₹${pricePerDay}` : 'the daily rental rate';
  const lateFee = pricePerDay ? `₹${Math.round(pricePerDay * 0.5)}/hour` : '₹500/hour';

  return `1. Permitted Use & Care:
The renter agrees to use the ${title || 'equipment'} strictly for lawful photography/filmmaking purposes. The equipment must be protected against water, dust, impacts, and extreme conditions. Unauthorized repairs or disassembly are strictly prohibited.

2. Pickup & Return Timings:
Equipment pickup and return must be completed in ${city || 'the agreed city'} between 9:00 AM and 8:00 PM on the scheduled rental dates. Valid government photo ID is required at the time of pickup.

3. Damage & Loss Liability:
The renter is fully liable for any physical damage, loss, or theft during the rental period. In the event of minor damage, the renter agrees to pay the actual authorized repair costs. In case of total loss or theft, full replacement value will be charged.

4. Late Return Fee:
Returns delayed beyond 1 hour past the agreed return time will incur a late fee of ${lateFee}, up to the full daily rate of ${dailyRate} per 24-hour delay.

5. Cancellation Policy:
Bookings can be cancelled by the renter without penalty at any time prior to the scheduled start date.`;
}
```

---

## 4. API Specification

#### `POST /api/ai/generate-terms`
- **Access:** Protected (`authMiddleware` - authenticated owners)
- **Request Body:**
  ```json
  {
    "title": "Sony FX3 Cinema Line Camera",
    "category": "Cameras",
    "pricePerDay": 4000,
    "city": "Mumbai",
    "description": "Full-frame cinema camera with top handle XLR unit."
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "source": "gemini",
    "disclaimer": "These terms are AI-generated guidelines and do not constitute legal advice.",
    "terms": "1. Permitted Use & Care:\nUse the Sony FX3 with certified accessories...\n\n2. Pickup & Return...\n\n3. Damage & Loss...\n\n4. Late Return Fee...\n\n5. Cancellation..."
  }
  ```
- **Fallback Response (`200 OK` with fallback indicator):**
  ```json
  {
    "success": true,
    "source": "fallback_error",
    "disclaimer": "These terms are generated from standard default guidelines and do not constitute legal advice.",
    "terms": "1. Permitted Use & Care:\n..."
  }
  ```

---

## 5. Frontend UI & UX Integration

### 5.1 Add/Edit Listing Form Integration (`listing-form.html`)
- **Terms Section Layout:**
  - Header: **Rental Terms & Conditions**
  - Action Bar:
    - Primary Button: `✨ Generate Terms with Gemini AI`
    - Secondary Action: `Use Default Template`
    - Quick Action: `Clear Terms`
  - Loading State:
    - Button displays animated spinner: *"Generating custom terms..."*
    - Button is disabled while request is in flight.
  - Textarea:
    - `<textarea id="rental_terms" name="rental_terms" rows="8" placeholder="Click 'Generate Terms with Gemini AI' or write your own custom terms here..."></textarea>`
    - Character / line count indicator.
  - Legal Disclaimer Banner:
    ```html
    <div class="ai-disclaimer-notice">
      <svg class="icon">...</svg>
      <span><strong>Note:</strong> Rental terms generated by AI are general recommendations and do not constitute formal legal advice. Please review and tailor them before publishing.</span>
    </div>
    ```

### 5.2 Listing Detail Display (`listing-detail.html`)
- Terms are displayed in a clean, readable accordion or framed card with a scrollable view.
- Disclaimer footnote shown below terms.

---

## 6. Security, Reliability & Quota Resilience

1. **Zero Secret Leakage:**
   - Client scripts never receive `process.env.GEMINI_API_KEY`.
   - All external AI requests terminate at the Node.js server.
2. **Network Timeout & Circuit Breaker:**
   - 10-second timeout on Gemini API requests.
   - If the request exceeds timeout or fails, immediately fall back to `defaultTermsTemplate.js` without blocking the owner or throwing unhandled errors.
3. **No-Block Policy for Rentals:**
   - The platform must function fully even if the AI service is completely down or the API key is not yet configured.

---

## 7. Implementation Tasks

- [ ] **Step 1: Install SDK & Setup Service**
  - Add `@google/genai` or `@google/generative-ai` to backend dependencies.
  - Configure `GEMINI_API_KEY` in `.env.example` and server startup checks.
  - Implement `services/defaultTermsTemplate.js`.
  - Implement `services/geminiService.js` with prompt engineering, timeout handling, and fallback logic.
- [ ] **Step 2: Implement Controller & Route**
  - Create `controllers/aiController.js` handling `POST /api/ai/generate-terms`.
  - Wire route into `routes/aiRoutes.js` with `authMiddleware`.
- [ ] **Step 3: Frontend Form Integration**
  - Add "Generate Terms with Gemini AI" button and disclaimer banner to `listing-form.html`.
  - Add JavaScript handler in `public/js/listing-form.js` with loading state, error toast, and auto-fill into the terms textarea.
- [ ] **Step 4: Testing & Verification**
  - Test AI terms generation with a valid Gemini API key.
  - Test fallback template generation when `GEMINI_API_KEY` is missing or invalid.
  - Test manual editing of terms in the textarea before saving.
  - Verify disclaimer visibility on both the edit form and the public listing detail page.
