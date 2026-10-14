/**
 * Default Fallback Rental Terms Template (Module 5 & EC-5.1, EC-5.2, EC-5.5)
 * Used when Gemini API is unavailable or when owners publish listings without manual terms.
 */

function getDefaultTermsTemplate({ title, category, pricePerDay, city }) {
  const itemTitle = (title && title.trim()) ? title.trim() : 'camera equipment';
  const itemCity = (city && city.trim()) ? city.trim() : 'the designated location';
  const numericPrice = Number(pricePerDay) || 0;
  const dailyRateText = numericPrice > 0 ? `₹${numericPrice.toLocaleString('en-IN')}` : 'the standard daily rental rate';
  const lateFeeText = numericPrice > 0 
    ? `₹${Math.max(150, Math.round(numericPrice * 0.25)).toLocaleString('en-IN')}/hour`
    : '₹500/hour';

  return `1. Permitted Use & Care:
The renter agrees to use the ${itemTitle} exclusively for lawful photography, filmmaking, or creative production. The equipment must be protected at all times against moisture, extreme temperatures, direct rain, sand, and accidental drops. Unauthorized disassembly, repair attempts, or firmware modifications are strictly forbidden.

2. Pickup & Return Timings:
Equipment handover and return must be completed in ${itemCity} between 9:00 AM and 8:00 PM on the agreed rental dates. The renter must present a valid government-issued photo ID (Aadhaar/Driving License/Passport) and test all functions during the physical handover inspection.

3. Damage & Loss Liability:
The renter assumes 100% financial responsibility for the equipment from handover until return. In the event of optical scratches, body damage, or water ingress, the renter will cover the full authorized manufacturer repair invoice. In the event of theft, unrecoverable damage, or total loss, the full market replacement value will be charged.

4. Late Return Fee:
To respect subsequent creators' reservations, equipment must be returned promptly. Unannounced returns delayed past the agreed hour incur a late surcharge of ${lateFeeText}, up to a maximum of the full daily charge of ${dailyRateText} per 24 hours of delay.

5. Cancellation Policy:
The renter may cancel this reservation without any penalty at any time prior to the scheduled rental start date. Cancellations requested on or after the start date cannot be accommodated.`;
}

module.exports = {
  getDefaultTermsTemplate
};
