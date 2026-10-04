const bcrypt = require('bcryptjs');
const { getDb } = require('./db');
const { initDatabase } = require('./init');

function seedDatabase() {
  initDatabase();
  const db = getDb();

  // Check if already seeded
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count > 0) {
    console.log('ℹ️ Database already contains data. Skipping seed.');
    return;
  }

  console.log('🌱 Seeding initial demo data...');

  const hashedPassword = bcrypt.hashSync('password123', 10);

  // 1. Insert Users
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, phone, city, password)
    VALUES (?, ?, ?, ?, ?)
  `);

  const ownerRes = insertUser.run(
    'Arjun Mehta',
    'owner@rental.com',
    '+919820112233',
    'Mumbai',
    hashedPassword
  );
  const ownerId = Number(ownerRes.lastInsertRowid);

  const renterRes = insertUser.run(
    'Priya Sharma',
    'renter@rental.com',
    '+919811445566',
    'Delhi',
    hashedPassword
  );
  const renterId = Number(renterRes.lastInsertRowid);

  // 2. Insert Listings
  const insertListing = db.prepare(`
    INSERT INTO listings (owner_id, title, description, category, price_per_day, city, images, rental_terms, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const sampleListings = [
    {
      title: 'Sony Alpha A7 IV Full-Frame Camera',
      description: '33MP full-frame Exmor R CMOS sensor, 4K 60p 10-bit video, BIONZ XR processing, 2x batteries, 128GB V90 SD card, and dual charger included. Pristine condition, ideal for high-end wedding and documentary shoots.',
      category: 'Cameras',
      price: 2500,
      city: 'Mumbai',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=80',
        'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=1000&q=80'
      ]),
      terms: '1. Permitted Use: Handle with care, no rain or extreme dust environments without housing.\n2. Pickup & Return: Pickup 9 AM - Return 8 PM at Bandra West.\n3. Damage Policy: Renter is 100% liable for sensor damage, scratches, or mechanical failure.\n4. Late Fee: ₹500 per hour beyond scheduled return time.\n5. Cancellation: Full refund if cancelled 24 hours prior.'
    },
    {
      title: 'Canon EOS R5 8K Mirrorless Body',
      description: '45MP Full-Frame sensor capable of internal 8K RAW recording, Dual Pixel CMOS AF II, and 8 stops of in-body image stabilization. Includes 2x LP-E6NH batteries and 512GB CFexpress Type B card.',
      category: 'Cameras',
      price: 3500,
      city: 'Bengaluru',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=1000&q=80'
      ]),
      terms: '1. Permitted Use: Professional videography and photography.\n2. Return: Return by 7 PM on end date.\n3. Damage Liability: Replacement cost for CFexpress card or body damage.\n4. Late Fee: ₹600/hr.\n5. Cancellation: Permitted before rental start.'
    },
    {
      title: 'Sony FE 24-70mm f/2.8 GM II Lens',
      description: 'The world\'s lightest f/2.8 standard zoom lens with ultra-fast autofocus and razor-sharp optics across the entire frame. Comes with B+W nano-pro protection filter and hood.',
      category: 'Lenses',
      price: 1400,
      city: 'Mumbai',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1617005082133-548c4dd27f35?auto=format&fit=crop&w=1000&q=80'
      ]),
      terms: '1. Permitted Use: Do not remove the front protection filter.\n2. Inspection: Glass inspected thoroughly at handover.\n3. Damage: Scratches on front/rear element require element replacement cost.\n4. Late Fee: ₹300/hr.\n5. Cancellation: Free before pickup.'
    },
    {
      title: 'Godox SL-60W LED Continuous Video Light Kit',
      description: '60W 5600K daylight-balanced continuous LED light with Bowens mount, wireless remote, 8-foot light stand, and 60x90cm rectangular softbox. Perfect for YouTube videos, interviews, and portraits.',
      category: 'Lighting',
      price: 750,
      city: 'Delhi',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1527011046414-4781f1f94f8c?auto=format&fit=crop&w=1000&q=80'
      ]),
      terms: '1. Permitted Use: Indoor or shaded studio use only.\n2. Return: Return all cables and softbox diffusers cleanly folded.\n3. Damage: Bulb and electrical safety deposit applicable.\n4. Late Fee: ₹150/hr.\n5. Cancellation: Cancel before start date.'
    },
    {
      title: 'DJI RS 3 Pro 3-Axis Gimbal Stabilizer',
      description: 'Supports up to 4.5kg payload with automated axis locks, 1.8-inch OLED touchscreen, and SuperSmooth stabilization mode. Includes briefcase handle and quick-release plates.',
      category: 'Tripods & Support',
      price: 1600,
      city: 'Mumbai',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1000&q=80'
      ]),
      terms: '1. Permitted Use: Do not overload motors beyond rated 4.5kg.\n2. Calibration: Calibrate balance before powering on.\n3. Damage: Motor burnout or stripped gears chargeable to renter.\n4. Late Fee: ₹300/hr.\n5. Cancellation: Permitted before pickup.'
    },
    {
      title: 'Rode Wireless GO II Dual Channel Mic System',
      description: 'Ultra-compact dual-channel wireless microphone system with built-in recording, 200m range, 2x transmitters, 1x receiver, lavalier mics, and windshield deadcats.',
      category: 'Audio',
      price: 650,
      city: 'Pune',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=1000&q=80'
      ]),
      terms: '1. Permitted Use: Sound recording. Keep dry.\n2. Return: Return with all 3 USB-C charging cables.\n3. Damage: Missing transmitter charged at ₹7,000.\n4. Late Fee: ₹150/hr.\n5. Cancellation: Free before start date.'
    }
  ];

  let firstListingId = null;
  for (const item of sampleListings) {
    const res = insertListing.run(
      ownerId,
      item.title,
      item.description,
      item.category,
      item.price,
      item.city,
      item.images,
      item.terms,
      1
    );
    if (!firstListingId) {
      firstListingId = Number(res.lastInsertRowid);
    }
  }

  // 3. Insert a sample Confirmed Booking for demonstration
  // Dates: Next week (e.g. 5 days from now to 7 days from now)
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() + 5);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 7);

  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const insertBooking = db.prepare(`
    INSERT INTO bookings (
      listing_id, renter_id, owner_id, start_date, end_date,
      days_count, price_per_day, total_price, status, terms_accepted, renter_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertBooking.run(
    firstListingId,
    renterId,
    ownerId,
    startStr,
    endStr,
    3,
    2500,
    7500,
    'Confirmed',
    1,
    'Commercial photoshoot in South Mumbai.'
  );

  console.log('✅ Demo database seeded successfully:');
  console.log('   - 2 Demo Users: owner@rental.com & renter@rental.com (Password: password123)');
  console.log(`   - 6 Demo Camera & Gear Listings`);
  console.log(`   - 1 Confirmed Booking for testing availability calendar (${startStr} to ${endStr})`);
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
