/* The workspace recreation, and the one thing about Bizora that a screenshot
   of a single screen cannot say: the same product, speaking a different trade.

   Every label below is real. The terminology and the stage names come from the
   platform's own template migration
   (backend/prisma/migrations/20261005110000_business_templates/migration.sql)
   and the dashboard widgets from the same rows' dashboardWidgets column. The
   numbers are sample data, and the page says so.

   With JavaScript off the markup renders the tailor template, so the hero is
   never empty. */

(function () {
  'use strict';

  var TEMPLATES = {
    tailor: {
      label: 'Tailor',
      category: 'Service',
      business: 'Sana Stitch Studio',
      terms: { customers: 'Customers', items: 'Garments', measurements: 'Measurements', orders: 'Orders' },
      stages: ['New', 'Measurement', 'Cutting', 'Stitching', 'Finishing', 'Ready for pickup'],
      activeStage: 3,
      widgets: [
        { label: 'New orders', value: '7' },
        { label: 'Due today', value: '3' },
        { label: 'Overdue', value: '1', tone: 'warn' },
        { label: 'In progress', value: '12' },
        { label: 'Outstanding', value: 'Rs 84,500' },
        { label: 'Collected today', value: 'Rs 31,000', tone: 'ok' },
      ],
      columns: ['Order', 'Customer', 'Stage', 'Balance'],
      rows: [
        { ref: '#1042', title: '3-piece suit', customer: 'Rehman', stage: 'Stitching', balance: 'Rs 12,000' },
        { ref: '#1043', title: 'Winter coat', customer: 'Ayesha', stage: 'Cutting', balance: 'Rs 8,500' },
        { ref: '#1044', title: 'Kurta set', customer: 'Bilal', stage: 'Measurement', balance: 'Rs 4,200' },
      ],
    },
    furniture: {
      label: 'Furniture',
      category: 'Product',
      business: 'Al-Noor Furniture',
      terms: { customers: 'Customers', items: 'Furniture Items', measurements: 'Dimensions', orders: 'Orders' },
      stages: ['New', 'Design', 'Material Confirmation', 'Production', 'Finishing', 'Ready'],
      activeStage: 3,
      widgets: [
        { label: 'New orders', value: '4' },
        { label: 'Due today', value: '2' },
        { label: 'Overdue', value: '0' },
        { label: 'In progress', value: '9' },
        { label: 'Outstanding', value: 'Rs 246,000' },
        { label: 'Collected today', value: 'Rs 48,500', tone: 'ok' },
      ],
      columns: ['Order', 'Customer', 'Stage', 'Balance'],
      rows: [
        { ref: '#2087', title: '3-seater sofa', customer: 'Rehman', stage: 'Production', balance: 'Rs 62,000' },
        { ref: '#2088', title: 'Dining set', customer: 'Zahid', stage: 'Material Confirmation', balance: 'Rs 118,000' },
        { ref: '#2089', title: 'Office cabinets', customer: 'Karachi Print House', stage: 'Finishing', balance: 'Rs 34,000' },
      ],
    },
    'auto-workshop': {
      label: 'Auto Workshop',
      category: 'Service',
      business: 'Zahid Auto Workshop',
      terms: { customers: 'Customers', items: 'Vehicles', measurements: 'Inspections', orders: 'Jobs' },
      stages: ['Inspection', 'Estimate', 'Approved', 'Repair', 'Quality Check', 'Ready'],
      activeStage: 3,
      widgets: [
        { label: 'New jobs', value: '11' },
        { label: 'Due today', value: '5' },
        { label: 'Overdue', value: '2', tone: 'warn' },
        { label: 'In progress', value: '14' },
        { label: 'Outstanding', value: 'Rs 173,400' },
        { label: 'Collected today', value: 'Rs 22,750', tone: 'ok' },
      ],
      columns: ['Job', 'Customer', 'Stage', 'Balance'],
      rows: [
        { ref: '#3311', title: 'Suzuki Alto — engine', customer: 'Imran', stage: 'Repair', balance: 'Rs 28,000' },
        { ref: '#3312', title: 'Toyota Corolla — AC', customer: 'Sadia', stage: 'Estimate', balance: 'Rs 15,500' },
        { ref: '#3313', title: 'Honda City — brakes', customer: 'Kamran', stage: 'Quality Check', balance: 'Rs 9,800' },
      ],
    },
    printing: {
      label: 'Printing',
      category: 'Product',
      business: 'Karachi Print House',
      terms: { customers: 'Customers', items: 'Print Products', measurements: 'Specifications', orders: 'Jobs' },
      stages: ['New', 'Design', 'Production', 'Finishing', 'Ready'],
      activeStage: 2,
      widgets: [
        { label: 'New jobs', value: '18' },
        { label: 'Due today', value: '6' },
        { label: 'Overdue', value: '1', tone: 'warn' },
        { label: 'In progress', value: '23' },
        { label: 'Outstanding', value: 'Rs 96,250' },
        { label: 'Collected today', value: 'Rs 18,400', tone: 'ok' },
      ],
      columns: ['Job', 'Customer', 'Stage', 'Balance'],
      rows: [
        { ref: '#5504', title: '500 business cards', customer: 'Al-Noor Furniture', stage: 'Production', balance: 'Rs 7,500' },
        { ref: '#5505', title: 'Brochures, A5', customer: 'Sana Stitch Studio', stage: 'Design', balance: 'Rs 21,000' },
        { ref: '#5506', title: 'Wedding invites', customer: 'Ayesha', stage: 'Finishing', balance: 'Rs 14,300' },
      ],
    },
    carpenter: {
      label: 'Carpenter',
      category: 'Service',
      business: 'Kamran Woodworks',
      terms: { customers: 'Customers', items: 'Projects', measurements: 'Dimensions', orders: 'Jobs' },
      stages: ['New', 'Design', 'Material Confirmation', 'Production', 'Finishing', 'Ready'],
      activeStage: 4,
      widgets: [
        { label: 'New jobs', value: '5' },
        { label: 'Due today', value: '1' },
        { label: 'Overdue', value: '0' },
        { label: 'In progress', value: '8' },
        { label: 'Outstanding', value: 'Rs 132,000' },
        { label: 'Collected today', value: 'Rs 26,500', tone: 'ok' },
      ],
      columns: ['Job', 'Customer', 'Stage', 'Balance'],
      rows: [
        { ref: '#7710', title: 'Kitchen cabinets', customer: 'Bilal', stage: 'Finishing', balance: 'Rs 88,000' },
        { ref: '#7711', title: 'Bookshelf, walnut', customer: 'Sadia', stage: 'Production', balance: 'Rs 32,000' },
        { ref: '#7712', title: 'Door frames ×6', customer: 'Imran', stage: 'Material Confirmation', balance: 'Rs 24,000' },
      ],
    },
    generic: {
      label: 'Generic',
      category: 'General',
      business: 'Your Business',
      terms: { customers: 'Customers', items: 'Items', measurements: 'Details', orders: 'Orders' },
      stages: ['New', 'In progress', 'Ready'],
      activeStage: 1,
      widgets: [
        { label: 'New orders', value: '6' },
        { label: 'Due today', value: '2' },
        { label: 'Overdue', value: '0' },
        { label: 'In progress', value: '5' },
        { label: 'Outstanding', value: 'Rs 58,000' },
        { label: 'Collected today', value: 'Rs 12,000', tone: 'ok' },
      ],
      columns: ['Order', 'Customer', 'Stage', 'Balance'],
      rows: [
        { ref: '#1001', title: 'Consultation', customer: 'Rehman', stage: 'In progress', balance: 'Rs 15,000' },
        { ref: '#1002', title: 'Site visit', customer: 'Ayesha', stage: 'New', balance: 'Rs 6,000' },
        { ref: '#1003', title: 'Follow-up', customer: 'Kamran', stage: 'Ready', balance: 'Rs 3,500' },
      ],
    },
  };

  var MODULES = ['Customers', 'Orders', 'Catalog', 'Measurements', 'Payments', 'Notifications', 'Reports', 'Inventory'];

  function el(id) { return document.getElementById(id); }

  function renderTemplate(key) {
    var data = TEMPLATES[key];
    if (!data) return;

    el('mockBusiness').textContent = data.business;
    el('mockTrade').textContent = data.label + ' · ' + data.category;

    el('mockNavCustomers').textContent = data.terms.customers;
    el('mockNavOrders').textContent = data.terms.orders;
    el('mockNavItems').textContent = data.terms.items;
    el('mockNavMeasurements').textContent = data.terms.measurements;

    el('mockWidgets').innerHTML = data.widgets.map(function (widget) {
      return '<div class="w' + (widget.tone ? ' w-' + widget.tone : '') + '">'
        + '<span>' + widget.label + '</span><strong>' + widget.value + '</strong></div>';
    }).join('');

    el('mockStages').innerHTML = data.stages.map(function (stage, index) {
      var state = index < data.activeStage ? ' is-done' : (index === data.activeStage ? ' is-active' : '');
      return '<li class="pipe-step' + state + '"><span>' + stage + '</span></li>';
    }).join('');

    el('mockHead').innerHTML = data.columns.map(function (column) {
      return '<span>' + column + '</span>';
    }).join('');

    el('mockRows').innerHTML = data.rows.map(function (row) {
      var stageIndex = data.stages.indexOf(row.stage);
      var tone = stageIndex >= data.activeStage ? ' chip-active' : '';
      return '<div class="tr">'
        + '<span class="c-ref">' + row.ref + '<em>' + row.title + '</em></span>'
        + '<span>' + row.customer + '</span>'
        + '<span><i class="chip' + tone + '">' + row.stage + '</i></span>'
        + '<span class="c-money">' + row.balance + '</span>'
        + '</div>';
    }).join('');
  }

  function initTabs() {
    var tabs = document.querySelectorAll('[data-template-tab]');
    if (!tabs.length) return;
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (other) {
          other.classList.remove('is-active');
          other.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('is-active');
        tab.setAttribute('aria-selected', 'true');
        renderTemplate(tab.getAttribute('data-template-tab'));
      });
    });
  }

  /* Fade sections in as they arrive. Honours prefers-reduced-motion, and if
     IntersectionObserver is missing every section simply stays visible. */
  function initReveal() {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var items = document.querySelectorAll('[data-reveal]');
    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (item) { item.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    items.forEach(function (item) { observer.observe(item); });
  }

  function initModules() {
    var host = el('mockModules');
    if (!host) return;
    host.innerHTML = MODULES.map(function (name, index) {
      return '<li' + (index === 1 ? ' class="is-active"' : '') + '>' + name + '</li>';
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    initModules();
    initTabs();
    initReveal();
    renderTemplate('tailor');
  });

  window.BIZORA_TEMPLATES = TEMPLATES;
})();
