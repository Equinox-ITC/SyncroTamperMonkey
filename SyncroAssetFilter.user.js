// ==UserScript==
// @name         Syncro Asset Filter
// @namespace    https://equinoxitc.syncromsp.com/
// @version      1.3.0
// @description  Filter customer assets by online status and bulk-select online devices
// @author       Equinox ITC
// @match        https://*.syncromsp.com/customer_assets*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------
    let filterOnlineOnly = false;

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function getStatusEl(row) {
        // The status icon is uniquely identified by having an inline colour style.
        // Other fa-circle icons in the row (remote icons etc.) do not have inline colours.
        return row.querySelector('i.fas.fa-circle[style*="color"], i.fa-circle[style*="color"]');
    }

    function isOnline(row) {
        const icon = getStatusEl(row);
        if (!icon) return false;
        // Walk up to the exact span.tooltipper that wraps THIS icon
        // (rows have multiple .tooltipper spans; querySelector would find the wrong one)
        const span = icon.closest('span.tooltipper');
        if (span) {
            const title = (span.getAttribute('data-original-title') || span.getAttribute('title') || '').trim();
            if (title) return title === 'Online';
        }
        // Colour fallback: confirmed online colour is rgb(42, 186, 138)
        return /rgb\(\s*42\s*,\s*186/.test(icon.style.color || '');
    }

    function getAllRows() {
        return Array.from(document.querySelectorAll('tr[data-testid^="asset-row-"]'));
    }

    // -------------------------------------------------------------------------
    // Filter logic
    // -------------------------------------------------------------------------

    function applyFilter() {
        const rows = getAllRows();
        rows.forEach(row => {
            if (filterOnlineOnly && !isOnline(row)) {
                row.style.display = 'none';
            } else {
                row.style.display = '';
            }
        });
        updateFilterBtn();
        updateCounts();
    }

    // -------------------------------------------------------------------------
    // Select-all-online logic
    // -------------------------------------------------------------------------

    function selectAllOnline() {
        const rows = getAllRows();
        let count = 0;
        rows.forEach(row => {
            if (isOnline(row)) {
                const cb = row.querySelector('input.selectedId');
                if (cb && !cb.checked) {
                    cb.checked = true;
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                    count++;
                }
            }
        });
        updateCounts();
        flashBtn(selectBtn, `${count} selected`);
    }

    // -------------------------------------------------------------------------
    // UI: inject toolbar
    // -------------------------------------------------------------------------

    let filterBtn, selectBtn, countBadge;

    function buildToolbar() {
        // Find the existing bulk-actions bar to anchor near it
        const anchor =
            document.querySelector('.bhv-bulk-actions') ||
            document.querySelector('#asset-bulk-actions') ||
            document.querySelector('.table-responsive') ||
            document.querySelector('table');

        if (!anchor) return;

        const bar = document.createElement('div');
        bar.id = 'eqx-asset-filter-bar';
        bar.style.cssText = [
            'display:flex',
            'align-items:center',
            'gap:8px',
            'padding:6px 0 8px 0',
            'flex-wrap:wrap',
        ].join(';');

        // Filter toggle button
        filterBtn = document.createElement('button');
        filterBtn.type = 'button';
        filterBtn.className = 'btn btn-sm btn-default';
        filterBtn.style.cssText = 'font-size:12px;';
        filterBtn.addEventListener('click', () => {
            filterOnlineOnly = !filterOnlineOnly;
            applyFilter();
        });

        // Select-all-online button
        selectBtn = document.createElement('button');
        selectBtn.type = 'button';
        selectBtn.className = 'btn btn-sm btn-default';
        selectBtn.style.cssText = 'font-size:12px;';
        selectBtn.textContent = 'Select All Online';
        selectBtn.addEventListener('click', selectAllOnline);

        // Count badge
        countBadge = document.createElement('span');
        countBadge.style.cssText = 'font-size:12px;color:#666;margin-left:4px;';

        bar.appendChild(filterBtn);
        bar.appendChild(selectBtn);
        bar.appendChild(countBadge);

        // Insert above the anchor element
        anchor.parentNode.insertBefore(bar, anchor);

        updateFilterBtn();
        updateCounts();
    }

    function updateFilterBtn() {
        if (!filterBtn) return;
        if (filterOnlineOnly) {
            filterBtn.textContent = 'Show All Devices';
            filterBtn.classList.remove('btn-default');
            filterBtn.classList.add('btn-success');
        } else {
            filterBtn.textContent = 'Show Online Only';
            filterBtn.classList.remove('btn-success');
            filterBtn.classList.add('btn-default');
        }
    }

    function updateCounts() {
        if (!countBadge) return;
        const rows = getAllRows();
        const total = rows.length;
        const online = rows.filter(isOnline).length;
        const visible = rows.filter(r => r.style.display !== 'none').length;

        if (filterOnlineOnly) {
            countBadge.textContent = `Showing ${visible} online of ${total} devices`;
        } else {
            countBadge.textContent = `${online} online / ${total} devices`;
        }
    }

    function flashBtn(btn, text) {
        const original = btn.textContent;
        btn.textContent = text;
        btn.classList.add('btn-info');
        btn.classList.remove('btn-default');
        setTimeout(() => {
            btn.textContent = original;
            btn.classList.remove('btn-info');
            btn.classList.add('btn-default');
        }, 2000);
    }

    // -------------------------------------------------------------------------
    // MutationObserver: wait for React to render the status dots
    // -------------------------------------------------------------------------

    let toolbarBuilt = false;

    function onMutation() {
        // Build the toolbar once the table exists
        if (!toolbarBuilt) {
            const table = document.querySelector('tr[data-testid^="asset-row-"]');
            if (table) {
                buildToolbar();
                toolbarBuilt = true;
            }
        }

        // Re-apply filter / update counts whenever DOM changes
        // (React renders status dots asynchronously)
        if (toolbarBuilt) {
            applyFilter();
        }
    }

    const observer = new MutationObserver(debounce(onMutation, 250));
    observer.observe(document.body, { childList: true, subtree: true });

    // -------------------------------------------------------------------------
    // Utility: debounce
    // -------------------------------------------------------------------------

    function debounce(fn, delay) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

})();
