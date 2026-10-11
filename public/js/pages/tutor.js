/* =========================================================================
   tutor.js — Navigation specific to the TUTOR panel.
   The common flow (practice > logbook > activities > evidence > questions)
   lives in core/panels.js. The question bank (list / create / edit / delete /
   assign) and the grade registration live in tutor.api.js; the shared
   tutor/advisor logic lives in teacher.api.js.
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
    SPP.panels.wireStandardFlow({ questions: 'tutor' });
    initTutorUI();

    // "..." menus of the template evidence / feedback cards (rendered cards bind themselves)
    document.querySelectorAll('.ev-card, .feedback-card').forEach(SPP.panels.bindMenu);
});


// Lógica específica para la vista de Tutor
function initTutorUI() {

    const btnEntrar = document.querySelector('.practice-submit');
    const practicePanel = document.querySelector('.practice-panel');
    const practicaPanel = document.getElementById('logbook-panel');
    const logbookBackBtn = document.getElementById('logbookBack');

    const actividadesPanel = document.getElementById('activities-panel');
    const activitiesBackBtn = document.getElementById('activitiesBack');
    // querySelectorAll captura los 6 botones "Entrar" (uno por actividad)
    const actividadesBtns = document.querySelectorAll('.activity-enter-btn');

    const preguntasPanel = document.getElementById('questions-panel');
    const questionsBackBtn = document.getElementById('questionsBack');

    const evidenciasPanel = document.getElementById('evidences-panel');
    const evidencesBackBtn = document.getElementById('evidencesBack');
    const evidenciasTitleEl = document.getElementById('evidencias-title');

    // Botones de acción de la bitácora identificados por contexto (no por ID duplicado)
    // El logbook-panel tiene exactamente dos .lb-action-btn: Actividades y Preguntas
    const practicaActionBtns = practicaPanel
        ? practicaPanel.querySelectorAll('.lb-action-btn')
        : [];
    const actividadesEntrarpractica = practicaActionBtns[0] || null; // primer btn = Actividades
    const preguntasBtn = practicaActionBtns[1] || null; // segundo btn = Preguntas

    // Botones de acción del panel de preguntas
    const preguntasActionBtns = preguntasPanel
        ? preguntasPanel.querySelectorAll('.lb-action-btn')
        : [];
    const preguntasEntrarActividades = preguntasActionBtns[0] || null;
    const preguntasEntrarPreguntas = preguntasActionBtns[1] || null;

    function resetScroll() {
        window.scrollTo(0, 0);
        // En móvil el scroll está en .app-shell
        const appShell = document.querySelector('.app-shell');
        if (appShell) appShell.scrollTop = 0;
        const wrapper = document.querySelector('.practice-content-wrapper');
        if (wrapper) wrapper.scrollTop = 0;
    }

    // ── Entrar a Bitácora desde Práctica ──────────────────────────────────
    if (btnEntrar && practicePanel && practicaPanel) {
        btnEntrar.addEventListener('click', () => {
            practicePanel.style.display = 'none';
            practicaPanel.style.display = 'flex';
            resetScroll();
        });
    }

    // ── Volver a Práctica desde Bitácora ──────────────────────────────────
    if (logbookBackBtn && practicePanel && practicaPanel) {
        logbookBackBtn.addEventListener('click', () => {
            practicaPanel.style.display = 'none';
            practicePanel.style.display = 'block';
            resetScroll();
        });
    }

    // ── Edición de Nota y Observación en Bitácora ─────────────────────────
    const practicaInfoCard = document.getElementById('logbook-info-card');
    const notaDisplay = document.getElementById('grade-display');
    const notaInput = document.getElementById('grade-input');
    const obsDisplay = document.getElementById('obs-display');
    const obsInput = document.getElementById('obs-input');
    const editActions = document.getElementById('edit-actions');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const saveEditBtn = document.getElementById('save-edit-btn');

    if (practicaInfoCard && notaDisplay && notaInput && obsDisplay && obsInput && editActions) {
        practicaInfoCard.addEventListener('click', () => {
            // Solo habilitar si no están ya en modo edición
            if (notaInput.style.display === 'none') {
                const isGradePlaceholder = notaDisplay.textContent === 'Nota' || notaDisplay.textContent === 'Not graded';
                notaInput.value = isGradePlaceholder ? '' : notaDisplay.textContent;
                
                const currentObs = obsDisplay.dataset.fullObs || obsDisplay.textContent;
                const isObsPlaceholder = currentObs === 'Observación' || currentObs === 'No observations';
                obsInput.value = isObsPlaceholder ? '' : currentObs;
                
                notaDisplay.style.display = 'none';
                obsDisplay.style.display = 'none';
                notaInput.style.display = 'block';
                obsInput.style.display = 'block';
                editActions.style.display = 'flex';
                
                notaInput.focus();
            }
        });

        cancelEditBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notaDisplay.style.display = 'block';
            obsDisplay.style.display = 'block';
            notaInput.style.display = 'none';
            obsInput.style.display = 'none';
            editActions.style.display = 'none';
        });

        saveEditBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const nuevaNota = notaInput.value.trim();
            const nuevaObs = obsInput.value.trim();
            const practice = window.SPP_TEACHER?.state?.practice;
            if (!practice) { alert('No practice selected'); return; }
            
            try {
                await SPP.patch('/api/practices/' + practice.id + '/logbook', {
                    finalGrade: nuevaNota || null,
                    generalObservation: nuevaObs || null
                });
                notaDisplay.textContent = nuevaNota || 'Not graded';
                
                if (nuevaObs) {
                    obsDisplay.dataset.fullObs = nuevaObs;
                    obsDisplay.removeAttribute('title'); 
                } else {
                    obsDisplay.dataset.fullObs = '';
                    obsDisplay.removeAttribute('title');
                }
                updateObsDisplay();
                
                notaDisplay.style.display = 'block';
                obsDisplay.style.display = 'block';
                notaInput.style.display = 'none';
                obsInput.style.display = 'none';
                editActions.style.display = 'none';
                const modal = document.getElementById('success-modal');
                const titleEl = document.getElementById('success-modal-title');
                const msgEl = document.getElementById('success-modal-message');
                if (modal && titleEl && msgEl) {
                    titleEl.textContent = 'Success';
                    msgEl.textContent = 'Logbook updated successfully!';
                    modal.style.display = 'flex';
                }
                if (window.SPP_TEACHER?.reloadLogbook) {
                    await window.SPP_TEACHER.reloadLogbook();
                }
            } catch (err) {
                SPP.showError(err);
            }
        });
        
        function updateObsDisplay() {
            const isMobile = window.matchMedia("(max-width: 600px)").matches;
            const obsText = obsDisplay.dataset.fullObs || '';
            if (!obsText) {
                obsDisplay.textContent = 'No observations';
                obsDisplay.removeAttribute('data-tooltip');
                return;
            }
            
            if (isMobile) {
                obsDisplay.textContent = obsText;
                obsDisplay.removeAttribute('data-tooltip');
            } else {
                const words = obsText.split(/\s+/);
                if (words.length > 10) {
                    obsDisplay.textContent = words.slice(0, 10).join(' ') + '...';
                    obsDisplay.setAttribute('data-tooltip', obsText);
                } else {
                    obsDisplay.textContent = obsText;
                    obsDisplay.removeAttribute('data-tooltip');
                }
            }
        }
        
        window.addEventListener('resize', updateObsDisplay);
        // Llamado inicial
        updateObsDisplay();
        
        notaInput.addEventListener('click', (e) => e.stopPropagation());
        obsInput.addEventListener('click', (e) => e.stopPropagation());
    }

    // ── Entrar a Actividades desde Bitácora o Preguntas ───────────────────────────────
    if (actividadesEntrarpractica && practicaPanel && actividadesPanel) {
        actividadesEntrarpractica.addEventListener('click', () => {
            practicaPanel.style.display = 'none';
            actividadesPanel.style.display = 'flex';
            resetScroll();
        });
    }
    if (preguntasEntrarActividades) {
        preguntasEntrarActividades.addEventListener('click', () => {
            alert('Sección en construcción');
        });
    }
    if (preguntasEntrarPreguntas) {
        preguntasEntrarPreguntas.addEventListener('click', () => {
            alert('Sección en construcción');
        });
    }

    // ── Volver a Bitácora desde Actividades ───────────────────────────────
    if (activitiesBackBtn && practicaPanel && actividadesPanel) {
        activitiesBackBtn.addEventListener('click', () => {
            actividadesPanel.style.display = 'none';
            practicaPanel.style.display = 'flex';
            resetScroll();
        });
    }

    // ── Entrar a Evidencias desde cualquier botón de Actividad (#1 al #6) ─
    if (actividadesBtns.length > 0 && actividadesPanel && evidenciasPanel) {
        actividadesBtns.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                // Intentamos sacar el número, si no existe usamos el índice + 1
                const numActividad = btn.getAttribute('data-activity') || (index + 1);

                if (evidenciasTitleEl) {
                    evidenciasTitleEl.textContent = `Actividad #${numActividad}`;
                }
                actividadesPanel.style.display = 'none';
                evidenciasPanel.style.display = 'flex';
                resetScroll();
            });
        });
    }

    // ── Volver a Actividades desde Evidencias ─────────────────────────────
    if (evidencesBackBtn && actividadesPanel && evidenciasPanel) {
        evidencesBackBtn.addEventListener('click', () => {
            evidenciasPanel.style.display = 'none';
            actividadesPanel.style.display = 'flex';
            resetScroll();
        });
    }

    // ── Entrar a Preguntas desde Bitácora ─────────────────────────────────
    if (preguntasBtn && practicaPanel && preguntasPanel) {
        preguntasBtn.addEventListener('click', () => {
            practicaPanel.style.display = 'none';
            preguntasPanel.style.display = 'flex';
            resetScroll();
        });
    }

    // ── Volver a Bitácora desde Preguntas ─────────────────────────────────
    if (questionsBackBtn && practicaPanel && preguntasPanel) {
        questionsBackBtn.addEventListener('click', () => {
            preguntasPanel.style.display = 'none';
            practicaPanel.style.display = 'flex';
            resetScroll();
        });
    }

    // ── Menú "..." en tarjetas de Evidencias y Retroalimentaciones ────────
    // Panel flotante a la izquierda del botón (estilo director); el botón
    // permanece fijo al final y pasa a flecha ← al abrir.
    function setEvMenuState(btn, open) {
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');

        const dd = btn.nextElementSibling; // .ev-dropdown
        if (dd) dd.classList.toggle('is-open', open);

        const icon = btn.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-ellipsis', !open);
            icon.classList.toggle('fa-arrow-left', open);
        }
    }

    function closeAllEvDropdowns(exceptBtn) {
        document.querySelectorAll('.ev-menu-btn').forEach(btn => {
            if (btn === exceptBtn) return;
            setEvMenuState(btn, false);
        });
    }

    document.querySelectorAll('.ev-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = btn.getAttribute('aria-expanded') === 'true';
            closeAllEvDropdowns(btn);
            setEvMenuState(btn, !isOpen);
        });
    });

    // Cerrar dropdown al hacer clic fuera
    document.addEventListener('click', () => closeAllEvDropdowns(null));

    // ── Abrir modal de "Ver evidencia" ──────────────────────────────────
    document.querySelectorAll('.ev-item--view').forEach(btn => {
        btn.addEventListener('click', () => {
            // Opcional: aquí puedes abrir un modal con un <iframe> o la imagen
            console.log('Abrir evidencia (ver)');
        });
    });

    // ── Enviar / Cancelar Retroalimentación ─────────────────────────────
    const retroBtnSubmit = document.querySelector('.feedback-btn-submit');
    const retroBtnCancel = document.querySelector('.feedback-btn-cancel');
    const retroTextarea = document.querySelector('.feedback-textarea');

    // Auto-crecer textarea y mantener visible el botón "Cancelar" mientras se escribe.
    // Antes se llamaba scrollIntoView({behavior:'smooth'}) en CADA tecla; como cada
    // llamada dispara su propia animación, escribir rápido apilaba varias animaciones
    // de scroll pisándose entre sí — eso era el texto "brincando" (y en el fondo, la
    // misma causa del bug de la barra superior en móvil: el contenedor de scroll
    // quedaba en un estado intermedio inconsistente hasta salir y volver a entrar).
    // Ahora: (1) se agrupan los eventos por fotograma con requestAnimationFrame en vez
    // de reaccionar a cada tecla suelta, (2) solo se mueve el scroll si el botón
    // realmente ya no es visible, y (3) el scroll es instantáneo (sin "smooth"), para
    // que nunca haya dos animaciones corriendo a la vez.
    if (retroTextarea) {
        let retroScrollRaf = null;
        retroTextarea.addEventListener('input', () => {
            retroTextarea.style.height = 'auto';
            retroTextarea.style.height = Math.min(retroTextarea.scrollHeight, 200) + 'px';

            if (!retroBtnCancel) return;
            if (retroScrollRaf) cancelAnimationFrame(retroScrollRaf);
            retroScrollRaf = requestAnimationFrame(() => {
                if (typeof scrollAppShellToReveal === 'function') {
                    scrollAppShellToReveal(retroBtnCancel);
                }
            });
        });
    }
}
/* =========================================================================
   asignar-actividad.js — Modal "Asignar Nueva Actividad" del panel Tutor.
   Se carga DESPUÉS de shell.js y tutor.js. No depende de sus variables
   internas (van dentro de su propio DOMContentLoaded), así que este
   archivo consulta el DOM directamente por id/clase.

   Qué hace:
     · Abre/cierra el modal (botón, X, click afuera, Cancelar, Escape)
     · Zona de "Adjuntar Evidencias" con arrastrar-y-soltar + clic
     · Al Confirmar, agrega una tarjeta "Actividad #N" nueva al listado
       y la conecta con el panel de Evidencias, igual que las demás.
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById('amOpenBtn');
    const modal = document.getElementById('am-modal');
    if (!openBtn || !modal) return; // Esta página no tiene el modal (por ahora solo Tutor)

    const closeX = document.getElementById('amModalCloseX');
    const btnCancel = document.getElementById('amBtnCancel');
    const form = document.getElementById('am-form');
    const dropzone = document.getElementById('am-dropzone');
    const fileInput = document.getElementById('am-file-input');
    const fileListEl = document.getElementById('am-file-list');
    const nombreInput = document.getElementById('am-nombre');

    const actividadesPanel = document.getElementById('activities-panel');
    const evidenciasPanel = document.getElementById('evidences-panel');
    const evidenciasTitleEl = document.getElementById('evidencias-title');

    let archivosSeleccionados = [];
    let ultimoFocoAntesDeAbrir = null;

    function resetScroll() {
        window.scrollTo(0, 0);
        const appShell = document.querySelector('.app-shell');
        if (appShell) appShell.scrollTop = 0;
        const wrapper = document.querySelector('.practice-content-wrapper');
        if (wrapper) wrapper.scrollTop = 0;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function formatForDateTimeLocal(dateVal) {
        if (!dateVal) return '';
        const str = typeof dateVal === 'string' ? dateVal.replace(/T/, ' ').replace(/Z$|[+-][0-9:]+$/, '').trim() : '';
        const d = str ? new Date(str.replace(' ', 'T')) : new Date(dateVal);
        if (isNaN(d.getTime())) return '';
        const pad = (n) => String(n).padStart(2, '0');
        const year = d.getFullYear();
        const month = pad(d.getMonth() + 1);
        const day = pad(d.getDate());
        const hours = pad(d.getHours());
        const minutes = pad(d.getMinutes());
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    /* ---------------------------------------------------------------------
       Abrir / cerrar modal
       --------------------------------------------------------------------- */
    function abrirModal() {
        ultimoFocoAntesDeAbrir = document.activeElement;
        const amTitle = document.getElementById("am-modal-title");
        if (amTitle) amTitle.textContent = "Assign New Activity";
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        const fechaAsigInput = document.getElementById('am-fecha-asig');
        const fechaLimiteInput = document.getElementById('am-fecha-limite');
        if (fechaAsigInput && !fechaAsigInput.value) {
            fechaAsigInput.value = formatForDateTimeLocal(new Date());
        }
        if (fechaLimiteInput) {
            fechaLimiteInput.value = '';
        }
        if (nombreInput) setTimeout(() => nombreInput.focus(), 50);
    }

    function cerrarModal() {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        if (form) form.reset();
        const fechaAsigInput = document.getElementById('am-fecha-asig');
        const fechaLimiteInput = document.getElementById('am-fecha-limite');
        if (fechaAsigInput) fechaAsigInput.value = '';
        if (fechaLimiteInput) fechaLimiteInput.value = '';
        archivosSeleccionados = [];
        pintarArchivos();
        if (ultimoFocoAntesDeAbrir && typeof ultimoFocoAntesDeAbrir.focus === 'function') {
            ultimoFocoAntesDeAbrir.focus();
        }
    }

    openBtn.addEventListener('click', abrirModal);
    if (closeX) closeX.addEventListener('click', cerrarModal);
    if (btnCancel) btnCancel.addEventListener('click', cerrarModal);
    // modal.addEventListener('click', (e) => { if (e.target === modal) cerrarModal(); }); // Desactivado por petición del usuario
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') cerrarModal();
    });

    /* ---------------------------------------------------------------------
       Zona de arrastrar y soltar evidencias
       --------------------------------------------------------------------- */
    function agregarArchivos(fileList) {
        Array.from(fileList || []).forEach((f) => archivosSeleccionados.push(f));
        pintarArchivos();
    }

    function quitarArchivo(index) {
        archivosSeleccionados.splice(index, 1);
        pintarArchivos();
    }

    function pintarArchivos() {
        if (!fileListEl) return;
        if (archivosSeleccionados.length === 0) {
            fileListEl.innerHTML = '';
            fileListEl.classList.remove('has-files');
            return;
        }
        fileListEl.classList.add('has-files');
        fileListEl.innerHTML = archivosSeleccionados.map((f, i) => {
            if (f.isExisting) {
                return '<span class="am-file-chip">' +
                    '<i class="fa-solid fa-paperclip" aria-hidden="true"></i>' +
                    '<a href="' + escapeHtml(f.url) + '" target="_blank" class="am-file-chip-name" style="text-decoration: none; color: inherit;">' + escapeHtml(f.name) + '</a>' +
                    '<button type="button" class="am-file-remove" data-idx="' + i + '" aria-label="Quitar ' + escapeHtml(f.name) + '"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
                    '</span>';
            } else {
                return '<span class="am-file-chip">' +
                    '<i class="fa-solid fa-paperclip" aria-hidden="true"></i>' +
                    '<span class="am-file-chip-name">' + escapeHtml(f.name) + '</span>' +
                    '<button type="button" class="am-file-remove" data-idx="' + i + '" aria-label="Quitar ' + escapeHtml(f.name) + '">' +
                    '<i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
                    '</span>';
            }
        }).join('');
        fileListEl.querySelectorAll('.am-file-remove').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                quitarArchivo(parseInt(btn.getAttribute('data-idx'), 10));
            });
        });
    }

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInput.click();
            }
        });

        ['dragenter', 'dragover'].forEach((evt) => {
            dropzone.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('is-dragover');
            });
        });
        ['dragleave', 'drop'].forEach((evt) => {
            dropzone.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('is-dragover');
            });
        });
        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            if (dt && dt.files) agregarArchivos(dt.files);
        });

        fileInput.addEventListener('change', () => {
            agregarArchivos(fileInput.files);
            fileInput.value = ''; // permite volver a seleccionar el mismo archivo
        });
    }

    /* ---------------------------------------------------------------------
       Confirmar asignación → crea la tarjeta de la nueva actividad
       --------------------------------------------------------------------- */
    function siguienteNumeroActividad() {
        const tarjetas = actividadesPanel ? actividadesPanel.querySelectorAll('.activity-enter-btn') : [];
        let max = 0;
        tarjetas.forEach((btn) => {
            const n = parseInt(btn.getAttribute('data-activity'), 10);
            if (!isNaN(n)) max = Math.max(max, n);
        });
        return max + 1;
    }

    function crearTarjetaActividad(numero, nombre) {
        const card = document.createElement('div');
        card.className = 'practica-action-card';
        card.innerHTML =
            '<div class="b-action-left">' +
            '<div class="stat-icon"><i class="fa-solid fa-file-lines" aria-hidden="true"></i></div>' +
            '<span class="b-action-label">Actividad #' + numero + (nombre ? ' — ' + escapeHtml(nombre) : '') + '</span>' +
            '</div>' +
            '<button type="button" class="lb-action-btn activity-enter-btn" data-activity="' + numero + '"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>';
        return card;
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const nombre = (nombreInput.value || '').trim();
            if (!nombre) {
                nombreInput.focus();
                nombreInput.classList.add('am-input-error');
                setTimeout(() => nombreInput.classList.remove('am-input-error'), 1200);
                return;
            }

            const description = (document.getElementById('am-desc').value || '').trim();
            const assignedDate = document.getElementById('am-fecha-asig').value || '';
            const dueDate = document.getElementById('am-fecha-limite').value || '';

            const practice = window.SPP_TEACHER?.state?.practice;
            if (!practice) { alert('No practice selected'); return; }

            try {
                const formData = new FormData();
                formData.append('title', nombre);
                if (description) formData.append('description', description);
                formData.append('assignedDate', assignedDate);
                formData.append('dueDate', dueDate);
                
                if (typeof archivosSeleccionados !== 'undefined') {
                    const newFiles = archivosSeleccionados.filter(f => !f.isExisting);
                    const keptFileIds = archivosSeleccionados.filter(f => f.isExisting).map(f => f.id);
                    
                    for (let i = 0; i < newFiles.length; i++) {
                        formData.append('files', newFiles[i]);
                    }
                    // Always append keptFileIds so backend knows if all files were deleted
                    formData.append('keptFileIds', JSON.stringify(keptFileIds));
                }

                const amTitle = document.getElementById('am-modal-title');
                const isEditing = amTitle && amTitle.textContent === "Edit Activity";
                
                const showSuccessModal = (title, message) => {
                    const modal = document.getElementById('success-modal');
                    const titleEl = document.getElementById('success-modal-title');
                    const msgEl = document.getElementById('success-modal-message');
                    if(modal && titleEl && msgEl) {
                        titleEl.textContent = title;
                        msgEl.textContent = message;
                        modal.style.display = 'flex';
                    }
                };

                if (isEditing) {
                    const activity = window.SPP_TEACHER?.state?.activity;
                    if (!activity) { alert('No activity selected to edit'); return; }
                    
                    await SPP.request('/api/practices/' + practice.id + '/activities/' + activity.id, { method: 'PATCH', formData: formData });
                    showSuccessModal('Activity Updated', 'Your activity has been successfully updated.');
                    cerrarModal();

                    if (window.SPP_TEACHER?.refreshActivities) {
                        await window.SPP_TEACHER.refreshActivities(activity.id);
                    }
                } else {
                    const res = await SPP.request('/api/practices/' + practice.id + '/activities', { method: 'POST', formData: formData });
                    showSuccessModal('Assignment Submitted', 'Your activity has been successfully uploaded.');
                    cerrarModal();

                    if (window.SPP_TEACHER?.refreshActivities) {
                        await window.SPP_TEACHER.refreshActivities(res?.activity?.id);
                    }
                }
            } catch (err) {
                SPP.showError(err);
            }
        });
    }
    
    const editBtn = document.querySelector(".act-edit-btn");
    if (editBtn && modal) {
        editBtn.addEventListener("click", () => {
            ultimoFocoAntesDeAbrir = document.activeElement;
            const amTitle = document.getElementById("am-modal-title");
            if (amTitle) amTitle.textContent = "Edit Activity";
            
            // Cargar datos de la actividad en el modal
            const activity = window.SPP_TEACHER?.state?.activity;
            if (activity) {
                const nombreInput = document.getElementById('am-nombre');
                const descInput = document.getElementById('am-desc');
                const fechaAsigInput = document.getElementById('am-fecha-asig');
                const fechaLimiteInput = document.getElementById('am-fecha-limite');
                
                if (nombreInput) nombreInput.value = activity.title || activity.name || '';
                if (descInput) descInput.value = activity.description || '';
                
                if (fechaAsigInput) fechaAsigInput.value = formatForDateTimeLocal(activity.assignedDate || activity.createdAt);
                if (fechaLimiteInput) fechaLimiteInput.value = formatForDateTimeLocal(activity.dueDate || activity.deadline);
                
                // Cargar archivos existentes
                archivosSeleccionados = (activity.files || []).map(f => ({ ...f, isExisting: true }));
                pintarArchivos();
            }

            modal.style.display = "flex";
            document.body.style.overflow = "hidden";
            const dd = editBtn.closest(".ev-dropdown");
            if (dd) dd.classList.remove("is-open");
            const btnMenu = document.querySelector(".ev-menu-wrapper .ev-menu-btn");
            if (btnMenu) {
                btnMenu.setAttribute("aria-expanded", "false");
                const icon = btnMenu.querySelector("i");
                if (icon) {
                    icon.classList.add("fa-ellipsis");
                    icon.classList.remove("fa-arrow-left");
                }
            }
        });
    }

    const deleteBtn = document.querySelector("#act-main-menu .ev-item--delete");
    const deleteModal = document.getElementById("delete-confirm-modal");
    if (deleteBtn && deleteModal) {
        const btnCancel = document.getElementById("deleteConfirmCancel");
        const btnClose = document.getElementById("deleteConfirmCloseX");
        const btnConfirm = document.getElementById("deleteConfirmYes");
        const nameSpan = document.getElementById("delete-confirm-name");

        const closeDeleteModal = () => { deleteModal.style.display = "none"; };
        if (btnCancel) btnCancel.addEventListener("click", closeDeleteModal);
        if (btnClose) btnClose.addEventListener("click", closeDeleteModal);

        deleteBtn.addEventListener("click", () => {
            const activity = window.SPP_TEACHER?.state?.activity;
            if (activity) {
                if (nameSpan) {
                    const isTutorGenerated = activity.title && activity.title.toLowerCase() !== 'activity';
                    nameSpan.textContent = isTutorGenerated ? activity.title : `Activity #${activity.number}`;
                }
                deleteModal.style.display = "flex";
            }
            // Close the dropdown menu if it was open
            const dd = deleteBtn.closest(".ev-dropdown");
            if (dd) dd.classList.remove("is-open");
        });

        if (btnConfirm) {
            btnConfirm.addEventListener("click", async () => {
                const activity = window.SPP_TEACHER?.state?.activity;
                if (!activity) return;
                try {
                    // Call backend to delete activity
                    await SPP.del(`/api/practices/${activity.practiceId}/activities/${activity.id}`);
                    closeDeleteModal();
                    
                    // Trigger the back button to close the activity details panel
                    const backBtn = document.getElementById('evidencesBack');
                    if (backBtn) backBtn.click();
                    
                    // Reload activities to reflect changes
                    if (window.SPP_TEACHER?.refreshActivities) {
                        await window.SPP_TEACHER.refreshActivities();
                    } else if (window.SPP_TEACHER?.state?.practice) {
                        const selector = document.getElementById('practice-selector');
                        if (selector) {
                            selector.dispatchEvent(new Event('change'));
                        } else {
                            window.location.reload();
                        }
                    } else {
                        window.location.reload();
                    }
                } catch (err) {
                    SPP.showError(err);
                }
            });
        }
    }

    const successModal = document.getElementById('success-modal');
    const successCloseX = document.getElementById('successModalCloseX');
    const successAcceptBtn = document.getElementById('successModalAcceptBtn');
    
    const closeSuccessModal = () => {
        if (successModal) successModal.style.display = 'none';
    };

    if (successCloseX) successCloseX.addEventListener('click', closeSuccessModal);
    if (successAcceptBtn) successAcceptBtn.addEventListener('click', closeSuccessModal);

});


// Lógica para editar la nota en la Actividad (Tutor)
document.addEventListener("DOMContentLoaded", () => {
    const actNotaContainer = document.getElementById("act-nota-container");
    const actNotaDisplay = document.getElementById("act-grade-display");
    const actNotaInput = document.getElementById("act-grade-input");
    const actNotaActions = document.getElementById("act-nota-actions");
    const actNotaCancelBtn = document.getElementById("act-nota-cancel-btn");
    const actNotaSaveBtn = document.getElementById("act-nota-save-btn");

    if (actNotaContainer && actNotaDisplay && actNotaInput && actNotaActions) {
        actNotaContainer.addEventListener("click", () => {
            if (actNotaInput.style.display === "none") {
                actNotaInput.value = actNotaDisplay.textContent.trim();
                actNotaDisplay.style.display = "none";
                actNotaInput.style.display = "block";
                actNotaActions.style.display = "flex";
                actNotaInput.focus();
            }
        });

        actNotaCancelBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            actNotaDisplay.style.display = ""; // Reverts to CSS default (flex)
            actNotaInput.style.display = "none";
            actNotaActions.style.display = "none";
        });

        actNotaSaveBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const nuevaNota = actNotaInput.value.trim();
            const activity = window.SPP_TEACHER?.state?.activity;
            const practice = window.SPP_TEACHER?.state?.practice;
            if (!activity || !practice) { alert('No activity selected'); return; }

            try {
                // Notice the ID for activity could be activity.id
                await SPP.patch('/api/practices/' + practice.id + '/activities/' + activity.id, {
                    grade: nuevaNota ? Number(nuevaNota) : null
                });
                actNotaDisplay.textContent = nuevaNota || '0.0';
                actNotaDisplay.style.display = ''; // Reverts to CSS default (flex)
                actNotaInput.style.display = 'none';
                actNotaActions.style.display = 'none';
                const modal = document.getElementById('success-modal');
                const titleEl = document.getElementById('success-modal-title');
                const msgEl = document.getElementById('success-modal-message');
                if (modal && titleEl && msgEl) {
                    titleEl.textContent = 'Success';
                    msgEl.textContent = 'Activity grade updated successfully!';
                    modal.style.display = 'flex';
                }
            } catch (err) {
                SPP.showError(err);
            }
        });

        actNotaInput.addEventListener("click", (e) => e.stopPropagation());
    }
});
