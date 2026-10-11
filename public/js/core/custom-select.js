/* =========================================================================
   custom-select.js — Replaces the native <select> of the Director forms with a
   styled dropdown (desktop) or an overlay sheet (compact desktop / mobile).
   Public API:
     SPP.customSelect.init(rootSelector)   turn the selects inside a section into custom selects
     SPP.customSelect.resetIn(root)        put every select of `root` back on its first option
     SPP.customSelect.rebuild(select)      redraw the visual list after the options changed
     SPP.customSelect.sync(select)         refresh the trigger text from the select value
     SPP.fillSelect(select, items, valueKey, textKey, placeholder)
   ========================================================================= */
(function () {
    'use strict';
    const SPP = window.SPP;

    const VISIBLE_ROWS = 5;
    let scrollLockHost = null;
    let scrollAllowEl = null;
    let sheet = null;
    let sheetChevron = null;

    function isMobileLayout() {
        return window.innerWidth <= 900 || window.innerHeight <= 500;
    }

    /** Compact desktop (laptops < ~15", reduced windows). Does not include phones. */
    function isCompactComputerLayout() {
        if (isMobileLayout()) return false;
        return window.innerWidth <= 1536 || window.innerHeight <= 864;
    }

    function usesOverlaySheet() {
        return isMobileLayout() || isCompactComputerLayout();
    }

    // ---------------------------------------------------------------- background scroll lock
    function blockBackgroundScroll(event) {
        if (scrollAllowEl && scrollAllowEl.contains(event.target)) return;
        event.preventDefault();
    }

    function lockBackgroundScroll(scrollContainer) {
        unlockBackgroundScroll();
        scrollAllowEl = scrollContainer;
        scrollLockHost = document.querySelector('.app-shell') || document;
        scrollLockHost.addEventListener('wheel', blockBackgroundScroll, { passive: false });
        scrollLockHost.addEventListener('touchmove', blockBackgroundScroll, { passive: false });
    }

    function unlockBackgroundScroll() {
        if (scrollLockHost) {
            scrollLockHost.removeEventListener('wheel', blockBackgroundScroll);
            scrollLockHost.removeEventListener('touchmove', blockBackgroundScroll);
        }
        scrollLockHost = null;
        scrollAllowEl = null;
    }

    function ensureOptionHeight() {
        if (document.documentElement.dataset.cpSelectOptionHeight) return;
        const probe = document.createElement('div');
        probe.className = 'custom-option';
        probe.textContent = 'M';
        probe.style.visibility = 'hidden';
        probe.style.position = 'absolute';
        probe.style.pointerEvents = 'none';
        document.body.appendChild(probe);
        const height = Math.ceil(probe.getBoundingClientRect().height) || 44;
        probe.remove();
        document.documentElement.dataset.cpSelectOptionHeight = String(height);
        document.documentElement.style.setProperty('--cp-select-option-height', `${height}px`);
        document.documentElement.style.setProperty('--cp-select-visible-rows', String(VISIBLE_ROWS));
    }

    // ---------------------------------------------------------------- overlay sheet
    function ensureSheet() {
        if (sheet) return sheet;

        const root = document.createElement('div');
        root.className = 'cp-select-sheet-root';
        root.id = 'cpSelectSheetRoot';
        root.hidden = true;
        root.innerHTML = `
            <div class="cp-select-sheet-backdrop" data-cp-select-dismiss tabindex="-1" aria-hidden="true"></div>
            <div class="cp-select-sheet" role="dialog" aria-modal="true" aria-labelledby="cpSelectSheetTitle" tabindex="-1">
                <div class="cp-select-sheet-handle" aria-hidden="true"></div>
                <p class="cp-select-sheet-title" id="cpSelectSheetTitle"></p>
                <div class="cp-select-sheet-list"></div>
            </div>`;
        document.body.appendChild(root);

        root.querySelector('[data-cp-select-dismiss]').addEventListener('click', closeSheet);
        root.querySelector('.cp-select-sheet').addEventListener('click', (e) => e.stopPropagation());

        sheet = {
            root,
            title: root.querySelector('.cp-select-sheet-title'),
            list: root.querySelector('.cp-select-sheet-list'),
            dialog: root.querySelector('.cp-select-sheet')
        };
        return sheet;
    }

    function closeSheet() {
        if (!sheet || sheet.root.hidden) return;
        sheet.root.hidden = true;
        sheet.root.classList.remove('cp-select-sheet-root--center');
        sheet.list.replaceChildren();
        if (sheetChevron) {
            sheetChevron.style.transform = 'rotate(0deg)';
            sheetChevron = null;
        }
        unlockBackgroundScroll();
    }

    function closeAll() {
        document.querySelectorAll('.custom-options').forEach((list) => list.classList.remove('open'));
        document.querySelectorAll('.cp-input-wrap .right-icon').forEach((icon) => {
            icon.style.transform = 'rotate(0deg)';
        });
        closeSheet();
        unlockBackgroundScroll();
    }

    function fieldLabel(select) {
        const field = select.closest('.cp-field, .practice-field');
        const label = field?.querySelector('label');
        if (label?.textContent) return label.textContent.trim();
        const first = select.options[0];
        return first ? first.text.trim() : 'Select';
    }

    function applyValue(select, trigger, option) {
        select.value = option.value;
        trigger.textContent = option.text;
        trigger.classList.toggle('is-placeholder', !!option.disabled);
        closeAll();
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function openSheet({ select, trigger, chevron }) {
        const current = ensureSheet();
        closeAll();

        const centered = isCompactComputerLayout() && !isMobileLayout();
        current.root.classList.toggle('cp-select-sheet-root--center', centered);

        current.title.textContent = fieldLabel(select);
        current.list.replaceChildren();

        Array.from(select.options).forEach((option) => {
            if (option.disabled && option.value === '') return;

            const item = document.createElement('div');
            item.className = 'custom-option';
            item.textContent = option.text;
            item.dataset.value = option.value;
            if (select.value === option.value) item.classList.add('selected');

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                applyValue(select, trigger, option);
            });
            current.list.appendChild(item);
        });

        if (current.list.children.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'custom-option';
            empty.style.opacity = '0.5';
            empty.style.pointerEvents = 'none';
            empty.textContent = 'No records available';
            current.list.appendChild(empty);
        }

        current.root.hidden = false;
        sheetChevron = chevron;
        if (chevron) chevron.style.transform = 'rotate(180deg)';
        lockBackgroundScroll(current.list);
        current.dialog.focus({ preventScroll: true });
    }

    // ---------------------------------------------------------------- public API
    function init(rootSelector) {
        const root = document.querySelector(rootSelector);
        if (!root) return;

        ensureOptionHeight();

        root.querySelectorAll('.cp-input-wrap select').forEach((select) => {
            if (select.classList.contains('hidden-select')) return;

            select.classList.add('hidden-select');
            const wrapper = select.parentElement;
            const chevron = wrapper.querySelector('.right-icon');

            const container = document.createElement('div');
            container.className = 'custom-select-container';

            const trigger = document.createElement('div');
            trigger.className = 'custom-select-trigger';
            trigger.setAttribute('role', 'button');
            trigger.setAttribute('tabindex', '0');
            trigger.setAttribute('aria-haspopup', 'listbox');

            const selected = select.options[select.selectedIndex] || select.options[0];
            trigger.textContent = selected ? selected.text : '';
            if (selected && selected.disabled) trigger.classList.add('is-placeholder');

            const optionsList = document.createElement('div');
            optionsList.className = 'custom-options';
            optionsList.setAttribute('role', 'listbox');

            Array.from(select.options).forEach((option) => {
                if (option.disabled && option.value === '') return;

                const item = document.createElement('div');
                item.className = 'custom-option';
                item.setAttribute('role', 'option');
                item.textContent = option.text;
                item.dataset.value = option.value;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    applyValue(select, trigger, option);
                });
                optionsList.appendChild(item);
            });

            if (optionsList.children.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'custom-option';
                empty.style.opacity = '0.5';
                empty.style.pointerEvents = 'none';
                empty.textContent = 'No records available';
                optionsList.appendChild(empty);
            }

            function toggleDropdown(e) {
                if (select.disabled) return;
                e.stopPropagation();

                if (usesOverlaySheet()) {
                    if (sheet && !sheet.root.hidden && sheetChevron === chevron) {
                        closeAll();
                        return;
                    }
                    openSheet({ select, trigger, chevron });
                    return;
                }

                const wasOpen = optionsList.classList.contains('open');
                closeAll();

                if (!wasOpen) {
                    optionsList.classList.add('open');
                    if (chevron) chevron.style.transform = 'rotate(180deg)';
                    lockBackgroundScroll(optionsList);
                }
            }

            trigger.addEventListener('click', toggleDropdown);
            trigger.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleDropdown(e);
                }
            });

            if (chevron) {
                chevron.style.cursor = 'pointer';
                chevron.style.transition = 'transform 0.2s ease';
                chevron.addEventListener('click', toggleDropdown);
            }

            container.appendChild(trigger);
            container.appendChild(optionsList);
            wrapper.appendChild(container);
        });
    }

    /** Puts every select of `root` back on its first option and refreshes the visual trigger. */
    function resetIn(root) {
        root.querySelectorAll('.cp-input-wrap select').forEach((select) => {
            const trigger = select.parentElement.querySelector('.custom-select-trigger');
            const first = select.options[0];
            const chevron = select.parentElement.querySelector('.right-icon');
            select.selectedIndex = 0;
            if (trigger && first) {
                trigger.textContent = first.text;
                trigger.classList.toggle('is-placeholder', !!first.disabled);
            }
            if (chevron) chevron.style.transform = 'rotate(0deg)';
        });
    }

    /** Refreshes the trigger text from the select's current value. */
    function sync(select) {
        if (!select) return;
        const wrapper = select.closest('.cp-input-wrap');
        const trigger = wrapper ? wrapper.querySelector('.custom-select-trigger') : null;
        const option = select.options[select.selectedIndex];
        
        if (wrapper) {
            const container = wrapper.querySelector('.custom-select-container');
            if (select.disabled) {
                wrapper.classList.add('is-disabled');
                if (container) container.classList.add('is-disabled');
            } else {
                wrapper.classList.remove('is-disabled');
                if (container) container.classList.remove('is-disabled');
            }
        }

        if (!trigger || !option) return;
        trigger.textContent = option.text;
        trigger.classList.toggle('is-placeholder', !!option.disabled);
    }

    /** The options changed after init(): redraw the visual list from the <select>. */
    function rebuild(select) {
        const container = select.parentElement && select.parentElement.querySelector('.custom-select-container');
        if (!container) return;
        const trigger = container.querySelector('.custom-select-trigger');
        const list = container.querySelector('.custom-options');
        const first = select.options[0];
        trigger.textContent = first ? first.text : '';
        trigger.classList.toggle('is-placeholder', !!(first && first.disabled));
        
        if (select.disabled) {
            select.parentElement.classList.add('is-disabled');
            container.classList.add('is-disabled');
        } else {
            select.parentElement.classList.remove('is-disabled');
            container.classList.remove('is-disabled');
        }
        
        list.innerHTML = '';
        Array.from(select.options).forEach((option) => {
            if (option.disabled && option.value === '') return;
            const item = document.createElement('div');
            item.className = 'custom-option';
            item.setAttribute('role', 'option');
            item.textContent = option.text;
            item.dataset.value = option.value;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                select.value = option.value;
                trigger.textContent = option.text;
                trigger.classList.remove('is-placeholder');
                select.dispatchEvent(new Event('change', { bubbles: true }));
                list.classList.remove('is-open', 'open', 'show');
                container.classList.remove('is-open', 'open', 'show');
            });
            list.appendChild(item);
        });

        if (list.children.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'custom-option';
            empty.style.opacity = '0.5';
            empty.style.pointerEvents = 'none';
            empty.textContent = 'No records available';
            list.appendChild(empty);
        }
    }

    /** Empties a <select> and fills it with options; keeps the placeholder (first, disabled option). */
    SPP.fillSelect = function (select, items, valueKey, textKey, placeholder) {
        if (!select) return;
        select.innerHTML = '';
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.disabled = true;
        placeholderOption.selected = true;
        placeholderOption.textContent = placeholder || 'Select';
        select.appendChild(placeholderOption);
        items.forEach((item) => {
            const option = document.createElement('option');
            option.value = String(item[valueKey]);
            option.textContent = typeof textKey === 'function' ? textKey(item) : item[textKey];
            select.appendChild(option);
        });
        rebuild(select);
    };

    // Global listeners (registered once)
    document.addEventListener('click', closeAll);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
    window.addEventListener('resize', () => { if (!usesOverlaySheet()) closeSheet(); });

    SPP.customSelect = { init, resetIn, sync, rebuild };
})();
