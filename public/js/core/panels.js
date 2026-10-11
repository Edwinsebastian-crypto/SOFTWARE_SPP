/* =========================================================================
   panels.js — Panel navigation shared by the Student, Tutor, Advisor and
   Director views (previously copy-pasted in each page script).

   Flow:  practice -> logbook -> activities -> evidence
                          \-> questions (student / tutor)
   ========================================================================= */
(function () {
    'use strict';
    const SPP = window.SPP;
    const byId = (id) => document.getElementById(id);

    /** Scrolls every scrollable ancestor back to the top (the page, the wrapper and the shell). */
    function resetScroll() {
        window.scrollTo(0, 0);
        const wrapper = document.querySelector('.practice-content-wrapper');
        if (wrapper) wrapper.scrollTop = 0;
        const shell = document.querySelector('.app-shell');
        if (shell) shell.scrollTop = 0;
    }

    /** Hides `from`, shows `to` and scrolls to the top. */
    function swap(from, to, display) {
        from.style.display = 'none';
        to.style.display = display || 'flex';
        resetScroll();
    }

    /** Clicking `trigger` swaps `from` -> `to` (no-op when any element is missing). */
    function link(trigger, from, to, display) {
        if (trigger && from && to) trigger.addEventListener('click', () => swap(from, to, display));
    }

    // ---------------------------------------------------------------- "..." card menus
    function setMenuState(button, open) {
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        const dropdown = button.nextElementSibling; // .ev-dropdown
        if (dropdown) dropdown.classList.toggle('is-open', open);
        const icon = button.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-ellipsis', !open);
            icon.classList.toggle('fa-arrow-left', open);
        }
    }

    function closeAllMenus(except) {
        document.querySelectorAll('.ev-menu-btn').forEach((button) => {
            if (button !== except) setMenuState(button, false);
        });
    }

    /** Opens/closes the "..." menu of one card (the floating panel appears to the left of the button). */
    function bindMenu(card) {
        const button = card.querySelector('.ev-menu-btn');
        if (!button) return;
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = button.getAttribute('aria-expanded') === 'true';
            closeAllMenus(button);
            setMenuState(button, !isOpen);
        });
    }

    /**
     * Event delegation for a list of cards with a "..." menu (catalog lists of the Director).
     * `actions` = { view(card), edit(card), delete(card) }.
     */
    function bindCardList(root, cardSelector, actions) {
        if (!root) return;
        root.addEventListener('click', (e) => {
            const menuButton = e.target.closest('.ev-menu-btn');
            if (menuButton && root.contains(menuButton)) {
                e.stopPropagation();
                const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
                closeAllMenus(menuButton);
                setMenuState(menuButton, !isOpen);
                return;
            }
            const handlers = [['.ev-item--view', actions.view], ['.ev-item--edit', actions.edit], ['.ev-item--delete', actions.delete]];
            for (const [selector, handler] of handlers) {
                const item = e.target.closest(selector);
                if (item && root.contains(item)) {
                    const card = item.closest(cardSelector);
                    closeAllMenus(null);
                    if (card && handler) handler(card);
                    return;
                }
            }
        });
    }

    // ---------------------------------------------------------------- standard panel flow
    /**
     * Wires the navigation of the practice panels.
     * options.questions:
     *   'none'        — no questions section (advisor)
     *   'student'     — "My practice questions" panel
     *   'tutor'       — question bank panel
     *   'placeholder' — section still under construction (director)
     * options.scope: CSS selector of the section that contains the practice panel (director: '#practice').
     */
    function wireStandardFlow(options) {
        const o = Object.assign({ questions: 'none', scope: '' }, options);
        const scoped = (selector) => document.querySelector((o.scope ? o.scope + ' ' : '') + selector);

        const enterButton = scoped('.practice-submit');
        const practicePanel = scoped('.practice-panel');
        const logbookPanel = byId('logbook-panel');
        const activitiesPanel = byId('activities-panel');
        const evidencesPanel = byId('evidences-panel');
        const evidencesTitle = byId('evidences-title');
        const questionsPanel = byId('questions-panel');

        // The logbook panel has one action button per section: [activities, questions]
        const logbookButtons = logbookPanel ? logbookPanel.querySelectorAll('.lb-action-btn') : [];
        const questionButtons = questionsPanel ? questionsPanel.querySelectorAll('.lb-action-btn') : [];

        link(enterButton, practicePanel, logbookPanel);
        link(byId('logbookBack'), logbookPanel, practicePanel, 'block');
        link(logbookButtons[0], logbookPanel, activitiesPanel);
        link(byId('activitiesBack'), activitiesPanel, logbookPanel);
        link(byId('evidencesBack'), evidencesPanel, activitiesPanel);

        // Every activity button (#1 to #6) opens the evidence panel
        const activityButtons = (o.scope ? document.querySelector(o.scope) : document).querySelectorAll('.activity-enter-btn');
        activityButtons.forEach((button, index) => {
            button.addEventListener('click', () => {
                const number = button.getAttribute('data-activity') || (index + 1);
                if (evidencesTitle) evidencesTitle.textContent = `Activity #${number}`;
                swap(activitiesPanel, evidencesPanel);
            });
        });

        if (o.questions === 'none') return;
        link(logbookButtons[1], logbookPanel, questionsPanel);
        link(byId('questionsBack'), questionsPanel, logbookPanel);

        const underConstruction = () => alert('Section under construction');
        if (questionButtons[0]) questionButtons[0].addEventListener('click', underConstruction);

        if (o.questions === 'student') {
            const myQuestions = byId('my-questions-panel');
            link(questionButtons[1], questionsPanel, myQuestions);
            link(byId('myQuestionsBack'), myQuestions, questionsPanel);
        } else if (o.questions === 'tutor') {
            const questionBank = byId('question-bank-panel');
            link(questionButtons[1], questionsPanel, questionBank);
            link(byId('questionBankBack'), questionBank, questionsPanel);
        } else if (questionButtons[1]) {
            questionButtons[1].addEventListener('click', underConstruction);
        }
    }

    /** Tab buttons that show one panel and hide the others. `panelFor(button, index)` returns the id of the panel to show. */
    function wireTabs(buttons, panels, panelFor) {
        buttons.forEach((button, index) => {
            button.addEventListener('click', () => {
                const target = panelFor(button, index);
                if (!target) return;
                buttons.forEach((b) => b.classList.remove('active'));
                button.classList.add('active');
                panels.forEach((panel) => { panel.style.display = panel.id === target ? '' : 'none'; });
            });
        });
    }

    // Close any open "..." menu when clicking anywhere else
    document.addEventListener('click', () => closeAllMenus(null));

    SPP.panels = { resetScroll, swap, link, bindMenu, bindCardList, closeAllMenus, wireStandardFlow, wireTabs };
    SPP.bindMenu = bindMenu;
})();
