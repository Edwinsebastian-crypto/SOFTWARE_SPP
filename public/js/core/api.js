/* =========================================================================
   api.js — Client of the backend API (shared by ALL views).
   The views never touch the database: they only talk to /api/* (Express).
   The session travels in an httpOnly cookie (handled by Supabase on the server).
   ========================================================================= */
(function () {
    'use strict';
    const SPP = {};

    /* ------------------------------------------------------------------
       Global "wait" cursor. Any save/upload (POST/PUT/PATCH/DELETE)
       shows `cursor: wait` over the whole page. It is released when the
       confirmation modal appears, when an error is shown, or after a
       safety timeout so the page can never stay stuck.
       ------------------------------------------------------------------ */
    let waitCount = 0;
    let waitTimer = null;

    function forceReleaseWait() {
        waitCount = 0;
        if (waitTimer) { clearInterval(waitTimer); waitTimer = null; }
        document.documentElement.classList.remove('spp-waiting');
    }

    /** Manual on/off, for flows that save without going through SPP.request. */
    SPP.setWait = function (on) {
        if (on) {
            waitCount++;
            if (waitTimer) { clearInterval(waitTimer); waitTimer = null; }
            document.documentElement.classList.add('spp-waiting');
        } else if (waitCount > 0) {
            waitCount--;
            if (waitCount === 0 && !waitTimer) watchForModal();
        }
    };

    /** After the last request, keep the cursor until a modal shows up (max ~2.5 s). */
    function watchForModal() {
        let ticks = 0;
        waitTimer = setInterval(() => {
            const modalOpen = Array.prototype.some.call(
                document.querySelectorAll('.am-modal-overlay, .modal-overlay'),
                (el) => getComputedStyle(el).display !== 'none'
            );
            if (modalOpen || ++ticks > 25) forceReleaseWait();
        }, 100);
    }

    /**
     * JSON / multipart request to the API.
     * Throws Error(message) when the response is not 2xx.
     * options: { method, body, formData, skipRedirect }
     */
    SPP.request = async function (url, options) {
        const o = options || {};
        const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].indexOf(String(o.method || 'GET').toUpperCase()) !== -1;
        if (isMutation) SPP.setWait(true);
        try {
            return await doRequest(url, o);
        } finally {
            if (isMutation) SPP.setWait(false);
        }
    };

    async function doRequest(url, o) {
        const init = { method: o.method || 'GET', headers: { 'X-SPP': '1' }, credentials: 'same-origin' };
        if (o.formData) {
            init.body = o.formData;
        } else if (o.body !== undefined) {
            init.headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(o.body);
        }
        let response;
        try {
            response = await fetch(url, init);
        } catch (e) {
            throw new Error('Cannot reach the server', { cause: e });
        }
        let data = {};
        try { data = await response.json(); } catch (e) { /* empty body */ }
        if (response.status === 401 && !o.skipRedirect) {
            window.location.href = '/index.html';
            throw new Error('Session expired');
        }
        if (!response.ok) throw new Error(data.error || 'Error ' + response.status);
        return data;
    }
    SPP.get = (url) => SPP.request(url);
    SPP.post = (url, body) => SPP.request(url, { method: 'POST', body: body || {} });
    SPP.put = (url, body) => SPP.request(url, { method: 'PUT', body: body || {} });
    SPP.patch = (url, body) => SPP.request(url, { method: 'PATCH', body: body || {} });
    SPP.del = (url) => SPP.request(url, { method: 'DELETE' });

    /** Escapes text so it can be inserted into innerHTML (anti-XSS). */
    SPP.escapeHtml = function (text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    };

    /** '2026-04-18' or ISO -> '18/04/2026' */
    SPP.formatDate = function (value) {
        if (!value) return '—';
        const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
        if (match && String(value).length === 10) return match[3] + '/' + match[2] + '/' + match[1];
        const date = new Date(value);
        if (isNaN(date)) return '—';
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    SPP.formatDateTime = function (value) {
        if (!value) return 'Never';
        const str = typeof value === 'string' ? value.replace(/T/, ' ').replace(/Z$|[+-][0-9:]+$/, '').trim() : '';
        const date = str ? new Date(str.replace(' ', 'T')) : new Date(value);
        return isNaN(date.getTime()) ? 'Never' : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    SPP.formatActivityDate = function (value) {
        if (!value) return '—';
        const str = typeof value === 'string' ? value.replace(/T/, ' ').replace(/Z$|[+-][0-9:]+$/, '').trim() : '';
        const date = str ? new Date(str.replace(' ', 'T')) : new Date(value);
        if (isNaN(date.getTime())) return '—';
        const d = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const t = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        return `${d}, ${t}`;
    };

    /** Display names of the roles (the API uses the keys). */
    SPP.ROLES = { student: 'Student', tutor: 'Academic Tutor', advisor: 'Pedagogical Advisor', director: 'Director' };

    let sessionPromise = null;
    /** Data of the logged-in user (a single request per page). */
    SPP.session = function () {
        if (!sessionPromise) sessionPromise = SPP.get('/api/auth/session');
        return sessionPromise;
    };

    SPP.logout = async function () {
        try { await SPP.request('/api/auth/logout', { method: 'POST', body: {}, skipRedirect: true }); } catch (e) { /* we leave anyway */ }
        window.location.href = '/index.html';
    };

    SPP.showError = function (error) {
        forceReleaseWait();
        const msg = error && error.message ? error.message : 'An error occurred';
        let errorModal = document.getElementById('spp-global-error-modal');
        if (!errorModal) {
            errorModal = document.createElement('div');
            errorModal.id = 'spp-global-error-modal';
            errorModal.className = 'am-modal-overlay';
            errorModal.style.cssText = 'display: none; align-items: center; justify-content: center; z-index: 10000; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4);';
            errorModal.innerHTML = `
                <div class="am-modal" role="dialog" aria-modal="true" style="max-width: 450px; width: 90%; text-align: center; padding: 40px 30px; border-radius: 20px; position: relative;">
                    <button type="button" class="am-modal-close" style="position: absolute; top: 15px; right: 15px; border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                    <h3 class="am-modal-title" style="margin-top: 0; margin-bottom: 20px; font-family: 'Playfair Display', serif; font-size: 1.8rem; font-weight: 700;">Error</h3>
                    <div style="margin-bottom: 20px;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 3rem; color: #901010;"></i>
                    </div>
                    <div class="error-msg-text am-modal-text" style="font-size: 1.1rem; margin-bottom: 30px; line-height: 1.4; font-family: 'Inter', sans-serif;">
                    </div>
                    <div style="display: flex; justify-content: center;">
                        <button type="button" class="error-accept-btn" style="background-color: #901010; color: white; border: none; border-radius: 8px; padding: 12px 30px; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 1rem; cursor: pointer; min-width: 150px; transition: background-color 0.2s;">Accept</button>
                    </div>
                </div>
            `;
            document.body.appendChild(errorModal);
            
            const closeBtn = errorModal.querySelector('.am-modal-close');
            const acceptBtn = errorModal.querySelector('.error-accept-btn');
            const closeFn = () => { errorModal.style.display = 'none'; };
            closeBtn.addEventListener('click', closeFn);
            acceptBtn.addEventListener('click', closeFn);
        }
        
        errorModal.querySelector('.error-msg-text').textContent = msg;
        errorModal.style.display = 'flex';
    };

    window.SPP = SPP;
})();
