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

        async function renderActivitiesList(targetActivityId) {
            if (!state.practice) return;
            try {
                state.activities = (await SPP.get(`/api/practices/${state.practice.id}/activities`)).activities;
            } catch (e) { SPP.showError(e); return; }

            const activitiesListContainer = $('#activities-list-container') || $('#activities-panel');
            $$('.logbook-action-card', activitiesListContainer).forEach(card => card.remove());
            $$('.empty-activities-msg', activitiesListContainer).forEach(msg => msg.remove());

            if (state.activities.length === 0) {
                const msg = document.createElement('div');
                msg.className = 'empty-activities-msg';
                msg.style.padding = '20px';
                msg.style.textAlign = 'center';
                msg.style.color = 'var(--text-secondary, #666)';
                msg.textContent = 'This practice currently has no activities assigned.';
                activitiesListContainer.appendChild(msg);
            } else {
                state.activities.forEach(activity => {
                    let labelText = `Activity #${activity.number}`;
                    if (activity.title && activity.title.toLowerCase() !== 'activity') {
                        labelText = activity.title;
                    }
                    const card = document.createElement('div');
                    card.className = 'logbook-action-card';
                    card.innerHTML = `
                        <div class="lb-action-left">
                            <div class="stat-icon"><i class="fa-solid fa-file-lines"></i></div>
                            <span class="lb-action-label">${SPP.escapeHtml(labelText)}</span>
                        </div>
                        <button type="button" class="lb-action-btn activity-enter-btn" data-activity="${activity.number}"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
                    `;
                    activitiesListContainer.appendChild(card);
                });
            }

            // Bind newly created buttons
            $$('.activity-enter-btn', activitiesListContainer).forEach((button) => {
                button.addEventListener('click', async () => {
                    state.activity = state.activities.find((a) => String(a.number) === button.getAttribute('data-activity'));
                    if (!state.activity) return;

                    // Switch panel manually since the static ones lost the event listener
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
                    try { await loadEvidence(); } catch (e) { SPP.showError(e); }
                });
            });

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

        window.SPP_TEACHER.refreshActivities = renderActivitiesList;
        window.SPP_TEACHER.displayActivity = displayActivity;

        await renderActivitiesList();
        document.dispatchEvent(new CustomEvent('spp:practice', { detail: practice }));
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

    function renderLogbook() {
        if (!state.practice || !state.practice.logbook) return;
        const logbook = state.practice.logbook;
        const values = $$('#logbook-panel .lb-info-value');
        if (values.length === 2) {
            values[0].textContent = logbook.finalGrade != null ? Number(logbook.finalGrade).toFixed(1) : 'Not graded';
            updateObsDisplay(values[1], logbook.generalObservation);
        } else if (values.length >= 4) {
            values[0].textContent = SPP.formatDate(logbook.createdAt);
            values[1].textContent = logbook.finalGrade != null ? Number(logbook.finalGrade).toFixed(1) : 'Not graded';
            updateObsDisplay(values[2], logbook.generalObservation);
            values[3].textContent = logbook.status === 'active' ? 'Active' : 'Closed';
        }
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
        $('.feedback-content', card).textContent = feedback.text;

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
            empty.style.cssText = 'padding:16px;opacity:.7';
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
            emptyFeedback.style.cssText = 'padding:16px;opacity:.7';
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
                if (state.editingFeedbackId) {
                    await SPP.patch(`/api/activities/${state.activity.id}/feedback/${state.editingFeedbackId}`, { text });
                    state.editingFeedbackId = null;
                    const title = $('.feedback-form-title', feedbackForm);
                    if (title) title.textContent = 'Add Comment:';
                    showSuccessFeedbackModal('Feedback updated successfully');
                } else {
                    if (!evidenceSelect.value) { alert('This activity has no evidence to give feedback on yet.'); btnSubmit.disabled = false; return; }
                    await SPP.post(`/api/activities/${state.activity.id}/feedback`, { text, evidenceId: evidenceSelect.value });
                    showSuccessFeedbackModal('Feedback sent successfully');
                }
                currentTextarea.value = '';
                currentTextarea.style.height = 'auto';
                await loadEvidence();
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
