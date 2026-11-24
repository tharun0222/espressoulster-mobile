(() => {
  const primaryLabels = ['Orders', 'Subscriptions', 'Overview', 'Products', 'Table bookings'];
  const labelOf = (button) => [...button.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent.trim()).filter(Boolean).join(' ');

  const style = document.createElement('style');
  style.id = 'espresso-apk-admin-style';
  if (document.getElementById(style.id)) return;
  style.textContent = adminMobileCss;

  function makeButton(source, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    const icon = source.querySelector('svg');
    if (icon) {
      const copy = icon.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      const iconFrame = document.createElement('span');
      iconFrame.className = 'admin-nav-icon';
      iconFrame.append(copy);
      button.append(iconFrame);
    }
    if (label === 'Subscriptions') {
      for (const [className, text] of [
        ['admin-nav-full-label', label], ['admin-nav-short-label', 'Plans'],
      ]) {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        button.append(span);
      }
    } else {
      button.append(label === 'Table bookings' ? 'Bookings' : label);
    }
    return button;
  }

  function connectAdmin() {
    const app = document.querySelector('.admin-app');
    const sidebar = app?.querySelector('.admin-sidebar');
    const sidebarNav = sidebar?.querySelector('nav');
    if (!sidebarNav || app.querySelector('.admin-mobile-nav')) return;

    const sources = [...sidebarNav.querySelectorAll('button')];
    const primary = primaryLabels.map((label) => sources.find((button) => labelOf(button) === label));
    if (primary.some((button) => !button)) return;

    const nav = document.createElement('nav');
    nav.className = 'admin-mobile-nav';
    nav.setAttribute('aria-label', 'Mobile administrator navigation');
    nav.innerHTML = '<span class="admin-nav-glass" aria-hidden="true"></span><svg class="admin-nav-outline" viewBox="0 0 380 64" preserveAspectRatio="none" aria-hidden="true"><defs><clipPath id="admin-nav-glass-clip" clipPathUnits="objectBoundingBox"><use href="#admin-nav-outline" transform="scale(.002631579 .015625)"/></clipPath></defs><path id="admin-nav-outline" d="M23 2H147C156 2 159 6 163 14C169 27 176 35 190 35C204 35 211 27 217 14C221 6 224 2 233 2H357C370 2 379 11 379 23V25C379 47 362 63 339 63H41C18 63 1 47 1 25V23C1 11 10 2 23 2Z" vector-effect="non-scaling-stroke"/></svg>';
    const more = document.createElement('details');
    more.className = 'admin-mobile-menu';
    const summary = document.createElement('summary');
    summary.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    summary.setAttribute('aria-label', 'Admin menu');
    const panel = document.createElement('nav');
    panel.className = 'admin-mobile-menu-panel';
    panel.setAttribute('aria-label', 'Additional administrator sections');
    more.append(summary, panel);
    more.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && more.open) {
        more.open = false;
        summary.focus();
      }
    });
    document.addEventListener('pointerdown', (event) => {
      if (more.open && !more.contains(event.target)) more.open = false;
    });
    const mirrored = new Map();

    function addButton(parent, source, label) {
      const button = makeButton(source, label);
      if (parent === nav && label === 'Overview') button.setAttribute('data-raised-tab', '');
      mirrored.set(source, button);
      button.addEventListener('click', () => {
        more.open = false;
        source.click();
        const heading = app.querySelector('.admin-header h1');
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
        window.scrollTo(0, 0);
      });
      parent.append(button);
    }
    primary.forEach((source, index) => addButton(nav, source, primaryLabels[index]));
    sources.filter((source) => !primary.includes(source)).forEach((source) => {
      addButton(panel, source, labelOf(source));
    });
    const signOut = sidebar.querySelector('.admin-signout');
    if (signOut) addButton(panel, signOut, 'Sign out');

    const brand = document.createElement('div');
    brand.className = 'admin-mobile-brand';
    const name = document.createElement('span');
    const brandIcon = sidebar.querySelector('.admin-brand svg');
    if (brandIcon) brand.append(brandIcon.cloneNode(true));
    brand.append(name);
    const customerLink = sidebar.querySelector('.admin-customer-link');
    if (customerLink) brand.append(customerLink.cloneNode(true));
    brand.append(more);

    function sync() {
      const brandLabel = sidebar.querySelector('.admin-brand > span');
      name.textContent = (brandLabel && labelOf(brandLabel)) || 'Espressoulster Coffee';
      for (const [source, button] of mirrored) {
        if (source.classList.contains('active')) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
        button.disabled = source.disabled;
        if (labelOf(source) === 'Suggestions') {
          const count = source.querySelector('b')?.textContent.trim();
          let badge = button.querySelector('.admin-mobile-pending');
          if (count && !badge) {
            badge = document.createElement('span');
            badge.className = 'admin-mobile-pending';
            button.append(badge);
          }
          if (badge) badge.textContent = count ? count + ' pending' : '';
          button.setAttribute('aria-label', count ? 'Suggestions, ' + count + ' pending' : 'Suggestions');
        }
      }
      summary.classList.toggle('active', sources.some((source) =>
        !primary.includes(source) && source.classList.contains('active')));
    }
    new MutationObserver(sync).observe(sidebar, {
      subtree: true, attributes: true, attributeFilter: ['class', 'disabled'],
      childList: true, characterData: true,
    });

    const main = app.querySelector('.admin-main');
    function formatProducts() {
      const table = main?.querySelector('.product-manage-actions')?.closest('table');
      if (!table || table.tHead?.rows[0]?.cells.length !== 6) return;
      table.closest('.table-wrap')?.classList.add('admin-products', 'admin-apk-products');
      table.setAttribute('role', 'table');
      for (const group of [table.tHead, ...table.tBodies]) {
        group.setAttribute('role', 'rowgroup');
        for (const row of group.rows) {
          row.setAttribute('role', 'row');
          for (const cell of row.cells) {
            cell.setAttribute('role', group === table.tHead ? 'columnheader' : 'cell');
          }
        }
      }
    }
    if (main) new MutationObserver(formatProducts).observe(main, { childList: true, subtree: true });
    if (!app.closest('.admin-layout')) {
      const layout = document.createElement('div');
      layout.className = 'admin-layout';
      app.before(layout);
      layout.append(app);
    }
    app.prepend(brand);
    app.append(nav);
    sync();
    formatProducts();
    document.head.append(style);
    observer.disconnect();
  }

  const observer = new MutationObserver(connectAdmin);
  observer.observe(document.body, { childList: true, subtree: true });
  connectAdmin();
})();
