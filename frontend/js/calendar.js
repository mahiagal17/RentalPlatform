/**
 * RentLens Interactive Availability Calendar Component (Module 3)
 * Handles client-side month browsing, disabled past/booked/blocked dates,
 * range selection, bridging gap validation (EC-3.3), and pricing calculations.
 */

class RentLensCalendar {
  constructor(options = {}) {
    this.container = options.container;
    this.listingId = options.listingId;
    this.pricePerDay = Number(options.pricePerDay) || 0;
    this.onRangeSelect = options.onRangeSelect || (() => {});
    this.onClear = options.onClear || (() => {});
    
    // State
    const now = new Date();
    this.currentYear = now.getFullYear();
    this.currentMonth = now.getMonth(); // 0-indexed
    this.todayStr = this.formatDateYMD(now);

    this.unavailableRanges = []; // Array of { start, end, type, status, reason }
    this.selectedStart = null;   // 'YYYY-MM-DD'
    this.selectedEnd = null;     // 'YYYY-MM-DD'
    this.hoveredDate = null;     // 'YYYY-MM-DD'

    if (this.container) {
      this.init();
    }
  }

  formatDateYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  parseYMD(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  calculateInclusiveDays(startDateStr, endDateStr) {
    const start = this.parseYMD(startDateStr);
    const end = this.parseYMD(endDateStr);
    const diff = end.getTime() - start.getTime();
    return Math.round(diff / (1000 * 60 * 60 * 24)) + 1;
  }

  async init() {
    this.renderSkeleton();
    await this.loadAvailability();
    this.render();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="calendar-widget">
        <div class="calendar-loading">Loading availability calendar...</div>
      </div>
    `;
  }

  async loadAvailability() {
    if (!this.listingId) return;
    try {
      const res = await fetch(`/api/listings/${this.listingId}/availability`);
      const data = await res.json();
      if (data.success && Array.isArray(data.unavailableRanges)) {
        this.unavailableRanges = data.unavailableRanges;
      }
    } catch (err) {
      console.warn('Could not load availability ranges:', err);
    }
  }

  isDateUnavailable(dateStr) {
    // 1. Past date check (EC-3.6)
    if (dateStr < this.todayStr) {
      return { unavailable: true, type: 'past', label: 'Past Date' };
    }

    // 2. Check against unavailable ranges (EC-3.3, EC-3.7)
    for (const range of this.unavailableRanges) {
      if (dateStr >= range.start && dateStr <= range.end) {
        if (range.type === 'blocked') {
          return {
            unavailable: true,
            type: 'blocked',
            reason: range.reason || 'Maintenance / Personal Use',
            label: 'Maintenance / Blackout'
          };
        }
        return {
          unavailable: true,
          type: 'booked',
          status: range.status,
          label: range.status === 'Confirmed' ? 'Reserved' : 'Pending Booking'
        };
      }
    }

    return { unavailable: false };
  }

  // EC-3.3: Checks if any date between start and end is unavailable
  hasUnavailableInRange(startDateStr, endDateStr) {
    let curr = this.parseYMD(startDateStr);
    const end = this.parseYMD(endDateStr);

    while (curr <= end) {
      const dStr = this.formatDateYMD(curr);
      const check = this.isDateUnavailable(dStr);
      if (check.unavailable) {
        return check;
      }
      curr.setDate(curr.getDate() + 1);
    }
    return null;
  }

  prevMonth() {
    const now = new Date();
    // Prevent navigating further back than current month
    if (this.currentYear === now.getFullYear() && this.currentMonth <= now.getMonth()) {
      return;
    }
    this.currentMonth--;
    if (this.currentMonth < 0) {
      this.currentMonth = 11;
      this.currentYear--;
    }
    this.render();
  }

  nextMonth() {
    this.currentMonth++;
    if (this.currentMonth > 11) {
      this.currentMonth = 0;
      this.currentYear++;
    }
    this.render();
  }

  handleDayClick(dateStr) {
    const check = this.isDateUnavailable(dateStr);
    if (check.unavailable) {
      if (check.type === 'booked') {
        showToast(`Date ${dateStr} is already booked. Please choose available dates.`, 'warning');
      } else if (check.type === 'blocked') {
        showToast(`Date ${dateStr} is reserved for equipment maintenance (${check.reason || ''}).`, 'warning');
      }
      return;
    }

    // Case 1: First click or reset
    if (!this.selectedStart || (this.selectedStart && this.selectedEnd)) {
      this.selectedStart = dateStr;
      this.selectedEnd = null;
      this.render();
      return;
    }

    // Case 2: Second click
    if (this.selectedStart && !this.selectedEnd) {
      // If clicked prior to start date, make this the new start date
      if (dateStr < this.selectedStart) {
        this.selectedStart = dateStr;
        this.selectedEnd = null;
        this.render();
        return;
      }

      // Check for intervening unavailable dates (EC-3.3)
      const conflict = this.hasUnavailableInRange(this.selectedStart, dateStr);
      if (conflict) {
        showToast('Selected date range bridges across booked or maintenance dates. Please pick continuous available dates.', 'error');
        this.selectedStart = dateStr; // Set to clicked date
        this.selectedEnd = null;
        this.render();
        return;
      }

      // Valid range! (start == end is 1 day, EC-3.1)
      this.selectedEnd = dateStr;
      const days = this.calculateInclusiveDays(this.selectedStart, this.selectedEnd);
      const totalPrice = days * this.pricePerDay;

      this.render();
      this.onRangeSelect({
        startDate: this.selectedStart,
        endDate: this.selectedEnd,
        days,
        pricePerDay: this.pricePerDay,
        totalPrice
      });
    }
  }

  handleDayHover(dateStr) {
    if (this.selectedStart && !this.selectedEnd) {
      if (dateStr >= this.selectedStart) {
        this.hoveredDate = dateStr;
        this.updateHoverHighlights();
      }
    }
  }

  clearHover() {
    this.hoveredDate = null;
    this.updateHoverHighlights();
  }

  clearSelection() {
    this.selectedStart = null;
    this.selectedEnd = null;
    this.hoveredDate = null;
    this.render();
    this.onClear();
  }

  updateHoverHighlights() {
    const days = this.container.querySelectorAll('.cal-day[data-date]');
    days.forEach(el => {
      const d = el.getAttribute('data-date');
      if (this.selectedStart && !this.selectedEnd && this.hoveredDate) {
        if (d >= this.selectedStart && d <= this.hoveredDate) {
          el.classList.add('in-hover-range');
        } else {
          el.classList.remove('in-hover-range');
        }
      } else {
        el.classList.remove('in-hover-range');
      }
    });
  }

  render() {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[this.currentMonth];

    const firstDay = new Date(this.currentYear, this.currentMonth, 1).getDay(); // 0 = Sun
    const totalDays = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();

    const isPrevDisabled = (
      this.currentYear === new Date().getFullYear() &&
      this.currentMonth <= new Date().getMonth()
    );

    let html = `
      <div class="rentlens-calendar">
        <!-- Header -->
        <div class="cal-header">
          <button type="button" class="cal-nav-btn prev-btn" ${isPrevDisabled ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div class="cal-title">${monthName} ${this.currentYear}</div>
          <button type="button" class="cal-nav-btn next-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>

        <!-- Legend -->
        <div class="cal-legend">
          <span class="legend-item"><span class="legend-dot available"></span> Available</span>
          <span class="legend-item"><span class="legend-dot booked"></span> Booked</span>
          <span class="legend-item"><span class="legend-dot blocked"></span> Maintenance</span>
        </div>

        <!-- Weekdays -->
        <div class="cal-weekdays">
          <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
        </div>

        <!-- Day Grid -->
        <div class="cal-grid">
    `;

    // Empty cells for leading padding days
    for (let i = 0; i < firstDay; i++) {
      html += `<div class="cal-day cal-day-empty"></div>`;
    }

    // Days of the month
    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(this.currentYear, this.currentMonth, day);
      const dateStr = this.formatDateYMD(date);
      const check = this.isDateUnavailable(dateStr);

      let classes = ['cal-day'];
      let badgeHtml = '';
      let title = dateStr;

      if (dateStr === this.todayStr) {
        classes.push('is-today');
      }

      if (check.unavailable) {
        classes.push('disabled');
        classes.push(check.type);
        title = `${dateStr} - ${check.label || 'Unavailable'}`;
        if (check.type === 'booked') {
          badgeHtml = '<span class="day-indicator booked-dot" title="Booked"></span>';
        } else if (check.type === 'blocked') {
          badgeHtml = '<span class="day-indicator blocked-dot" title="Maintenance"></span>';
        }
      } else {
        classes.push('available');
      }

      // Selection classes
      if (this.selectedStart === dateStr) {
        classes.push('range-start');
      }
      if (this.selectedEnd === dateStr) {
        classes.push('range-end');
      }
      if (this.selectedStart && this.selectedEnd && dateStr > this.selectedStart && dateStr < this.selectedEnd) {
        classes.push('in-range');
      }

      html += `
        <div 
          class="${classes.join(' ')}" 
          data-date="${dateStr}"
          title="${title}"
        >
          <span class="day-num">${day}</span>
          ${badgeHtml}
        </div>
      `;
    }

    html += `
        </div>

        <!-- Footer / Range status -->
        <div class="cal-footer">
          <div class="cal-status-text">
            ${this.getSelectionSummaryText()}
          </div>
          ${this.selectedStart ? `
            <button type="button" class="btn btn-outline btn-xs cal-clear-btn">Reset</button>
          ` : ''}
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.attachEvents();
  }

  getSelectionSummaryText() {
    if (!this.selectedStart) {
      return '<span style="color: var(--text-dim);">Pick rental start date</span>';
    }
    if (this.selectedStart && !this.selectedEnd) {
      return `<span style="color: var(--primary);">Start: <strong>${this.selectedStart}</strong> &bull; Select return date</span>`;
    }
    const days = this.calculateInclusiveDays(this.selectedStart, this.selectedEnd);
    return `<span style="color: var(--success); font-weight: 600;">✓ ${this.selectedStart} &rarr; ${this.selectedEnd} (${days} ${days === 1 ? 'day' : 'days'})</span>`;
  }

  attachEvents() {
    const prevBtn = this.container.querySelector('.prev-btn');
    const nextBtn = this.container.querySelector('.next-btn');
    const clearBtn = this.container.querySelector('.cal-clear-btn');

    if (prevBtn) prevBtn.addEventListener('click', () => this.prevMonth());
    if (nextBtn) nextBtn.addEventListener('click', () => this.nextMonth());
    if (clearBtn) clearBtn.addEventListener('click', () => this.clearSelection());

    const days = this.container.querySelectorAll('.cal-day[data-date]');
    days.forEach(el => {
      const d = el.getAttribute('data-date');
      el.addEventListener('click', () => this.handleDayClick(d));
      el.addEventListener('mouseenter', () => this.handleDayHover(d));
    });

    const grid = this.container.querySelector('.cal-grid');
    if (grid) {
      grid.addEventListener('mouseleave', () => this.clearHover());
    }
  }
}

window.RentLensCalendar = RentLensCalendar;
