/* =========================================================================
   users.js — "Manage Users" module of the Director panel.
   Loaded AFTER shell.js and director.js. Everything lives inside an IIFE so it
   does not clash with the variables/functions of director.js.

   Contains:
     · Register / List tabs
     · 4-step registration wizard with per-step validation
     · Credential card that updates live
     · List with search, filters and pagination
   ========================================================================= */

(function () {
    'use strict';

    const root = document.getElementById('manage-users');
    if (!root) return;

    /* ----------------------------------------------------------------------
       System catalogs (they match the roles of the SPP login)
       ---------------------------------------------------------------------- */
    const ROLES = {
        student: { name: 'Student', icon: 'fa-graduation-cap', cssClass: '' },
        tutor: { name: 'Academic Tutor', icon: 'fa-user', cssClass: 'um-pill--tutor' },
        advisor: { name: 'Pedagogical Advisor', icon: 'fa-user-group', cssClass: 'um-pill--advisor' },
        director: { name: 'Director', icon: 'fa-briefcase', cssClass: 'um-pill--director' }
    };

    const STATUS_LABELS = {
        active: 'Active',
        pending: 'Pending',
        inactive: 'Inactive'
    };

    const STATUS_DESCRIPTIONS = {
        active: 'The user enters the portal as soon as they receive their credentials.',
        pending: 'The user must activate the account from the e-mail before signing in.',
        inactive: 'The account is created but has no access to the portal.'
    };

    const DOMAIN = '@' + (window.SPP_DOMAIN || 'university.edu');

    // The users come from the database (GET /api/users)
    let users = [];
    let allPractices = [];

    /* ----------------------------------------------------------------------
       Utilities
       ---------------------------------------------------------------------- */
    const $ = (selector) => root.querySelector(selector);
    const $$ = (selector) => Array.from(root.querySelectorAll(selector));
    const escapeHtml = SPP.escapeHtml;

    /* Programs from the database (programa table) for students and tutors */
    async function loadPrograms() {
        try {
            const { programs } = await SPP.get('/api/users/programs');
            const select = $('#um-program');
            const placeholder = select.options[0];
            select.innerHTML = '';
            select.appendChild(placeholder);
            programs.forEach((program) => {
                const option = document.createElement('option');
                option.value = program.name;
                option.textContent = program.name;
                option.setAttribute('data-faculty', program.faculty || '');
                select.appendChild(option);
            });
            select.selectedIndex = 0;
            SPP.customSelect.rebuild(select);
        } catch (err) {
            showNotice('Could not load the programs', err.message);
        }
    }

    async function loadUsers() {
        try {
            const [res, pracRes] = await Promise.all([
                SPP.get('/api/users'),
                SPP.get('/api/practices')
            ]);
            users = res.users ? res.users.filter(u => u.role !== 'director') : [];
            allPractices = pracRes.practices || [];
        } catch (err) {
            users = [];
            allPractices = [];
            showNotice('Could not load the users', err.message);
        }
        renderList();
        window.dispatchEvent(new Event('spp:dataChanged'));
    }

    function fullName(user) {
        return (user.firstName + ' ' + user.lastName).trim();
    }

    function stripAccents(text) {
        return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    }

    /* ======================================================================
       1. TABS
       ====================================================================== */
    const tabs = $$('.um-tab-btn');
    tabs.forEach((button) => {
        button.addEventListener('click', () => {
            const target = button.getAttribute('data-um-panel');
            tabs.forEach((b) => b.classList.toggle('active', b === button));
            $$('.um-panel').forEach((panel) => {
                panel.style.display = panel.id === target ? '' : 'none';
            });
            if (window.SPP && window.SPP.panels && window.SPP.panels.resetScroll) {
                window.SPP.panels.resetScroll();
            }
        });
    });

    function openTab(id) {
        const button = root.querySelector('.um-tab-btn[data-um-panel="' + id + '"]');
        if (button) button.click();
    }

    /* ======================================================================
       2. REGISTRATION WIZARD
       ====================================================================== */
    const layout = $('.um-wizard-layout');
    const stepPanels = $$('.um-step-panel');
    const stepItems = $$('.um-step-item');
    const stepBars = $$('.um-step-bar');
    const prevButton = $('#um-btn-prev');
    const nextButton = $('#um-btn-next');
    const submitButton = $('#um-btn-submit');
    const resetButton = $('#um-btn-reset');
    const progressText = $('#um-progress-text');
    const preview = $('#um-preview-card');
    const form = $('#um-form');

    const TOTAL_STEPS = stepPanels.length;
    let currentStep = 1;
    let editingId = null;
    let passwordVisible = false;

    const fields = {
        documentType: $('#um-doc-type'),
        documentNumber: $('#um-doc-number'),
        firstName: $('#um-names'),
        lastName: $('#um-surnames'),
        program: $('#um-program'),
        faculty: $('#um-faculty'),
        email: $('#um-email'),
        password: $('#um-pass'),
        notify: $('#um-notify')
    };

    let accountStatus = 'active';

    /* --- Reading the form --- */
    function formData() {
        const roleInput = root.querySelector('input[name="um-role"]:checked');
        const username = (fields.email.value || '').trim();
        return {
            firstName: fields.firstName.value.trim(),
            lastName: fields.lastName.value.trim(),
            documentType: fields.documentType.value,
            documentNumber: fields.documentNumber.value.trim(),
            role: roleInput ? roleInput.value : 'student',
            program: fields.program.value,
            status: accountStatus,
            email: username ? username + DOMAIN : '',
            password: fields.password.value
        };
    }

    /* --- Credential card (same template for the live preview and the detail) --- */
    function credentialTemplate(user, showPassword, activePracticeId) {
        const role = ROLES[user.role] || ROLES.student;
        const name = fullName(user) || 'User name';
        const doc = (user.documentType || '-') + '  •  ' + (user.documentNumber || '—');
        const status = (user.status || 'active');
        const year = new Date().getFullYear();
        const password = user.password || '';

        return '' +
            '<article class="um-cred">' +
            '  <header class="um-cred-top">' +
            '    <div class="um-cred-brand">' +
            '      <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>' +
            '      <p>University<br>credential <em>' + year + '</em></p>' +
            '    </div>' +
            '    <span class="um-cred-state um-cred-state--' + status + '">' + escapeHtml(STATUS_LABELS[status] || 'Active').toUpperCase() + '</span>' +
            '  </header>' +
            (activePracticeId ? '  <button type="button" class="um-cred-cta" data-um-logbook="' + escapeHtml(activePracticeId) + '">View practice <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>' : '') +
            '  <div class="um-cred-body">' +
            '    <h3 class="um-cred-name">' + escapeHtml(name) + '</h3>' +
            '    <p class="um-cred-doc">' + escapeHtml(doc) + '</p>' +
            '    <span class="um-cred-role"><i class="fa-solid ' + role.icon + '" aria-hidden="true"></i>' + escapeHtml(role.name) + '</span>' +
            '    <dl class="um-cred-meta">' +
            '      <div><dt>PROGRAMA ACADÉMICO</dt><dd>' + escapeHtml(user.program || 'Unassigned') + '</dd></div>' +
            '      <div><dt>CORREO</dt><dd class="is-mono">' + escapeHtml(user.email || 'user' + DOMAIN) + '</dd></div>' +
            '    </dl>' +
            '  </div>' +
            '</article>';
    }

    function renderPreview() {
        preview.innerHTML = credentialTemplate(formData(), passwordVisible);
    }

    /* --- Program -> faculty --- */
    function syncFaculty() {
        const option = fields.program.options[fields.program.selectedIndex];
        fields.faculty.value = option ? (option.getAttribute('data-faculty') || '') : '';
    }

    /* --- Suggested e-mail based on the name --- */
    let emailEditedByHand = false;
    fields.email.addEventListener('input', () => { emailEditedByHand = true; });

    function suggestEmail() {
        if (emailEditedByHand) return;
        const first = stripAccents(fields.firstName.value.trim().split(/\s+/)[0] || '');
        const last = stripAccents(fields.lastName.value.trim().split(/\s+/)[0] || '');
        if (!first && !last) return;
        fields.email.value = (first ? first.charAt(0) + '.' : '') + last;
    }

    /* --- Per-step validation --- */
    function markError(input, message) {
        const field = input.closest('.um-field');
        if (!field) return;
        const box = field.querySelector('.um-error');
        if (message) {
            field.classList.add('has-error');
            if (box) box.textContent = message;
        } else {
            field.classList.remove('has-error');
        }
    }

    function validateStep(step) {
        let valid = true;
        const fail = (input, message) => { markError(input, message); if (valid) input.focus(); valid = false; };

        if (step === 1) {
            markError(fields.firstName, ''); markError(fields.lastName, ''); markError(fields.documentNumber, ''); markError(fields.documentType, '');
            if (!fields.documentType.value) fail(fields.documentType, 'Select a document type.');
            if (!/^\d{6,15}$/.test(fields.documentNumber.value.trim())) fail(fields.documentNumber, 'Enter the document number (digits only, at least 6).');
            if (fields.lastName.value.trim().length < 2) fail(fields.lastName, 'Enter the full last names.');
            if (fields.firstName.value.trim().length < 2) fail(fields.firstName, 'Enter the first names of the user.');
            const duplicate = users.find((u) => u.documentNumber === fields.documentNumber.value.trim() && u.id !== editingId);
            if (duplicate) fail(fields.documentNumber, 'A user with this document already exists.');
        }

        if (step === 2) {
            markError(fields.program, '');
            const isAdvisor = root.querySelector('input[name="um-role"]:checked')?.value === 'advisor';
            if (!isAdvisor && !fields.program.value) fail(fields.program, 'Select the program or department.');
        }

        if (step === 3) {
            markError(fields.email, ''); markError(fields.password, '');
            const password = fields.password.value;
            const passwordOptional = !!editingId && password === '';
            if (!passwordOptional && (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password))) {
                fail(fields.password, editingId
                    ? 'Leave it empty to keep it, or use 8+ characters with an uppercase letter, a lowercase letter and a number.'
                    : 'At least 8 characters, with an uppercase letter, a lowercase letter and a number.');
            }
            if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/i.test(fields.email.value.trim())) fail(fields.email, 'Use letters, numbers, dot, hyphen or underscore.');
            const duplicateEmail = users.find((u) => u.email === fields.email.value.trim() + DOMAIN && u.id !== editingId);
            if (duplicateEmail) fail(fields.email, 'This institutional e-mail is already assigned.');
        }

        return valid;
    }

    /* --- Navigation between steps --- */
    function showStep(n) {
        currentStep = Math.min(Math.max(n, 1), TOTAL_STEPS);
        layout.setAttribute('data-step', String(currentStep));

        stepPanels.forEach((panel, i) => panel.classList.toggle('is-active', i === currentStep - 1));

        stepItems.forEach((item, i) => {
            item.classList.toggle('is-current', i === currentStep - 1);
            item.classList.toggle('is-done', i < currentStep - 1);
            item.setAttribute('aria-current', i === currentStep - 1 ? 'step' : 'false');
        });
        stepBars.forEach((bar, i) => bar.classList.toggle('is-done', i < currentStep - 1));

        prevButton.style.display = currentStep === 1 ? 'none' : '';
        nextButton.style.display = currentStep === TOTAL_STEPS ? 'none' : '';
        submitButton.style.display = currentStep === TOTAL_STEPS ? '' : 'none';
        progressText.textContent = 'Step ' + currentStep + ' of ' + TOTAL_STEPS;

        if (currentStep === TOTAL_STEPS) renderSummary();
        renderPreview();

        SPP.panels.resetScroll();
    }

    function renderSummary() {
        const data = formData();
        const role = ROLES[data.role];
        const summary = $('#um-summary');
        const rows = [
            ['Full name', fullName(data)],
            ['Document', data.documentType + ' ' + data.documentNumber],
            ['Institutional role', role.name],
            ['Program', data.program],
            ['Faculty', fields.faculty.value || '—'],
            ['Institutional e-mail', data.email],
            ['Initial status', STATUS_LABELS[data.status]],
            ['Credential delivery', fields.notify.checked ? 'By e-mail, when saved' : 'Manual delivery']
        ];
        summary.innerHTML = rows.map((row) =>
            '<div><dt>' + escapeHtml(row[0]) + '</dt><dd>' + escapeHtml(row[1] || '—') + '</dd></div>'
        ).join('');
    }

    nextButton.addEventListener('click', () => {
        if (!validateStep(currentStep)) return;
        if (currentStep === 1) suggestEmail();
        showStep(currentStep + 1);
    });

    prevButton.addEventListener('click', () => showStep(currentStep - 1));

    stepItems.forEach((item, i) => {
        item.addEventListener('click', () => {
            const target = i + 1;
            if (target <= currentStep) return showStep(target);
            for (let step = currentStep; step < target; step++) {
                if (!validateStep(step)) return showStep(step);
            }
            showStep(target);
        });
    });

    /* --- Inputs that refresh the card --- */
    ['input', 'change'].forEach((eventName) => {
        form.addEventListener(eventName, (e) => {
            if (e.target === fields.documentNumber) {
                fields.documentNumber.value = fields.documentNumber.value.replace(/\D/g, '');
            }
            if (e.target.name === 'um-role') {
                const isAdvisor = e.target.value === 'advisor';
                fields.program.disabled = isAdvisor;
                if (isAdvisor) {
                    fields.program.value = '';
                    syncFaculty();
                }
                SPP.customSelect.rebuild(fields.program);
            }
            if (e.target === fields.program) syncFaculty();
            if (e.target === fields.password) measurePassword(fields.password.value);
            renderPreview();
            if (currentStep === TOTAL_STEPS) renderSummary();
        });
    });

    /* --- Password --- */
    const strengthBars = $$('#um-strength span');
    const strengthText = $('#um-strength-text');

    function measurePassword(value) {
        let level = 0;
        if (value.length >= 8) level++;
        if (/[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value)) level++;
        if (value.length >= 12 && /[^A-Za-z0-9]/.test(value)) level++;

        const colors = ['#b93232', '#dda326', '#1a6b50'];
        const texts = ['Weak: use 8 characters or more', 'Medium: add uppercase letters and numbers', 'Strong: ready to hand over'];

        strengthBars.forEach((bar, i) => {
            bar.style.background = i < level ? colors[Math.max(level - 1, 0)] : '';
        });
        if (strengthText) {
            strengthText.textContent = value.length === 0 ? 'Not set' : texts[Math.max(level - 1, 0)];
            strengthText.style.color = value.length === 0 ? '' : colors[Math.max(level - 1, 0)];
        }
    }

    $('#um-pass-toggle').addEventListener('click', function () {
        const visible = fields.password.type === 'text';
        fields.password.type = visible ? 'password' : 'text';
        const icon = this.querySelector('i');
        icon.classList.toggle('fa-eye', visible);
        icon.classList.toggle('fa-eye-slash', !visible);
    });

    $('#um-pass-generate').addEventListener('click', () => {
        const letters = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
        const digits = '23456789';
        const symbols = '!@#$%*';
        let password = '';
        for (let i = 0; i < 10; i++) password += letters.charAt(Math.floor(Math.random() * letters.length));
        for (let i = 0; i < 3; i++) password += digits.charAt(Math.floor(Math.random() * digits.length));
        password += symbols.charAt(Math.floor(Math.random() * symbols.length));
        fields.password.value = password;
        measurePassword(password);
        markError(fields.password, '');
        renderPreview();
    });

    /* --- Account status --- */
    function setStatus(status) {
        accountStatus = status;
        $$('.um-switch button').forEach((b) => b.classList.toggle('is-on', b.getAttribute('data-status') === status));
        const description = $('#um-status-desc');
        if (description) description.textContent = STATUS_DESCRIPTIONS[status];
    }

    $$('.um-switch button').forEach((button) => {
        button.addEventListener('click', () => {
            setStatus(button.getAttribute('data-status'));
            renderPreview();
            if (currentStep === TOTAL_STEPS) renderSummary();
        });
    });

    /* --- Clear / save --- */
    function clearForm() {
        form.reset();
        editingId = null;
        emailEditedByHand = false;
        setStatus('active');
        $$('.um-field').forEach((field) => field.classList.remove('has-error'));
        $('#um-form-title').textContent = 'Register new user';
        $('#um-form-desc').textContent = 'Complete the four steps to register the user in the institutional software.';
        fields.password.placeholder = '';
        submitButton.innerHTML = '<i class="fa-solid fa-user-check" aria-hidden="true"></i> Register and activate';
        fields.program.disabled = false;
        syncFaculty();
        SPP.customSelect.sync(fields.documentType);
        SPP.customSelect.rebuild(fields.program);
        measurePassword(fields.password.value);
        showStep(1);
    }

    resetButton.addEventListener('click', clearForm);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        for (let step = 1; step <= 3; step++) {
            if (!validateStep(step)) return showStep(step);
        }
        const data = formData();
        const body = {
            firstName: data.firstName, lastName: data.lastName, documentType: data.documentType, documentNumber: data.documentNumber,
            role: data.role, program: data.program, status: data.status, email: fields.email.value.trim(), password: data.password
        };
        submitButton.disabled = true;
        try {
            if (editingId) {
                await SPP.put('/api/users/' + encodeURIComponent(editingId), body);
                await SPP.modals.alert({ title: 'User updated', message: 'User updated successfully' });
            } else {
                await SPP.post('/api/users', body);
                await SPP.modals.alert({ title: 'User registered', message: 'User registered successfully' });
            }
            clearForm();
            await loadUsers();
        } catch (err) {
            await SPP.modals.alert({ title: 'Could not save', message: err.message });
        } finally {
            submitButton.disabled = false;
        }
    });

    /* ======================================================================
       3. LIST — desktop table + mobile cards, bulk selection and row actions
       ====================================================================== */
    const tbody = $('#um-tbody');
    const cardsContainer = $('#um-cards');
    const searchInput = $('#um-search');
    const roleFilter = $('#um-filter-role');
    const statusFilter = $('#um-filter-status');
    const rowsSelect = $('#um-rows');
    const selectAll = document.getElementById('um-select-all');
    const selection = new Set();
    let page = 1;

    function filteredUsers() {
        const query = stripAccents(searchInput.value.trim());
        return users.filter((user) => {
            if (roleFilter.value && user.role !== roleFilter.value) return false;
            if (statusFilter.value && user.status !== statusFilter.value) return false;
            if (!query) return true;
            return stripAccents(fullName(user) + ' ' + user.documentNumber + ' ' + user.email).includes(query);
        });
    }

    function initials(user) {
        const a = (user.firstName || '').trim().charAt(0);
        const b = (user.lastName || '').trim().charAt(0);
        return (a + b).toUpperCase() || '··';
    }

    function actionsHtml(user) {
        const hasActivePractice = allPractices.some(p => p.status === 'active' && (
            String(p.studentDocument) === String(user.documentNumber) ||
            String(p.tutorDocument) === String(user.documentNumber) ||
            String(p.advisorDocument) === String(user.documentNumber)
        ));
        
        const deleteAttr = hasActivePractice 
            ? 'disabled style="cursor: not-allowed; opacity: 0.5" title="Cannot delete user with active practices"' 
            : 'data-act="delete" title="Delete user"';

        return '<div class="um-row-actions">' +
            '<button type="button" data-act="view" data-id="' + user.id + '" title="View credential" aria-label="View credential"><i class="fa-solid fa-id-card" aria-hidden="true"></i></button>' +
            '<button type="button" data-act="edit" data-id="' + user.id + '" title="Edit user" aria-label="Edit user"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></button>' +
            '<button type="button" ' + deleteAttr + ' data-id="' + user.id + '" aria-label="Delete user"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>' +
            '</div>';
    }

    function rowHtml(user) {
        const role = ROLES[user.role];
        const marked = selection.has(user.id) ? ' checked' : '';
        return '<tr data-id="' + user.id + '">' +
            '<td class="um-col-check"><input type="checkbox" class="um-check-row" data-id="' + user.id + '" aria-label="Select ' + escapeHtml(fullName(user)) + '"' + marked + '></td>' +
            '<td><div class="um-user-cell"><span class="um-avatar" aria-hidden="true">' + escapeHtml(initials(user)) + '</span>' +
            '<div><strong>' + escapeHtml(fullName(user)) + '</strong><small>' + escapeHtml(user.email) + '</small></div></div></td>' +
            '<td class="um-doc">' + escapeHtml((user.documentType || '-') + ' ' + user.documentNumber) + '</td>' +
            '<td><span class="um-pill ' + role.cssClass + '"><i class="fa-solid ' + role.icon + '" aria-hidden="true"></i>' + escapeHtml(role.name) + '</span></td>' +
            '<td><div class="um-dep"><strong>' + escapeHtml(user.program || 'Unassigned') + '</strong></div></td>' +
            '<td><span class="um-state um-state--' + user.status + '">' + escapeHtml(STATUS_LABELS[user.status] || 'Active') + '</span></td>' +
            '<td class="um-col-actions">' + actionsHtml(user) + '</td>' +
            '</tr>';
    }

    function userCardHtml(user) {
        const role = ROLES[user.role];
        const marked = selection.has(user.id) ? ' checked' : '';
        return '<article class="um-user-card" data-id="' + user.id + '">' +
            '<div class="um-user-card-top">' +
            '<input type="checkbox" class="um-check-row" data-id="' + user.id + '" aria-label="Select ' + escapeHtml(fullName(user)) + '"' + marked + '>' +
            '<div class="um-user-cell"><span class="um-avatar" aria-hidden="true">' + escapeHtml(initials(user)) + '</span>' +
            '<div><strong>' + escapeHtml(fullName(user)) + '</strong><small>' + escapeHtml(user.email) + '</small></div></div></div>' +
            '<div class="um-user-card-meta">' +
            '<span class="um-pill ' + role.cssClass + '"><i class="fa-solid ' + role.icon + '" aria-hidden="true"></i>' + escapeHtml(role.name) + '</span>' +
            '<span class="um-state um-state--' + user.status + '">' + escapeHtml(STATUS_LABELS[user.status] || 'Active') + '</span>' +
            '</div>' +
            '<dl>' +
            '<div><dt>Document:</dt><dd>' + escapeHtml((user.documentType || '-') + ' ' + user.documentNumber) + '</dd></div>' +
            '<div><dt>Program:</dt><dd>' + escapeHtml(user.program || 'Unassigned') + '</dd></div>' +
            '</dl>' +
            actionsHtml(user) +
            '</article>';
    }

    function renderList() {
        const list = filteredUsers();
        const perPage = parseInt(rowsSelect.value, 10) || 10;
        const totalPages = Math.max(Math.ceil(list.length / perPage), 1);
        page = Math.min(page, totalPages);

        const start = (page - 1) * perPage;
        const visible = list.slice(start, start + perPage);

        if (visible.length === 0) {
            const empty = '<div class="um-empty"><i class="fa-solid fa-user-slash" aria-hidden="true"></i>' +
                '<strong>No user matches the search</strong>' +
                '<span>Change the filters or register a new user from the first tab.</span></div>';
            tbody.innerHTML = '<tr><td colspan="7">' + empty + '</td></tr>';
            cardsContainer.innerHTML = empty;
        } else {
            tbody.innerHTML = visible.map(rowHtml).join('');
            cardsContainer.innerHTML = visible.map(userCardHtml).join('');
        }

        $('#um-range').innerHTML = list.length === 0
            ? 'No results'
            : 'Showing <b>' + (start + 1) + '–' + (start + visible.length) + '</b> of <b>' + list.length + '</b> users';

        renderPagination(totalPages);
        renderKpis();
        updateSelection();
    }

    function renderPagination(total) {
        const container = $('#um-pages');
        let html = '<button type="button" data-page="prev" aria-label="Previous page"' + (page === 1 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>';
        const from = Math.max(1, Math.min(page - 2, total - 4));
        const to = Math.min(total, Math.max(page + 2, 5));
        for (let p = from; p <= to; p++) {
            html += '<button type="button" data-page="' + p + '"' + (p === page ? ' class="is-current" aria-current="page"' : '') + '>' + p + '</button>';
        }
        html += '<button type="button" data-page="next" aria-label="Next page"' + (page === total ? ' disabled' : '') + '><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>';
        container.innerHTML = html;
    }

    function renderKpis() {
        const count = (predicate) => users.filter(predicate).length;
        const total = users.length || 1;
        const data = [
            ['um-kpi-students', count((u) => u.role === 'student')],
            ['um-kpi-tutors', count((u) => u.role === 'tutor')],
            ['um-kpi-advisors', count((u) => u.role === 'advisor')],
            ['um-kpi-pending', count((u) => u.status !== 'active')]
        ];
        data.forEach(([id, value]) => {
            const node = root.querySelector('#' + id);
            if (node) node.textContent = value;
            const footer = root.querySelector('#' + id + '-pct');
            if (footer) footer.textContent = Math.round((value / total) * 100) + '% of the total';
        });
        $('#um-total-pill').textContent = users.length + ' registered users';
    }

    /* --- Selection of the visible rows (table and cards share the same set) --- */
    const bulkBar = $('#um-bulk');

    function updateSelection() {
        const visibleIds = $$('.um-check-row').map((c) => c.getAttribute('data-id'));
        const marked = visibleIds.filter((id) => selection.has(id));
        if (bulkBar) bulkBar.hidden = selection.size === 0;
        const counter = $('#um-selected-count');
        if (counter) counter.textContent = selection.size;
        if (selectAll) {
            selectAll.checked = visibleIds.length > 0 && marked.length === visibleIds.length;
            selectAll.indeterminate = marked.length > 0 && marked.length < visibleIds.length;
        }
    }

    if (selectAll) {
        selectAll.addEventListener('change', () => {
            $$('.um-check-row').forEach((c) => {
                const id = c.getAttribute('data-id');
                if (selectAll.checked) selection.add(id); else selection.delete(id);
            });
            renderList();
        });
    }

    root.addEventListener('change', (e) => {
        if (!e.target.classList.contains('um-check-row')) return;
        const id = e.target.getAttribute('data-id');
        if (e.target.checked) selection.add(id); else selection.delete(id);
        $$('.um-check-row[data-id="' + id + '"]').forEach((c) => { c.checked = e.target.checked; });
        updateSelection();
    });

    /* --- Bulk actions (Activate / Suspend / Delete) --- */
    $$('.um-bulk-actions button').forEach((button) => {
        button.addEventListener('click', async () => {
            const action = button.getAttribute('data-bulk');
            const ids = Array.from(selection);
            if (action === 'cancel') {
                selection.clear();
                return renderList();
            }
            if (action === 'delete') {
                const confirmed = await SPP.modals.confirm({
                    title: 'Delete ' + selection.size + ' user(s)',
                    message: 'They will lose access to the portal and will be removed from the list.',
                    confirmLabel: 'Yes, delete',
                    isDestructive: true
                });
                if (!confirmed) return;
                try {
                    for (const id of ids) await SPP.del('/api/users/' + encodeURIComponent(id));
                    selection.clear();
                    await loadUsers();
                } catch (err) {
                    await SPP.modals.alert({ title: 'Could not delete', message: err.message });
                }
                return;
            }
            const status = action === 'activate' ? 'active' : 'inactive';
            try {
                for (const id of ids) {
                    await SPP.patch('/api/users/' + encodeURIComponent(id) + '/status', { status });
                }
                selection.clear();
                await loadUsers();
            } catch (err) {
                await SPP.modals.alert({ title: 'Could not update', message: err.message });
            }
        });
    });

    /* --- Row / card actions (View credential / Edit / Delete) --- */
    root.addEventListener('click', async (e) => {
        const button = e.target.closest('[data-act]');
        if (button && root.contains(button)) {
            const user = users.find((x) => x.id === button.getAttribute('data-id'));
            if (!user) return;
            const action = button.getAttribute('data-act');
            if (action === 'view') return openCredential(user);
            if (action === 'edit') return editUser(user);
            if (action === 'delete') {
                const confirmed = await SPP.modals.confirm({
                    title: 'Delete ' + fullName(user),
                    message: 'The user will lose access to the portal and will be removed from the list.',
                    confirmLabel: 'Yes, delete',
                    isDestructive: true
                });
                if (!confirmed) return;
                try {
                    await SPP.del('/api/users/' + encodeURIComponent(user.id));
                    selection.delete(user.id);
                    await loadUsers();
                } catch (err) {
                    await SPP.modals.alert({ title: 'Could not delete', message: err.message });
                }
                return;
            }
        }

        const pageButton = e.target.closest('[data-page]');
        if (pageButton && root.contains(pageButton)) {
            const value = pageButton.getAttribute('data-page');
            const total = Math.max(Math.ceil(filteredUsers().length / (parseInt(rowsSelect.value, 10) || 10)), 1);
            if (value === 'prev') page = Math.max(1, page - 1);
            else if (value === 'next') page = Math.min(total, page + 1);
            else page = parseInt(value, 10);
            return renderList();
        }

        handleCardClick(e);
    });

    /* The modals live outside <main>, so they need their own listener. */
    function handleCardClick(e) {
        const passwordToggle = e.target.closest('[data-um-verpass]');
        if (passwordToggle) {
            if (preview.contains(passwordToggle)) {
                passwordVisible = !passwordVisible;
                return renderPreview();
            }
            const output = passwordToggle.closest('.um-cred-pass').querySelector('output');
            const icon = passwordToggle.querySelector('i');
            const hidden = icon.classList.contains('fa-eye-slash');
            output.textContent = hidden ? (output.getAttribute('data-real') || '') : '•'.repeat(8);
            icon.classList.toggle('fa-eye-slash', !hidden);
            icon.classList.toggle('fa-eye', hidden);
            return;
        }

        const logbookLink = e.target.closest('[data-um-logbook]');
        if (logbookLink) {
            closeModals();
            const practiceId = logbookLink.getAttribute('data-um-logbook');
            window.dispatchEvent(new CustomEvent('spp:open-practice', { detail: { id: practiceId } }));
            const link = document.querySelector('.app-nav-link[href="#practice"]');
            if (link) link.click();
        }
    }

    /* --- "Credential" modal (the same live card of the wizard) --- */
    async function openCredential(user) {
        let activePracticeId = null;
        try {
            if (user.role === 'student') {
                const res = await SPP.get('/api/practices');
                if (res && res.practices) {
                    const userPractices = res.practices.filter(p => p.studentDocument === user.id);
                    const active = userPractices.find(p => p.status === 'active');
                    if (active) activePracticeId = active.id;
                }
            }
        } catch(e) {
            console.error(e);
        }

        const body = document.getElementById('um-modal-credential-body');
        if (body) body.innerHTML = credentialTemplate(user, false, activePracticeId);
        const output = credentialModal ? credentialModal.querySelector('.um-cred-pass output') : null;
        if (output) output.setAttribute('data-real', user.password || '');
        if (credentialModal) credentialModal.style.display = 'flex';
    }

    [searchInput, roleFilter, statusFilter, rowsSelect].forEach((control) => {
        control.addEventListener('input', () => { page = 1; renderList(); });
        control.addEventListener('change', () => { page = 1; renderList(); });
    });

    $('#um-btn-clear').addEventListener('click', () => {
        searchInput.value = '';
        roleFilter.value = '';
        statusFilter.value = '';
        SPP.customSelect.sync(roleFilter);
        SPP.customSelect.sync(statusFilter);
        page = 1;
        renderList();
    });

    $('#um-btn-new').addEventListener('click', () => {
        clearForm();
        openTab('um-panel-register');
    });

    /* --- Edit --- */
    function editUser(user) {
        editingId = user.id;
        emailEditedByHand = true;
        fields.firstName.value = user.firstName;
        fields.lastName.value = user.lastName;
        fields.documentType.value = user.documentType;
        fields.documentNumber.value = user.documentNumber;
        fields.email.value = user.email.split('@')[0];
        fields.password.value = '';
        fields.password.placeholder = 'Leave empty to keep the current one';
        const radio = root.querySelector('input[name="um-role"][value="' + user.role + '"]');
        if (radio) radio.checked = true;

        const exists = Array.from(fields.program.options).some((o) => o.value === user.program);
        if (!exists && user.program) {
            const option = document.createElement('option');
            option.value = user.program;
            option.textContent = user.program;
            option.setAttribute('data-faculty', user.faculty || '');
            fields.program.appendChild(option);
        }
        fields.program.value = user.program;
        fields.program.disabled = user.role === 'advisor';
        syncFaculty();
        SPP.customSelect.sync(fields.documentType);
        SPP.customSelect.rebuild(fields.program);

        setStatus(user.status);

        $('#um-form-title').textContent = 'Edit user';
        $('#um-form-desc').textContent = 'Review the four steps and save the changes of ' + fullName(user) + '.';
        submitButton.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save changes';

        measurePassword('');
        openTab('um-panel-register');
        showStep(1);
        if (window.SPP && window.SPP.panels && window.SPP.panels.resetScroll) {
            window.SPP.panels.resetScroll();
        }
    }

    /* ======================================================================
       4. MODALS
       ====================================================================== */
    const credentialModal = document.getElementById('um-modal-credential');

    function closeModals() {
        if (credentialModal) credentialModal.style.display = 'none';
    }

    document.querySelectorAll('[data-um-close]').forEach((button) => button.addEventListener('click', closeModals));

    if (credentialModal) {
        credentialModal.addEventListener('click', (e) => { if (e.target === credentialModal) closeModals(); });
        credentialModal.addEventListener('click', handleCardClick);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModals();
    });

    /* ======================================================================
       5. START-UP
       ====================================================================== */
    syncFaculty();
    measurePassword(fields.password.value);
    $$('.um-suffix').forEach((el) => { el.textContent = DOMAIN; });
    showStep(1);
    renderList();
    loadPrograms();
    loadUsers();
})();
