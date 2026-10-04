/**
 * Core Application Framework & State Manager
 */

// Centralized Auth State
const Auth = {
  getToken() {
    return localStorage.getItem('token');
  },
  setToken(token) {
    localStorage.setItem('token', token);
  },
  getUser() {
    try {
      const data = localStorage.getItem('user');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },
  setUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
  },
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    showToast('Logged out successfully', 'info');
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 400);
  },
  isAuthenticated() {
    return !!this.getToken();
  }
};

// Toast Notifications System
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  toast.innerHTML = `
    <span style="font-weight: 700; font-size: 1.1rem;">${iconMap[type] || 'ℹ'}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Global API Fetch Helper with Auto Auth Header
async function apiFetch(endpoint, options = {}) {
  const token = Auth.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(endpoint, {
      ...options,
      headers
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401 && Auth.isAuthenticated()) {
        Auth.logout();
      }
      throw new Error(data.message || `Request failed with status ${res.status}`);
    }

    return data;
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    throw err;
  }
}

// INR Currency Formatter
function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

// Date Formatter
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

// Dynamic Navigation Header Injection
function renderNavbar(activePage = 'home') {
  const navContainer = document.querySelector('.navbar .container .nav-content');
  if (!navContainer) return;

  const user = Auth.getUser();

  navContainer.innerHTML = `
    <a href="/" class="brand">
      <div class="brand-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path>
          <circle cx="12" cy="13" r="3"></circle>
        </svg>
      </div>
      <span>RentLens</span>
    </a>

    <ul class="nav-links">
      <li><a href="/" class="nav-link ${activePage === 'home' ? 'active' : ''}">Browse Gear</a></li>
      ${user ? `
        <li><a href="/my-listings.html" class="nav-link ${activePage === 'my-listings' ? 'active' : ''}">My Listings</a></li>
        <li><a href="/my-bookings.html" class="nav-link ${activePage === 'my-bookings' ? 'active' : ''}">My Bookings</a></li>
        <li><a href="/booking-requests.html" class="nav-link ${activePage === 'requests' ? 'active' : ''}">Booking Requests</a></li>
      ` : ''}
    </ul>

    <div class="nav-auth">
      ${user ? `
        <a href="/listing-form.html" class="btn btn-primary btn-sm">
          <span>+ Add Listing</span>
        </a>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <a href="/profile.html" class="btn btn-secondary btn-sm" title="View Profile">
            <span>👤 ${user.name.split(' ')[0]}</span>
          </a>
          <button onclick="Auth.logout()" class="btn btn-outline btn-sm" title="Logout">
            <span>Logout</span>
          </button>
        </div>
      ` : `
        <a href="/login.html" class="btn btn-secondary btn-sm">Log In</a>
        <a href="/register.html" class="btn btn-primary btn-sm">Sign Up</a>
      `}
    </div>
  `;
}

// Auto-run on DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
  const currentPath = window.location.pathname;
  let activePage = 'home';
  if (currentPath.includes('my-listings')) activePage = 'my-listings';
  else if (currentPath.includes('my-bookings')) activePage = 'my-bookings';
  else if (currentPath.includes('requests')) activePage = 'requests';
  else if (currentPath.includes('profile')) activePage = 'profile';

  renderNavbar(activePage);
});
