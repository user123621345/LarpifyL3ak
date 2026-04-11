// Shopify admin — larpify store
const ShopifyApp = {

  defaults: {
    storeName: 'larpify',
    logoText:  'lar',
    avatar:    'EC',
    sales:     '1,169.61',
    gross:     '1,254.50',
    orders:    '2',
    conv:      '0',
    visitors:  '0',
    period:    '12h',
    fulfill:   '2',
    payments:  '1'
  },

  periodLabels: {
    '12h':   { btn: 'Last 12 hours', x: ['6:00 AM', '11:00 AM', '4:00 PM'] },
    'today': { btn: 'Today',         x: ['8:00 AM', '12:00 PM', '6:00 PM'] },
    '7d':    { btn: 'Last 7 days',   x: ['Mon', 'Wed', 'Fri'] },
    '30d':   { btn: 'Last 30 days',  x: ['Week 1', 'Week 2', 'Week 4'] },
    '90d':   { btn: 'Last 90 days',  x: ['Jan', 'Feb', 'Mar'] }
  },

  data: null,

  init() {
    this.loadData();
    this.render();
    this.bindEvents();
    this.registerSW();
    this.initCarousel();
    this.initPullToRefresh();
  },

  async registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      this._swReg = await navigator.serviceWorker.register('/sw.js');
    } catch (e) {
      console.warn('SW registration failed:', e);
    }
  },


  // ── Persistence ──────────────────────────────────────────

  loadData() {
    try {
      const s = localStorage.getItem('larpifyData');
      this.data = s ? { ...this.defaults, ...JSON.parse(s) } : { ...this.defaults };
    } catch (_) {
      this.data = { ...this.defaults };
    }
  },

  saveData() {
    localStorage.setItem('larpifyData', JSON.stringify(this.data));
  },

  // ── Render ───────────────────────────────────────────────

  render() {
    const d = this.data;
    this._set('storeNameDisplay', d.storeName);
    this._set('logoText',        d.logoText);
    this._set('avatarInitials',  d.avatar);

    this._set('dispVisitors',   parseInt(d.visitors) || 0);
    this._set('actionFulfill',  d.fulfill);
    this._set('actionPayments', d.payments);

    // Filter button period label
    const p = this.periodLabels[d.period] || this.periodLabels['12h'];
    const filterBtn = document.getElementById('filterPeriodBtn');
    if (filterBtn) filterBtn.innerHTML = p.btn + ' <span class="chevron">▾</span>';

    // Chart x-axis labels
    this._set('xLabel1', p.x[0]);
    this._set('xLabel2', p.x[1]);
    this._set('xLabel3', p.x[2]);

    // Refresh carousel stats with updated data
    if (this._refreshCarousel) this._refreshCarousel();

    // Update chart y-axis labels based on current values
    this.updateChartAxes();
  },

  updateChartAxes() {
    const d = this.data;

    const fmtMoney = (val) => {
      if (val >= 1000000) return '$' + (val / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
      if (val >= 1000)    return '$' + (val / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
      return '$' + val;
    };

    // chart0: Total sales
    const sales = parseFloat(String(d.sales).replace(/,/g, '')) || 0;
    const salesMax = Math.ceil(sales / 100) * 100 || 1000;
    this._set('yTop0', fmtMoney(salesMax));
    this._set('yMid0', fmtMoney(Math.round(salesMax / 2)));

    // chart1: Orders
    const orders = parseInt(d.orders) || 0;
    const ordersMax = Math.max(orders, 1);
    this._set('yTop1', String(ordersMax));
    this._set('yMid1', String(Math.round(ordersMax / 2)));

    // chart2: Conversion rate
    const conv = parseFloat(d.conv) || 0;
    const convMax = Math.max(Math.ceil(conv / 5) * 5, 5);
    this._set('yTop2', convMax + '%');
    this._set('yMid2', (convMax / 2) + '%');

    // chart3: Gross sales
    const gross = parseFloat(String(d.gross).replace(/,/g, '')) || 0;
    const grossMax = Math.ceil(gross / 100) * 100 || 1000;
    this._set('yTop3', fmtMoney(grossMax));
    this._set('yMid3', fmtMoney(Math.round(grossMax / 2)));
  },

  _set(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  },

  // ── Settings ─────────────────────────────────────────────

  bindEvents() {
    document.getElementById('openSettings') .addEventListener('click', () => this.openSettings());
    document.getElementById('closeSettings').addEventListener('click', () => this.closeSettings());
    document.getElementById('saveSettings') .addEventListener('click', () => this.saveSettings());
    document.getElementById('pushNotif')    .addEventListener('click', () => this.pushNotification());

    // Speed toggle
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const speed = btn.dataset.speed;
        document.getElementById('mediumField').style.display = speed === 'medium' ? '' : 'none';
        document.getElementById('slowField').style.display   = speed === 'slow'   ? '' : 'none';
      });
    });
  },

  async pushNotification() {
    const g = id => document.getElementById(id).value.trim();
    const store  = g('notifStore')  || this.data.storeName || 'My Store';
    const items  = parseInt(g('notifItems')) || 1;
    const amount = g('notifAmount') || '0.00';
    const count  = Math.min(Math.max(parseInt(g('notifCount')) || 3, 1), 50);
    const speed  = document.querySelector('.speed-btn.active')?.dataset.speed || 'fast';

    const startOrder = Math.floor(1000 + Math.random() * 9000);
    const body  = `${store} has a new order for ${items} item${items !== 1 ? 's' : ''} totaling $${amount}.`;

    if (!('Notification' in window)) {
      alert('Notifications not supported on this browser.');
      return;
    }

    if (Notification.permission === 'denied') {
      alert('Notifications are blocked. Enable them in your browser/phone settings for this site.');
      return;
    }

    if (Notification.permission !== 'granted') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') {
        alert('Notification permission was not granted.');
        return;
      }
    }

    this.closeSettings();

    // Try SW notification, fall back to direct Notification for HTTP
    let reg = null;
    try {
      reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('SW timeout')), 1500))
      ]);
    } catch (_) {}

    const icon = '/images/shopify_icon.png';

    const fire = (i, opts) => {
      const title = `Order #${startOrder + i}`;
      if (reg) {
        reg.showNotification(title, { body, icon, ...opts });
      } else {
        new Notification(title, { body, icon });
      }
    };

    const base = Date.now();

    if (speed === 'fast') {
      for (let i = 0; i < count; i++) {
        setTimeout(() => fire(i, { vibrate: [100], tag: `order-${base}-${i}` }), i * 150);
      }
    } else {
      const intervalMs = speed === 'medium'
        ? Math.min(Math.max(parseFloat(g('notifMedium')) || 3, 1), 30) * 1000
        : Math.min(Math.max(parseFloat(g('notifSlow'))   || 10, 1), 120) * 1000;

      for (let i = 0; i < count; i++) {
        setTimeout(() => fire(i, { vibrate: [200, 100, 200], tag: `order-${base}-${i}` }), i * intervalMs);
      }
    }
  },


  openSettings() {
    const d = this.data;
    document.getElementById('cfgStoreName').value = d.storeName;
    document.getElementById('cfgLogoText') .value = d.logoText;
    document.getElementById('cfgAvatar')   .value = d.avatar;
    document.getElementById('cfgSales')    .value = d.sales;
    document.getElementById('cfgGross')    .value = d.gross;
    document.getElementById('cfgOrders')   .value = d.orders;
    document.getElementById('cfgConv')     .value = d.conv;
    document.getElementById('cfgVisitors') .value = d.visitors;
    document.getElementById('cfgPeriod')   .value = d.period;
    document.getElementById('cfgFulfill')  .value = d.fulfill;
    document.getElementById('cfgPayments') .value = d.payments;
    document.getElementById('settingsPage').style.display = 'block';
    document.getElementById('mainPage')    .style.display = 'none';
  },

  closeSettings() {
    document.getElementById('settingsPage').style.display = 'none';
    document.getElementById('mainPage')    .style.display = '';
    const cw = document.getElementById('contentWrapper');
    if (cw) cw.scrollTop = 0;
  },

  saveSettings() {
    const g = id => document.getElementById(id).value.trim();
    this.data = {
      storeName: g('cfgStoreName') || this.defaults.storeName,
      logoText:  g('cfgLogoText')  || this.defaults.logoText,
      avatar:    g('cfgAvatar')    || this.defaults.avatar,
      sales:     g('cfgSales')     || this.defaults.sales,
      gross:     g('cfgGross')     || this.defaults.gross,
      orders:    g('cfgOrders')    || this.defaults.orders,
      conv:      g('cfgConv')      || this.defaults.conv,
      visitors:  g('cfgVisitors')  || '0',
      period:    g('cfgPeriod')    || this.defaults.period,
      fulfill:   g('cfgFulfill')   || this.defaults.fulfill,
      payments:  g('cfgPayments')  || this.defaults.payments
    };
    this.saveData();
    this.closeSettings();
    this.render();
  },

  drawChart() {},

  initCarousel() {
    const viewport  = document.getElementById('metricsViewport');
    const panelA    = document.getElementById('panelA');
    const panelB    = document.getElementById('panelB');
    const chartPool = document.getElementById('chartPool');
    const areaA     = document.getElementById('chartAreaA');
    const areaB     = document.getElementById('chartAreaB');

    const defs = [
      { label: 'Total sales',     short: 'Total sales',  val: () => '$' + this.data.sales },
      { label: 'Orders',          short: 'Orders',       val: () => this.data.orders       },
      { label: 'Conversion rate', short: 'Conversion',   val: () => this.data.conv + '%'   },
      { label: 'Gross sales',     short: 'Gross sales',  val: () => '$' + this.data.gross  },
    ];
    const pages = [[0,1,2],[1,2,3],[2,3,0],[3,0,1]];
    let current = 0, animating = false, swiping = false;
    let swipeDir = 0, swipeNext = 0, startX = 0, startY = 0;

    const fillStats = (prefix, pageIdx) => {
      const [p, s, t] = pages[pageIdx];
      const ids = prefix === 'n'
        ? ['ncol0label','ncol0val','ncol1label','ncol1val','ncol2label','ncol2val']
        : ['col0label',  'col0val', 'col1label',  'col1val', 'col2label',  'col2val'];
      const texts = [defs[p].label, defs[p].val(), defs[s].label, defs[s].val(), defs[t].label, defs[t].val()];
      ids.forEach((id, i) => { const el = document.getElementById(id); if (el) el.textContent = texts[i]; });
    };

    const activateChart = (pageIdx) => {
      const existing = areaA.firstElementChild;
      if (existing) chartPool.appendChild(existing);
      areaA.appendChild(document.getElementById('chart' + pageIdx));
    };

    const prepareNextChart = (pageIdx) => {
      areaB.innerHTML = '';
      const clone = document.getElementById('chart' + pageIdx).cloneNode(true);
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      areaB.appendChild(clone);
    };

    const getW = () => viewport.offsetWidth || window.innerWidth;

    // Move both panels: A at tx, B offset one full width in the opposite direction.
    // swipeDir=-1 (left): B starts at +W (right side), slides in.
    // swipeDir=+1 (right): B starts at -W (left side), slides in.
    const move = (tx, progress, dur) => {
      const w = getW();
      const tr = dur ? `transform ${dur}, opacity ${dur}` : 'none';
      panelA.style.transition = tr;
      panelA.style.transform  = `translateX(${tx}px)`;
      panelA.style.opacity    = String(1 - progress);
      panelB.style.transition = tr;
      panelB.style.transform  = `translateX(${tx - swipeDir * w}px)`;
      panelB.style.opacity    = String(progress);
    };

    this._refreshCarousel = () => fillStats('', current);

    activateChart(0);
    fillStats('', 0);

    viewport.addEventListener('touchstart', e => {
      if (animating) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      swiping = false;
    }, { passive: true });

    viewport.addEventListener('touchmove', e => {
      if (animating) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (!swiping) {
        if (Math.abs(dx) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) return;
        swiping   = true;
        swipeDir  = dx < 0 ? -1 : 1;
        swipeNext = ((current - swipeDir) % 4 + 4) % 4;
        fillStats('n', swipeNext);
        prepareNextChart(swipeNext);
        panelB.style.pointerEvents = 'none';
      }

      e.preventDefault();

      const progress = Math.min(1, Math.abs(dx) / getW());
      move(dx, progress, null);
    }, { passive: false });

    const onEnd = e => {
      if (!swiping || animating) { swiping = false; return; }
      swiping = false;

      const W   = getW();
      const dx  = (e.changedTouches ? e.changedTouches[0].clientX : startX) - startX;
      const committed = Math.abs(dx) > W / 4;
      const ease = '0.22s cubic-bezier(0.25, 1, 0.5, 1)';

      animating = true;

      if (committed) {
        // panelA exits fully in swipe direction, panelB lands at 0
        move(swipeDir * W, 1, ease);
        setTimeout(() => {
          current = swipeNext;
          fillStats('', current);
          activateChart(current);
          panelA.style.transition = 'none';
          panelA.style.transform  = 'translateX(0)';
          panelA.style.opacity    = '1';
          panelB.style.transition = 'none';
          panelB.style.opacity    = '0';
          panelB.style.pointerEvents = 'none';
          areaB.innerHTML = '';
          animating = false;
        }, 230);
      } else {
        move(0, 0, ease);
        setTimeout(() => {
          panelB.style.pointerEvents = 'none';
          areaB.innerHTML = '';
          animating = false;
        }, 230);
      }
    };

    viewport.addEventListener('touchend',    onEnd, { passive: true });
    viewport.addEventListener('touchcancel', onEnd, { passive: true });
  },

  initPullToRefresh() {
    const el        = document.getElementById('contentWrapper');
    const spinner   = document.getElementById('ptrSpinner');
    const THRESHOLD = 80;

    let startY = 0, pulling = false, refreshing = false;

    const rubberBand = dy => dy * 0.55;

    const getPull = () =>
      parseFloat(el.style.transform?.match(/translateY\(([^p]+)px\)/)?.[1] ?? 0) || 0;

    const reset = (doRefresh) => {
      pulling = false;
      el.classList.add('ptr-snap');
      if (doRefresh) {
        refreshing = true;
        el.style.transform = 'translateY(80px)';
        setTimeout(() => {
          spinner.classList.remove('visible');
          setTimeout(() => {
            el.style.transform = 'translateY(0)';
            setTimeout(() => { refreshing = false; }, 380);
          }, 180);
        }, 1100);
      } else {
        spinner.classList.remove('visible');
        setTimeout(() => { el.style.transform = 'translateY(0)'; }, 180);
      }
    };

    el.addEventListener('touchstart', e => {
      if (refreshing || el.scrollTop > 0) return;
      startY  = e.touches[0].clientY;
      pulling = true;
      el.classList.remove('ptr-snap');
    }, { passive: true });

    el.addEventListener('touchmove', e => {
      if (!pulling || refreshing) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) return;
      e.preventDefault();
      const pull = rubberBand(dy);
      el.style.transform = `translateY(${pull}px)`;
      if (pull > 20) spinner.classList.add('visible');
    }, { passive: false });

    const onEnd = () => {
      if (refreshing) return;
      const pull = getPull();
      if (pull > 0) reset(pull >= THRESHOLD);
      else pulling = false;
    };

    el.addEventListener('touchend',    onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ShopifyApp.init());
} else {
  ShopifyApp.init();
}
