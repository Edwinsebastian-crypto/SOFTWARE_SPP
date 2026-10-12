/* =========================================================================
   director.api.js — Connects the DIRECTOR panel with the API (/api):
   create practice, practice types, institutions, practice lookup and reports.
   (User management lives in users.js, also connected to the API.)
   Loaded AFTER director.js.
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
    const $ = (selector, root) => (root || document).querySelector(selector);
    const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
    const esc = SPP.escapeHtml;
    const STATUS_COLORS = { active: '#265c48', completed: '#6b7280', cancelled: '#b3261e' };

    // =====================================================================
    // 1) CREATE PRACTICE
    // =====================================================================
    const createRoot = $('#create-practice');
    // the five selects, in order: type, institution, student, tutor, advisor
    const [typeSelect, institutionSelect, studentSelect, tutorSelect, advisorSelect] = $$('.cp-input-wrap select', createRoot);
    const [startInput, endInput] = $$('.cp-date-input', createRoot);
    let practiceTypes = [];
    let institutions = [];
    let editingPracticeId = null;
    let allPractices = [];
    let isNavigatingToEdit = false;

    function resetCreatePracticeForm() {
        editingPracticeId = null;
        const mainTitle = document.querySelector('.cp-main-title');
        if (mainTitle) mainTitle.textContent = 'Practice Management';

        if (startInput) {
            startInput.value = '';
            startInput.disabled = false;
            if (startInput.parentElement) startInput.parentElement.classList.remove('is-disabled');
        }
        if (endInput) {
            endInput.value = '';
            endInput.disabled = false;
            if (endInput.parentElement) endInput.parentElement.classList.remove('is-disabled');
        }

        [typeSelect, institutionSelect, studentSelect, tutorSelect, advisorSelect].forEach(sel => {
            if (sel) {
                sel.selectedIndex = 0;
                sel.disabled = false;
                if (sel.parentElement && sel.parentElement.classList.contains('cp-input-wrap')) {
                    sel.parentElement.classList.remove('is-disabled');
                }
            }
        });

        if (createRoot) {
            createRoot.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
            createRoot.querySelectorAll('.cp-error').forEach(el => el.textContent = '');
        }

        SPP.customSelect.resetIn(createRoot);
        loadCreateOptions();
    }

    async function loadCreateOptions() {
        try {
            const [typesResult, institutionsResult, usersResult, practicesResult] = await Promise.all([
                SPP.get('/api/practice-types'), SPP.get('/api/institutions'), SPP.get('/api/users?status=active'), SPP.get('/api/practices')
            ]);
            practiceTypes = typesResult.practiceTypes;
            institutions = institutionsResult.institutions;
            
            const activeUsers = usersResult.users.filter(u => u.status === 'active' || !u.status);
            allPractices = practicesResult.practices || [];
            
            const validStudents = activeUsers.filter(u => {
                if (u.role !== 'student') return false;
                const studentPractices = allPractices.filter(p => String(p.studentDocument) === String(u.documentNumber));
                return studentPractices.length === 0 || studentPractices.every(p => p.status === 'completed' || String(p.id) === String(editingPracticeId));
            });

            const byRole = (role) => activeUsers.filter((user) => user.role === role);
            const fullName = (user) => user.firstName + ' ' + user.lastName;
            SPP.fillSelect(typeSelect, practiceTypes, 'id', 'name', 'Select Practice Type');
            SPP.fillSelect(institutionSelect, institutions, 'id', 'name', 'Select the Institution');
            SPP.fillSelect(studentSelect, validStudents, 'documentNumber', fullName, 'Select the Student');
            SPP.fillSelect(tutorSelect, byRole('tutor'), 'documentNumber', fullName, 'Select the Tutor');
            SPP.fillSelect(advisorSelect, byRole('advisor'), 'documentNumber', fullName, 'Select the Advisor');
        } catch (e) { SPP.showError(e); }
    }

    window.addEventListener('spp:dataChanged', () => {
        loadCreateOptions();
    });

    function markError(input, message) {
        if (!input) return;
        const field = input.closest('.cp-field, .ptm-field, .practice-field, .institution-field, .inst-field');
        if (!field) return;
        let box = field.querySelector('.cp-error');
        if (!box) {
            box = document.createElement('span');
            box.className = 'cp-error';
            field.appendChild(box);
        }
        if (message) {
            field.classList.add('has-error');
            box.textContent = message;
        } else {
            field.classList.remove('has-error');
        }
    }

    let pendingPracticeId = null; // practice to reveal in the Practices panel once the modal is accepted

    function setSuccessModal(title, message) {
        // Obsolete: replaced by SPP.modals.alert, left empty just in case other parts use it
    }

    /** Opens the Practices panel with `id` selected, i.e. back where the practice lives. */
    function goToPractice(id) {
        if (!practices || !practices.length || !id) return;
        const target = String(id);
        if (!practices.some((p) => String(p.id) === target)) return;
        practiceSelector.value = target;
        SPP.customSelect.sync(practiceSelector);
        showPractice(target);
        const practiceTab = document.querySelector('a[href="#practice"]');
        if (practiceTab) practiceTab.click();
        SPP.panels.resetScroll();
    }

    /** Switches to the list tab and flashes the card of `id` (create / edit feedback). */
    function revealCard(root, tabSelector, cardSelector, id) {
        if (!root || !id) return;
        const tab = $(tabSelector, root);
        if (tab) tab.click();
        const card = root.querySelector(cardSelector + '[data-id="' + String(id).replace(/"/g, '') + '"]');
        if (!card) return;

        const shell = document.querySelector('.app-shell');
        const isMobile = window.innerWidth <= 900 || window.innerHeight <= 500;

        if (isMobile && shell) {
            // On mobile ONLY .app-shell scrolls. scrollIntoView would also move body/html,
            // which hides the title under the fixed top bar and cannot be undone by the user.
            const topbar = root.querySelector('.app-topbar');
            const topbarHeight = topbar ? topbar.offsetHeight : 0;
            const cardTop = card.getBoundingClientRect().top - shell.getBoundingClientRect().top + shell.scrollTop;
            shell.scrollTo({ top: Math.max(0, cardTop - topbarHeight - 24), behavior: 'smooth' });
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        } else {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        card.classList.add('spp-card-highlight');
        setTimeout(() => card.classList.remove('spp-card-highlight'), 2400);
    }

    const saveButton = $('.cp-btn-save', createRoot);
    saveButton.addEventListener('click', async () => {
        const practice = {
            typeId: typeSelect.value, institutionId: institutionSelect.value, studentDocument: studentSelect.value,
            tutorDocument: tutorSelect.value, advisorDocument: advisorSelect.value, startDate: startInput.value, endDate: endInput.value
        };

        let hasError = false;
        [typeSelect, institutionSelect, studentSelect, tutorSelect, advisorSelect, startInput, endInput].forEach(inp => markError(inp, ''));
        
        if (!practice.typeId) { markError(typeSelect, 'Select a practice type'); hasError = true; }
        if (!practice.institutionId) { markError(institutionSelect, 'Select an institution'); hasError = true; }
        if (!practice.studentDocument) { markError(studentSelect, 'Select a student'); hasError = true; }
        if (!practice.tutorDocument) { markError(tutorSelect, 'Select a tutor'); hasError = true; }
        if (!practice.advisorDocument) { markError(advisorSelect, 'Select an advisor'); hasError = true; }
        if (!practice.startDate) { 
            markError(startInput, 'Select a start date'); 
            hasError = true; 
        } else {
            const startYear = parseInt(practice.startDate.split('-')[0], 10);
            if (isNaN(startYear) || startYear < 2000 || startYear > 2100) {
                markError(startInput, 'Please select a valid start date');
                hasError = true;
            }
        }

        if (!practice.endDate) { 
            markError(endInput, 'Select an end date'); 
            hasError = true; 
        } else {
            const endYear = parseInt(practice.endDate.split('-')[0], 10);
            if (isNaN(endYear) || endYear < 2000 || endYear > 2100) {
                markError(endInput, 'Please select a valid end date');
                hasError = true;
            } else if (practice.startDate && practice.endDate < practice.startDate) {
                markError(endInput, 'The end date cannot be earlier than the start date');
                hasError = true;
            }
        }

        if (hasError) return;
        saveButton.disabled = true;
        try {
            const isEdit = Boolean(editingPracticeId);
            let savedId = editingPracticeId;
            if (isEdit) {
                await SPP.put(`/api/practices/${editingPracticeId}`, practice);
                editingPracticeId = null;
            } else {
                const created = await SPP.post('/api/practices', practice);
                savedId = created && created.practice ? created.practice.id : null;
            }
            await loadPractices();
            loadDashboard();

            const title = isEdit ? 'Practice updated' : 'Practice created';
            const msg = isEdit ? 'The practice was updated successfully and already appears in the list.' : 'The practice was registered successfully and already appears in the list.';
            await SPP.modals.alert({ title, message: msg });

            resetCreatePracticeForm();
            if (savedId) goToPractice(savedId);
        } catch (e) { SPP.showError(e); }
        saveButton.disabled = false;
    });

    const cancelCreateButton = $('.cp-btn-cancel', createRoot);
    if (cancelCreateButton) {
        cancelCreateButton.addEventListener('click', () => {
            resetCreatePracticeForm();
        });
    }

    const createPracticeNavLink = document.querySelector('a[href="#create-practice"]');
    if (createPracticeNavLink) {
        createPracticeNavLink.addEventListener('click', () => {
            if (!isNavigatingToEdit) {
                resetCreatePracticeForm();
            }
        });
    }

    // =====================================================================
    // 2) PRACTICE TYPES
    // =====================================================================
    const typesRoot = $('#manage-practices');
    const typeForm = $('#ptm-form-register');
    const typeList = $('#ptm-type-list');
    const typeCardTemplate = $('.ptm-type-card', typeList) ? $('.ptm-type-card', typeList).cloneNode(true) : null;
    let editingTypeId = null;

    function typeCard(type) {
        const card = typeCardTemplate.cloneNode(true);
        card.dataset.id = type.id;
        card.dataset.code = type.code;
        $('.ptm-type-name', card).textContent = type.name;
        const items = $$('.ptm-meta-item', card);
        if (items[0]) items[0].innerHTML = '<span class="ptm-meta-key">Practice Code</span> ' + esc(type.code);
        if (items[1]) items[1].innerHTML = '<span class="ptm-meta-key">Semester</span> ' + esc(type.semester);
        if (items[2]) items[2].innerHTML = '<span class="ptm-meta-key">Hours</span> ' + esc(type.hours);
        
        const hasActivePractice = allPractices.some(p => p.status === 'active' && String(p.typeId) === String(type.id));
        const deleteItem = card.querySelector('.ev-item--delete');
        if (deleteItem && hasActivePractice) {
            deleteItem.classList.add('is-disabled');
            deleteItem.style.pointerEvents = 'none';
            deleteItem.style.opacity = '0.5';
            deleteItem.style.cursor = 'not-allowed';
            deleteItem.title = 'Cannot delete type with active practices';
        }
        return card;
    }

    async function loadTypes() {
        try {
            const [typeRes, pracRes] = await Promise.all([SPP.get('/api/practice-types'), SPP.get('/api/practices')]);
            practiceTypes = typeRes.practiceTypes;
            allPractices = pracRes.practices || [];
        } catch (e) { SPP.showError(e); return; }
        const pill = $('#ptm-total-pill'); if (pill) pill.textContent = practiceTypes.length + (practiceTypes.length === 1 ? ' practice types registered' : ' practice types registered');
        typeList.innerHTML = '';
        if (!practiceTypes.length) typeList.innerHTML = '<p style="padding:16px;opacity:.7">There are no practice types registered yet.</p>';
        practiceTypes.forEach((type) => typeList.appendChild(typeCard(type)));
    }

    function resetTypeForm() {
        typeForm.reset();
        editingTypeId = null;
        $$('.cp-input-wrap select', typesRoot).forEach((select) => { select.selectedIndex = 0; SPP.customSelect.rebuild(select); });
        typeForm.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));

        const registerTab = $('[data-ptm-panel="ptm-panel-register"]', typesRoot);
        if (registerTab) {
            registerTab.innerHTML = '<i class="fa-solid fa-circle-plus" aria-hidden="true"></i> <span class="ptm-tab-title">Register Practice Type</span>';
        }
        const mainHeader = $('#ptm-main-title');
        if (mainHeader) mainHeader.textContent = 'Manage practice types';
        const submitBtn = $('.cp-btn-save', typeForm);
        if (submitBtn) submitBtn.textContent = 'Register Type';
    }
    $('#ptm-btn-cancel').addEventListener('click', resetTypeForm);

    const managePracticesNavLink = document.querySelector('a[href="#manage-practices"]');
    if (managePracticesNavLink) {
        managePracticesNavLink.addEventListener('click', () => {
            resetTypeForm();
        });
    }
    typeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = { name: $('#ptm-name').value, semester: $('#ptm-semester').value, hours: $('#ptm-hours').value };
        const nameInput = $('#ptm-name');
        const semesterInput = $('#ptm-semester');
        const hoursInput = $('#ptm-hours');
        [nameInput, semesterInput, hoursInput].forEach(inp => markError(inp, ''));
        
        let hasError = false;
        if (!body.name.trim()) { markError(nameInput, 'Enter the name of the practice type'); hasError = true; }
        if (!body.semester) { markError(semesterInput, 'Select a semester'); hasError = true; }
        if (!body.hours) { markError(hoursInput, 'Enter the hours'); hasError = true; }
        if (hasError) return;

        const isTypeEdit = Boolean(editingTypeId);
        try {
            let savedId = editingTypeId;
            if (isTypeEdit) await SPP.put(`/api/practice-types/${editingTypeId}`, body);
            else savedId = (await SPP.post('/api/practice-types', body)).practiceType.id;
            resetTypeForm();
            await loadTypes();
            await loadCreateOptions();
            loadDashboard();
            revealCard(typesRoot, '[data-ptm-panel="ptm-panel-list"]', '.ptm-type-card', savedId);
            await SPP.modals.alert({
                title: isTypeEdit ? 'Practice type updated' : 'Practice type created',
                message: isTypeEdit
                    ? 'The changes were saved and the practice type now appears in the list.'
                    : 'The practice type was registered successfully and already appears in the list.'
            });
        } catch (err) { SPP.showError(err); }
    });

    SPP.panels.bindCardList(typesRoot, '.ptm-type-card', {
        view: (card) => {
            const type = practiceTypes.find((x) => String(x.id) === card.dataset.id);
            if (type) SPP.modals.alert({
                title: type.name,
                icon: 'info',
                rows: [
                    { label: 'Practice Code', value: type.code },
                    { label: 'Semester', value: type.semester },
                    { label: 'Hours', value: type.hours }
                ]
            });
        },
        edit: (card) => {
            const type = practiceTypes.find((x) => String(x.id) === card.dataset.id);
            if (!type) return;
            editingTypeId = type.id;
            $('#ptm-name').value = type.name;
            $('#ptm-semester').value = String(type.semester);
            $('#ptm-hours').value = type.hours;
            SPP.customSelect.rebuild($('#ptm-semester'));
            const trigger = $('#ptm-semester').parentElement.querySelector('.custom-select-trigger');
            if (trigger) { trigger.textContent = String(type.semester); trigger.classList.remove('is-placeholder'); }

            const registerTab = $('[data-ptm-panel="ptm-panel-register"]', typesRoot);
            if (registerTab) {
                registerTab.innerHTML = '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> <span class="ptm-tab-title">Edit Practice Type</span>';
            }
            const mainHeader = $('#ptm-main-title');
            if (mainHeader) mainHeader.textContent = 'Edit Practice Type';
            const submitBtn = $('.cp-btn-save', typeForm);
            if (submitBtn) submitBtn.textContent = 'Save Changes';

            if (registerTab) registerTab.click();
            if (window.SPP && window.SPP.panels && window.SPP.panels.resetScroll) {
                window.SPP.panels.resetScroll();
            } else {
                window.scrollTo(0, 0);
            }
        },
        delete: async (card) => {
            const type = practiceTypes.find((x) => String(x.id) === card.dataset.id);
            const confirmed = await SPP.modals.confirm({
                title: 'Delete practice type',
                message: 'The practice type "' + (type ? type.name : '') + '" will be permanently deleted.\n\nThis action cannot be undone.',
                confirmLabel: 'Delete'
            });
            if (!confirmed) return;
            try {
                await SPP.del(`/api/practice-types/${card.dataset.id}`);
                await loadTypes();
                await loadCreateOptions();
                loadDashboard();
                await SPP.modals.alert({ title: 'Practice type deleted', message: 'The practice type was deleted successfully.' });
            } catch (err) { SPP.showError(err); }
        }
    });

    // =====================================================================
    // 3) INSTITUTIONS
    // =====================================================================
    const institutionsRoot = $('#manage-institutions');
    const institutionForm = $('#inst-form-register');
    const institutionList = $('#inst-entity-list');
    const institutionCardTemplate = $('.inst-entity-card', institutionList) ? $('.inst-entity-card', institutionList).cloneNode(true) : null;
    const taxIdInput = $('#inst-taxid');
    let editingInstitutionId = null;

    function institutionCard(institution) {
        const card = institutionCardTemplate.cloneNode(true);
        card.dataset.id = institution.id;
        $('.ev-card-title', card).textContent = institution.name;
        const items = $$('.entity-meta-item', card);
        if (items[0]) items[0].innerHTML = '<span class="entity-meta-key">Tax ID</span> ' + esc(institution.taxId);
        if (items[1]) items[1].innerHTML = '<span class="entity-meta-key">Manager</span> ' + esc(institution.manager);
        if (items[2]) items[2].innerHTML = '<span class="entity-meta-key">Email</span> ' + esc(institution.email);
        $('.entity-card-desc', card).textContent = institution.address;

        const hasActivePractice = allPractices.some(p => p.status === 'active' && String(p.institutionId) === String(institution.id));
        const deleteItem = card.querySelector('.ev-item--delete');
        if (deleteItem && hasActivePractice) {
            deleteItem.classList.add('is-disabled');
            deleteItem.style.pointerEvents = 'none';
            deleteItem.style.opacity = '0.5';
            deleteItem.style.cursor = 'not-allowed';
            deleteItem.title = 'Cannot delete institution with active practices';
        }

        return card;
    }

    async function loadInstitutions() {
        try {
            const [instRes, pracRes] = await Promise.all([SPP.get('/api/institutions'), SPP.get('/api/practices')]);
            institutions = instRes.institutions;
            allPractices = pracRes.practices || [];
        } catch (e) { SPP.showError(e); return; }
        const pill = $('#inst-total-pill'); if (pill) pill.textContent = institutions.length + (institutions.length === 1 ? ' institutions registered' : ' institutions registered');
        institutionList.innerHTML = '';
        if (!institutions.length) institutionList.innerHTML = '<p style="padding:16px;opacity:.7">There are no institutions registered yet.</p>';
        institutions.forEach((institution) => institutionList.appendChild(institutionCard(institution)));
    }

    function resetInstitutionForm() {
        institutionForm.reset();
        editingInstitutionId = null;
        taxIdInput.readOnly = false;
        institutionForm.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));

        const registerTab = $('[data-inst-panel="inst-panel-register"]', institutionsRoot);
        if (registerTab) {
            registerTab.innerHTML = '<i class="fa-solid fa-circle-plus" aria-hidden="true"></i> <span class="inst-tab-title">Register Institution</span>';
        }
        const mainHeader = $('#inst-main-title');
        if (mainHeader) mainHeader.textContent = 'Manage institutions';
        const submitBtn = $('.cp-btn-save', institutionForm);
        if (submitBtn) submitBtn.textContent = 'Register Institution';
    }
    $('#inst-btn-cancel').addEventListener('click', resetInstitutionForm);

    const manageInstitutionsNavLink = document.querySelector('a[href="#manage-institutions"]');
    if (manageInstitutionsNavLink) {
        manageInstitutionsNavLink.addEventListener('click', () => {
            resetInstitutionForm();
        });
    }

    institutionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
            taxId: taxIdInput.value, manager: $('#inst-manager').value, address: $('#inst-address').value,
            name: $('#inst-name').value, email: $('#inst-email').value
        };
        
        const managerInput = $('#inst-manager');
        const addressInput = $('#inst-address');
        const nameInput = $('#inst-name');
        const emailInput = $('#inst-email');
        [taxIdInput, managerInput, addressInput, nameInput, emailInput].forEach(inp => markError(inp, ''));
        
        let hasError = false;
        if (!body.taxId.trim()) { markError(taxIdInput, 'Enter the Tax ID'); hasError = true; }
        if (!body.manager.trim()) { markError(managerInput, 'Enter the manager name'); hasError = true; }
        if (!body.address.trim()) { markError(addressInput, 'Enter the address'); hasError = true; }
        if (!body.name.trim()) { markError(nameInput, 'Enter the institution name'); hasError = true; }
        if (!body.email.trim()) { markError(emailInput, 'Enter the email'); hasError = true; }
        if (hasError) return;

        try {
            const isInstitutionEdit = Boolean(editingInstitutionId);
            let savedId = editingInstitutionId;
            if (isInstitutionEdit) await SPP.put(`/api/institutions/${editingInstitutionId}`, body);
            else savedId = (await SPP.post('/api/institutions', body)).institution.id;
            resetInstitutionForm();
            await loadInstitutions();
            await loadCreateOptions();
            loadDashboard();
            revealCard(institutionsRoot, '[data-inst-panel="inst-panel-list"]', '.inst-entity-card', savedId);
            await SPP.modals.alert({
                title: isInstitutionEdit ? 'Institution updated' : 'Institution created',
                message: isInstitutionEdit
                    ? 'The changes were saved and the institution now appears in the list.'
                    : 'The institution was registered successfully and already appears in the list.'
            });
        } catch (err) { SPP.showError(err); }
    });

    SPP.panels.bindCardList(institutionsRoot, '.inst-entity-card', {
        view: (card) => {
            const institution = institutions.find((x) => String(x.id) === card.dataset.id);
            if (institution) SPP.modals.alert({
                title: institution.name,
                icon: 'info',
                rows: [
                    { label: 'Tax ID', value: institution.taxId },
                    { label: 'Manager', value: institution.manager },
                    { label: 'Email', value: institution.email },
                    { label: 'Address', value: institution.address }
                ]
            });
        },
        edit: (card) => {
            const institution = institutions.find((x) => String(x.id) === card.dataset.id);
            if (!institution) return;
            editingInstitutionId = institution.id;
            taxIdInput.readOnly = true; // the tax id is the primary key: it is never changed
            taxIdInput.value = institution.taxId;
            $('#inst-manager').value = institution.manager;
            $('#inst-address').value = institution.address;
            $('#inst-name').value = institution.name;
            $('#inst-email').value = institution.email;

            const registerTab = $('[data-inst-panel="inst-panel-register"]', institutionsRoot);
            if (registerTab) {
                registerTab.innerHTML = '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> <span class="inst-tab-title">Edit Institution</span>';
            }
            const mainHeader = $('#inst-main-title');
            if (mainHeader) mainHeader.textContent = 'Edit Institution';
            const submitBtn = $('.cp-btn-save', institutionForm);
            if (submitBtn) submitBtn.textContent = 'Save Changes';

            if (registerTab) registerTab.click();
            if (window.SPP && window.SPP.panels && window.SPP.panels.resetScroll) {
                window.SPP.panels.resetScroll();
            } else {
                window.scrollTo(0, 0);
            }
        },
        delete: async (card) => {
            const institution = institutions.find((x) => String(x.id) === card.dataset.id);
            const confirmed = await SPP.modals.confirm({
                title: 'Delete institution',
                message: 'The institution "' + (institution ? institution.name : '') + '" will be permanently deleted.\n\nThis action cannot be undone.',
                confirmLabel: 'Delete'
            });
            if (!confirmed) return;
            try {
                await SPP.del(`/api/institutions/${card.dataset.id}`);
                await loadInstitutions();
                await loadCreateOptions();
                loadDashboard();
                await SPP.modals.alert({ title: 'Institution deleted', message: 'The institution was deleted successfully.' });
            } catch (err) { SPP.showError(err); }
        }
    });

    // =====================================================================
    // 4) PRACTICES (Director "Practices" panel: look up any practice)
    // =====================================================================
    const setField = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
                el.value = value == null ? '' : value; el.readOnly = true;
            } else {
                el.textContent = value == null ? '' : value;
            }
        }
    };
    const practicePanel = $('#practice .practice-panel');
    let practices = [];
    const selectorBox = document.createElement('div');
    selectorBox.id = 'practice-selector-box';
    selectorBox.className = 'practice-field';
    selectorBox.style.marginBottom = '24px';
    selectorBox.innerHTML = '<label for="practice-selector">Assigned practice (student)</label>' +
        '<div class="cp-input-wrap">' +
        '<select id="practice-selector"></select>' +
        '<i class="fa-solid fa-chevron-down right-icon" aria-hidden="true"></i>' +
        '</div>';
    $('.practice-form', practicePanel).insertAdjacentElement('beforebegin', selectorBox);
    SPP.customSelect.init('#practice-selector-box');
    const practiceSelector = $('#practice-selector', selectorBox);

    async function showPractice(id) {
        const practice = practices.find((x) => String(x.id) === String(id));
        if (!practice) return;
        setField('practice-name', practice.name); setField('tutor', practice.tutor); setField('hours', practice.hours);
        setField('institution', practice.institution); setField('advisor', practice.advisor); setField('semester', practice.semester);
        setField('start-date', SPP.formatDate(practice.startDate)); setField('end-date', SPP.formatDate(practice.endDate));
        setField('code', practice.code);
        const badge = $('#practice .status-badge');
        if (badge) { badge.title = practice.status; badge.textContent = practice.status; badge.style.backgroundColor = STATUS_COLORS[practice.status] || ''; }
        
        try {
            const result = await SPP.get(`/api/practices/${practice.id}/activities`);
            const activities = result.activities || [];
            const btnDel = document.getElementById('btn-delete-practice');
            if (btnDel) {
                btnDel.style.display = activities.length === 0 ? 'flex' : 'none';
            }
            const activitiesListContainer = $('#activities-list-container');
            if (activitiesListContainer) {
                activitiesListContainer.innerHTML = '';
                if (activities.length === 0) {
                    const msg = document.createElement('div');
                    msg.className = 'empty-activities-msg';
                    msg.style.padding = '20px';
                    msg.style.textAlign = 'center';
                    msg.style.color = 'var(--text-secondary, #666)';
                    msg.textContent = 'This practice currently has no activities assigned.';
                    activitiesListContainer.appendChild(msg);
                } else {
                    activities.forEach(activity => {
                        let labelText = `Activity #${activity.number}`;
                        if (activity.title && activity.title.toLowerCase() !== 'activity') {
                            labelText = activity.title;
                        }
                        const card = document.createElement('div');
                        card.className = 'logbook-action-card';
                        card.innerHTML = `
                            <div class="lb-action-left">
                                <div class="stat-icon"><i class="fa-solid fa-file-lines"></i></div>
                                <span class="lb-action-label">${SPP.escapeHtml(labelText)}</span>
                            </div>
                            <button type="button" class="lb-action-btn activity-enter-btn"
                                data-activity="${activity.number}"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
                        `;
                        activitiesListContainer.appendChild(card);
                    });
                    
                    // Bind newly created buttons
                    $$('.activity-enter-btn', activitiesListContainer).forEach((button) => {
                        button.addEventListener('click', async () => {
                            const activityNum = button.getAttribute('data-activity');
                            const activity = activities.find((a) => String(a.number) === activityNum);
                            if (!activity) return;

                            let titleText = `Activity #${activity.number}`;
                            if (activity.title && activity.title.toLowerCase() !== 'activity') {
                                titleText = activity.title;
                            }
                            
                            const titleEl = document.getElementById('evidences-title');
                            if (titleEl) titleEl.textContent = titleText;

                            // Switch panel manually
                            const actividadesPanel = document.getElementById('activities-panel');
                            const evidenciasPanel = document.getElementById('evidences-panel');
                            if (actividadesPanel && evidenciasPanel) {
                                actividadesPanel.style.display = 'none';
                                evidenciasPanel.style.display = 'flex';
                                window.scrollTo(0, 0);
                                const appShell = document.querySelector('.app-shell');
                                if (appShell) appShell.scrollTop = 0;
                            }

                            // Render details
                            setField('act-name-display', titleText);
                            setField('act-start-display', SPP.formatActivityDate(activity.assignedDate || activity.createdAt));
                            
                            const isTutorGenerated = activity.title && activity.title.toLowerCase() !== 'activity';
                            
                            const deadlineContainer = document.getElementById('act-deadline-container');
                            const descContainer = document.getElementById('act-desc-container');
                            const rightPanel = document.getElementById('act-right-panel');
                            const leftPanel = document.getElementById('act-left-panel');
                            const detailCard = document.querySelector('.act-details-card');
                            const gridRow = document.getElementById('act-grid-row');
                            
                            if (isTutorGenerated) {
                                if (deadlineContainer) deadlineContainer.style.display = 'flex';
                                if (descContainer) descContainer.style.display = 'flex';
                                if (rightPanel) rightPanel.style.display = 'flex';
                                if (leftPanel) leftPanel.style.width = '';
                                if (detailCard) detailCard.style.display = 'flex';
                                if (gridRow) gridRow.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px;';
                                
                                setField('act-end-display', activity.dueDate ? SPP.formatActivityDate(activity.dueDate) : 'without limit');
                                setField('act-desc-display', activity.description || 'No description provided');
                                
                                const filesContainer = document.getElementById('act-files-display');
                                if (activity.files && activity.files.length > 0) {
                                    filesContainer.innerHTML = activity.files.map((f) => 
                                        `<a href="${f.url}" target="_blank" class="am-file-chip" style="cursor:pointer; text-decoration:none; color:inherit; display:inline-flex">
                                            <i class="fa-solid fa-paperclip"></i>
                                            <span class="am-file-chip-name">${SPP.escapeHtml(f.name)}</span>
                                        </a>`
                                    ).join('');
                                } else {
                                    filesContainer.innerHTML = '<span style="color:#666;font-style:italic">No files attached</span>';
                                }
                            } else {
                                if (deadlineContainer) deadlineContainer.style.display = 'none';
                                if (descContainer) descContainer.style.display = 'none';
                                if (rightPanel) rightPanel.style.display = 'none';
                                if (leftPanel) leftPanel.style.width = '100%';
                                if (detailCard) detailCard.style.display = 'block';
                                if (gridRow) gridRow.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;';
                            }
                            
                            setField('act-grade-display', activity.grade != null ? Number(activity.grade).toFixed(1) : 'Not graded');
                            setField('act-hours-display', activity.totalHours || 0);

                            // Render Evidence and Feedback
                            try {
                                const [evidencesList, feedbacksList] = await Promise.all([
                                    SPP.get(`/api/activities/${activity.id}/evidences`),
                                    SPP.get(`/api/activities/${activity.id}/feedback`)
                                ]);
                                
                                const feedbackSection = document.querySelector('.feedback-section');
                                if (!feedbackSection) return;
                                
                                const templates = $$('.ev-card, .feedback-card', feedbackSection).filter(c => c.style.display === 'none');
                                if (templates.length < 2) return;
                                
                                // Clean up old children, but don't touch templates or headers
                                $$('.ev-card, .ev-empty', evidenciasPanel).forEach(node => {
                                    if (node.style.display !== 'none') node.remove();
                                });
                                $$('.feedback-card, .ev-empty', feedbackSection).forEach(node => {
                                    if (node.style.display !== 'none') node.remove();
                                });
                                
                                // Load evidences
                                if (evidencesList.evidences && evidencesList.evidences.length > 0) {
                                    // Sum hours dynamically just like the tutor view
                                    const totalHours = evidencesList.evidences.reduce((acc, ev) => acc + (Number(ev.hours) || 0), 0);
                                    const hoursDisplay = document.getElementById('act-hours-display');
                                    if (hoursDisplay) {
                                        hoursDisplay.textContent = totalHours;
                                    }

                                    evidencesList.evidences.forEach(ev => {
                                        const card = templates[0].cloneNode(true);
                                        card.style.display = 'flex';
                                        if (ev.hours != null) {
                                            $('.ev-card-title', card).textContent = ev.hours + ' Hours';
                                        } else {
                                            $('.ev-card-title', card).textContent = '0 Hours';
                                        }
                                        const descText = ev.description || 'No description provided';
                                        $('.ev-card-desc', card).textContent = descText.length > 70 ? descText.slice(0, 67) + '...' : descText;
                                        
                                        if (ev.files && ev.files.length > 0) {
                                            const filesDiv = document.createElement('div');
                                            filesDiv.style.marginTop = '12px';
                                            filesDiv.style.display = 'flex';
                                            filesDiv.style.flexWrap = 'wrap';
                                            filesDiv.style.gap = '8px';
                                            filesDiv.innerHTML = ev.files.map(f => 
                                                `<a href="${f.url}" target="_blank" class="am-file-chip" style="cursor:pointer; text-decoration:none; color:inherit; display:inline-flex">
                                                    <i class="fa-solid fa-paperclip"></i>
                                                    <span class="am-file-chip-name">${SPP.escapeHtml(f.name)}</span>
                                                </a>`
                                            ).join('');
                                            $('.ev-card-desc', card).appendChild(filesDiv);
                                        }
                                        
                                        const viewItem = $('.ev-item--view', card);
                                        if (viewItem) {
                                            viewItem.addEventListener('click', () => {
                                                const dd = viewItem.closest('.ev-dropdown');
                                                if (dd) dd.classList.remove('is-open');
                                                showDirectorEvidenceModal(ev);
                                            });
                                        }
                                        SPP.bindMenu(card);
                                        feedbackSection.insertAdjacentElement('beforebegin', card);
                                    });
                                } else {
                                    const empty = document.createElement('p');
                                    empty.className = 'ev-empty';
                                    empty.style.cssText = 'padding:16px;opacity:.7';
                                    empty.textContent = 'The student has not uploaded evidence for this activity yet.';
                                    feedbackSection.insertAdjacentElement('beforebegin', empty);
                                }
                                
                                // Load feedbacks
                                if (feedbacksList.feedback && feedbacksList.feedback.length > 0) {
                                    feedbacksList.feedback.forEach(fb => {
                                        const card = templates[1].cloneNode(true);
                                        card.style.display = 'flex';
                                        $('.feedback-role', card).textContent = fb.role === 'advisor' ? 'Advisor' : 'Tutor';
                                        $('.feedback-date', card).textContent = SPP.formatDateTime(fb.date);

                                        const words = (fb.text || '').trim().split(/\s+/).filter(Boolean);
                                        const truncatedText = words.length > 10 ? words.slice(0, 10).join(' ') + '...' : (fb.text || '');
                                        $('.feedback-content', card).textContent = truncatedText;

                                        const cardBody = $('.feedback-card-body', card);
                                        if (cardBody) {
                                            cardBody.style.cursor = 'pointer';
                                            cardBody.title = 'Click to view full feedback';
                                            cardBody.addEventListener('click', () => showDirectorFeedbackModal(fb.text));
                                        }
                                        
                                        const viewItem = $('.ev-item--view', card);
                                        if (viewItem) {
                                            viewItem.addEventListener('click', () => {
                                                const dd = viewItem.closest('.ev-dropdown');
                                                if (dd) dd.classList.remove('is-open');
                                                showDirectorFeedbackModal(fb.text);
                                            });
                                        }
                                        SPP.bindMenu(card);
                                        feedbackSection.appendChild(card);
                                    });
                                } else {
                                    const emptyFeedback = document.createElement('p');
                                    emptyFeedback.className = 'ev-empty';
                                    emptyFeedback.style.cssText = 'padding:16px;opacity:.7';
                                    emptyFeedback.textContent = 'There is no feedback yet.';
                                    feedbackSection.appendChild(emptyFeedback);
                                }
                            } catch (err) {
                                SPP.showError(err);
                            }
                        });
                    });
                }
            }
        } catch (e) { SPP.showError(e); }
        
        const values = $$('#practice #logbook-panel .lb-info-value');
        if (values.length >= 2) {
            const logbook = practice.logbook;
            values[0].textContent = logbook.finalGrade != null ? Number(logbook.finalGrade).toFixed(1) : 'Not graded';
            
            const obsElement = values[1];
            obsElement.dataset.fullObs = logbook.generalObservation || '';
            
            window.updateDirectorObsDisplay = function() {
                const activeObs = $$('#practice #logbook-panel .lb-info-value')[1];
                if (!activeObs) return;
                const isMobile = window.matchMedia("(max-width: 768px)").matches;
                const obsText = activeObs.dataset.fullObs || '';
                
                if (!obsText) {
                    activeObs.textContent = 'No observations';
                    activeObs.removeAttribute('data-tooltip');
                    return;
                }
                
                if (isMobile) {
                    activeObs.textContent = obsText;
                    activeObs.removeAttribute('data-tooltip');
                } else {
                    const words = obsText.split(/\s+/);
                    if (words.length > 10) {
                        activeObs.textContent = words.slice(0, 10).join(' ') + '...';
                        activeObs.setAttribute('data-tooltip', obsText);
                    } else {
                        activeObs.textContent = obsText;
                        activeObs.removeAttribute('data-tooltip');
                    }
                }
            };
            
            if (!window.directorObsResizeListenerAttached) {
                window.addEventListener('resize', () => window.updateDirectorObsDisplay && window.updateDirectorObsDisplay());
                window.directorObsResizeListenerAttached = true;
            }
            
            window.updateDirectorObsDisplay();
        }
        const studentName = $('#practice .lb-student-name'); if (studentName) studentName.textContent = '- ' + practice.student;
        window.SPP_CURRENT_STUDENT = {
            fullName: practice.student,
            documentType: practice.studentDetails.documentType,
            documentNumber: practice.studentDocument,
            status: practice.studentDetails.status,
            program: practice.studentDetails.program,
            email: practice.studentDetails.email
        };
    }

    async function loadPractices() {
        try { practices = (await SPP.get('/api/practices')).practices; } catch (e) { SPP.showError(e); return; }
        const enterButton = $('#practice .practice-submit');
        if (!practices.length) {
            practiceSelector.innerHTML = '<option>No practices have been created</option>';
            practiceSelector.disabled = true;
            if (enterButton) enterButton.disabled = true;
            SPP.customSelect.rebuild(practiceSelector);
            return;
        }
        practiceSelector.disabled = false; if (enterButton) enterButton.disabled = false;
        const previous = practiceSelector.value;
        practiceSelector.innerHTML = practices
            .map((p) => `<option value="${p.id}">${esc(p.student)} — ${esc(p.code)}</option>`).join('');
        if (previous && practices.some((p) => String(p.id) === previous)) practiceSelector.value = previous;
        SPP.customSelect.rebuild(practiceSelector);
        SPP.customSelect.sync(practiceSelector);
        showPractice(practiceSelector.value);
    }
    practiceSelector.addEventListener('change', () => showPractice(practiceSelector.value));

    window.addEventListener('spp:open-practice', (e) => {
        if (!practices || !practices.length) return;
        const id = String(e.detail.id);
        if (practices.some((p) => String(p.id) === id)) {
            practiceSelector.value = id;
            SPP.customSelect.sync(practiceSelector);
            showPractice(id);
            const enterButton = $('#practice .practice-submit');
            if (enterButton) {
                // Navigate directly to the logbook panel
                enterButton.click();
            }
        }
    });

    const practiceOptionsMenu = document.getElementById('practice-options-menu');
    if (practiceOptionsMenu) {
        SPP.bindMenu(practiceOptionsMenu);
    }

    const btnEditPractice = document.getElementById('btn-edit-practice');
    if (btnEditPractice) {
        btnEditPractice.addEventListener('click', async () => {
            const id = practiceSelector.value;
            const practice = practices.find((x) => String(x.id) === String(id));
            if (!practice) return;

            const dd = practiceOptionsMenu.querySelector('.ev-dropdown');
            if (dd) dd.classList.remove('is-open');

            editingPracticeId = practice.id;
            await loadCreateOptions();

            typeSelect.value = practice.typeId || '';
            institutionSelect.value = practice.institutionId || '';
            studentSelect.value = practice.studentDocument || '';
            tutorSelect.value = practice.tutorDocument || '';
            advisorSelect.value = practice.advisorDocument || '';
            
            startInput.value = practice.startDate ? String(practice.startDate).split('T')[0] : '';
            endInput.value = practice.endDate ? String(practice.endDate).split('T')[0] : '';

            typeSelect.disabled = true;
            institutionSelect.disabled = true;
            studentSelect.disabled = true;
            
            startInput.disabled = false;
            if (startInput.parentElement) startInput.parentElement.classList.remove('is-disabled');
            
            tutorSelect.disabled = false;
            advisorSelect.disabled = false;
            
            endInput.disabled = false;
            if (endInput.parentElement) endInput.parentElement.classList.remove('is-disabled');

            [typeSelect, institutionSelect, studentSelect, tutorSelect, advisorSelect].forEach(sel => SPP.customSelect.sync(sel));

            const mainTitle = document.querySelector('.cp-main-title');
            if (mainTitle) mainTitle.textContent = 'Edit Practice';

            const createPracticeTab = document.querySelector('a[href="#create-practice"]');
            if (createPracticeTab) {
                isNavigatingToEdit = true;
                createPracticeTab.click();
                isNavigatingToEdit = false;
            }
            if (window.SPP && window.SPP.panels && window.SPP.panels.resetScroll) {
                window.SPP.panels.resetScroll();
            } else {
                window.scrollTo(0, 0);
            }
        });
    }

    const btnDeletePractice = document.getElementById('btn-delete-practice');
    if (btnDeletePractice) {
        btnDeletePractice.addEventListener('click', async () => {
            const id = practiceSelector.value;
            if (!id) return;
            
            const dd = practiceOptionsMenu.querySelector('.ev-dropdown');
            if (dd) dd.classList.remove('is-open');

            const confirmed = await SPP.modals.confirm({
                title: 'Delete practice',
                message: 'Are you sure you want to delete this practice? will be permanently deleted.\n\nThis action cannot be undone.',
                confirmLabel: 'Delete'
            });
            if (!confirmed) return;
            try {
                await SPP.del(`/api/practices/${id}`);
                await loadPractices();
                loadDashboard();
                await SPP.modals.alert({ title: 'Practice deleted', message: 'The practice was deleted successfully.' });
            } catch (err) {
                SPP.showError(err);
            }
        });
    }

    // =====================================================================
    // 5) REPORTS (accreditation indicators: PostgreSQL -> MongoDB)
    // =====================================================================
    const reportsWrapper = $('#reports .reports-wrapper');
    const toolbar = document.createElement('section');
    toolbar.style.cssText = 'margin:0 0 24px;padding:18px 20px;border-radius:14px;background:var(--toolbar-bg, var(--input-bg));box-shadow:var(--input-shadow)';
    toolbar.innerHTML =
        '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">' +
        '<strong style="font-family:var(--font-serif);font-size:18px">Accreditation indicators (real data)</strong>' +
        '<div style="display:flex;gap:10px;align-items:center"><label for="ind-year">Year</label>' +
        '<input id="ind-year" type="number" min="2000" max="2100" style="width:90px;height:40px;border-radius:8px;border:1px solid #ccc;padding:0 8px">' +
        '<button type="button" class="cp-btn cp-btn-save" id="ind-generate" style="margin:0">Generate and save</button></div></div>' +
        '<div id="ind-summary" style="display:flex;flex-wrap:wrap;gap:12px;margin-top:14px"></div>' +
        '<div id="ind-detail" style="margin-top:14px;overflow-x:auto"></div>';
    $('.reports-tabs', reportsWrapper).insertAdjacentElement('beforebegin', toolbar);
    $('#ind-year').value = new Date().getFullYear();

    function renderSummary(summary) {
        const kpi = (label, value) => `<div style="padding:10px 16px;border-radius:10px;background:var(--kpi-bg, rgba(40,131,96,.12));min-width:130px"><div style="font-size:12px;opacity:.75">${label}</div><div style="font-size:22px;font-weight:700">${esc(value == null ? '—' : value)}</div></div>`;
        $('#ind-summary').innerHTML = kpi('Practices', summary.practices) + kpi('Active', summary.activePractices) + kpi('Active students', summary.students) +
            kpi('Tutors', summary.tutors) + kpi('Advisors', summary.advisors) + kpi('Institutions', summary.institutions) + kpi('Average grade', summary.averageGrade);
    }

    function renderIndicators(indicators) {
        if (!indicators.length) {
            $('#ind-detail').innerHTML = '<p style="opacity:.7">There are no indicators saved for this year yet. Click "Generate and save".</p>';
            return;
        }
        const rows = indicators.map((i) =>
            `<tr><td>${esc(i.programName)}</td><td>${esc(i.activeStudentsTotal)}</td><td>${esc(i.practicesByType.reduce((total, x) => total + x.count, 0))}</td>` +
            `<td>${esc(i.dropoutRate)}%</td><td>${esc(i.averagePracticeDurationDays)} d</td>` +
            `<td>${esc(i.teacherSupport.tutorFeedbackCount)} / ${esc(i.teacherSupport.advisorFeedbackCount)}</td></tr>`).join('');
        $('#ind-detail').innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="text-align:left;border-bottom:2px solid #288360">' +
            '<th>Program</th><th>Active students</th><th>Practices</th><th>Dropout</th><th>Avg. duration</th><th>Tutor / advisor feedback</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    async function loadReports() {
        try {
            renderSummary((await SPP.get('/api/reports/summary')).summary);
            renderIndicators((await SPP.get('/api/reports?year=' + encodeURIComponent($('#ind-year').value))).indicators);
        } catch (e) { $('#ind-detail').innerHTML = '<p style="color:#b3261e">' + esc(e.message) + '</p>'; }
    }
    $('#ind-generate').addEventListener('click', async (e) => {
        e.target.disabled = true;
        try {
            const result = await SPP.post('/api/reports/generate', { year: Number($('#ind-year').value) });
            renderIndicators(result.indicators);
            renderSummary((await SPP.get('/api/reports/summary')).summary);
        } catch (err) { SPP.showError(err); }
        e.target.disabled = false;
    });
    $('#ind-year').addEventListener('change', loadReports);

    // ---------- 5b) REPORT TABS (real data: General, Types, Practice, Feedback, Institutions) ----------
    const PROGRESS_FILLS = ['fill-green', 'fill-blue', 'fill-purple', 'fill-magenta', 'fill-orange'];
    const HDIST_FILLS = ['hdist-fill-dark', 'hdist-fill-green', 'hdist-fill-pink', 'hdist-fill-red',
        'hdist-fill-yellow', 'hdist-fill-blue', 'hdist-fill-violet'];

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value == null ? '—' : value;
    };

    /** Ranking bars (Top institutions, Most active tutors...). */
    function renderProgressList(id, items, emptyText) {
        const list = document.getElementById(id);
        if (!list) return;
        if (!items || !items.length) { list.innerHTML = '<li style="opacity:.7">' + esc(emptyText) + '</li>'; return; }
        const max = Math.max.apply(null, items.map((item) => Number(item.count) || 0));
        list.innerHTML = items.map((item, index) => {
            const count = Number(item.count) || 0;
            const width = max > 0 ? Math.max(2, Math.round((100 * count) / max)) : 0;
            return '<li>' +
                '<div class="progress-info"><span class="rank">#' + (index + 1) + '</span> <span class="name" title="' +
                esc(item.name) + '">' + esc(item.name) + '</span> <span class="count">' + esc(count) + '</span></div>' +
                '<div class="progress-bar"><div class="progress-fill ' + PROGRESS_FILLS[index % PROGRESS_FILLS.length] +
                '" style="width:' + width + '%;"></div></div>' +
                '</li>';
        }).join('');
    }

    /** Horizontal bars (Practice status, Institutions with most student teachers...). */
    function renderHdist(id, rows, footerId, footerTotal, emptyText) {
        const list = document.getElementById(id);
        if (!list) return;
        if (!rows || !rows.length) {
            list.innerHTML = '<p style="opacity:.7">' + esc(emptyText) + '</p>';
        } else {
            const max = Math.max.apply(null, rows.map((row) => Number(row.count) || 0));
            list.innerHTML = rows.map((row, index) => {
                const count = Number(row.count) || 0;
                const width = max > 0 ? Math.max(2, Math.round((100 * count) / max)) : 0;
                const value = row.value == null ? count : row.value;
                return '<div class="hdist-row">' +
                    '<span class="hdist-label" title="' + esc(row.name) + '">' + esc(row.name) + '</span>' +
                    '<div class="hdist-bar-wrap"><div class="hdist-bar-fill ' + HDIST_FILLS[index % HDIST_FILLS.length] +
                    '" style="width:' + width + '%;"></div></div>' +
                    '<span class="hdist-value">' + esc(value) + '</span>' +
                    '</div>';
            }).join('');
        }
        if (footerId) setText(footerId, footerTotal == null ? '' : 'Total : ' + footerTotal);
    }

    /** Desktop table + mobile cards share the same rows. */
    function renderTable(bodyId, cardsId, rows, columns, emptyText) {
        const body = document.getElementById(bodyId);
        const cards = document.getElementById(cardsId);
        if (!body || !cards) return;
        const cell = (row, column) => (column.format ? column.format(row[column.key]) : esc(row[column.key]));
        if (!rows || !rows.length) {
            body.innerHTML = '<tr><td colspan="' + columns.length + '" style="opacity:.7">' + esc(emptyText) + '</td></tr>';
            cards.innerHTML = '<p style="opacity:.7">' + esc(emptyText) + '</p>';
            return;
        }
        body.innerHTML = rows.map((row) => '<tr>' + columns.map((column) => '<td>' + cell(row, column) + '</td>').join('') + '</tr>').join('');
        cards.innerHTML = rows.map((row) => '<div class="types-card">' +
            columns.map((column) => '<p><strong>' + esc(column.label) + ':</strong> ' + cell(row, column) + '</p>').join('') +
            '</div>').join('');
    }

    const practiceColumns = [
        { key: 'code', label: 'Practice ID' },
        { key: 'institution', label: 'Institution' },
        { key: 'student', label: 'Student' }
    ];

    /** Fills the five tabs from GET /api/reports/dashboard (computed from PostgreSQL). */
    async function loadDashboard() {
        let dashboard;
        try {
            dashboard = (await SPP.get('/api/reports/dashboard')).dashboard;
        } catch (e) {
            SPP.showError(e);
            return;
        }

        // General
        setText('rep-gen-total', dashboard.general.totalPractices);
        setText('rep-gen-active', dashboard.general.activePractices);
        setText('rep-gen-completed', dashboard.general.completedPractices);
        renderProgressList('rep-gen-institutions', dashboard.general.topInstitutions, 'There are no practices registered yet.');
        renderProgressList('rep-gen-tutors', dashboard.general.topTutors, 'There are no tutors assigned to practices yet.');

        // Types
        renderTable('rep-types-body', 'rep-types-cards', dashboard.types, [
            { key: 'name', label: 'Practice Type' },
            { key: 'students', label: 'Students' },
            { key: 'percent', label: '% Participation', format: (value) => esc(value) + '%' }
        ], 'There are no practice types with practices yet.');

        // Practice
        setText('rep-practice-total', dashboard.practice.total);
        setText('rep-practice-no-evidence', dashboard.practice.withoutEvidence);
        renderHdist('rep-practice-status', dashboard.practice.status.map((row) =>
            ({ name: row.label, count: row.count, value: row.count + ' (' + row.percent + '%)' })),
        'rep-practice-status-total', dashboard.practice.total, 'There are no practices registered yet.');
        renderTable('rep-practice-no-evidence-body', 'rep-practice-no-evidence-cards', dashboard.practice.withoutEvidenceList,
            practiceColumns, 'Every practice already has evidence uploaded.');

        // Feedback
        setText('rep-fb-tutor', dashboard.feedback.tutorFeedback);
        setText('rep-fb-advisor', dashboard.feedback.advisorFeedback);
        setText('rep-fb-without-tutor', dashboard.feedback.practicesWithoutTutorFeedback);
        renderProgressList('rep-fb-tutors', dashboard.feedback.topTutors, 'There is no tutor feedback yet.');
        renderProgressList('rep-fb-advisors', dashboard.feedback.topAdvisors, 'There is no advisor feedback yet.');
        renderTable('rep-fb-no-tutor-body', 'rep-fb-no-tutor-cards', dashboard.feedback.withoutTutorFeedbackList,
            practiceColumns, 'Every practice already has tutor feedback.');

        // Institutions
        setText('rep-inst-total', dashboard.institutions.total);
        setText('rep-inst-active', dashboard.institutions.withActiveStudents);
        setText('rep-inst-completed-only', dashboard.institutions.completedOnly);
        renderHdist('rep-inst-distribution', dashboard.institutions.distribution.map((row) => ({ name: row.name, count: row.count })),
            'rep-inst-distribution-total', dashboard.institutions.totalStudents, 'There are no institutions with practices yet.');
        renderTable('rep-inst-details-body', 'rep-inst-details-cards', dashboard.institutions.details, [
            { key: 'institution', label: 'Institution' },
            { key: 'activeStudents', label: 'Active Student Teachers' },
            { key: 'completedStudents', label: 'Completed Student Teachers' }
        ], 'There are no institutions with practices yet.');
    }

    // =====================================================================
    // 6) NAVIGATION & MODALS
    // =====================================================================
    
    // Modals
    function descargarArchivo(urlOriginal, nombreDescarga = 'evidencia') {
        if (!urlOriginal.includes('/upload/')) {
            return window.open(urlOriginal, '_blank');
        }
        const nombreSinExtension = nombreDescarga.replace(/\.[^/.]+$/, '');
        const nombreLimpio = nombreSinExtension
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9_-]/g, '_');
        
        const urlDescarga = urlOriginal.replace('/upload/', `/upload/fl_attachment:${nombreLimpio}/`);
        const enlaceTemporal = document.createElement('a');
        enlaceTemporal.href = urlDescarga;
        enlaceTemporal.setAttribute('download', nombreDescarga);
        document.body.appendChild(enlaceTemporal);
        enlaceTemporal.click();
        document.body.removeChild(enlaceTemporal);
    }

    function showDirectorEvidenceModal(evidence) {
        let modal = document.getElementById('view-evidence-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'view-evidence-modal';
            modal.className = 'am-modal-overlay';
            modal.style.display = 'none';
            modal.style.zIndex = '10000';
            modal.innerHTML = `
                <div class="am-modal" role="dialog" aria-modal="true" style="max-width: 500px; width: 90%;">
                    <button type="button" class="am-modal-close" id="veModalCloseX" aria-label="Close">
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                    <h3 class="am-modal-title">View Evidence</h3>

                    <div class="am-form">
                        <div class="am-field">
                            <label>Hours Worked</label>
                            <input type="text" id="ve-hours" class="act-value-box act-input" readonly>
                        </div>
                        <div class="am-field">
                            <label>Description</label>
                            <textarea id="ve-desc" rows="4" readonly></textarea>
                        </div>
                        <div class="am-field">
                            <label>Files</label>
                            <div class="am-dropzone" style="display: flex; flex-direction: column; border: none; background: transparent; padding: 0; margin: 0; pointer-events: auto;">
                                <div class="am-file-list has-files" id="ve-file-list" style="width: 100%; display: flex; flex-direction: column; align-items: flex-start;"></div>
                            </div>
                        </div>
                        <div class="am-actions" style="justify-content: center;">
                            <button type="button" class="am-btn-cancel" id="veBtnCancel" style="margin: 0; "><i class="fa-solid fa-xmark" aria-hidden="true"></i>Close</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const closeModal = () => modal.style.display = 'none';
            document.getElementById('veModalCloseX').addEventListener('click', closeModal);
            document.getElementById('veBtnCancel').addEventListener('click', closeModal);
        }

        document.getElementById('ve-hours').value = evidence.hours || 0;
        document.getElementById('ve-desc').value = evidence.description || 'No description provided';
        
        const fileList = document.getElementById('ve-file-list');
        fileList.innerHTML = '';
        
        if (evidence.files && evidence.files.length > 0) {
            evidence.files.forEach(f => {
                const span = document.createElement('span');
                span.className = 'am-file-chip';
                span.style.marginBottom = '8px';
                span.style.width = '100%';
                span.style.padding = '12px 16px';
                span.style.justifyContent = 'flex-start';
                span.style.borderRadius = '24px';
                
                span.innerHTML =
                    '<i class="fa-solid fa-paperclip" aria-hidden="true" style="margin-right: 12px; font-size: 1.1rem; color: var(--clr-primary-dark, #103323);"></i>' +
                    `<a href="${f.url}" target="_blank" class="am-file-chip-name" style="text-decoration: none; color: var(--clr-primary-dark, #103323); cursor: pointer; flex: 1; font-weight: 600; font-size: 1rem; text-align: left;">${SPP.escapeHtml(f.name)}</a>` +
                    `<button type="button" class="am-file-view am-file-download-btn" title="Download" style="color:var(--clr-primary-dark, #103323); margin-left:8px; font-size: 1.3rem; background:none; border:none; cursor:pointer;"><i class="fa-solid fa-download" aria-hidden="true"></i></button>`;
                
                span.querySelector('.am-file-download-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    descargarArchivo(f.url, f.name);
                });
                
                fileList.appendChild(span);
            });
        } else {
            fileList.innerHTML = '<span style="color:#666;font-style:italic;display:block;padding:12px;">No files attached</span>';
        }

        modal.style.display = 'flex';
    }
    
    function showDirectorFeedbackModal(text) {
        let modal = document.getElementById('view-feedback-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'view-feedback-modal';
            modal.className = 'am-modal-overlay';
            modal.style.display = 'none';
            modal.style.zIndex = '10000';
            modal.innerHTML = `
                <div class="am-modal" role="dialog" aria-modal="true" style="max-width: 450px;">
                    <button type="button" class="am-modal-close" id="vfModalCloseX" aria-label="Close">
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                    <h3 class="am-modal-title" style="margin-bottom: 20px;">Feedback</h3>

                    <div id="vf-content" class="am-modal-text" style="font-size: 1rem; margin-bottom: 30px; line-height: 1.5; font-family: 'Inter', sans-serif; white-space: pre-wrap;"></div>

                    <div class="am-actions" style="justify-content: center;">
                        <button type="button" class="am-btn-confirm" id="vfBtnAccept" style="margin: 0; background-color: #901010; color: white;">Accept</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const closeModal = () => modal.style.display = 'none';
            document.getElementById('vfModalCloseX').addEventListener('click', closeModal);
            document.getElementById('vfBtnAccept').addEventListener('click', closeModal);
        }

        document.getElementById('vf-content').textContent = text || 'No feedback provided';
        modal.style.display = 'flex';
    }

    // Panel Navigation
    const panelLogbook = document.getElementById('logbook-panel');
    const panelAct = document.getElementById('activities-panel');
    const panelEv = document.getElementById('evidences-panel');

    const btnActs = $$('#activities-btn, #questions-activities-btn');
    btnActs.forEach(btn => {
        if (btn) btn.addEventListener('click', () => {
            if (panelLogbook && panelAct) {
                panelLogbook.style.display = 'none';
                panelAct.style.display = 'flex';
                const questionsPanel = document.getElementById('questions-panel');
                if (questionsPanel) questionsPanel.style.display = 'none';
                window.scrollTo(0, 0);
            }
        });
    });

    const btnActBack = document.getElementById('activitiesBack');
    if (btnActBack && panelLogbook && panelAct) {
        btnActBack.addEventListener('click', () => {
            panelAct.style.display = 'none';
            panelLogbook.style.display = 'block';
            window.scrollTo(0, 0);
        });
    }

    const btnEvBack = document.getElementById('evidencesBack');
    if (btnEvBack && panelAct && panelEv) {
        btnEvBack.addEventListener('click', () => {
            panelEv.style.display = 'none';
            panelAct.style.display = 'flex';
            window.scrollTo(0, 0);
        });
    }

    // ---------- start-up ----------
    loadCreateOptions();
    loadTypes();
    loadInstitutions();
    loadPractices();
    loadReports();
    loadDashboard();
});
