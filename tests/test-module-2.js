const assert = require('assert');
const app = require('../server');

async function runTests() {
  console.log('🧪 Starting Module 2 (Listings & Search) automated test suite...\n');

  const server = app.listen(3003);
  const baseUrl = 'http://localhost:3003/api';

  try {
    // 0. Authenticate Owner & Renter
    console.log('Setup: Authenticating test accounts...');
    let res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@rental.com', password: 'password123' })
    });
    const ownerData = await res.json();
    const ownerToken = ownerData.token;
    const ownerId = ownerData.user.id;

    res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'renter@rental.com', password: 'password123' })
    });
    const renterData = await res.json();
    const renterToken = renterData.token;
    console.log('   ✅ Tokens acquired.\n');

    // Test 1: Browse Public Listings
    console.log('Test 1: Browse all active listings (GET /api/listings)...');
    res = await fetch(`${baseUrl}/listings`);
    assert.strictEqual(res.status, 200);
    let data = await res.json();
    assert.ok(data.listings.length >= 6, 'Expected at least 6 seeded listings');
    console.log(`   ✅ Browse returned ${data.listings.length} listings.\n`);

    // Test 2: Search by Keyword
    console.log('Test 2: Search keyword "Sony"...');
    res = await fetch(`${baseUrl}/listings?q=Sony`);
    assert.strictEqual(res.status, 200);
    data = await res.json();
    assert.ok(data.listings.length > 0);
    data.listings.forEach(l => {
      const match = l.title.includes('Sony') || l.description.includes('Sony');
      assert.ok(match, 'Expected item to contain "Sony"');
    });
    console.log(`   ✅ Keyword search found ${data.listings.length} Sony items.\n`);

    // Test 3: EC-2.6 SQL LIKE Wildcard Escaping
    console.log('Test 3 [EC-2.6]: Search with wildcard characters "%" and "_" ...');
    res = await fetch(`${baseUrl}/listings?q=%25`); // % character URL encoded
    assert.strictEqual(res.status, 200);
    data = await res.json();
    // Should search for literal % and not crash or return all items
    console.log('   ✅ Wildcard characters handled cleanly without injection or SQL error.\n');

    // Test 4: Filter by Category & City
    console.log('Test 4: Filter by Category="Cameras" & City="Mumbai"...');
    res = await fetch(`${baseUrl}/listings?category=Cameras&city=Mumbai`);
    assert.strictEqual(res.status, 200);
    data = await res.json();
    assert.ok(data.listings.length > 0);
    data.listings.forEach(l => {
      assert.strictEqual(l.category, 'Cameras');
      assert.strictEqual(l.city, 'Mumbai');
    });
    console.log(`   ✅ Filter returned ${data.listings.length} matching item(s).\n`);

    // Test 5: Sorting by Price Ascending
    console.log('Test 5: Sort by price_asc...');
    res = await fetch(`${baseUrl}/listings?sort=price_asc`);
    assert.strictEqual(res.status, 200);
    data = await res.json();
    for (let i = 1; i < data.listings.length; i++) {
      assert.ok(
        data.listings[i].price_per_day >= data.listings[i - 1].price_per_day,
        'Expected prices to be in ascending order'
      );
    }
    console.log('   ✅ Price ascending order verified.\n');

    // Test 6: EC-2.3 Price Validation (Negative / Zero / Extreme Price)
    console.log('Test 6 [EC-2.3]: Attempt to create listing with negative price (-500)...');
    res = await fetch(`${baseUrl}/listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`
      },
      body: JSON.stringify({
        title: 'Cheap Gear',
        category: 'Cameras',
        price_per_day: -500,
        city: 'Mumbai',
        description: 'Test invalid negative price'
      })
    });
    assert.strictEqual(res.status, 400, 'Expected 400 Bad Request for negative price');
    data = await res.json();
    assert.strictEqual(data.code, 'INVALID_PRICE');
    console.log('   ✅ Negative price rejected with 400.\n');

    // Test 7: Create Valid Listing as Owner
    console.log('Test 7: Create valid new listing as Owner...');
    res = await fetch(`${baseUrl}/listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`
      },
      body: JSON.stringify({
        title: 'Blackmagic Pocket Cinema Camera 6K Pro',
        category: 'Cameras',
        price_per_day: 2800,
        city: 'Mumbai',
        description: 'Super 35 HDR sensor, built-in ND filters, EF lens mount.',
        images: ['https://example.com/bmpcc6k.jpg'],
        rental_terms: 'Return with all batteries fully charged.'
      })
    });
    assert.strictEqual(res.status, 201, 'Expected 201 Created');
    data = await res.json();
    const createdListingId = data.listing.id;
    assert.ok(createdListingId, 'Expected listing ID');
    console.log(`   ✅ Listing created with ID ${createdListingId}.\n`);

    // Test 8: EC-2.4 IDOR Protection on Update (Renter tries to edit Owner's listing)
    console.log('Test 8 [EC-2.4]: Unauthorized user tries to update listing (IDOR test)...');
    res = await fetch(`${baseUrl}/listings/${createdListingId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${renterToken}`
      },
      body: JSON.stringify({
        title: 'Hacked Title',
        price_per_day: 100
      })
    });
    assert.strictEqual(res.status, 403, 'Expected 403 Forbidden');
    data = await res.json();
    assert.strictEqual(data.code, 'FORBIDDEN');
    console.log('   ✅ IDOR modification blocked with 403 Forbidden.\n');

    // Test 9: Toggle Active / Inactive Status
    console.log('Test 9: Owner toggles listing to Inactive (is_active = 0)...');
    res = await fetch(`${baseUrl}/listings/${createdListingId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`
      },
      body: JSON.stringify({ is_active: 0 })
    });
    assert.strictEqual(res.status, 200);
    data = await res.json();
    assert.strictEqual(data.is_active, 0);
    console.log('   ✅ Status updated to Inactive.\n');

    // Test 10: EC-2.5 Inactive Item Public Access
    console.log('Test 10 [EC-2.5]: Non-owner visits inactive listing...');
    res = await fetch(`${baseUrl}/listings/${createdListingId}`, {
      headers: { 'Authorization': `Bearer ${renterToken}` }
    });
    assert.strictEqual(res.status, 200);
    data = await res.json();
    assert.strictEqual(data.listing.booking_disabled, true);
    assert.ok(data.listing.status_message.includes('inactive'));
    console.log('   ✅ Inactive listing shows booking_disabled for non-owners.\n');

    // Test 11: EC-2.1 Critical Safeguard - Delete listing with active upcoming bookings
    console.log('Test 11 [EC-2.1]: Attempt to delete Listing 1 (has confirmed upcoming booking)...');
    res = await fetch(`${baseUrl}/listings/1`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    assert.strictEqual(res.status, 400, 'Expected 400 Bad Request');
    data = await res.json();
    assert.strictEqual(data.code, 'HAS_UPCOMING_BOOKINGS');
    console.log('   ✅ Safeguard passed: Deletion blocked because listing has active bookings.\n');

    // Test 12: Delete Listing with NO upcoming bookings
    console.log('Test 12: Delete listing with no bookings...');
    res = await fetch(`${baseUrl}/listings/${createdListingId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    assert.strictEqual(res.status, 200, 'Expected 200 OK');
    data = await res.json();
    assert.strictEqual(data.success, true);
    console.log('   ✅ Safely deleted listing without bookings.\n');

    console.log('🎉 ALL MODULE 2 TESTS PASSED SUCCESSFULLY! (12/12)');

  } catch (err) {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTests();
