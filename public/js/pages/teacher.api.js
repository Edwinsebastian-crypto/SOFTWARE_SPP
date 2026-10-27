/* =========================================================================
   teacher.api.js — Logic shared by the TUTOR and ADVISOR panels.
   Both see the practices assigned to them, review evidence and write
   feedback. The data comes from the API (/api).
   Exposes window.SPP_TEACHER so tutor.api.js can add what is specific to the tutor.
   ========================================================================= */
/* global scrollAppShellToReveal */
document.addEventListener('DOMContentLoaded', async () => {
    const STATUS_COLORS = { active: '#265c48', completed: '#6b7280', cancelled: '#b3261e' };
    const $ = (selector, root) => (root || document).querySelector(selector);
    const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
    const setField = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
                el.value = value == null ? '' : value;
                el.readOnly = true;
            } else {
                el.textContent = value == null ? '' : value;
            }
        }
    };

    const state = { practices: [], practice: null, activities: [], activity: null, evidences: [] };
    window.SPP_TEACHER = { state, reloadLogbook: null };

    const evidencePanel = $('#evidences-panel');
    const evidenceTemplate = $('.ev-card', evidencePanel).cloneNode(true);
    const feedbackTemplate = $('.feedback-card', evidencePanel).cloneNode(true);
    const feedbackSection = $('.feedback-section', evidencePanel);
    const feedbackForm = $('.feedback-form-section', evidencePanel);

    // ---------- practice selector (the original design showed a single, fixed practice) ----------
    const practicePanel = $('.practice-panel');
    const practiceForm = $('.practice-form', practicePanel);
    const selectorBox = document.createElement('div');
    selectorBox.id = 'practice-selector-box';
    selectorBox.className = 'practice-field';
    selectorBox.style.marginBottom = '24px';
    selectorBox.innerHTML = '<label for="practice-selector">Assigned practice (student)</label>' +
        '<div class="cp-input-wrap">' +
        '<select id="practice-selector"></select>' +
        '<i class="fa-solid fa-chevron-down right-icon" aria-hidden="true"></i>' +
        '</div>';
    practiceForm.insertAdjacentElement('beforebegin', selectorBox);
    SPP.customSelect.init('#practice-selector-box');
    const selector = $('#practice-selector', selectorBox);

    try {
        state.practices = (await SPP.get('/api/practices')).practices;
    } catch (e) { SPP.showError(e); return; }

    const enterButton = $('.practice-submit');
    if (!state.practices.length) {
        selector.innerHTML = '<option>You have no assigned practices</option>';
        selector.disabled = true;
        if (enterButton) enterButton.disabled = true;
        SPP.customSelect.rebuild(selector);
        SPP.customSelect.sync(selector);
        return;
    }
    const previous = selector.value;
    selector.innerHTML = state.practices
        .map((p) => `<option value="${p.id}">${SPP.escapeHtml(p.student)} — ${SPP.escapeHtml(p.code)}</option>`).join('');
    
    if (previous && state.practices.some((p) => String(p.id) === previous)) {
        selector.value = previous;
    } else if (selector.options.length > 0) {
        selector.selectedIndex = 0;
    }

    SPP.customSelect.rebuild(selector);
    SPP.customSelect.sync(selector);

    // ---------- fill in practice + logbook ----------
    async function selectPractice(id) {
        const practice = state.practices.find((p) => String(p.id) === String(id));
        if (!practice) return;
        state.practice = practice;
        setField('practice-name', practice.name);
        setField('tutor', practice.tutor);
        setField('hours', practice.hours);
        setField('institution', practice.institution);
        setField('advisor', practice.advisor);
        setField('semester', practice.semester);
        setField('start-date', SPP.formatDate(practice.startDate));
        setField('end-date', SPP.formatDate(practice.endDate));
        setField('code', practice.code);
        const badge = $('.status-badge');
        if (badge) {
            badge.textContent = practice.status;
            badge.title = practice.status;
            badge.style.backgroundColor = STATUS_COLORS[practice.status] || '';
        }

        renderLogbook();
        // The student credential (click on their name) uses this real data
        window.SPP_CURRENT_STUDENT = {
            fullName: practice.student,
            documentType: practice.studentDetails?.documentType,
            documentNumber: practice.studentDocument,
            status: practice.studentDetails?.status,
            program: practice.studentDetails?.program,
            email: practice.studentDetails?.email
        };
        const studentName = $('.lb-student-name');
        if (studentName) studentName.textContent = '- ' + practice.student;

        function displayActivity(activity) {
            if (!activity) return;
            let titleText = `Activity #${activity.number}`;
            if (activity.title && activity.title.toLowerCase() !== 'activity') {
                titleText = activity.title;
            }
            const titleEl = document.getElementById('evidencias-title');
            if (titleEl) titleEl.textContent = titleText;

            const isTutorGenerated = activity.title && activity.title.toLowerCase() !== 'activity';

            let displayName = titleText;
            if (isTutorGenerated) {
                displayName = activity.title;
            }
            setField('act-name-display', displayName);
            setField('act-start-display', SPP.formatActivityDate(activity.assignedDate || activity.createdAt));

            const deadlineContainer = document.getElementById('act-deadline-container');
            const descContainer = document.getElementById('act-desc-container');
            const rightPanel = document.getElementById('act-right-panel');
            const leftPanel = document.getElementById('act-left-panel');
            const detailCard = document.querySelector('.act-details-card');
            const gridRow = document.getElementById('act-grid-row');
            const lblAssigned = document.getElementById('lbl-assigned-date');
            const lblGrade = document.getElementById('lbl-grade');
            const lblHours = document.getElementById('lbl-hours');
            const calIcon = document.getElementById('act-calendar-icon');
            const actMainMenu = document.getElementById('act-main-menu');

            if (isTutorGenerated) {
                if (deadlineContainer) deadlineContainer.style.display = '';
                if (descContainer) descContainer.style.display = '';
                if (rightPanel) rightPanel.style.display = '';
                if (leftPanel) leftPanel.style.width = '';
                if (detailCard) detailCard.style.display = 'flex';
                if (gridRow) gridRow.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px;';

                if (lblAssigned) lblAssigned.textContent = 'Assignment Date';
                if (lblGrade) lblGrade.textContent = 'Grade:';
                if (lblHours) lblHours.textContent = 'Hours Completed';
                if (calIcon) calIcon.style.display = 'none';
                if (actMainMenu) actMainMenu.style.display = '';

                const deadlineVal = activity.dueDate || activity.deadline;
                setField('act-end-display', deadlineVal ? SPP.formatActivityDate(deadlineVal) : 'without limit');
                setField('act-desc-display', activity.description || 'No description provided');

                const filesDisplay = document.getElementById('act-files-display');
                if (filesDisplay) {
                    const files = activity.files || [];
                    if (files.length === 0) {
                        filesDisplay.innerHTML = '<span style="color:#666;font-style:italic">No files attached</span>';
                    } else {
                        filesDisplay.innerHTML = files.map(f =>
                            `<a href="${f.url}" target="_blank" class="am-file-chip" style="cursor:pointer; text-decoration:none; color:inherit; display:inline-flex">
                                <i class="fa-solid fa-paperclip"></i>
                                <span class="am-file-chip-name">${SPP.escapeHtml(f.name)}</span>
                            </a>`
                        ).join('');
                    }
                }
            } else {
                if (deadlineContainer) deadlineContainer.style.display = 'none';
                if (descContainer) descContainer.style.display = 'none';
                if (rightPanel) rightPanel.style.display = 'none';
                if (leftPanel) leftPanel.style.width = '100%';
                if (detailCard) detailCard.style.display = 'block';
                if (gridRow) gridRow.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;';

                if (lblAssigned) lblAssigned.textContent = 'Assigned Date';
                if (lblGrade) lblGrade.textContent = 'Grade';
                if (lblHours) lblHours.textContent = 'Hours Worked';
                if (calIcon) calIcon.style.display = '';
                if (actMainMenu) actMainMenu.style.display = 'none';
            }

            setField('act-hours-display', activity.hours || 0);
            setField('act-grade-display', activity.grade || '0.0');
        }

        let activeActivityFilter = 'all';
        let activitySearchQuery = '';
        let actControlsInitialized = false;

        function getActivityStatusInfo(activity) {
            const rawGrade = activity.grade;
            const gradeNum = (rawGrade !== null && rawGrade !== undefined && rawGrade !== '') ? parseFloat(rawGrade) : null;
            const hasValidGrade = gradeNum !== null && !isNaN(gradeNum) && gradeNum > 0;
            const evidenceCount = Number(activity.evidenceCount) || (Array.isArray(activity.files) ? activity.files.length : 0);
            const feedbackCount = Number(activity.feedbackCount) || 0;

            if (hasValidGrade) {
                return {
                    category: 'graded',
                    badgeClass: 'act-status--graded',
                    label: `Graded ${gradeNum.toFixed(1)}/5.0`,
                    icon: null,
                    gradeValue: gradeNum
                };
            }

            // Completed: el tutor añadió retroalimentación (sin nota asignada aún)
            if (feedbackCount > 0 && !hasValidGrade) {
                return {
                    category: 'completed',
                    badgeClass: 'act-status--submitted',
                    label: 'Completed',
                    icon: 'fa-solid fa-check',
                    gradeValue: null
                };
            }

            // Pending Review: tienen evidencias pero no retroalimentación o nota
            if (evidenceCount > 0 && !hasValidGrade && feedbackCount === 0) {
                return {
                    category: 'review',
                    badgeClass: 'act-status--in-review',
                    label: 'Pending Review',
                    icon: 'fa-solid fa-triangle-exclamation',
                    gradeValue: null
                };
            }

            let isOverdue = false;
            if (activity.dueDate) {
                const due = new Date(activity.dueDate);
                if (!isNaN(due.getTime()) && due.getTime() < Date.now()) {
                    isOverdue = true;
                }
            }

            // Pending tasks: no tienen evidencias
            return {
                category: 'pending',
                badgeClass: 'act-status--due',
                label: isOverdue ? 'Overdue' : 'Due',
                icon: null,
                gradeValue: null
            };
        }

        function activityMatchesFilter(activity, filter) {
            if (!filter || filter === 'all') return true;

            const rawGrade = activity.grade;
            const gradeNum = (rawGrade !== null && rawGrade !== undefined && rawGrade !== '') ? parseFloat(rawGrade) : null;
            const hasValidGrade = gradeNum !== null && !isNaN(gradeNum) && gradeNum > 0;
            const evidenceCount = Number(activity.evidenceCount) || (Array.isArray(activity.files) ? activity.files.length : 0);
            const feedbackCount = Number(activity.feedbackCount) || 0;

            if (filter === 'pending') {
                // Pending tasks: actividades que no tienen evidencias
                return evidenceCount === 0;
            }

            if (filter === 'review') {
                // Pending review: tienen evidencias pero no retroalimentación o nota
                return evidenceCount > 0 && !hasValidGrade && feedbackCount === 0;
            }

            if (filter === 'completed' || filter === 'submitted') {
                // Completed: tienen retroalimentación pero no tienen nota
                return feedbackCount > 0 && !hasValidGrade;
            }

            if (filter === 'graded') {
                // Graded: solo las que tienen una nota
                return hasValidGrade;
            }

            return true;
        }

        function formatCardDueDate(dueDateStr) {
            if (!dueDateStr) return 'No due date';
            try {
                const d = new Date(dueDateStr);
                if (isNaN(d.getTime())) return `Due ${dueDateStr}`;
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const month = months[d.getUTCMonth()];
                const day = d.getUTCDate();
                const year = d.getUTCFullYear();
                return `Due ${month} ${day}, ${year}`;
            } catch (_) {
                return `Due ${dueDateStr}`;
            }
        }

        function formatActivityTitle(activity) {
            const rawTitle = (activity.title || '').trim();
            const actNum = activity.number;
            if (!rawTitle || rawTitle.toLowerCase() === 'activity' || rawTitle.toLowerCase() === `activity #${actNum}` || rawTitle.toLowerCase() === `activity ${actNum}`) {
                return `Activity #${actNum}`;
            }
            if (rawTitle.toLowerCase().startsWith(`activity #${actNum}`) || rawTitle.toLowerCase().startsWith(`activity ${actNum}`)) {
                return rawTitle;
            }
            return `Activity #${actNum} - ${rawTitle}`;
        }

        function updateActivitiesKPIs(activities) {
            const pendingEl = document.getElementById('act-kpi-pending');
            const reviewEl = document.getElementById('act-kpi-review');
            const completedEl = document.getElementById('act-kpi-completed');
            const gradeEl = document.getElementById('act-kpi-grade');
            if (!pendingEl && !completedEl && !gradeEl && !reviewEl) return;

            let pendingCount = 0;
            let reviewCount = 0;
            let completedCount = 0;
            let gradedGrades = [];

            (activities || []).forEach(act => {
                const rawGrade = act.grade;
                const gradeNum = (rawGrade !== null && rawGrade !== undefined && rawGrade !== '') ? parseFloat(rawGrade) : null;
                const hasValidGrade = gradeNum !== null && !isNaN(gradeNum) && gradeNum > 0;
                const evidenceCount = Number(act.evidenceCount) || (Array.isArray(act.files) ? act.files.length : 0);
                const feedbackCount = Number(act.feedbackCount) || 0;

                // Pending tasks: no tienen evidencias
                if (evidenceCount === 0) {
                    pendingCount++;
                }
                // Pending review: tienen evidencias pero no retroalimentación o nota
                if (evidenceCount > 0 && !hasValidGrade && feedbackCount === 0) {
                    reviewCount++;
                }
                // Completed: tienen retroalimentación pero no tienen nota
                if (feedbackCount > 0 && !hasValidGrade) {
                    completedCount++;
                }
                // Graded: actividades con nota
                if (hasValidGrade) {
                    gradedGrades.push(gradeNum);
                }
            });

            if (pendingEl) pendingEl.textContent = pendingCount;
            if (reviewEl) reviewEl.textContent = reviewCount;
            if (completedEl) completedEl.textContent = completedCount;
            if (gradeEl) {
                if (gradedGrades.length > 0) {
                    const avg = gradedGrades.reduce((sum, g) => sum + g, 0) / gradedGrades.length;
                    gradeEl.textContent = `${avg.toFixed(1)}/5.0`;
                } else {
                    gradeEl.textContent = '0.0/5.0';
                }
            }
        }

        function setupActivitiesControls() {
            if (actControlsInitialized) return;
            const searchInput = document.getElementById('act-search-input');
            const filterButtons = document.querySelectorAll('.act-pill-btn');

            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    activitySearchQuery = (e.target.value || '').trim().toLowerCase();
                    renderActivitiesCards();
                });
            }

            filterButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    filterButtons.forEach(b => b.classList.remove('is-active'));
                    btn.classList.add('is-active');
                    activeActivityFilter = btn.getAttribute('data-filter') || 'all';
                    renderActivitiesCards();
                });
            });

            // Quick-filter when clicking KPI cards
            const bindKpiClick = (cardId, filterKey) => {
                const card = document.getElementById(cardId);
                if (card) {
                    card.addEventListener('click', () => {
                        const targetBtn = document.querySelector(`.act-pill-btn[data-filter="${filterKey}"]`);
                        if (targetBtn) targetBtn.click();
                    });
                    card.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            const targetBtn = document.querySelector(`.act-pill-btn[data-filter="${filterKey}"]`);
                            if (targetBtn) targetBtn.click();
                        }
                    });
                }
            };

            bindKpiClick('act-kpi-card-pending', 'pending');
            bindKpiClick('act-kpi-card-review', 'review');
            bindKpiClick('act-kpi-card-completed', 'completed');
            bindKpiClick('act-kpi-card-grade', 'graded');

            actControlsInitialized = true;
        }

        function renderActivitiesCards() {
            const container = document.getElementById('activities-list-container') || document.getElementById('activities-panel');
            if (!container) return;

            // Remove existing cards and empty messages
            container.querySelectorAll('.act-card, .logbook-action-card, .empty-activities-msg, .act-empty-msg').forEach(el => el.remove());

            const activities = state.activities || [];
            const filtered = activities.filter(activity => {
                if (!activityMatchesFilter(activity, activeActivityFilter)) {
                    return false;
                }
                if (activitySearchQuery) {
                    const status = getActivityStatusInfo(activity);
                    const fullText = `${activity.number} ${activity.title || ''} ${activity.description || ''} ${status.label}`.toLowerCase();
                    if (!fullText.includes(activitySearchQuery)) {
                        return false;
                    }
                }
                return true;
            });

            if (filtered.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'act-empty-msg';
                empty.innerHTML = `
                    <i class="fa-regular fa-folder-open" aria-hidden="true"></i>
                    <p>${activities.length === 0 ? 'This practice currently has no activities assigned.' : 'No activities found matching your search or filter.'}</p>
                `;
                container.appendChild(empty);
                return;
            }

            filtered.forEach(activity => {
                const status = getActivityStatusInfo(activity);
                const title = formatActivityTitle(activity);
                const dueFormatted = formatCardDueDate(activity.dueDate);

                const card = document.createElement('div');
                card.className = 'act-card';
                card.setAttribute('data-activity', activity.number);
                card.setAttribute('tabindex', '0');
                card.setAttribute('role', 'button');
                card.setAttribute('aria-label', `${title}, ${dueFormatted}, Status: ${status.label}`);

                card.innerHTML = `
                    <div class="act-card-header">
                        <div class="act-card-icon" aria-hidden="true">
                            <i class="fa-solid fa-file-lines"></i>
                        </div>
                        <h3 class="act-card-title" title="${SPP.escapeHtml(title)}">${SPP.escapeHtml(title)}</h3>
                    </div>
                    <div class="act-card-body">
                        <div class="act-doc-thumb" aria-hidden="true">
                            <div class="act-doc-head"></div>
                            <div class="act-doc-line"></div>
                            <div class="act-doc-line"></div>
                            <div class="act-doc-line short"></div>
                            <div class="act-doc-line"></div>
                            <div class="act-doc-line short"></div>
                        </div>
                        <div class="act-card-info">
                            <span class="act-card-due">${SPP.escapeHtml(dueFormatted)}</span>
                            <span class="act-status-badge ${status.badgeClass}">${status.icon ? `<i class="${status.icon}" style="margin-right: 5px;" aria-hidden="true"></i>` : ''}${SPP.escapeHtml(status.label)}</span>
                        </div>
                        <button type="button" class="act-arrow-btn activity-enter-btn" data-activity="${activity.number}" aria-label="Open activity">
                            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                        </button>
                    </div>
                `;

                const openActivity = async (e) => {
                    if (e) e.stopPropagation();
                    state.activity = state.activities.find((a) => String(a.number) === String(activity.number));
                    if (!state.activity) return;

                    const actividadesPanel = document.getElementById('activities-panel');
                    const evidenciasPanel = document.getElementById('evidences-panel');
                    if (actividadesPanel && evidenciasPanel) {
                        actividadesPanel.style.display = 'none';
                        evidenciasPanel.style.display = 'flex';
                        window.scrollTo(0, 0);
                        const appShell = document.querySelector('.app-shell');
                        if (appShell) appShell.scrollTop = 0;
                        const wrapper = document.querySelector('.practice-content-wrapper');
                        if (wrapper) wrapper.scrollTop = 0;
                    }

                    displayActivity(state.activity);
                    try { await loadEvidence(); } catch (err) { SPP.showError(err); }
                };

                card.addEventListener('click', openActivity);
                card.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openActivity(e);
                    }
                });

                container.appendChild(card);
            });
        }

        async function renderActivitiesList(targetActivityId) {
            if (!state.practice) return;
            try {
                state.activities = (await SPP.get(`/api/practices/${state.practice.id}/activities`)).activities || [];
            } catch (e) { SPP.showError(e); return; }

            // Ensure feedbackCount reflects specifically the reviewer's feedback and calculate real hours
            if (state.activities && state.activities.length > 0) {
                const currentUser = await getCurrentUser();
                const targetRole = (currentUser && currentUser.role === 'advisor') ? 'advisor' : 'tutor';
                await Promise.all(state.activities.map(async (act) => {
                    try {
                        const [res, evRes] = await Promise.all([
                            SPP.get(`/api/activities/${act.id}/feedback`),
                            SPP.get(`/api/activities/${act.id}/evidences`)
                        ]);
                        const roleComments = Array.isArray(res?.feedback)
                            ? res.feedback.filter(item => item.role === targetRole)
                            : [];
                        act.feedbackCount = roleComments.length;
                        act.roleFeedbackCount = roleComments.length;
                        if (Array.isArray(evRes?.evidences)) {
                            act.hours = evRes.evidences.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
                            act.evidenceCount = evRes.evidences.length;
                        }
                    } catch (_) {
                        act.feedbackCount = Number(act.feedbackCount) || 0;
                        act.roleFeedbackCount = Number(act.roleFeedbackCount) || 0;
                    }
                }));
            }

            setupActivitiesControls();
            updateActivitiesKPIs(state.activities);
            renderActivitiesCards();

            // Update card badges on logbook-panel
            // Actividades: solo aparece 'Up to date' si no tiene nada por revisar.
            // Si tiene actividades por retroalimentar (categoría 'review'), muestra "X pending review" en amarillo.
            const reviewCount = (state.activities || []).filter((a) => getActivityStatusInfo(a).category === 'review').length;
            const pendingPill = document.getElementById('lb-pending-pill');
            if (pendingPill) {
                if (reviewCount > 0) {
                    pendingPill.textContent = `${reviewCount} pending review`;
                    pendingPill.className = 'lb-card-pill lb-card-pill--warning';
                } else {
                    pendingPill.textContent = 'Up to date';
                    pendingPill.className = 'lb-card-pill lb-card-pill--uptodate';
                }
            }

            const hoursPill = document.getElementById('lb-hours-pill');
            if (hoursPill) {
                const targetHours = (state.practice?.hours != null && !isNaN(state.practice.hours)) ? state.practice.hours : 0;
                const totalWorked = (state.activities || []).reduce((sum, act) => sum + (Number(act.hours) || 0), 0);
                hoursPill.textContent = `${totalWorked} / ${targetHours} h`;
            }

            await updateTeacherQuestionsPill();

            if (targetActivityId) {
                const updated = state.activities.find(a => String(a.id) === String(targetActivityId));
                if (updated) {
                    state.activity = updated;
                    displayActivity(updated);
                }
            } else if (state.activity) {
                const updated = state.activities.find(a => String(a.id) === String(state.activity.id));
                if (updated) {
                    state.activity = updated;
                    displayActivity(updated);
                }
            }
        }

        async function updateTeacherQuestionsPill() {
            const qPill = document.getElementById('lb-questions-pill');
            if (!qPill) return;

            const setPill = (text, isWarning) => {
                qPill.textContent = text;
                qPill.className = isWarning ? 'lb-card-pill lb-card-pill--warning' : 'lb-card-pill lb-card-pill--uptodate';
            };

            if (!state.practice) {
                setPill('Up to date', false);
                return;
            }

            try {
                const evalApi = window.EvalAPI || (window.SPP && window.SPP.EvalAPI);
                if (!evalApi || !evalApi.tutor || typeof evalApi.tutor.listarEvaluaciones !== 'function') {
                    setPill('Up to date', false);
                    return;
                }

                const practiceId = String(state.practice.id || state.practice.code || '');
                if (!practiceId) {
                    setPill('Up to date', false);
                    return;
                }

                const evs = await evalApi.tutor.listarEvaluaciones({ id_practica: practiceId });
                if (!Array.isArray(evs) || evs.length === 0) {
                    setPill('Up to date', false);
                    return;
                }

                // 1. Evaluaciones en estado BORRADOR
                const draftsCount = evs.filter((ev) => ev.estado === 'BORRADOR').length;

                // 2. Evaluaciones con respuestas sin calificar
                let toGradeCount = 0;
                const evsWithAttempts = evs.filter((ev) => Number(ev.intentos_presentados) > 0);

                if (evsWithAttempts.length > 0) {
                    await Promise.all(evsWithAttempts.map(async (ev) => {
                        try {
                            const intentos = await evalApi.tutor.listarIntentos(ev.id_evaluacion);
                            if (Array.isArray(intentos)) {
                                const pendingAttempts = intentos.filter(
                                    (i) => i.estado === 'ENVIADO' || Number(i.respuestas_pendientes) > 0
                                );
                                toGradeCount += pendingAttempts.length;
                            }
                        } catch (_) {}
                    }));
                }

                if (draftsCount > 0 && toGradeCount > 0) {
                    const draftText = `${draftsCount} ${draftsCount === 1 ? 'draft' : 'drafts'}`;
                    setPill(`${draftText}, ${toGradeCount} to grade`, true);
                } else if (draftsCount > 0) {
                    setPill(`${draftsCount} ${draftsCount === 1 ? 'draft' : 'drafts'}`, true);
                } else if (toGradeCount > 0) {
                    setPill(`${toGradeCount} to grade`, true);
                } else {
                    setPill('Up to date', false);
                }
            } catch (_) {
                setPill('Up to date', false);
            }
        }

        window.SPP_TEACHER.refreshActivities = renderActivitiesList;
        window.SPP_TEACHER.displayActivity = displayActivity;
        window.SPP_TEACHER.updateQuestionsPill = updateTeacherQuestionsPill;

        const evidencesBackBtn = document.getElementById('evidencesBack');
        if (evidencesBackBtn && !evidencesBackBtn.dataset.refreshBound) {
            evidencesBackBtn.addEventListener('click', () => {
                if (window.SPP_TEACHER?.refreshActivities) {
                    window.SPP_TEACHER.refreshActivities();
                }
            });
            evidencesBackBtn.dataset.refreshBound = 'true';
        }

        await renderActivitiesList();
        document.dispatchEvent(new CustomEvent('spp:practice', { detail: practice }));
    }

    // Bind cards to trigger navigation buttons when whole card is clicked
    const cardActivities = document.getElementById('lb-card-activities');
    const actBtn = document.getElementById('preguntas-actividades-btn');
    if (cardActivities && actBtn) {
        cardActivities.addEventListener('click', (e) => {
            if (!e.target.closest('#preguntas-actividades-btn')) actBtn.click();
        });
        cardActivities.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                actBtn.click();
            }
        });
    }

    const cardQuestions = document.getElementById('lb-card-questions');
    const qBtn = document.getElementById('preguntas-preguntas-btn');
    if (cardQuestions && qBtn) {
        cardQuestions.addEventListener('click', (e) => {
            if (!e.target.closest('#preguntas-preguntas-btn')) qBtn.click();
        });
        cardQuestions.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                qBtn.click();
            }
        });
    }

    function updateLogbookHero(logbook) {
        const lb = logbook || {};
        const scoreValEl = document.getElementById('lb-score-val');
        const scoreTitleEl = document.getElementById('lb-grade-title');
        const ringFillEl = document.getElementById('lb-ring-fill');
        const obsTextEl = document.getElementById('lb-obs-text');

        let gradeNum = lb.finalGrade != null && lb.finalGrade !== '' ? parseFloat(lb.finalGrade) : null;
        if (gradeNum === null || isNaN(gradeNum)) {
            gradeNum = 5.0;
        }

        if (scoreValEl) scoreValEl.textContent = gradeNum.toFixed(1);

        let gradeTitle = 'Excelente';
        if (gradeNum >= 4.5) gradeTitle = 'Excelente';
        else if (gradeNum >= 4.0) gradeTitle = 'Sobresaliente';
        else if (gradeNum >= 3.0) gradeTitle = 'Aprobado';
        else if (gradeNum > 0) gradeTitle = 'Reprobado';
        else gradeTitle = 'Sin calificar';

        if (scoreTitleEl) scoreTitleEl.textContent = gradeTitle;

        if (ringFillEl) {
            const circumference = 226.2;
            const pct = Math.max(0, Math.min(1, gradeNum / 5.0));
            ringFillEl.style.strokeDasharray = `${circumference}`;
            ringFillEl.style.strokeDashoffset = `${circumference * (1 - pct)}`;
        }

        if (obsTextEl) {
            const obsText = lb.generalObservation && lb.generalObservation.trim()
                ? lb.generalObservation
                : '¡Qué buen trabajo realizaste!';
            obsTextEl.textContent = obsText;
            obsTextEl.title = obsText;
        }

        const notaDisplay = document.getElementById('grade-display');
        if (notaDisplay) notaDisplay.textContent = lb.finalGrade != null ? Number(lb.finalGrade).toFixed(1) : 'Not graded';
        const obsDisplay = document.getElementById('obs-display');
        if (obsDisplay) {
            obsDisplay.textContent = lb.generalObservation || 'No observations';
            obsDisplay.dataset.fullObs = lb.generalObservation || '';
        }
    }
    window.SPP_TEACHER.updateLogbookHero = updateLogbookHero;

    function updateObsDisplay(obsElement, obsText) {
        const isMobile = window.matchMedia("(max-width: 600px)").matches;
        if (!obsText) {
            obsElement.textContent = 'No observations';
            obsElement.removeAttribute('data-tooltip');
            return;
        }
        if (isMobile) {
            obsElement.textContent = obsText;
            obsElement.removeAttribute('data-tooltip');
        } else {
            const words = obsText.split(/\s+/);
            if (words.length > 10) {
                obsElement.textContent = words.slice(0, 10).join(' ') + '...';
                obsElement.setAttribute('data-tooltip', obsText);
            } else {
                obsElement.textContent = obsText;
                obsElement.removeAttribute('data-tooltip');
            }
        }
    }

    function renderLogbook() {
        if (!state.practice || !state.practice.logbook) return;
        updateLogbookHero(state.practice.logbook);
    }

    window.addEventListener('resize', () => {
        if (state.practice && state.practice.logbook) {
            renderLogbook();
        }
    });
    window.SPP_TEACHER.reloadLogbook = async () => {
        const fresh = (await SPP.get(`/api/practices/${state.practice.id}`)).practice;
        const index = state.practices.findIndex((p) => p.id === fresh.id);
        state.practices[index] = fresh;
        state.practice = fresh;
        renderLogbook();
    };

    selector.addEventListener('change', () => selectPractice(selector.value));

    // ---------- evidence and feedback of the activity ----------
    function evidenceCard(evidence) {
        const card = evidenceTemplate.cloneNode(true);
        card.style.display = '';
        if (evidence.hours != null) {
            $('.ev-card-title', card).textContent = evidence.hours + ' Hours';
        } else {
            $('.ev-card-title', card).textContent = '0 Hours';
        }

        const descText = evidence.description || 'No description provided';
        $('.ev-card-desc', card).textContent = descText.length > 70 ? descText.slice(0, 67) + '...' : descText;

        if (evidence.files && evidence.files.length > 0) {
            const filesDiv = document.createElement('div');
            filesDiv.style.marginTop = '12px';
            filesDiv.style.display = 'flex';
            filesDiv.style.flexWrap = 'wrap';
            filesDiv.style.gap = '8px';

            filesDiv.innerHTML = evidence.files.map(f =>
                `<a href="${f.url}" target="_blank" class="am-file-chip" style="cursor:pointer; text-decoration:none; color:inherit; display:inline-flex">
                    <i class="fa-solid fa-paperclip"></i>
                    <span class="am-file-chip-name">${SPP.escapeHtml(f.name)}</span>
                </a>`
            ).join('');

            $('.ev-card-desc', card).appendChild(filesDiv);
        }

        SPP.bindMenu(card);
        const viewItem = $('.ev-item--view', card);
        if (viewItem) {
            viewItem.addEventListener('click', () => {
                const dd = viewItem.closest('.ev-dropdown');
                if (dd) dd.classList.remove('is-open');
                showEvidenceModal(evidence);
            });
        }
        return card;
    }

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

    function showEvidenceModal(evidence) {
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

    function showFeedbackModal(text) {
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

    function showSuccessFeedbackModal(text) {
        let modal = document.getElementById('success-feedback-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'success-feedback-modal';
            modal.className = 'am-modal-overlay';
            modal.style.display = 'none';
            modal.style.zIndex = '10000';
            modal.innerHTML = `
                <div class="am-modal" role="dialog" aria-modal="true" style="max-width: 450px;">
                    <button type="button" class="am-modal-close" id="sfModalCloseX" aria-label="Close">
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                    <h3 class="am-modal-title" style="margin-bottom: 20px;">Success</h3>

                    <div id="sf-content" class="am-modal-text" style="font-size: 1rem; margin-bottom: 30px; line-height: 1.5; font-family: 'Inter', sans-serif;"></div>

                    <div class="am-actions" style="justify-content: center;">
                        <button type="button" class="am-btn-confirm" id="sfBtnAccept" style="margin: 0; background-color: #901010; color: white;">Accept</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const closeModal = () => modal.style.display = 'none';
            document.getElementById('sfModalCloseX').addEventListener('click', closeModal);
            document.getElementById('sfBtnAccept').addEventListener('click', closeModal);
        }

        document.getElementById('sf-content').textContent = text;
        modal.style.display = 'flex';
    }

    function showDeleteFeedbackModal(feedbackId) {
        let modal = document.getElementById('delete-feedback-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'delete-feedback-modal';
            modal.className = 'am-modal-overlay';
            modal.style.display = 'none';
            modal.style.zIndex = '10000';
            modal.innerHTML = `
                <div class="am-modal" role="dialog" aria-modal="true" aria-labelledby="delete-feedback-title" style="max-width: 450px;">
                    <button type="button" class="am-modal-close" id="dfModalCloseX" aria-label="Close">
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                    <h3 class="am-modal-title" id="delete-feedback-title" style="margin-bottom: 20px;">Confirm Deletion</h3>

                    <div class="am-modal-text" style="font-size: 1rem; margin-bottom: 30px; line-height: 1.5; font-family: 'Inter', sans-serif;">
                        Are you sure you want to delete this feedback?<br><br>
                        This action cannot be undone.
                    </div>

                    <div class="am-actions" style="justify-content: flex-start; gap: 16px;">
                        <button type="button" class="am-btn-cancel" id="dfBtnCancel" style="margin: 0;">Cancel</button>
                        <button type="button" class="am-btn-confirm" id="dfBtnConfirm" style="margin: 0; background-color: #901010; color: white;">Delete</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const closeModal = () => { modal.style.display = 'none'; };
            document.getElementById('dfModalCloseX').addEventListener('click', closeModal);
            document.getElementById('dfBtnCancel').addEventListener('click', closeModal);
        }

        const confirmBtn = document.getElementById('dfBtnConfirm');
        // Remove old listeners
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        newConfirmBtn.addEventListener('click', async () => {
            newConfirmBtn.disabled = true;
            try {
                await SPP.del(`/api/activities/${state.activity.id}/feedback/${feedbackId}`);
                modal.style.display = 'none';
                await loadEvidence();
            } catch (e) {
                SPP.showError(e);
            } finally {
                newConfirmBtn.disabled = false;
            }
        });

        modal.style.display = 'flex';
    }

    let currentUser;
    async function getCurrentUser() {
        if (!currentUser) currentUser = await SPP.session();
        return currentUser;
    }

    async function feedbackCard(feedback) {
        const card = feedbackTemplate.cloneNode(true);
        card.style.display = '';
        $('.feedback-role', card).textContent = feedback.role === 'advisor' ? 'Advisor' : 'Tutor';
        $('.feedback-date', card).textContent = SPP.formatDateTime(feedback.date);
        const words = (feedback.text || '').trim().split(/\s+/).filter(Boolean);
        const truncatedText = words.length > 10 ? words.slice(0, 10).join(' ') + '...' : (feedback.text || '');
        $('.feedback-content', card).textContent = truncatedText;

        const cardBody = $('.feedback-card-body', card);
        if (cardBody) {
            cardBody.style.cursor = 'pointer';
            cardBody.title = 'Click to view full feedback';
            cardBody.addEventListener('click', () => showFeedbackModal(feedback.text));
        }

        const user = await getCurrentUser();
        const isOwner = user.documentNumber === feedback.authorDocument;

        SPP.bindMenu(card);
        const viewItem = $('.ev-item--view', card);
        if (viewItem) viewItem.addEventListener('click', () => showFeedbackModal(feedback.text));

        const editItem = $('.ev-item--edit', card);
        if (editItem) {
            if (!isOwner) {
                editItem.remove();
            } else {
                editItem.addEventListener('click', () => {
                    const textarea = document.querySelector('.feedback-textarea');
                    const title = document.querySelector('.feedback-form-title');
                    if (textarea && title) {
                        textarea.value = feedback.text;
                        textarea.style.height = 'auto';
                        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
                        title.textContent = 'Edit feedback';
                        state.editingFeedbackId = feedback.id;
                        textarea.focus();
                    }
                });
            }
        }

        const deleteItem = $('.ev-item--delete', card);
        if (deleteItem) {
            if (!isOwner) {
                deleteItem.remove();
            } else {
                deleteItem.addEventListener('click', () => showDeleteFeedbackModal(feedback.id));
            }
        }

        return card;
    }

    async function loadEvidence() {
        const activity = state.activity;
        state.evidences = [];
        const [evidenceResult, feedbackResult] = await Promise.all([
            SPP.get(`/api/activities/${activity.id}/evidences`),
            SPP.get(`/api/activities/${activity.id}/feedback`)
        ]);
        state.evidences = evidenceResult.evidences;

        // Sum hours dynamically just like the student view
        const totalHours = state.evidences.reduce((acc, ev) => acc + (Number(ev.hours) || 0), 0);
        const hoursDisplay = document.getElementById('act-hours-display');
        if (hoursDisplay) {
            hoursDisplay.value = totalHours;
            if (hoursDisplay.tagName !== 'INPUT') {
                hoursDisplay.textContent = totalHours;
            }
        }

        fillEvidenceSelector(evidenceResult.evidences);
        $$('.ev-card, .ev-empty', evidencePanel).forEach((node) => node.remove());
        $$('.feedback-card', feedbackSection).forEach((node) => node.remove());

        const actMainMenu = document.getElementById('act-main-menu');
        if (actMainMenu) {
            const deleteBtn = actMainMenu.querySelector('.ev-item--delete');
            if (deleteBtn) {
                deleteBtn.style.display = evidenceResult.evidences.length > 0 ? 'none' : '';
            }
        }

        if (!evidenceResult.evidences.length) {
            const empty = document.createElement('p');
            empty.className = 'ev-empty';
            empty.style.cssText = 'padding:16px 0;opacity:.7;text-align:left;';
            empty.textContent = 'The student has not uploaded evidence for this activity yet.';
            feedbackSection.insertAdjacentElement('beforebegin', empty);
            feedbackForm.style.display = 'none';
        } else {
            feedbackForm.style.display = 'block';
        }

        evidenceResult.evidences.forEach((evidence) => feedbackSection.insertAdjacentElement('beforebegin', evidenceCard(evidence)));
        for (const item of feedbackResult.feedback) {
            feedbackForm.insertAdjacentElement('beforebegin', await feedbackCard(item));
        }

        if (!feedbackResult.feedback.length) {
            const emptyFeedback = document.createElement('p');
            emptyFeedback.className = 'ev-empty';
            emptyFeedback.style.cssText = 'padding:16px 0;opacity:.7;text-align:left;';
            emptyFeedback.textContent = 'There is no feedback yet.';
            feedbackForm.insertAdjacentElement('beforebegin', emptyFeedback);
        }
    }

    // ---------- feedback form ----------
    // In the legacy schema feedback hangs from an evidence: the user chooses which one it is addressed to
    const evidenceSelect = document.createElement('select');
    evidenceSelect.className = 'feedback-evidence';
    evidenceSelect.setAttribute('aria-label', 'Evidence to give feedback on');
    evidenceSelect.style.cssText = 'display:none;width:100%;height:46px;margin:0 0 10px;padding:0 12px;border-radius:10px;border:1px solid #ccc;font-weight:700';
    feedbackForm.insertBefore(evidenceSelect, feedbackForm.firstChild);
    function fillEvidenceSelector(evidences) {
        const list = evidences || state.evidences || [];
        evidenceSelect.innerHTML = list.length
            ? list.map((x) => `<option value="${SPP.escapeHtml(x.id)}">${SPP.escapeHtml(x.hours ? x.hours + ' Hours' : 'Evidence')}</option>`).join('')
            : '<option value="">The student has not uploaded evidence yet</option>';
    }
    const textarea = $('.feedback-textarea', feedbackForm);
    textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
        // keep the "Cancel" button visible while typing (instant scroll, never smooth)
        if (typeof scrollAppShellToReveal === 'function') scrollAppShellToReveal($('.feedback-btn-cancel', feedbackForm));
    });
    const btnCancel = $('.feedback-btn-cancel', feedbackForm);
    if (!btnCancel.dataset.bound) {
        btnCancel.addEventListener('click', () => {
            textarea.value = '';
            textarea.style.height = 'auto';
            state.editingFeedbackId = null;
            const title = $('.feedback-form-title', feedbackForm);
            if (title) title.textContent = 'Add Comment:';
        });
        btnCancel.dataset.bound = 'true';
    }

    const btnSubmit = $('.feedback-btn-submit', feedbackForm);
    if (!btnSubmit.dataset.bound) {
        btnSubmit.addEventListener('click', async () => {
            const currentTextarea = $('.feedback-textarea', feedbackForm);
            const text = currentTextarea.value.trim();
            if (!text) { alert('Please enter a comment before sending.'); return; }

            btnSubmit.disabled = true;
            try {
                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const localDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

                if (state.editingFeedbackId) {
                    await SPP.patch(`/api/activities/${state.activity.id}/feedback/${state.editingFeedbackId}`, { text, date: localDate });
                    state.editingFeedbackId = null;
                    const title = $('.feedback-form-title', feedbackForm);
                    if (title) title.textContent = 'Add Comment:';
                    showSuccessFeedbackModal('Feedback updated successfully');
                } else {
                    if (!evidenceSelect.value) { alert('This activity has no evidence to give feedback on yet.'); btnSubmit.disabled = false; return; }
                    await SPP.post(`/api/activities/${state.activity.id}/feedback`, { text, evidenceId: evidenceSelect.value, date: localDate });
                    showSuccessFeedbackModal('Feedback sent successfully');
                }
                currentTextarea.value = '';
                currentTextarea.style.height = 'auto';
                await loadEvidence();
                if (window.SPP_TEACHER?.refreshActivities) {
                    await window.SPP_TEACHER.refreshActivities();
                }
            } catch (e) {
                SPP.showError(e);
            } finally {
                btnSubmit.disabled = false;
            }
        });
        btnSubmit.dataset.bound = 'true';
    }

    await selectPractice(selector.value);
});
