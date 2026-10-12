/* =========================================================================
   student.api.js — Connects the STUDENT panel with the API (/api).
   student.js takes care of the navigation between panels; this file only
   fetches/saves data and fills in the existing HTML.
   ========================================================================= */
document.addEventListener('DOMContentLoaded', async () => {
    const TOPICS = { pedagogy: 'Pedagogy', didactics: 'Didactics', assessment: 'Assessment' };
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
    const questionList = $('#mqList');
    const pendingTemplate = questionList ? $('.mq-card[data-status="pending"]', questionList).cloneNode(true) : null;
    const answeredTemplate = questionList ? $('.mq-card[data-status="answered"]', questionList).cloneNode(true) : null;

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

    // Logbook card: [Final Grade, General Observation]
    const logbookValues = $$('#logbook-panel .lb-info-value');
    if (logbookValues.length >= 2) {
        const logbook = practice.logbook;
        logbookValues[0].textContent = logbook.finalGrade != null ? Number(logbook.finalGrade).toFixed(1) : 'Not graded';
        updateObsDisplay(logbookValues[1], logbook.generalObservation);
        
        window.addEventListener('resize', () => {
            updateObsDisplay(logbookValues[1], logbook.generalObservation);
        });
    }

    // ---------- 2) Activities ----------
    async function loadActivities() {
        const { activities } = await SPP.get(`/api/practices/${practice.id}/activities`);

        const container = $('#activities-container');
        if (!container) return;

        container.innerHTML = ''; // Clear container

        if (activities.length === 0) {
            const msg = document.createElement('div');
            msg.className = 'empty-activities-msg';
            msg.style.padding = '20px';
            msg.style.textAlign = 'center';
            msg.style.color = 'var(--text-secondary, #666)';
            msg.textContent = 'This practice currently has no activities assigned.';
            container.appendChild(msg);
        } else {
            activities.forEach((activity) => {
                const card = document.createElement('div');
                card.className = 'logbook-action-card dynamic-activity-card';
                card.innerHTML = `
                    <div class="lb-action-left">
                        <div class="stat-icon"><i class="fa-solid fa-file-lines"></i></div>
                        <span class="lb-action-label"></span>
                    </div>
                    <button type="button" class="lb-action-btn activity-enter-btn" aria-label="Enter Activity"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
                `;
                container.appendChild(card);

            const button = $('.activity-enter-btn', card);
            button.dataset.id = activity.id;
            button.dataset.activity = activity.number;

            const label = $('.lb-action-label', card);
            if (label) {
                let titleText = 'Activity #' + activity.number;
                if (activity.title && activity.title.toLowerCase() !== 'activity') {
                    titleText = activity.title;
                }
                label.textContent = titleText;
            }

            button.addEventListener('click', () => {
                if (currentActivity && currentActivity.id !== activity.id && evidencePanel) {
                    $$('.ev-card, .ev-empty', evidencePanel).forEach((node) => node.remove());
                    $$('.feedback-card', evidencePanel).forEach((node) => node.remove());
                    setText('act-hours', '0');
                }
                currentActivity = activity;
                fillActivityDetails(activity);
                loadEvidence();

                // Switch panel views manually
                $('#activities-panel').style.display = 'none';
                $('#evidences-panel').style.display = 'block';
            });
            });
        }
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

        const totalHours = Array.isArray(evidences) ? evidences.reduce((acc, ev) => acc + (Number(ev.hours) || 0), 0) : 0;
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
        const { mode, id, newFiles, keptFileIds, hours, description } = event.detail;
        const modal = SPP.evidenceModal;
        if (modal) modal.setBusy(true);
        try {
            const form = new FormData();
            newFiles.forEach(f => form.append('files', f));
            keptFileIds.forEach(fid => form.append('keptFileIds', fid));
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
            } else {
                if (isActivityClosed(currentActivity)) throw new Error('Submissions are closed for this activity');
                await SPP.request(`/api/evidences/${encodeURIComponent(id)}`, { method: 'PUT', formData: form });

                // Reload evidence first while modal stays open
                await loadEvidence();
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
            empty.style.cssText = 'padding:16px;opacity:.7';
            empty.textContent = 'You have not uploaded evidence for this activity yet.';
            section.insertAdjacentElement('beforebegin', empty);
        }
        evidenceResult.evidences.forEach((evidence) => section.insertAdjacentElement('beforebegin', evidenceCard(evidence)));
        feedbackResult.feedback.forEach((item) => section.appendChild(feedbackCard(item)));
        if (!feedbackResult.feedback.length) {
            const empty = document.createElement('p');
            empty.className = 'ev-empty';
            empty.style.cssText = 'padding:16px;opacity:.7';
            empty.textContent = 'There is no feedback yet.';
            section.appendChild(empty);
        }
    }

    // ---------- 4) Questions ----------
    let questions = [];

    function openDetail(question) {
        $('#mqDetailNum').textContent = 'Question #' + question.number;
        $('#mqDetailCategory').textContent = 'Category: ' + (TOPICS[question.topic] || question.topic);
        $('#mqDetailQuestion').textContent = question.statement;
        $('#mqDetailObservation').textContent = question.observation || 'No observations yet.';
        $('#my-questions-panel').style.display = 'none';
        $('#mq-detail-panel').style.display = 'flex';
        window.scrollTo(0, 0);
    }

    async function sendAnswer(question, card, final) {
        const text = $('.mq-answer-input', card).value.trim();
        if (final && !text) { alert('Please write an answer before sending.'); return; }
        try {
            await SPP.put(`/api/answers/${question.id}`, { text, submit: final });
            alert(final ? 'Answer sent successfully' : 'Draft saved');
            await loadQuestions();
        } catch (e) { SPP.showError(e); }
    }

    function questionCard(question) {
        const answered = question.status === 'answered';
        const card = (answered ? answeredTemplate : pendingTemplate).cloneNode(true);
        card.dataset.status = answered ? 'answered' : 'pending';
        $('.mq-card-num', card).textContent = 'Question #' + question.number;
        $('.mq-card-cat', card).textContent = 'Category: ' + (TOPICS[question.topic] || question.topic);
        $('.mq-card-question', card).textContent = question.statement;
        if (answered) {
            const answerText = $('.mq-answer-text', card);
            answerText.textContent = question.answer.length > 140 ? question.answer.slice(0, 137) + '...' : question.answer;
            const historyButton = $('.mq-btn--history', card);
            const viewLink = $('.mq-view-link', card);
            if (historyButton) historyButton.addEventListener('click', () => openDetail(question));
            if (viewLink) viewLink.addEventListener('click', () => openDetail(question));
            const actions = $('.mq-card-actions', card);
            if (actions) actions.remove(); // a submitted answer can no longer be edited
        } else {
            $('.mq-answer-input', card).value = question.answer || '';
            $('.mq-btn--send', card).addEventListener('click', () => sendAnswer(question, card, true));
            $('.mq-btn--draft', card).addEventListener('click', () => sendAnswer(question, card, false));
        }
        return card;
    }

    function applyFilter() {
        const activeTab = $('#my-questions-panel .mq-tab--active');
        const filter = activeTab ? activeTab.getAttribute('data-filter') : 'all';
        $$('#mqList .mq-card').forEach((card) => {
            card.classList.toggle('mq-card--hidden', !(filter === 'all' || filter === card.dataset.status));
        });
    }

    async function loadQuestions() {
        if (!questionList) return;
        const result = await SPP.get(`/api/practices/${practice.id}/questions`);
        questions = result.questions;
        questionList.innerHTML = '';
        if (!questions.length) {
            const empty = document.createElement('p');
            empty.style.cssText = 'padding:16px;opacity:.7';
            empty.textContent = 'Your tutor has not assigned you questions yet.';
            questionList.appendChild(empty);
            return;
        }
        questions.forEach((question) => questionList.appendChild(questionCard(question)));
        applyFilter();
    }
    $$('#my-questions-panel .mq-tab').forEach((tab) => tab.addEventListener('click', () => setTimeout(applyFilter, 0)));

    try {
        await Promise.all([loadActivities(), loadQuestions()]);
    } catch (e) { SPP.showError(e); }
});
