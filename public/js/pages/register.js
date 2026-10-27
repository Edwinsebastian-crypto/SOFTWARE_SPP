/* =========================================================================
   register.js — Self-registration wizard matching the Director's
   User Management registration experience.
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));
    const escapeHtml = (window.SPP && window.SPP.escapeHtml) ? window.SPP.escapeHtml : (str) => {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    };

    const ROLES = {
        student: { name: 'Student', icon: 'fa-graduation-cap' },
        tutor: { name: 'Academic Tutor', icon: 'fa-user' },
        advisor: { name: 'Pedagogical Advisor', icon: 'fa-user-group' }
    };

    const DOMAIN = '@' + (window.SPP_DOMAIN || 'udi.edu.co');

    const layout = $('reg-wizard-container');
    const form = $('reg-form');
    const stepPanels = $$('.um-step-panel');
    const stepItems = $$('.um-step-item');
    const stepBars = $$('.um-step-bar');
    const prevButton = $('reg-btn-prev');
    const nextButton = $('reg-btn-next');
    const submitButton = $('reg-btn-submit');
    const resetButton = $('reg-btn-reset');
    const progressText = $('reg-progress-text');
    const preview = $('reg-preview-card');
    const errorBanner = $('reg-error-banner');
    const doneBox = $('reg-done');

    const fields = {
        documentType: $('reg-doctype'),
        documentNumber: $('reg-doc'),
        firstName: $('reg-first'),
        lastName: $('reg-last'),
        program: $('reg-program'),
        faculty: $('reg-faculty'),
        email: $('reg-email'),
        password: $('reg-pass'),
        confirmPassword: $('reg-pass2')
    };

    const TOTAL_STEPS = stepPanels.length;
    let currentStep = 1;
    let emailEditedByHand = false;
    let programs = [];

    function selectedRole() {
        const checked = document.querySelector('input[name="role"]:checked');
        return checked ? checked.value : 'student';
    }

    function needsProgram() {
        const role = selectedRole();
        return role === 'student' || role === 'tutor';
    }

    function fullName(data) {
        return ((data.firstName || '') + ' ' + (data.lastName || '')).trim();
    }

    function stripAccents(text) {
        return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

    function formData() {
        const username = (fields.email.value || '').trim();
        return {
            firstName: fields.firstName.value.trim(),
            lastName: fields.lastName.value.trim(),
            documentType: fields.documentType.value,
            documentNumber: fields.documentNumber.value.trim(),
            role: selectedRole(),
            program: needsProgram() ? fields.program.value : '',
            email: username ? (username.includes('@') ? username : username + DOMAIN) : '',
            password: fields.password.value
        };
    }

    /* --- Credential preview card --- */
    function credentialTemplate(user) {
        const role = ROLES[user.role] || ROLES.student;
        const name = fullName(user) || 'User name';
        const doc = (user.documentType || '-') + '  •  ' + (user.documentNumber || '—');
        const year = new Date().getFullYear();
        const email = user.email || ('user' + DOMAIN);

        return '' +
            '<article class="um-cred">' +
            '  <header class="um-cred-top">' +
            '    <div class="um-cred-brand">' +
            '      <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>' +
            '      <p>University<br>credential <em>' + year + '</em></p>' +
            '    </div>' +
            '    <span class="um-cred-state um-cred-state--active">ACTIVE</span>' +
            '  </header>' +
            '  <div class="um-cred-body">' +
            '    <h3 class="um-cred-name">' + escapeHtml(name) + '</h3>' +
            '    <p class="um-cred-doc">' + escapeHtml(doc) + '</p>' +
            '    <span class="um-cred-role"><i class="fa-solid ' + role.icon + '" aria-hidden="true"></i>' + escapeHtml(role.name) + '</span>' +
            '    <dl class="um-cred-meta">' +
            '      <div><dt>PROGRAMA ACADÉMICO</dt><dd>' + escapeHtml(user.program || 'Unassigned') + '</dd></div>' +
            '      <div><dt>CORREO</dt><dd class="is-mono">' + escapeHtml(email) + '</dd></div>' +
            '    </dl>' +
            '  </div>' +
            '</article>';
    }

    function renderPreview() {
        if (preview) {
            preview.innerHTML = credentialTemplate(formData());
        }
    }

    /* --- Program dropdown sync --- */
    async function loadPrograms() {
        try {
            const res = await SPP.request('/api/auth/programs', { skipRedirect: true });
            programs = res.programs || [];
            const select = fields.program;
            const placeholder = select.options[0];
            select.innerHTML = '';
            select.appendChild(placeholder);
            programs.forEach((p) => {
                const opt = document.createElement('option');
                opt.value = p.name;
                opt.textContent = p.name;
                opt.setAttribute('data-faculty', p.faculty || '');
                select.appendChild(opt);
            });
            if (window.SPP && window.SPP.customSelect && typeof window.SPP.customSelect.init === 'function') {
                window.SPP.customSelect.init('#reg-wizard-container');
                window.SPP.customSelect.rebuild(select);
            }
        } catch (err) {
            console.error('Could not load programs:', err);
        }
    }

    function syncFaculty() {
        const option = fields.program.options[fields.program.selectedIndex];
        fields.faculty.value = option ? (option.getAttribute('data-faculty') || '') : '';
    }

    fields.program.addEventListener('change', () => {
        syncFaculty();
        renderPreview();
    });

    /* --- Role change handling --- */
    document.querySelectorAll('input[name="role"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            const progBox = $('reg-program-box');
            if (progBox) {
                progBox.style.display = needsProgram() ? '' : 'none';
            }
            if (!needsProgram()) {
                fields.program.selectedIndex = 0;
                fields.faculty.value = '';
                if (window.SPP && window.SPP.customSelect) {
                    window.SPP.customSelect.sync(fields.program);
                }
            }
            renderPreview();
        });
    });

    /* --- Email auto-suggestion --- */
    fields.email.addEventListener('input', () => {
        emailEditedByHand = true;
        renderPreview();
    });

    function suggestEmail() {
        if (emailEditedByHand) return;
        const first = stripAccents(fields.firstName.value.trim().split(/\s+/)[0] || '');
        const last = stripAccents(fields.lastName.value.trim().split(/\s+/)[0] || '');
        if (!first && !last) return;
        fields.email.value = (first ? first.charAt(0) + '.' : '') + last;
    }

    [fields.firstName, fields.lastName].forEach((input) => {
        input.addEventListener('input', () => {
            suggestEmail();
            renderPreview();
        });
    });

    fields.documentType.addEventListener('change', renderPreview);
    fields.documentNumber.addEventListener('input', renderPreview);

    /* --- Password toggle & generator --- */
    $('reg-pass-toggle').addEventListener('click', function () {
        const visible = fields.password.type === 'text';
        fields.password.type = visible ? 'password' : 'text';
        fields.confirmPassword.type = visible ? 'password' : 'text';
        const icon = this.querySelector('i');
        icon.classList.toggle('fa-eye', visible);
        icon.classList.toggle('fa-eye-slash', !visible);
    });

    $('reg-pass-generate').addEventListener('click', () => {
        const letters = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
        const digits = '23456789';
        const symbols = '!@#$%*';
        let pass = '';
        for (let i = 0; i < 10; i++) pass += letters.charAt(Math.floor(Math.random() * letters.length));
        for (let i = 0; i < 3; i++) pass += digits.charAt(Math.floor(Math.random() * digits.length));
        pass += symbols.charAt(Math.floor(Math.random() * symbols.length));
        fields.password.value = pass;
        fields.confirmPassword.value = pass;
        markError(fields.password, '');
        markError(fields.confirmPassword, '');
        renderPreview();
    });

    /* --- Validation per step --- */
    function markError(input, message) {
        const field = input.closest('.um-field');
        if (!field) return;
        const box = field.querySelector('.um-error');
        if (message) {
            field.classList.add('has-error');
            if (box) box.textContent = message;
        } else {
            field.classList.remove('has-error');
            if (box) box.textContent = '';
        }
    }

    function validateStep(step) {
        let valid = true;
        const fail = (input, msg) => {
            markError(input, msg);
            if (valid) input.focus();
            valid = false;
        };

        if (step === 1) {
            markError(fields.documentType, '');
            markError(fields.documentNumber, '');
            markError(fields.firstName, '');
            markError(fields.lastName, '');

            if (!fields.documentType.value) fail(fields.documentType, 'Select a document type.');
            const docNum = fields.documentNumber.value.trim();
            if (!/^\d{6,15}$/.test(docNum)) fail(fields.documentNumber, 'Enter a valid document number (digits only, at least 6).');
            if (fields.lastName.value.trim().length < 2) fail(fields.lastName, 'Enter the full last names.');
            if (fields.firstName.value.trim().length < 2) fail(fields.firstName, 'Enter the first names.');
        }

        if (step === 2) {
            markError(fields.program, '');
            if (needsProgram() && !fields.program.value) {
                fail(fields.program, 'Select your academic program.');
            }
        }

        if (step === 3) {
            markError(fields.email, '');
            markError(fields.password, '');
            markError(fields.confirmPassword, '');

            const emailVal = fields.email.value.trim();
            const cleanUser = emailVal.replace(/@.*$/, '');
            if (!cleanUser || !/^[a-z0-9]+([._-][a-z0-9]+)*$/i.test(cleanUser)) {
                fail(fields.email, 'Use letters, numbers, dot, hyphen or underscore.');
            }

            const pass = fields.password.value;
            if (pass.length < 8 || !/[a-z]/.test(pass) || !/[A-Z]/.test(pass) || !/\d/.test(pass)) {
                fail(fields.password, 'At least 8 characters, with an uppercase letter, a lowercase letter and a number.');
            }

            if (fields.confirmPassword.value !== pass) {
                fail(fields.confirmPassword, 'The passwords do not match.');
            }
        }

        return valid;
    }

    /* --- Navigation --- */
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
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function renderSummary() {
        const data = formData();
        const role = ROLES[data.role] || ROLES.student;
        const summary = $('reg-summary');
        const rows = [
            ['Full name', fullName(data)],
            ['Document', data.documentType + ' ' + data.documentNumber],
            ['Institutional role', role.name],
            ['Program', data.program || 'Unassigned'],
            ['Faculty', fields.faculty.value || '—'],
            ['Institutional e-mail', data.email],
            ['Initial status', 'Pending approval (Director)']
        ];
        summary.innerHTML = rows.map((row) =>
            '<div><dt>' + escapeHtml(row[0]) + '</dt><dd>' + escapeHtml(row[1] || '—') + '</dd></div>'
        ).join('');
    }

    prevButton.addEventListener('click', () => {
        errorBanner.textContent = '';
        showStep(currentStep - 1);
    });

    nextButton.addEventListener('click', () => {
        errorBanner.textContent = '';
        if (!validateStep(currentStep)) return;
        showStep(currentStep + 1);
    });

    resetButton.addEventListener('click', () => {
        form.reset();
        emailEditedByHand = false;
        $('reg-program-box').style.display = '';
        if (window.SPP && window.SPP.customSelect) {
            window.SPP.customSelect.sync(fields.documentType);
            window.SPP.customSelect.sync(fields.program);
        }
        $$('.um-field').forEach((f) => f.classList.remove('has-error'));
        $$('.um-error').forEach((e) => { e.textContent = ''; });
        errorBanner.textContent = '';
        showStep(1);
        renderPreview();
    });

    /* --- Form Submission --- */
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBanner.textContent = '';

        if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
            errorBanner.textContent = 'Please complete all required fields correctly.';
            return;
        }

        const data = formData();
        submitButton.disabled = true;

        try {
            await SPP.request('/api/auth/register', {
                method: 'POST',
                skipRedirect: true,
                body: {
                    role: data.role,
                    program: data.program,
                    documentType: data.documentType,
                    documentNumber: data.documentNumber,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    email: data.email,
                    password: data.password
                }
            });

            // Hide the wizard container and top bar, show success screen
            layout.style.display = 'none';
            $('reg-form-title').textContent = 'Registration submitted';
            $('reg-form-desc').textContent = 'Your request has been received by the institutional software.';
            doneBox.hidden = false;
        } catch (err) {
            errorBanner.textContent = err.message || 'Could not complete registration. Please try again.';
            submitButton.disabled = false;
        }
    });

    // Initialize
    loadPrograms();
    renderPreview();
    showStep(1);
});
