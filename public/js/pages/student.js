/* =========================================================================
   student.js — Navigation specific to the STUDENT panel.
   The common flow (practice > logbook > activities > evidence > questions)
   lives in core/panels.js; the data lives in student.api.js.
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
    SPP.panels.wireStandardFlow({ questions: 'student' });

    const myQuestionsPanel = document.getElementById('my-questions-panel');
    SPP.panels.link(document.getElementById('mqDetailBack'), document.getElementById('mq-detail-panel'), myQuestionsPanel);

    // Tabs: All / To Answer / Answered. Only the active state is toggled here; the cards are
    // filtered in student.api.js because the cards are rendered from the API data.
    const tabs = myQuestionsPanel ? myQuestionsPanel.querySelectorAll('.mq-tab') : [];
    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            tabs.forEach((t) => {
                t.classList.remove('mq-tab--active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('mq-tab--active');
            tab.setAttribute('aria-selected', 'true');
        });
    });

    // "..." menus of the template evidence / feedback cards (rendered cards bind themselves)
    document.querySelectorAll('.ev-card, .feedback-card').forEach(SPP.panels.bindMenu);
});

/* =========================================================================
   "Add New Evidence" modal — UI only (open/close, drag & drop, file chip,
   validation). When the form is valid it dispatches `spp:evidence-submit`
   with { file, hours, description }; student.api.js performs the upload and
   then calls SPP.evidenceModal.close().
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('am-modal');
    const openButton = document.getElementById('amOpenBtn');
    if (!modal || !openButton) return;

    const closeX = document.getElementById('amModalCloseX');
    const cancelButton = document.getElementById('amBtnCancel');
    const confirmButton = document.getElementById('amBtnConfirm');
    const form = document.getElementById('am-form');
    const dropzone = document.getElementById('am-dropzone');
    const fileInput = document.getElementById('am-file-input');
    const fileList = document.getElementById('am-file-list');
    const hoursInput = document.getElementById('am-hours');
    const descriptionInput = document.getElementById('am-desc');

    let selectedFiles = []; // the API stores multiple files per evidence
    let currentMode = 'add'; // 'add' or 'edit'
    let editingId = null;
    let lastFocus = null;
    let busy = false;

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
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

    function flagError(element) {
        if (!element) return;
        element.classList.add('am-input-error');
        setTimeout(() => element.classList.remove('am-input-error'), 1200);
    }

    function renderFiles() {
        if (!fileList) return;
        if (!selectedFiles.length) {
            fileList.innerHTML = '';
            fileList.classList.remove('has-files');
            return;
        }
        fileList.classList.add('has-files');
        fileList.innerHTML = '';

        if (currentMode === 'view') {
            fileList.style.width = '100%';
            fileList.style.display = 'flex';
            fileList.style.flexDirection = 'column';
            fileList.style.alignItems = 'flex-start';
        } else {
            fileList.style.width = '';
            fileList.style.display = '';
            fileList.style.flexDirection = '';
            fileList.style.alignItems = '';
        }

        if (currentMode === 'view' && selectedFiles.length > 0) {
            const title = document.createElement('label');
            title.textContent = 'Files';
            title.style.width = '100%';
            title.style.textAlign = 'left';
            title.style.display = 'block';
            title.style.fontFamily = "'Playfair Display', serif";
            title.style.fontWeight = '700';
            title.style.fontSize = '1.1rem';
            title.style.margin = '16px 0 8px 0';
            fileList.appendChild(title);
        }

        selectedFiles.forEach((f, i) => {
            const span = document.createElement('span');
            span.className = 'am-file-chip';
            if (currentMode === 'view') {
                span.style.marginBottom = '8px';
                span.style.width = '100%';
                span.style.padding = '12px 16px';
                span.style.justifyContent = 'flex-start';
                span.style.borderRadius = '24px';
            }
            
            const isExisting = f.isExisting;
            if (currentMode === 'view' && isExisting) {
                span.innerHTML =
                    '<i class="fa-solid fa-paperclip" aria-hidden="true" style="margin-right: 12px; font-size: 1.1rem; color: var(--clr-primary-dark, #103323);"></i>' +
                    `<a href="${f.url}" target="_blank" class="am-file-chip-name" style="text-decoration: none; color: var(--clr-primary-dark, #103323); cursor: pointer; flex: 1; font-weight: 600; font-size: 1rem; text-align: left;">${escapeHtml(f.name)}</a>` +
                    `<button type="button" class="am-file-view am-file-download-btn" title="Download" style="color:var(--clr-primary-dark, #103323); margin-left:8px; font-size: 1.3rem; background:none; border:none; cursor:pointer;"><i class="fa-solid fa-download" aria-hidden="true"></i></button>`;
                
                span.querySelector('.am-file-download-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    descargarArchivo(f.url, f.name);
                });
            } else {
                span.innerHTML =
                    '<i class="fa-solid fa-paperclip" aria-hidden="true"></i>' +
                    '<span class="am-file-chip-name">' + escapeHtml(f.name) + '</span>' +
                    '<button type="button" class="am-file-remove" aria-label="Remove ' + escapeHtml(f.name) + '"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>';
                
                span.querySelector('.am-file-remove').addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedFiles.splice(i, 1);
                    renderFiles();
                });
            }
            fileList.appendChild(span);
        });
    }

    function addFiles(files) {
        if (files && files.length) {
            for (let i = 0; i < files.length; i++) {
                selectedFiles.push(files[i]);
            }
        }
        renderFiles();
    }

    function setBusy(value) {
        busy = value;
        if (confirmButton) {
            confirmButton.disabled = value;
            confirmButton.textContent = value ? 'Saving...' : (currentMode === 'edit' ? 'Save Changes' : 'Add Evidence');
        }
    }

    function open(mode = 'add') {
        currentMode = mode;
        editingId = null;
        document.getElementById('am-modal-title').textContent = mode === 'add-activity' ? 'Upload Evidence' : 'Add New Evidence';
        if (dropzone) {
            dropzone.style.display = 'flex';
            dropzone.style.pointerEvents = '';
            dropzone.style.border = '';
            dropzone.style.background = '';
            dropzone.style.padding = '';
            dropzone.style.margin = '';
            Array.from(dropzone.children).forEach(c => {
                if (c !== fileList && c.id !== 'am-file-input') c.style.display = '';
            });
        }
        if (descriptionInput) { descriptionInput.value = ''; descriptionInput.readOnly = false; }
        if (hoursInput) { hoursInput.value = 1; hoursInput.readOnly = false; }
        if (confirmButton) { confirmButton.style.display = ''; confirmButton.textContent = 'Add Evidence'; }
        if (cancelButton) { cancelButton.style.display = ''; }
        
        selectedFiles = [];
        renderFiles();
        
        lastFocus = document.activeElement;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        if (hoursInput) setTimeout(() => hoursInput.focus(), 50);
    }

    function openForEdit(evidence) {
        currentMode = 'edit';
        editingId = evidence.id;
        document.getElementById('am-modal-title').textContent = 'Edit Evidence';
        if (dropzone) {
            dropzone.style.display = 'flex';
            dropzone.style.pointerEvents = '';
            dropzone.style.border = '';
            dropzone.style.background = '';
            dropzone.style.padding = '';
            dropzone.style.margin = '';
            Array.from(dropzone.children).forEach(c => {
                if (c !== fileList && c.id !== 'am-file-input') c.style.display = '';
            });
        }
        if (descriptionInput) { descriptionInput.value = evidence.description || ''; descriptionInput.readOnly = false; }
        if (hoursInput) { hoursInput.value = evidence.hours || ''; hoursInput.readOnly = false; }
        if (confirmButton) { confirmButton.style.display = ''; confirmButton.textContent = 'Save Changes'; }
        if (cancelButton) { cancelButton.style.display = ''; }
        
        selectedFiles = (evidence.files || []).map(f => ({ ...f, isExisting: true }));
        renderFiles();

        lastFocus = document.activeElement;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        if (hoursInput) setTimeout(() => hoursInput.focus(), 50);
    }

    function openForView(evidence) {
        currentMode = 'view';
        editingId = evidence.id;
        document.getElementById('am-modal-title').textContent = 'View Evidence';
        if (dropzone) {
            dropzone.style.display = 'flex';
            dropzone.style.border = 'none';
            dropzone.style.background = 'transparent';
            dropzone.style.padding = '0';
            dropzone.style.margin = '0';
            dropzone.style.pointerEvents = ''; // Allow clicks to reach children
            Array.from(dropzone.children).forEach(c => {
                if (c !== fileList) c.style.display = 'none';
            });
        }
        if (descriptionInput) { descriptionInput.value = evidence.description || 'No description provided'; descriptionInput.readOnly = true; }
        if (hoursInput) { hoursInput.value = evidence.hours || ''; hoursInput.readOnly = true; }
        if (confirmButton) confirmButton.style.display = 'none'; // No save button
        if (cancelButton) { cancelButton.style.display = ''; cancelButton.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>Close'; }
        
        selectedFiles = (evidence.files || []).map(f => ({ ...f, isExisting: true }));
        renderFiles();

        lastFocus = document.activeElement;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function close() {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        if (form) form.reset();
        selectedFiles = [];
        renderFiles();
        if (cancelButton) cancelButton.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i>Cancel';
        setBusy(false);
        if (lastFocus && document.contains(lastFocus) && typeof lastFocus.focus === 'function') lastFocus.focus();
    }

    if (openButton) openButton.addEventListener('click', () => open('add'));
    if (closeX) closeX.addEventListener('click', () => { if (!busy) close(); });
    if (cancelButton) cancelButton.addEventListener('click', () => { if (!busy) close(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex' && !busy) close();
    });

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', (e) => {
            if (currentMode === 'view') return;
            if (e.target.closest('a') || e.target.closest('button')) return;
            fileInput.click();
        });
        dropzone.addEventListener('keydown', (e) => {
            if (currentMode === 'view') return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
        });
        ['dragenter', 'dragover'].forEach((type) => {
            dropzone.addEventListener(type, (e) => {
                e.preventDefault(); e.stopPropagation();
                dropzone.classList.add('is-dragover');
            });
        });
        ['dragleave', 'drop'].forEach((type) => {
            dropzone.addEventListener(type, (e) => {
                e.preventDefault(); e.stopPropagation();
                dropzone.classList.remove('is-dragover');
            });
        });
        dropzone.addEventListener('drop', (e) => {
            if (currentMode === 'view') return;
            if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
        });
        fileInput.addEventListener('change', () => {
            addFiles(fileInput.files);
            fileInput.value = '';
        });
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (busy) return;
            const hours = Number(hoursInput ? hoursInput.value : 0);
            if (!Number.isInteger(hours) || hours < 0 || hours > 1000) {
                flagError(hoursInput);
                if (hoursInput) hoursInput.focus();
                return;
            }
            const newFiles = selectedFiles.filter(f => !f.isExisting);
            const keptFileIds = selectedFiles.filter(f => f.isExisting).map(f => f.id);
            
            if ((currentMode === 'add' || currentMode === 'add-activity') && !newFiles.length && !keptFileIds.length) {
                flagError(dropzone);
                return;
            }
            if (currentMode === 'edit' && !newFiles.length && !keptFileIds.length) {
                flagError(dropzone);
                return;
            }
            document.dispatchEvent(new CustomEvent('spp:evidence-submit', {
                detail: { mode: currentMode, id: editingId, newFiles, keptFileIds, hours, description: descriptionInput ? descriptionInput.value : '' }
            }));
        });
    }

    const deleteModal = document.getElementById('delete-confirm-modal');
    let confirmDeleteAction = null;

    if (deleteModal) {
        document.getElementById('deleteConfirmCloseX').addEventListener('click', () => deleteModal.style.display = 'none');
        document.getElementById('deleteConfirmCancel').addEventListener('click', () => deleteModal.style.display = 'none');
        document.getElementById('deleteConfirmYes').addEventListener('click', () => {
            if (confirmDeleteAction) confirmDeleteAction();
            deleteModal.style.display = 'none';
        });
    }

    function confirmDelete(hours, action) {
        if (!deleteModal) return action();
        document.getElementById('delete-confirm-hours').textContent = hours || 0;
        confirmDeleteAction = action;
        deleteModal.style.display = 'flex';
    }

    SPP.evidenceModal = { open, openForEdit, openForView, close, setBusy, confirmDelete };
});
