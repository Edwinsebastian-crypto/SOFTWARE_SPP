/* =========================================================================
   modals.js — In-app modals shared by every panel.
   Replaces the browser's native alert()/confirm() with the same "am-modal"
   design the tutor panel uses (create / edit / delete confirmations).

     await SPP.modals.alert({ title, message, rows, icon, acceptLabel });
     const yes = await SPP.modals.confirm({ title, message, confirmLabel, cancelLabel });

   The modals are created the first time they are used (same approach as
   SPP.showError in api.js), so a page only pays for what it shows.
   ========================================================================= */
(function () {
    'use strict';
    const SPP = window.SPP || (window.SPP = {});

    const esc = (text) => {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    };
    const ICONS = {
        check: 'fa-solid fa-check',
        exclamation: 'fa-solid fa-triangle-exclamation',
        info: 'fa-solid fa-circle-info'
    };

    let alertOverlay = null;
    let confirmOverlay = null;
    let resolveAlert = null;
    let resolveConfirm = null;

    function close(overlay) {
        if (!overlay || overlay.style.display === 'none') return;
        overlay.style.display = 'none';
        if (overlay === alertOverlay && resolveAlert) { const done = resolveAlert; resolveAlert = null; done(); }
        if (overlay === confirmOverlay && resolveConfirm) { const done = resolveConfirm; resolveConfirm = null; done(false); }
    }

    /** Builds one overlay; reused on every call. */
    function build(kind) {
        const overlay = document.createElement('div');
        overlay.className = 'am-modal-overlay';
        overlay.style.display = 'none';
        overlay.dataset.sppModal = kind;
        overlay.innerHTML =
            '<div class="am-modal" role="dialog" aria-modal="true" aria-labelledby="spp-' + kind + '-title" style="max-width: 470px; width: 100%;">' +
            '  <button type="button" class="am-modal-close" data-spp-close aria-label="Close">' +
            '    <i class="fa-solid fa-xmark" aria-hidden="true"></i>' +
            '  </button>' +
            '  <h3 class="am-modal-title" id="spp-' + kind + '-title" style="margin-bottom: 16px;"></h3>' +
            (kind === 'alert' ? '  <div class="spp-modal-icon" style="display:flex;justify-content:center;margin-bottom:16px;"><i style="font-size:3rem;color:#6e8b7c;"></i></div>' : '') +
            '  <div class="am-modal-text" style="font-size:1rem;line-height:1.5;font-family:\'Inter\',sans-serif;white-space:pre-wrap;"></div>' +
            (kind === 'alert' ? '  <div class="spp-modal-rows" style="margin-top:14px;"></div>' : '') +
            '  <div class="am-actions" style="margin-top:26px;display:flex;gap:14px;' + (kind === 'alert' ? 'justify-content:center;' : 'justify-content:flex-end;') + '">' +
            (kind === 'confirm' ? '    <button type="button" class="am-btn-cancel" data-spp-cancel style="margin:0;"></button>' : '') +
            '    <button type="button" class="am-btn-confirm" data-spp-accept style="margin:0;"></button>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.closest('[data-spp-close]')) close(overlay);
            else if (e.target.closest('[data-spp-cancel]')) close(overlay);
            else if (e.target.closest('[data-spp-accept]')) {
                if (kind === 'alert') {
                    close(overlay);
                } else if (kind === 'confirm') {
                    overlay.style.display = 'none';
                    if (resolveConfirm) { const done = resolveConfirm; resolveConfirm = null; done(true); }
                }
            }
        });
        return overlay;
    }

    function root(kind) {
        const existing = document.querySelector('.am-modal-overlay[data-spp-modal="' + kind + '"]');
        const overlay = existing || build(kind);
        return overlay;
    }

    /** Title + message (+ optional label/value rows) with a single Accept button. */
    function alertModal({ title, message, rows, icon, acceptLabel } = {}) {
        return new Promise((resolve) => {
            const overlay = root('alert');
            overlay.querySelector('#spp-alert-title').textContent = title || 'Notice';
            const iconNode = overlay.querySelector('.spp-modal-icon i');
            const iconName = ICONS[icon] || ICONS.check;
            if (iconNode) { iconNode.className = iconName; iconNode.style.color = icon === 'exclamation' ? '#901010' : '#6e8b7c'; }
            overlay.querySelector('.am-modal-text').textContent = message || '';
            const rowsBox = overlay.querySelector('.spp-modal-rows');
            rowsBox.innerHTML = (rows || []).map((row) =>
                '<div style="display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid rgba(128,128,128,.25);">' +
                '<span style="opacity:.75">' + esc(row.label) + '</span>' +
                '<strong style="text-align:right">' + esc(row.value) + '</strong>' +
                '</div>').join('');
            rowsBox.style.display = (rows && rows.length) ? 'block' : 'none';
            const accept = overlay.querySelector('[data-spp-accept]');
            accept.textContent = acceptLabel || 'Accept';
            alertOverlay = overlay;
            resolveAlert = resolve;
            overlay.style.display = 'flex';
            accept.focus();
        });
    }

    /** Cancel / Confirm; resolves `true` only when the user confirms. */
    function confirmModal({ title, message, confirmLabel, cancelLabel, danger } = {}) {
        return new Promise((resolve) => {
            const overlay = root('confirm');
            overlay.querySelector('#spp-confirm-title').textContent = title || 'Confirm';
            overlay.querySelector('.am-modal-text').textContent = message || '';
            const accept = overlay.querySelector('[data-spp-accept]');
            const cancel = overlay.querySelector('[data-spp-cancel]');
            accept.textContent = confirmLabel || 'Confirm';
            cancel.textContent = cancelLabel || 'Cancel';
            accept.style.backgroundColor = danger === false ? '' : '#901010';
            accept.style.color = danger === false ? '' : '#fff';
            confirmOverlay = overlay;
            resolveConfirm = resolve;
            overlay.style.display = 'flex';
            cancel.focus();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        close(document.querySelector('.am-modal-overlay[data-spp-modal="alert"]'));
        close(document.querySelector('.am-modal-overlay[data-spp-modal="confirm"]'));
    });

    SPP.modals = { alert: alertModal, confirm: confirmModal };
})();
