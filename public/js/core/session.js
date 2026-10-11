/* =========================================================================
   session.js — Loaded in the 4 panels (after api.js).
   Checks the session, renders the user's name/role/profile and wires "Log out".
   ========================================================================= */
document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('.app-logout').forEach((link) => {
        link.addEventListener('click', (e) => { e.preventDefault(); SPP.logout(); });
    });

    let user;
    try { user = await SPP.session(); } catch (e) { return; }
    const fullName = (user.firstName + ' ' + user.lastName).trim();

    document.querySelectorAll('.app-account strong').forEach((el) => { el.textContent = fullName; });
    document.querySelectorAll('.app-account small').forEach((el) => { el.textContent = SPP.ROLES[user.role] || user.role; });

    // Profile: filled in by the label of each field (the HTML already carries the design)
    const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
    document.querySelectorAll('.profile-info-text').forEach((block) => {
        const label = ((block.querySelector('.profile-info-label') || {}).textContent || '').trim().toLowerCase();
        const value = block.querySelector('.profile-info-value');
        if (!value) return;
        if (label.includes('name')) value.textContent = fullName;
        else if (label.startsWith('id')) value.textContent = user.documentType + ' ' + user.documentNumber;
        else if (label.includes('email')) value.textContent = user.email;
        else if (label.includes('program')) value.textContent = user.program || 'Unassigned';
        else if (label.includes('status')) value.textContent = capitalize(user.status);
    });
});
