/* =========================================================================
   login.js — Only for index.html (sign-in screen).
   It has nothing to do with the shell (sidebar/topbar); that lives in
   core/shell.js and is loaded by the panels, not by this page.
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
    // Password visibility toggle on the login form
    const togglePassword = document.querySelector('.btn-visibility');
    const passwordInput = document.getElementById('password');

    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', function () {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);

            const icon = this.querySelector('i');
            icon.classList.toggle('fa-eye', type === 'text');
            icon.classList.toggle('fa-eye-slash', type === 'password');
        });
    }

    // Login: the server validates username/password with Supabase and DETECTS the role from the database
    const loginForm = document.querySelector('.login-form');
    if (loginForm) {
        const submitButton = loginForm.querySelector('.btn-submit');
        const notice = document.createElement('p');
        notice.className = 'login-error';
        notice.setAttribute('role', 'alert');
        notice.style.cssText = 'color:#b3261e;font-size:14px;font-weight:600;margin:8px 0 0;min-height:18px';
        submitButton.parentNode.insertBefore(notice, submitButton);

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            notice.textContent = '';

            submitButton.disabled = true;
            try {
                const result = await SPP.request('/api/auth/login', {
                    method: 'POST',
                    skipRedirect: true,
                    body: {
                        username: document.getElementById('username').value,
                        password: document.getElementById('password').value
                    }
                });
                window.location.href = result.redirectTo;
            } catch (err) {
                notice.textContent = err.message;
                submitButton.disabled = false;
            }
        });
    }
});

/* ── Splash screen ── */
(function () {
    const splash = document.getElementById('spp-splash');
    if (!splash) return;

    let shouldShow = false;
    try {
        if (!sessionStorage.getItem('spp-intro-shown')) {
            sessionStorage.setItem('spp-intro-shown', '1');
            shouldShow = true;
        }
    } catch (e) {
        shouldShow = true; // Fallback
    }

    if (shouldShow) {
        splash.classList.remove('is-hidden');
        setTimeout(function () {
            splash.classList.add('splash-out');
            splash.addEventListener('animationend', function () {
                splash.remove();
            }, { once: true });
        }, 1700);
    } else {
        splash.remove();
    }
})();
