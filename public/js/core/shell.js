/* =========================================================================
   shell.js — Shared shell (sidebar, topbar, mobile menu, theme).
   Used by ALL logged-in panels (student, tutor, advisor, director).
   Do not put anything panel-specific here; if a panel needs its own JS
   (for example tutor.js), load it SEPARATELY, after this file.
   ========================================================================= */

// --- Real visible height on mobile ---
// On several Android browsers "dvh" is not recalculated correctly on load. --app-vh
// fixes that with visualViewport. CAUTION: when the keyboard opens, visualViewport
// shrinks; if we applied that height to .app-shell, the top bar would seem to
// "disappear" until it scrolls out of the screen. That is why, with a focused field
// and an open keyboard, we keep the layout height (without keyboard).
let layoutViewportHeight = window.innerHeight;

function isMobileLayout() {
    return window.innerWidth <= 900 || window.innerHeight <= 500;
}

function isFormField(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
        el.isContentEditable;
}

function isLikelyKeyboardOpen(vv) {
    if (!vv) return false;
    return vv.height < layoutViewportHeight * 0.72;
}

function setAppViewportHeight() {
    const vv = window.visualViewport;
    const typing = isFormField(document.activeElement);
    let height = window.innerHeight;

    if (vv) {
        if (typing && isLikelyKeyboardOpen(vv)) {
            height = layoutViewportHeight;
        } else {
            height = vv.height;
            if (!isLikelyKeyboardOpen(vv)) {
                layoutViewportHeight = Math.max(window.innerHeight, vv.height);
            }
        }
    }

    document.documentElement.style.setProperty('--app-vh', (height * 0.01) + 'px');
}

/* exported scrollAppShellToReveal */
/** Scrolls only .app-shell down to reveal an element (without scrollIntoView). */
function scrollAppShellToReveal(element, margin = 16) {
    const shell = document.querySelector('.app-shell');
    if (!shell || !element) return;
    const shellRect = shell.getBoundingClientRect();
    const elRect = element.getBoundingClientRect();
    if (elRect.bottom > shellRect.bottom - margin) {
        shell.scrollTop += elRect.bottom - shellRect.bottom + margin;
    }
}

function updateAppTopbarOffset() {
    if (!isMobileLayout()) {
        document.documentElement.style.removeProperty('--app-topbar-offset');
        return;
    }
    let topbar = null;
    document.querySelectorAll('.app-content').forEach((section) => {
        if (window.getComputedStyle(section).display === 'none') return;
        topbar = section.querySelector('.app-topbar');
    });
    if (topbar && topbar.offsetHeight > 0) {
        document.documentElement.style.setProperty('--app-topbar-offset', topbar.offsetHeight + 'px');
    }
}
window.SPP = window.SPP || {};
window.SPP.updateAppTopbarOffset = updateAppTopbarOffset;

function refreshMobileChromeMetrics() {
    setAppViewportHeight();
    updateAppTopbarOffset();
}

refreshMobileChromeMetrics();
window.addEventListener('resize', refreshMobileChromeMetrics);
window.addEventListener('orientationchange', () => {
    layoutViewportHeight = window.innerHeight;
    setTimeout(refreshMobileChromeMetrics, 120);
});
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setAppViewportHeight);
}

document.addEventListener('focusout', (e) => {
    if (!isFormField(e.target)) return;
    setTimeout(() => {
        layoutViewportHeight = window.innerHeight;
        refreshMobileChromeMetrics();
    }, 120);
});

document.addEventListener('DOMContentLoaded', () => {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mobileMenuToggles = document.querySelectorAll('.mobile-menu-toggle');
    const shell = document.querySelector('.app-shell');
    const sidebar = document.querySelector('.app-sidebar');
    const themeToggleBtns = document.querySelectorAll('.theme-toggle-btn');

    // Theme toggle
    themeToggleBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');

            themeToggleBtns.forEach((toggleBtn) => {
                const icon = toggleBtn.querySelector('i:first-child');
                const text = toggleBtn.querySelector('span');

                if (isDark) {
                    icon.classList.remove('fa-sun', 'fa-regular');
                    icon.classList.add('fa-moon', 'fa-solid');
                    text.textContent = 'Dark';
                } else {
                    icon.classList.remove('fa-moon', 'fa-solid');
                    icon.classList.add('fa-sun', 'fa-regular');
                    text.textContent = 'Light';
                }
            });
        });
    });

    // Tab navigation
    const navLinks = document.querySelectorAll('.app-nav-link');
    const sections = document.querySelectorAll('.app-content');

    // Activate item on page load if marked data-active or data-activo
    const preActive = document.querySelector('.app-nav-link[data-active], .app-nav-link[data-activo]');
    if (preActive) {
        navLinks.forEach((nav) => {
            nav.classList.remove('app-nav-link--active');
            nav.removeAttribute('aria-current');
        });
        preActive.classList.add('app-nav-link--active');
        preActive.setAttribute('aria-current', 'page');
    }

    navLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
            if (link.hasAttribute('data-externo') || link.hasAttribute('data-external')) return; // real link to another page: let the browser navigate
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);

            // Update links
            navLinks.forEach((nav) => {
                nav.classList.remove('app-nav-link--active');
                nav.removeAttribute('aria-current');
            });
            link.classList.add('app-nav-link--active');
            link.setAttribute('aria-current', 'page');

            // Show the matching section
            sections.forEach((section) => {
                if (section.id === targetId) {
                    section.style.display = isMobileLayout() ? 'block' : 'flex';
                    const wrapper = section.querySelector('.practice-content-wrapper');
                    if (wrapper) wrapper.style.display = ''; // restore visibility
                } else {
                    section.style.display = 'none';
                }
            });

            // Scroll back to the top when switching sections. .app-shell is the only
            // container that really scrolls (all sections live stacked inside it and
            // only their display changes); if it is not reset here, the new section
            // "inherits" the scroll of the previous one and may appear already
            // scrolled to the bottom instead of starting at the top.
            window.scrollTo(0, 0);
            if (shell) shell.scrollTop = 0;
            document.querySelectorAll('.app-shell, .practice-content-wrapper, .reports-wrapper').forEach((el) => {
                el.scrollTop = 0;
            });
            updateAppTopbarOffset();
            requestAnimationFrame(updateAppTopbarOffset);

            // On mobile, close the menu after choosing an option
            if (isMobileLayout() && shell.classList.contains('sidebar-open')) {
                closeMobileMenu();
            }
        });
    });

    // On load: leave no menu option selected.
    // So that the top bar does not disappear on mobile, we keep the first
    // section visible but hide its content.
    navLinks.forEach((nav) => {
        nav.classList.remove('app-nav-link--active');
        nav.removeAttribute('aria-current');
    });
    sections.forEach((section, index) => {
        if (index === 0) {
            section.style.display = 'flex';
            const wrapper = section.querySelector('.practice-content-wrapper');
            if (wrapper) wrapper.style.display = 'none';
        } else {
            section.style.display = 'none';
        }
    });

    updateAppTopbarOffset();
    // --- Mobile menu ---
    // .app-shell is the container that scrolls on mobile (see CSS).
    // Instead of changing its "overflow" to block the background scroll
    // (which makes the scrollbar appear/disappear and visibly reflows the
    // content), the scroll gesture itself is blocked, letting the one that
    // happens inside the menu pass freely.
    function blockBackgroundScroll(event) {
        if (sidebar && !sidebar.contains(event.target)) {
            event.preventDefault();
        }
    }

    function openMobileMenu() {
        shell.classList.add('sidebar-open');
        shell.addEventListener('wheel', blockBackgroundScroll, { passive: false });
        shell.addEventListener('touchmove', blockBackgroundScroll, { passive: false });
    }

    function closeMobileMenu() {
        shell.classList.remove('sidebar-open');
        shell.removeEventListener('wheel', blockBackgroundScroll);
        shell.removeEventListener('touchmove', blockBackgroundScroll);
    }

    function toggleMobileMenu() {
        if (shell.classList.contains('sidebar-open')) {
            closeMobileMenu();
        } else {
            openMobileMenu();
        }
    }

    // Toggle for desktop/tablet (collapse sidebar) or mobile (open drawer)
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            if (!isMobileLayout()) {
                shell.classList.toggle('sidebar-collapsed');
            } else {
                toggleMobileMenu();
            }
        });
    }

    // Toggle for mobile (open the sidebar from the topbar)
    mobileMenuToggles.forEach((toggle) => {
        toggle.addEventListener('click', toggleMobileMenu);
    });

    // Close the sidebar on mobile when clicking outside
    document.addEventListener('click', (event) => {
        if (!shell) return;
        if (isMobileLayout()) {
            let clickedOnMobileToggle = false;
            mobileMenuToggles.forEach((toggle) => {
                if (toggle.contains(event.target)) {
                    clickedOnMobileToggle = true;
                }
            });

            if (shell.classList.contains('sidebar-open') &&
                sidebar && !sidebar.contains(event.target) &&
                (!sidebarToggle || !sidebarToggle.contains(event.target)) &&
                !clickedOnMobileToggle) {
                closeMobileMenu();
            }
        }
    });

    // If the window becomes desktop-sized with the mobile menu open, clean it up
    window.addEventListener('resize', () => {
        if (!isMobileLayout() && shell?.classList.contains('sidebar-open')) {
            closeMobileMenu();
        }
    });

    // --- Floating tooltip for collapsed sidebar (estilo verde platino) ---
    if (sidebar && shell) {
        let tooltip = document.getElementById('sidebar-collapsed-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'sidebar-collapsed-tooltip';
            tooltip.className = 'sidebar-tooltip';
            tooltip.setAttribute('role', 'tooltip');
            tooltip.setAttribute('aria-hidden', 'true');
            document.body.appendChild(tooltip);
        }

        function showTooltip(el) {
            if (!shell.classList.contains('sidebar-collapsed') || isMobileLayout()) {
                hideTooltip();
                return;
            }
            let label = el.querySelector('span')?.textContent?.replace(/\s+/g, ' ').trim();
            if (!label) {
                if (el.classList.contains('sidebar-toggle')) {
                    label = 'Menú';
                } else {
                    label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
                }
            }
            if (!label) return;

            tooltip.textContent = label;
            const rect = el.getBoundingClientRect();
            const left = Math.round(rect.right + 12);
            const top = Math.round(rect.top + (rect.height / 2));

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
            tooltip.classList.add('is-visible');
        }

        function hideTooltip() {
            if (tooltip) {
                tooltip.classList.remove('is-visible');
            }
        }

        const menuItems = sidebar.querySelectorAll('.app-nav-link, .app-logout, .sidebar-toggle');
        menuItems.forEach((item) => {
            item.addEventListener('mouseenter', () => showTooltip(item));
            item.addEventListener('mouseleave', hideTooltip);
            item.addEventListener('focus', () => showTooltip(item));
            item.addEventListener('blur', hideTooltip);
            item.addEventListener('click', hideTooltip);
        });

        sidebar.addEventListener('mouseleave', hideTooltip);
        window.addEventListener('scroll', hideTooltip, { passive: true });

        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', hideTooltip);
        }
    }

});

// On mobile only .app-shell may scroll. If anything (scrollIntoView, focus, autofill...)
// scrolls the window/body, put it back so the fixed top bar never covers the page title.
window.addEventListener('scroll', () => {
    if (!isMobileLayout()) return;
    if (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }
}, { passive: true });