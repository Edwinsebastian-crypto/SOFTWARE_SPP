/* =========================================================================
   credential.js — "Student credential" card shown when the tutor / advisor /
   director clicks the student's name inside the logbook.
   The current student is published by the page scripts in window.SPP_CURRENT_STUDENT:
   { fullName, documentType, documentNumber, status, program, email }
   ========================================================================= */
(function () {
    'use strict';
    const esc = (text) => SPP.escapeHtml(text);

    function credentialTemplate(student) {
        const doc = (student.documentType || '-') + '  •  ' + (student.documentNumber || '—');
        const status = student.status || 'active';
        const year = new Date().getFullYear();
        return '' +
            '<article class="lb-cred">' +
            '  <header class="lb-cred-top">' +
            '    <div class="lb-cred-brand">' +
            '      <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>' +
            '      <p>University<br>credential <em>' + year + '</em></p>' +
            '    </div>' +
            '    <span class="lb-cred-state lb-cred-state--' + esc(status) + '">' + esc(status.toUpperCase()) + '</span>' +
            '  </header>' +
            '  <div class="lb-cred-body">' +
            '    <h3 class="lb-cred-name">' + esc(student.fullName) + '</h3>' +
            '    <p class="lb-cred-doc">' + esc(doc) + '</p>' +
            '    <span class="lb-cred-role"><i class="fa-solid fa-user-graduate" aria-hidden="true"></i>Student</span>' +
            '    <dl class="lb-cred-meta">' +
            '      <div><dt>Academic program</dt><dd>' + esc(student.program || 'Unassigned') + '</dd></div>' +
            '      <div><dt>Email</dt><dd class="is-mono">' + esc(student.email || 'user@university.edu') + '</dd></div>' +
            '    </dl>' +
            '  </div>' +
            '</article>' +
            '<button type="button" class="lb-modal-close">Close</button>';
    }

    document.addEventListener('click', (e) => {
        const modal = document.getElementById('lb-modal-credential');
        const body = document.getElementById('lb-modal-credential-body');
        if (!modal || !body) return;

        if (e.target.closest('.lb-modal-close')) {
            modal.style.display = 'none';
            return;
        }
        if (e.target.closest('.lb-student-name') && window.SPP_CURRENT_STUDENT) {
            body.innerHTML = credentialTemplate(window.SPP_CURRENT_STUDENT);
            modal.style.display = 'flex';
        }
    });
})();
