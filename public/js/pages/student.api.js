/* =========================================================================
   student.api.js — Connects the STUDENT panel with the API (/api).
   student.js takes care of the navigation between panels; this file only
   fetches/saves data and fills in the existing HTML.
   ========================================================================= */
document.addEventListener('DOMContentLoaded', async () => {
    const STATUS_COLORS = { active: '#265c48', completed: '#6b7280', cancelled: '#b3261e' };
    const $ = (selector, root) => (root || document).querySelector(selector);
    const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
    const setField = (id, value) => {
        const el = document.getElementById(id);
        if (!el) return;
        const text = value == null || value === '' ? '—' : value;
        // read-only practice values are <div class="practice-value">; inputs are still supported
        if ('value' in el && el.tagName !== 'DIV') { el.value = value == null ? '' : value; el.readOnly = true; }
        else el.textContent = text;
    };
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value == null || value === '' ? '—' : value;
    };

    let practice = null;
    let currentActivity = null;

    // ---------- templates taken from the original HTML ----------
    const evidencePanel = $('#evidences-panel');
    const evidenceTemplate = $('.ev-card', evidencePanel) ? $('.ev-card', evidencePanel).cloneNode(true) : null;
    const feedbackTemplate = $('.feedback-card', evidencePanel) ? $('.feedback-card', evidencePanel).cloneNode(true) : null;

    // ---------- 1) Practice and logbook ----------
    try {
        const { practices } = await SPP.get('/api/practices');
        practice = practices.find((p) => p.status === 'active') || practices[0] || null;
    } catch (e) { SPP.showError(e); return; }

    const enterButton = $('.practice-submit');
    if (!practice) {
        if (enterButton) { enterButton.disabled = true; enterButton.title = 'You do not have an assigned practice yet'; }
        const heading = $('#practice-title');
        if (heading) heading.textContent = 'Practice Information — you do not have an assigned practice yet';
        return;
    }

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

    // Logbook card: [Final Grade, General Observation] hero banner & cards
    function updateLogbookHero(logbook) {
        const lb = logbook || {};
        const scoreValEl = $('#lb-score-val');
        const scoreTitleEl = $('#lb-grade-title');
        const ringFillEl = $('#lb-ring-fill');
        const obsTextEl = $('#lb-obs-text');

        let gradeNum = lb.finalGrade != null && lb.finalGrade !== '' ? parseFloat(lb.finalGrade) : null;
        if (gradeNum === null || isNaN(gradeNum)) {
            // Default 5.0 as shown in Image 2
            gradeNum = 5.0;
        }

        if (scoreValEl) scoreValEl.textContent = gradeNum.toFixed(1);
        
        let gradeTitle = 'Excellent';
        if (gradeNum >= 4.5) gradeTitle = 'Excellent';
        else if (gradeNum >= 4.0) gradeTitle = 'Outstanding';
        else if (gradeNum >= 3.0) gradeTitle = 'Passed';
        else if (gradeNum > 0) gradeTitle = 'Failed';
        else gradeTitle = 'Ungraded';
        
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
                : 'Great work completed!';
            obsTextEl.textContent = obsText;
            obsTextEl.title = obsText;
        }
    }

    updateLogbookHero(practice.logbook);

    // Bind cards to trigger navigation buttons when whole card is clicked
    const cardActivities = document.getElementById('lb-card-activities');
    const actBtn = document.getElementById('activities-btn');
    if (cardActivities && actBtn) {
        cardActivities.addEventListener('click', (e) => {
            if (!e.target.closest('#activities-btn')) actBtn.click();
        });
        cardActivities.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                actBtn.click();
            }
        });
    }

    const cardQuestions = document.getElementById('lb-card-questions');
    const qBtn = document.getElementById('questions-btn');
    if (cardQuestions && qBtn) {
        cardQuestions.addEventListener('click', (e) => {
            if (!e.target.closest('#questions-btn') && !e.target.closest('.lb-action-btn')) qBtn.click();
        });
        cardQuestions.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                qBtn.click();
            }
        });
    }

    if (qBtn && !qBtn.dataset.studentBound) {
        qBtn.addEventListener('click', () => {
            const panelLogbook = document.getElementById('logbook-panel');
            const questionsPanel = document.getElementById('questions-panel');
            if (panelLogbook) panelLogbook.style.display = 'none';
            if (questionsPanel) questionsPanel.style.display = 'flex';
            window.scrollTo(0, 0);
            if (window.SPP_EVAL_ESTUDIANTE && typeof window.SPP_EVAL_ESTUDIANTE.abrir === 'function') {
                window.SPP_EVAL_ESTUDIANTE.abrir();
            }
        });
        qBtn.dataset.studentBound = 'true';
    }

    // ---------- 2) Activities ----------
    let activitiesList = [];
    let activeActivityFilter = 'all';
    let activitySearchQuery = '';
    let actControlsInitialized = false;

    function getActivityStatusInfo(activity) {
        const rawGrade = activity.grade;
        const gradeNum = (rawGrade !== null && rawGrade !== undefined && rawGrade !== '') ? parseFloat(rawGrade) : null;
        const hasValidGrade = gradeNum !== null && !isNaN(gradeNum) && gradeNum > 0;
        const evidenceCount = Number(activity.evidenceCount) || (Array.isArray(activity.files) ? activity.files.length : 0);
        const feedbackCount = Number(activity.tutorFeedbackCount ?? activity.feedbackCount) || 0;

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

        // Pending Review: tienen evidencias pero no retroalimentación o nota del tutor
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
        const feedbackCount = Number(activity.tutorFeedbackCount ?? activity.feedbackCount) || 0;

        if (filter === 'pending') {
            return evidenceCount === 0;
        }
        if (filter === 'review') {
            return evidenceCount > 0 && !hasValidGrade && feedbackCount === 0;
        }
        if (filter === 'completed' || filter === 'submitted') {
            return feedbackCount > 0 && !hasValidGrade;
        }
        if (filter === 'graded') {
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
            const feedbackCount = Number(act.tutorFeedbackCount ?? act.feedbackCount) || 0;

            if (evidenceCount === 0) {
                pendingCount++;
            }
            if (evidenceCount > 0 && !hasValidGrade && feedbackCount === 0) {
                reviewCount++;
            }
            if (feedbackCount > 0 && !hasValidGrade) {
                completedCount++;
            }
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
        const container = document.getElementById('activities-container') || document.getElementById('activities-panel');
        if (!container) return;

        container.querySelectorAll('.act-card, .logbook-action-card, .empty-activities-msg, .act-empty-msg').forEach(el => el.remove());

        const activities = activitiesList || [];
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

            const openActivity = (e) => {
                if (e) e.stopPropagation();
                if (currentActivity && currentActivity.id !== activity.id && evidencePanel) {
                    $$('.ev-card, .ev-empty', evidencePanel).forEach((node) => node.remove());
                    $$('.feedback-card', evidencePanel).forEach((node) => node.remove());
                    setText('act-hours', '0');
                }
                currentActivity = activity;
                fillActivityDetails(activity);
                loadEvidence();

                const actPanel = document.getElementById('activities-panel');
                const evPanel = document.getElementById('evidences-panel');
                if (actPanel && evPanel) {
                    actPanel.style.display = 'none';
                    evPanel.style.display = 'block';
                    window.scrollTo(0, 0);
                    const appShell = document.querySelector('.app-shell');
                    if (appShell) appShell.scrollTop = 0;
                    const wrapper = document.querySelector('.practice-content-wrapper');
                    if (wrapper) wrapper.scrollTop = 0;
                }
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

    async function loadActivities() {
        try {
            const data = await SPP.get(`/api/practices/${practice.id}/activities`);
            activitiesList = data.activities || [];
        } catch (e) {
            SPP.showError(e);
            return;
        }

        // Ensure tutorFeedbackCount specifically reflects tutor feedback and get actual worked hours per activity
        if (activitiesList && activitiesList.length > 0) {
            await Promise.all(activitiesList.map(async (act) => {
                try {
                    const [res, evRes] = await Promise.all([
                        SPP.get(`/api/activities/${act.id}/feedback`),
                        SPP.get(`/api/activities/${act.id}/evidences`)
                    ]);
                    const tutorComments = Array.isArray(res?.feedback)
                        ? res.feedback.filter(item => item.role === 'tutor')
                        : [];
                    act.feedbackCount = tutorComments.length;
                    act.tutorFeedbackCount = tutorComments.length;
                    if (Array.isArray(evRes?.evidences)) {
                        act.hours = evRes.evidences.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
                        act.evidenceCount = evRes.evidences.length;
                    }
                } catch (_) {
                    act.feedbackCount = Number(act.feedbackCount) || 0;
                    act.tutorFeedbackCount = Number(act.tutorFeedbackCount) || 0;
                }
            }));
        }

        setupActivitiesControls();
        updateActivitiesKPIs(activitiesList);
        renderActivitiesCards();

        // Update card badges on logbook-panel
        const pendingCount = activitiesList.filter((a) => getActivityStatusInfo(a).category === 'pending').length;
        const pendingPill = document.getElementById('lb-pending-pill');
        if (pendingPill) {
            if (pendingCount > 0) {
                pendingPill.textContent = `${pendingCount} pending`;
                pendingPill.className = 'lb-card-pill lb-card-pill--warning';
            } else {
                pendingPill.textContent = 'Up to date';
                pendingPill.className = 'lb-card-pill lb-card-pill--uptodate';
            }
        }

        const hoursPill = document.getElementById('lb-hours-pill');
        if (hoursPill) {
            const targetHours = (practice?.hours != null && !isNaN(practice.hours)) ? practice.hours : 0;
            const totalWorked = activitiesList.reduce((sum, act) => sum + (Number(act.hours) || 0), 0);
            hoursPill.textContent = `${totalWorked} / ${targetHours} h`;
        }

        await updateStudentQuestionsPill();
    }

    async function updateStudentQuestionsPill() {
        const qPill = document.getElementById('lb-questions-pill');
        if (!qPill) return;

        const setPill = (text, isWarning) => {
            qPill.textContent = text;
            qPill.className = isWarning ? 'lb-card-pill lb-card-pill--warning' : 'lb-card-pill lb-card-pill--uptodate';
        };

        try {
            const evalApi = window.EvalAPI || SPP.EvalAPI;
            if (!evalApi || !evalApi.estudiante || typeof evalApi.estudiante.misEvaluaciones !== 'function') {
                setPill('Up to date', false);
                return;
            }

            const lista = await evalApi.estudiante.misEvaluaciones();
            if (!Array.isArray(lista) || lista.length === 0) {
                setPill('Up to date', false);
                return;
            }

            let pendingCount = 0;
            let pendingEvaluations = 0;
            for (const ev of lista) {
                if (ev.estado !== 'PUBLICADA') continue;

                let isPending = false;
                if (ev.id_intento_abierto) {
                    try {
                        const intento = await evalApi.estudiante.verIntento(ev.id_intento_abierto);
                        const preguntas = intento?.preguntas || [];
                        const respuestas = intento?.respuestas || [];
                        const unanswered = preguntas.filter((p) => {
                            const r = respuestas.find((x) => x.id_pregunta === p.id_pregunta);
                            if (!r) return true;
                            if (p.tipo_pregunta === 'ABIERTA') {
                                return !r.respuesta || !r.respuesta.trim();
                            }
                            return r.id_opcion === null || r.id_opcion === undefined;
                        }).length;
                        if (unanswered > 0) {
                            pendingCount += unanswered;
                            isPending = true;
                        }
                    } catch (_) {
                        const total = Number(ev.total_preguntas) || 0;
                        if (total > 0) {
                            pendingCount += total;
                            isPending = true;
                        }
                    }
                } else if (ev.puede_intentar && (!ev.intentos_usados || ev.intentos_usados === 0)) {
                    pendingCount += Number(ev.total_preguntas) || 0;
                    isPending = true;
                } else if (ev.puede_intentar && ev.ultimo_intento_estado !== 'ENVIADO' && ev.ultimo_intento_estado !== 'CALIFICADO') {
                    pendingCount += Number(ev.total_preguntas) || 0;
                    isPending = true;
                }

                if (isPending) pendingEvaluations++;
            }

            if (pendingCount > 0) {
                setPill(`${pendingCount} ${pendingCount === 1 ? 'question' : 'questions'}`, true);
            } else if (pendingEvaluations > 0) {
                setPill(`${pendingEvaluations} ${pendingEvaluations === 1 ? 'evaluation' : 'evaluations'}`, true);
            } else {
                setPill('Up to date', false);
            }
        } catch (_) {
            setPill('Up to date', false);
        }
    }
    window.updateStudentQuestionsPill = updateStudentQuestionsPill;

    const evidencesBackBtn = document.getElementById('evidencesBack');
    if (evidencesBackBtn && !evidencesBackBtn.dataset.refreshBound) {
        evidencesBackBtn.addEventListener('click', () => {
            loadActivities();
        });
        evidencesBackBtn.dataset.refreshBound = 'true';
    }

    const questionsBackBtn = document.getElementById('questionsBack');
    if (questionsBackBtn && !questionsBackBtn.dataset.badgeRefreshBound) {
        questionsBackBtn.addEventListener('click', () => {
            updateStudentQuestionsPill();
        });
        questionsBackBtn.dataset.badgeRefreshBound = 'true';
    }

    /** "Activity Information" card (read only for the student). */
    function fillActivityDetails(activity, evidences = []) {
        let titleText = 'Activity #' + activity.number;
        const isTutorGenerated = activity.title && activity.title.toLowerCase() !== 'activity';
        if (isTutorGenerated) {
            titleText = activity.title;
        }
        setText('act-name', titleText);

        const assignedDate = activity.assignedDate || activity.createdAt || new Date();
        setText('act-assigned-date', SPP.formatActivityDate(assignedDate));

        const grade = Number(activity.grade);
        setText('act-grade', activity.grade != null && grade > 0 ? grade.toFixed(1) : 'Not graded');

        const totalHours = Array.isArray(evidences) && evidences.length > 0
            ? evidences.reduce((acc, ev) => acc + (Number(ev.hours) || 0), 0)
            : (Number(activity.hours) || 0);
        setText('act-hours', totalHours.toString());

        // Dynamic fields visibility based on who generated it
        const deadlineContainer = document.getElementById('act-deadline-container');
        const descContainer = document.getElementById('act-desc-container');
        const rightPanel = document.getElementById('act-right-panel');
        const leftPanel = document.getElementById('act-left-panel');
        const detailCard = document.querySelector('.act-details-card');
        const gridRow = document.getElementById('act-grid-row');
        
        // Dynamic labels and icons
        const lblAssigned = document.getElementById('lbl-assigned-date');
        const lblGrade = document.getElementById('lbl-grade');
        const lblHours = document.getElementById('lbl-hours');
        const calIcon = document.getElementById('act-calendar-icon');

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

            setText('act-deadline-date', activity.dueDate ? SPP.formatActivityDate(activity.dueDate) : 'without limit');
            setText('act-desc', activity.description || 'No description provided');

            const filesDisplay = document.getElementById('act-files');
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
        }

        const uploadBtn = document.getElementById('amOpenBtn');
        if (uploadBtn) {
            uploadBtn.style.display = isActivityClosed(activity) ? 'none' : '';
        }
    }

    function isActivityClosed(activity) {
        if (!activity) return false;
        // 1) If tutor sets a deadline and the deadline is reached:
        if (activity.dueDate) {
            const str = typeof activity.dueDate === 'string' ? activity.dueDate.replace(/T/, ' ').replace(/Z$|[+-][0-9:]+$/, '').trim() : '';
            const due = str ? new Date(str.replace(' ', 'T')) : new Date(activity.dueDate);
            if (!isNaN(due.getTime()) && Date.now() >= due.getTime()) {
                return true;
            }
        }
        // 2) If tutor grades the activity (with or without deadline):
        if (activity.grade !== null && activity.grade !== undefined && activity.grade !== '') {
            const gradeNum = Number(activity.grade);
            if (!isNaN(gradeNum) && gradeNum > 0) {
                return true;
            }
        }
        return false;
    }



    // ---------- 3) Evidence + feedback ----------
    // Handle the new 'Upload Evidence' button in the activities panel
    const btnActivitiesUpload = $('#amOpenBtnActivities');
    if (btnActivitiesUpload) {
        btnActivitiesUpload.addEventListener('click', () => {
            if (SPP.evidenceModal) SPP.evidenceModal.open('add-activity');
        });
    }

    // The "Add New Evidence" modal (student.js) validates the form and dispatches this event.
    document.addEventListener('spp:evidence-submit', async (event) => {
        const { mode, id, newFiles, newLinks = [], keptFileIds, hours, description } = event.detail;
        const modal = SPP.evidenceModal;
        if (modal) modal.setBusy(true);
        try {
            const form = new FormData();
            newFiles.forEach(f => form.append('files', f));
            keptFileIds.forEach(fid => form.append('keptFileIds', fid));
            if (newLinks.length) form.append('links', JSON.stringify(newLinks.map(l => ({ url: l.url, name: l.name }))));
            form.append('description', description);
            form.append('hours', hours);

            if (mode === 'add-activity') {
                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const localStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
                // 1) Create the activity dynamically
                const createRes = await SPP.request(`/api/practices/${practice.id}/activities`, { 
                    method: 'POST',
                    body: { assignedDate: localStr }
                });
                const newActivityId = createRes.activity.id;

                // 2) Upload evidence to the newly created activity
                await SPP.request(`/api/activities/${newActivityId}/evidences`, { method: 'POST', formData: form });

                // Reload activities first while modal stays open
                await loadActivities();
            } else if (mode === 'add') {
                if (!currentActivity) throw new Error('No activity selected');
                if (isActivityClosed(currentActivity)) throw new Error('Submissions are closed for this activity');
                await SPP.request(`/api/activities/${currentActivity.id}/evidences`, { method: 'POST', formData: form });

                // Reload evidence first while modal stays open
                await loadEvidence();
                await loadActivities();
            } else {
                if (isActivityClosed(currentActivity)) throw new Error('Submissions are closed for this activity');
                await SPP.request(`/api/evidences/${encodeURIComponent(id)}`, { method: 'PUT', formData: form });

                // Reload evidence first while modal stays open
                await loadEvidence();
                await loadActivities();
            }

            // When the view has updated completely, switch directly from form modal to confirmation modal
            if (modal) modal.close();
            showSuccessModal();
        } catch (e) {
            if (modal) modal.setBusy(false);
            SPP.showError(e);
        }
    });

    function showSuccessModal() {
        const successModal = document.getElementById('success-modal');
        if (!successModal) return;
        successModal.style.display = 'flex';
        const closeSuccess = () => { successModal.style.display = 'none'; };
        const closeX = document.getElementById('successModalCloseX');
        const acceptBtn = document.getElementById('successModalAccept');
        if (closeX) closeX.onclick = closeSuccess;
        if (acceptBtn) acceptBtn.onclick = closeSuccess;
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
        const editItem = $('.ev-item--edit', card);
        const deleteItem = $('.ev-item--delete', card);

        if (viewItem) {
            viewItem.addEventListener('click', () => {
                if (SPP.evidenceModal && SPP.evidenceModal.openForView) {
                    SPP.evidenceModal.openForView(evidence);
                }
            });
        }

        const closed = isActivityClosed(currentActivity);
        if (closed) {
            if (editItem) editItem.style.display = 'none';
            if (deleteItem) deleteItem.style.display = 'none';
            const body = $('.ev-card-body', card);
            if (body) {
                body.style.cursor = 'pointer';
                body.title = 'Click to view evidence';
                body.addEventListener('click', () => {
                    if (SPP.evidenceModal && SPP.evidenceModal.openForView) {
                        SPP.evidenceModal.openForView(evidence);
                    }
                });
            }
        } else {
            if (editItem) {
                editItem.addEventListener('click', async () => {
                    if (SPP.evidenceModal && SPP.evidenceModal.openForEdit) {
                        SPP.evidenceModal.openForEdit(evidence);
                    }
                });
            }
            if (deleteItem) {
                deleteItem.addEventListener('click', async () => {
                    SPP.evidenceModal.confirmDelete(evidence.hours, async () => {
                        try {
                            await SPP.del(`/api/evidences/${encodeURIComponent(evidence.id)}`);
                            await loadEvidence();
                        } catch (e) { SPP.showError(e); }
                    });
                });
            }
        }
        return card;
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

    function feedbackCard(feedback) {
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

        SPP.bindMenu(card);
        const viewItem = $('.ev-item--view', card);
        if (viewItem) viewItem.addEventListener('click', () => showFeedbackModal(feedback.text));
        return card;
    }

    async function loadEvidence() {
        if (!currentActivity || !evidencePanel) return;

        const [evidenceResult, feedbackResult] = await Promise.all([
            SPP.get(`/api/activities/${currentActivity.id}/evidences`),
            SPP.get(`/api/activities/${currentActivity.id}/feedback`)
        ]);

        const section = $('.feedback-section', evidencePanel);
        $$('.ev-card, .ev-empty', evidencePanel).forEach((node) => node.remove());
        $$('.feedback-card', evidencePanel).forEach((node) => node.remove());

        const totalHours = evidenceResult.evidences.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
        setText('act-hours', String(totalHours));

        const uploadBtn = document.getElementById('amOpenBtn');
        if (uploadBtn) {
            uploadBtn.style.display = isActivityClosed(currentActivity) ? 'none' : '';
        }

        if (!evidenceResult.evidences.length) {
            const empty = document.createElement('p');
            empty.className = 'ev-empty';
            empty.style.cssText = 'padding:16px 0;opacity:.7;text-align:left;';
            empty.textContent = 'You have not uploaded evidence for this activity yet.';
            section.insertAdjacentElement('beforebegin', empty);
        }
        evidenceResult.evidences.forEach((evidence) => section.insertAdjacentElement('beforebegin', evidenceCard(evidence)));
        feedbackResult.feedback.forEach((item) => section.appendChild(feedbackCard(item)));
        if (!feedbackResult.feedback.length) {
            const empty = document.createElement('p');
            empty.className = 'ev-empty';
            empty.style.cssText = 'padding:16px 0;opacity:.7;text-align:left;';
            empty.textContent = 'There is no feedback yet.';
            section.appendChild(empty);
        }
    }

    try {
        await loadActivities();
    } catch (e) { SPP.showError(e); }
});
