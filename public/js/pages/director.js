/* =========================================================================
   director.js — Interface behaviour specific to the DIRECTOR panel:
   create-practice form, custom selects, tabs and the practice view navigation.
   The data (API calls) lives in director.api.js and users.js.
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
    // ---------- 1) Create practice ----------
    const createRoot = document.querySelector('#create-practice');
    const cancelButton = document.querySelector('#create-practice .cp-btn-cancel');
    const successModal = document.getElementById('successModal');
    const acceptButton = document.getElementById('modalAccept');

    if (cancelButton && createRoot) {
        cancelButton.addEventListener('click', () => {
            createRoot.querySelectorAll('input, select').forEach((input) => {
                if (input.tagName === 'SELECT') input.selectedIndex = 0;
                else input.value = '';
            });
            SPP.customSelect.resetIn(createRoot);
        });
    }

    // "Accept" on the success modal closes it and clears the form
    if (acceptButton) {
        acceptButton.addEventListener('click', () => {
            successModal.style.display = 'none';
            if (cancelButton) cancelButton.click();
        });
    }

    // The date picker opens on the first click anywhere on the field
    document.querySelectorAll('.cp-date-input').forEach((input) => {
        input.addEventListener('click', function () {
            if (typeof this.showPicker === 'function') {
                try { this.showPicker(); } catch (e) { /* noop */ }
            }
        });
    });

    // ---------- 2) Custom selects ----------
    ['#create-practice', '#manage-practices', '#manage-institutions', '#manage-users']
        .forEach((selector) => SPP.customSelect.init(selector));

    // ---------- 3) Tabs ----------
    // Reports
    const reportPanelIds = ['tab-general', 'tab-types', 'tab-practice', 'tab-feedback', 'tab-institutions'];
    SPP.panels.wireTabs(
        Array.from(document.querySelectorAll('#reports .reports-tab-btn')),
        reportPanelIds.map((id) => document.getElementById(id)).filter(Boolean),
        (_button, index) => reportPanelIds[index]
    );

    // Practice types
    SPP.panels.wireTabs(
        Array.from(document.querySelectorAll('#manage-practices .ptm-tab-btn')),
        Array.from(document.querySelectorAll('#manage-practices .ptm-panel')),
        (button) => button.getAttribute('data-ptm-panel')
    );

    // Institutions
    SPP.panels.wireTabs(
        Array.from(document.querySelectorAll('#manage-institutions .inst-tab-btn')),
        Array.from(document.querySelectorAll('#manage-institutions .inst-panel')),
        (button) => button.getAttribute('data-inst-panel')
    );

    // ---------- 4) Input masks ----------
    const hoursInput = document.getElementById('ptm-hours');
    if (hoursInput) hoursInput.addEventListener('input', () => { hoursInput.value = hoursInput.value.replace(/\D/g, ''); });

    const taxIdInput = document.getElementById('inst-taxid');
    if (taxIdInput) {
        taxIdInput.maxLength = 10; // nitEntidad is varchar(10) in the legacy schema
        taxIdInput.addEventListener('input', () => { taxIdInput.value = taxIdInput.value.replace(/[^\d-]/g, ''); });
    }

    // ---------- 5) Practice panel (same navigation as the student) ----------
    SPP.panels.wireStandardFlow({ scope: '#practice', questions: 'placeholder' });
    // "..." menus of the evidence / feedback cards of the practice panel
    SPP.panels.bindCardList(document.getElementById('practice'), '.ev-card', {});
});
