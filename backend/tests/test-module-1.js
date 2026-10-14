const assert = require('assert');
const app = require('../server');

async function runTests() {
  console.log('🧪 Starting Module 1 (Auth & Profile) automated test suite...\n');

  const server = app.listen(3002);
  const baseUrl = 'http://localhost:3002/api/auth';

  try {
    // Test 1: Successful Login with Demo User
    console.log('Test 1: Login with valid credentials...');
    let res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@rental.com', password: 'password123' })
    });
    assert.strictEqual(res.status, 200, 'Expected 200 OK on valid login');
    let data = await res.json();
    assert.ok(data.token, 'Expected JWT token in login response');
    assert.strictEqual(data.user.email, 'owner@rental.com');
    const token = data.token;
    console.log('   ✅ Valid login passed. Token received.\n');

    // Test 2: EC-1.7 Generic error on invalid password
    console.log('Test 2 [EC-1.7]: Login with incorrect password...');
    res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@rental.com', password: 'wrongpassword' })
    });
    assert.strictEqual(res.status, 401, 'Expected 401 Unauthorized');
    data = await res.json();
    assert.strictEqual(data.message, 'Invalid email or password.');
    console.log('   ✅ Generic error message confirmed.\n');

    // Test 3: EC-1.1 Duplicate email registration (case-insensitive)
    console.log('Test 3 [EC-1.1]: Register with case-insensitive existing email...');
    res = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Imposter',
        email: '  OWNER@RENTAL.COM  ',
        phone: '9876543210',
        city: 'Mumbai',
        password: 'securePassword123'
      })
    });
    assert.strictEqual(res.status, 409, 'Expected 409 Conflict for duplicate email');
    data = await res.json();
    assert.strictEqual(data.code, 'EMAIL_ALREADY_EXISTS');
    console.log('   ✅ Duplicate case-insensitive email rejected with 409.\n');

    // Test 4: EC-1.2 Short password (<8 characters)
    console.log('Test 4 [EC-1.2]: Register with short password (5 chars)...');
    res = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Short Pass',
        email: 'shortpass@example.com',
        phone: '9876543210',
        city: 'Delhi',
        password: 'short'
      })
    });
    assert.strictEqual(res.status, 400, 'Expected 400 Bad Request for short password');
    data = await res.json();
    assert.strictEqual(data.code, 'INVALID_PASSWORD_LENGTH');
    console.log('   ✅ Short password rejected with 400.\n');

    // Test 5: EC-1.5 Invalid phone number
    console.log('Test 5 [EC-1.5]: Register with invalid phone number...');
    res = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad Phone',
        email: 'badphone@example.com',
        phone: '12345',
        city: 'Delhi',
        password: 'validPassword123'
      })
    });
    assert.strictEqual(res.status, 400, 'Expected 400 Bad Request for bad phone');
    data = await res.json();
    assert.strictEqual(data.code, 'INVALID_PHONE');
    console.log('   ✅ Invalid phone rejected with 400.\n');

    // Test 6: Successful New User Registration
    console.log('Test 6: Register brand new valid user...');
    const randomEmail = `filmmaker_${Date.now()}@test.com`;
    res = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Karan Johar',
        email: randomEmail,
        phone: '9820011223',
        city: 'Mumbai',
        password: 'cinemaPassword123'
      })
    });
    assert.strictEqual(res.status, 201, 'Expected 201 Created');
    data = await res.json();
    assert.ok(data.token, 'Expected token upon registration');
    assert.strictEqual(data.user.name, 'Karan Johar');
    const newUserId = data.user.id;
    const newUserToken = data.token;
    console.log('   ✅ New user successfully created and authenticated.\n');

    // Test 7: EC-1.3 Invalid / Tampered Token
    console.log('Test 7 [EC-1.3]: Access protected /me with forged token...');
    res = await fetch(`${baseUrl}/me`, {
      headers: { 'Authorization': 'Bearer forged.tampered.token' }
    });
    assert.strictEqual(res.status, 401, 'Expected 401 Unauthorized');
    data = await res.json();
    assert.strictEqual(data.code, 'INVALID_TOKEN');
    console.log('   ✅ Tampered token safely rejected.\n');

    // Test 8: Get Profile with Valid Token
    console.log('Test 8: Access protected /me with valid token...');
    res = await fetch(`${baseUrl}/me`, {
      headers: { 'Authorization': `Bearer ${newUserToken}` }
    });
    assert.strictEqual(res.status, 200, 'Expected 200 OK');
    data = await res.json();
    assert.strictEqual(data.user.id, newUserId);
    assert.strictEqual(data.user.email, randomEmail);
    console.log('   ✅ Profile fetched successfully.\n');

    // Test 9: EC-1.6 IDOR Protection on Profile Update
    console.log('Test 9 [EC-1.6]: Profile update ignoring client-supplied userId (IDOR test)...');
    res = await fetch(`${baseUrl}/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${newUserToken}`
      },
      body: JSON.stringify({
        userId: 1, // Attempt to tamper with User 1's account
        name: 'Karan Updated',
        phone: '9988776655',
        city: 'Goa'
      })
    });
    assert.strictEqual(res.status, 200, 'Expected 200 OK');
    data = await res.json();
    // Verify that the updated user is STILL newUserId (Karan), NOT user 1
    assert.strictEqual(data.user.id, newUserId);
    assert.strictEqual(data.user.name, 'Karan Updated');
    assert.strictEqual(data.user.city, 'Goa');
    console.log('   ✅ IDOR test passed: Only authenticated user was updated.\n');

    console.log('🎉 ALL MODULE 1 TESTS PASSED SUCCESSFULLY! (9/9)');

  } catch (err) {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTests();
