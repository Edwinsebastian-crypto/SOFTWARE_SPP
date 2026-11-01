/* =========================================================================
   director.js — Interface behaviour specific to the DIRECTOR panel:
   create-practice form, custom selects, tabs and the practice view navigation.
   The data (API calls) lives in director.api.js and users.js.
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
    // ---------- 1) Create practice ----------
    const createRoot = document.querySelector('#create-practice');
    const cancelButton = document.querySelector('#create-practice .cp-btn-cancel');
    const successModal = document.getElementById('successModal');
    const acceptButton = document.getElementById('modalAccept');

    if (cancelButton && createRoot) {
        cancelButton.addEventListener('click', () => {
            createRoot.querySelectorAll('input, select').forEach((input) => {
                if (input.tagName === 'SELECT') input.selectedIndex = 0;
                else input.value = '';
            });
            SPP.customSelect.resetIn(createRoot);
        });
    }

    // "Accept" on the success modal closes it and clears the form
    if (acceptButton) {
        acceptButton.addEventListener('click', () => {
            successModal.style.display = 'none';
            if (cancelButton) cancelButton.click();
        });
    }

    // The date picker opens on the first click anywhere on the field
    document.querySelectorAll('.cp-date-input').forEach((input) => {
        input.addEventListener('click', function () {
            if (typeof this.showPicker === 'function') {
                try { this.showPicker(); } catch (e) { /* noop */ }
            }
        });
    });

    // ---------- 2) Custom selects ----------
    ['#create-practice', '#manage-practices', '#manage-institutions', '#manage-users']
        .forEach((selector) => SPP.customSelect.init(selector));

    // ---------- 3) Tabs ----------
    // Reports
    const reportButtons = Array.from(document.querySelectorAll('#reports .reports-tab-btn'));
    const reportPanelIds = ['tab-general', 'tab-types', 'tab-practice', 'tab-feedback', 'tab-institutions', 'tab-evaluations'];
    const reportPanels = reportPanelIds.map((id) => document.getElementById(id)).filter(Boolean);

    SPP.panels.wireTabs(
        reportButtons,
        reportPanels,
        (_button, index) => reportPanelIds[index]
    );

    const btnEvalTab = document.getElementById('btn-evaluations-tab');
    if (btnEvalTab) {
        btnEvalTab.addEventListener('click', () => {
            if (window.SPP_DIRECTOR && typeof window.SPP_DIRECTOR.cargarEvaluaciones === 'function') {
                const cont = document.getElementById('panel-contenido');
                if (cont && (cont.children.length === 0 || cont.querySelector('.ev-loading'))) {
                    window.SPP_DIRECTOR.cargarEvaluaciones();
                } else if (window.SPP && SPP.customSelect && typeof SPP.customSelect.init === 'function') {
                    SPP.customSelect.init('#dv-lista');
                }
            }
        });
    }

    reportButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn !== btnEvalTab) {
                const vPanel = document.getElementById('view-panel');
                const vDetalle = document.getElementById('view-detalle');
                if (vPanel) vPanel.hidden = false;
                if (vDetalle) vDetalle.hidden = true;
            }
        });
    });

    // Practice types
    SPP.panels.wireTabs(
        Array.from(document.querySelectorAll('#manage-practices .ptm-tab-btn')),
        Array.from(document.querySelectorAll('#manage-practices .ptm-panel')),
        (button) => button.getAttribute('data-ptm-panel')
    );

    // Institutions
    SPP.panels.wireTabs(
        Array.from(document.querySelectorAll('#manage-institutions .inst-tab-btn')),
        Array.from(document.querySelectorAll('#manage-institutions .inst-panel')),
        (button) => button.getAttribute('data-inst-panel')
    );

    // ---------- 4) Input masks ----------
    const hoursInput = document.getElementById('ptm-hours');
    if (hoursInput) hoursInput.addEventListener('input', () => { hoursInput.value = hoursInput.value.replace(/\D/g, ''); });

    const taxIdInput = document.getElementById('inst-taxid');
    if (taxIdInput) {
        taxIdInput.maxLength = 10; // nitEntidad is varchar(10) in the legacy schema
        taxIdInput.addEventListener('input', () => { taxIdInput.value = taxIdInput.value.replace(/[^\d-]/g, ''); });
    }

    // ---------- 5) Practice panel (same navigation as the student) ----------
    SPP.panels.wireStandardFlow({ scope: '#practice', questions: 'placeholder' });
    // "..." menus of the evidence / feedback cards of the practice panel
    SPP.panels.bindCardList(document.getElementById('practice'), '.ev-card', {});
});


/* =========================================================================
   director.js — Panel de evaluaciones del DIRECTOR (SOLO LECTURA).
   Cifras, alertas, gráficos, tutores y detalle de cada evaluación. No crea, edita ni califica nada y nunca
   muestra lo que escribieron los estudiantes. Habla solo con window.EvalAPI.director (servicio real o mock).
   Gráficos hechos con HTML/CSS: la CSP del monolito no permite librerías externas.
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
    'use strict';
    const contenido = document.getElementById('panel-contenido');
    if (!contenido) return;
    if (typeof EvalUI === 'undefined' || typeof EvalAPI === 'undefined') return;

    const { h, icon, $, clear, toast, ocupado, badge, plural, fecha } = EvalUI;
    const API = EvalAPI.director;
    EvalUI.habilitarEnlacesExternos();

    /* ------------------------------------------------------------ formato y nombres */
    const loc = (n, dec) => Number(n).toLocaleString('es-CO', { maximumFractionDigits: dec === undefined ? 0 : dec });
    const n0 = (n) => (n === null || n === undefined ? '—' : loc(n));
    const pct = (n) => (n === null || n === undefined ? '—' : `${loc(n, 1)} %`);
    const dias = (d) => plural(d, 'day', 'days');
    const DIR = { practicas: {}, tutores: {}, estudiantes: {} };
    const absorber = (d) => { if (d) for (const k of Object.keys(DIR)) Object.assign(DIR[k], d[k] || {}); };
    const nombreTutor = (id) => DIR.tutores[id] || `Tutor ${id}`;
    const nombreEstudiante = (id) => DIR.estudiantes[id] || `Student ${id}`;
    const etiquetaPractica = (id) => {
        const p = DIR.practicas[id];
        return p ? `${p.estudiante || 'Student'} · ${p.tipo || 'Practice'}` : `Practice ${id} (not found)`;
    };
    const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

    const vistas = { panel: $('#view-panel'), detalle: $('#view-detalle') };
    function ver(nombre, resetScroll = true) {
        Object.entries(vistas).forEach(([k, el]) => { el.hidden = k !== nombre; });
        if (resetScroll) {
            const w = $('.ev-wrapper'); if (w) w.scrollTop = 0;
            const rw = document.querySelector('.reports-wrapper'); if (rw) rw.scrollTop = 0;
            window.scrollTo(0, 0);
        }
    }

    /* ------------------------------------------------------------ tooltip (ratón y teclado) */
    const tip = $('#dv-tip');
    const moverTip = (x, y) => {
        const w = tip.offsetWidth, hh = tip.offsetHeight;
        tip.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - w - 8))}px`;
        tip.style.top = `${Math.max(8, Math.min(y + 16, window.innerHeight - hh - 8))}px`;
    };
    const mostrarTip = (el, x, y) => { tip.textContent = el.getAttribute('data-tip'); tip.hidden = false; moverTip(x, y); };
    document.addEventListener('mouseover', (e) => { const t = e.target.closest('[data-tip]'); if (t) mostrarTip(t, e.clientX, e.clientY); });
    document.addEventListener('mousemove', (e) => { if (!tip.hidden) moverTip(e.clientX, e.clientY); });
    document.addEventListener('mouseout', (e) => { if (e.target.closest('[data-tip]')) tip.hidden = true; });
    document.addEventListener('focusin', (e) => { const t = e.target.closest('[data-tip]'); if (t) { const r = t.getBoundingClientRect(); mostrarTip(t, r.left + r.width / 2, r.top); } });
    document.addEventListener('focusout', () => { tip.hidden = true; });

    /* ------------------------------------------------------------ piezas reutilizables */
    function tabla(columnas, filas, opciones) {
        const o = opciones || {};
        return h('div', { class: 'dv-tablewrap' },
            h('table', { class: 'dv-table' + (o.clic ? ' dv-table--click' : '') },
                h('thead', {}, h('tr', {}, columnas.map((c) => h('th', { scope: 'col', class: c.num ? 'num' : null }, c.t)))),
                h('tbody', {}, filas)));
    }
    /** Tarjeta con el gráfico y, detrás del botón «Ver tabla», los mismos datos en una tabla. */
    function tarjeta({ titulo, sub, grafico, columnas, filas, ancho, nota }) {
        const vistaGrafica = h('div', {}, grafico);
        const vistaTabla = columnas ? h('div', { hidden: true }, tabla(columnas, filas.map((f) => h('tr', {}, f.map((c, i) => h('td', { class: columnas[i].num ? 'num' : null }, c)))))) : null;
        const boton = columnas ? h('button', { type: 'button', class: 'dv-toggle', 'aria-pressed': 'false', onclick: () => {
            const abierto = boton.getAttribute('aria-pressed') === 'true';
            boton.setAttribute('aria-pressed', String(!abierto));
            vistaTabla.hidden = abierto; vistaGrafica.hidden = !abierto;
        } }, icon('fa-solid fa-table'), 'View table') : null;
        return h('article', { class: 'dv-card' + (ancho ? ' dv-card--wide' : '') },
            h('div', { class: 'dv-card-head' }, h('div', { style: 'margin-right:auto;min-width:0' }, h('h3', {}, titulo), sub ? h('p', {}, sub) : null), boton),
            vistaGrafica, vistaTabla, nota ? h('p', { class: 'dv-note' }, nota) : null);
    }
    const vacio = (texto, ic) => h('div', { class: 'dv-empty' }, icon(ic || 'fa-regular fa-folder-open'), texto);

    /** Barra apilada: un segmento por categoría, con 2 px de separación y la cifra dentro si cabe. */
    function barraApilada(partes) {
        const total = partes.reduce((s, p) => s + p.valor, 0);
        if (!total) return vacio('No data available yet.');
        return h('div', {},
            h('div', { class: 'dv-stack', role: 'img', 'aria-label': partes.map((p) => `${p.etiqueta}: ${p.valor}`).join(', ') },
                partes.map((p) => h('div', { class: `dv-seg ${p.clase}${p.valor ? '' : ' dv-seg--zero'}`, style: `flex:${p.valor} 1 0`, 'data-tip': `${p.etiqueta}: ${loc(p.valor)} (${loc(p.valor / total * 100, 1)} %)`, tabindex: '0' },
                    p.valor / total >= 0.08 ? String(p.valor) : ''))),
            h('div', { class: 'dv-legend' }, partes.map((p) => h('span', {}, h('i', { class: `dv-key ${p.clase}` }), `${p.etiqueta} `, h('b', {}, loc(p.valor)), ` (${loc(p.valor / total * 100)} %)`))));
    }
    /** Barras horizontales de una sola serie con el valor al lado (comparar magnitudes). */
    function barrasH(items, maximo, claseDe) {
        const max = maximo || Math.max(1, ...items.map((i) => i.valor));
        return h('div', { class: 'dv-hbars' }, items.map((i) => h('div', { class: 'dv-hrow' },
            h('span', { class: 'dv-hrow-label' }, i.etiqueta),
            h('div', { class: 'dv-track', 'data-tip': i.tip || `${i.etiqueta}: ${i.texto || i.valor}`, tabindex: '0' },
                h('div', { class: `dv-fill ${claseDe ? claseDe(i) : ''}`, style: `width:${Math.max(0, Math.min(100, i.valor / max * 100))}%` })),
            h('span', { class: 'dv-hrow-val' }, i.texto || loc(i.valor)))));
    }

    /* ------------------------------------------------------------ texto de las alertas */
    const SEVERIDAD = { ALTA: ['fa-solid fa-circle-exclamation', 'High'], MEDIA: ['fa-solid fa-triangle-exclamation', 'Medium'], BAJA: ['fa-solid fa-circle-info', 'Low'] };
    function mensajeAlerta(a) {
        switch (a.tipo) {
            case 'REVISION_ATRASADA': return `${plural(a.cantidad, 'attempt awaits', 'attempts await')} grading; the oldest has been waiting for ${dias(a.dias)}.`;
            case 'VENCIDA_SIN_CERRAR': return `The deadline passed ${dias(a.dias)} ago and the evaluation remains published.`;
            case 'BORRADOR_ANTIGUO': return `Has been in draft for ${dias(a.dias)} without being published.`;
            case 'SIN_INTENTOS': return `Published ${dias(a.dias)} ago and the student has not yet taken it.`;
            default: return a.tipo;
        }
    }
    const TITULO_ALERTA = { REVISION_ATRASADA: 'Overdue grading', VENCIDA_SIN_CERRAR: 'Overdue unclosed', BORRADOR_ANTIGUO: 'Old draft', SIN_INTENTOS: 'Not taken' };
    function bandera(a) {
        const [ic, t] = SEVERIDAD[a.severidad] || SEVERIDAD.BAJA;
        return h('span', { class: `dv-flag ${a.severidad === 'ALTA' ? '' : 'dv-flag--warn'}`, 'data-tip': mensajeAlerta(a), tabindex: '0' }, icon(ic), `${TITULO_ALERTA[a.tipo] || a.tipo}`);
    }

    /* ------------------------------------------------------------ PANEL GENERAL */
    let RESUMEN = null;
    let todasLasEvaluaciones = [];
    let limiteMostrado = 15;
    let bqInput = null, seSelect = null, stSelect = null, caCheck = null;
    let listaCuerpo = null, listaConteo = null, listaMas = null;

    function stripAccents(str) {
        return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

    function filteredEvaluaciones() {
        const query = stripAccents((bqInput ? bqInput.value : '').trim());
        const estado = seSelect ? seSelect.value : '';
        const tutor = stSelect ? stSelect.value : '';
        const soloAlertas = caCheck ? caCheck.checked : false;

        return todasLasEvaluaciones.filter((ev) => {
            if (estado && ev.estado !== estado) return false;
            if (tutor && String(ev.id_tutor) !== String(tutor)) return false;
            if (soloAlertas && (!ev.alertas || ev.alertas.length === 0)) return false;
            if (!query) return true;

            const estudiante = nombreEstudiante(ev.id_estudiante);
            const tut = nombreTutor(ev.id_tutor);
            const p = DIR.practicas[ev.id_practica];
            const practica = p ? `${p.tipo || ''} ${p.institucion || ''}` : '';
            const corpus = stripAccents(`${ev.titulo} #${ev.id_evaluacion} ${ev.id_evaluacion} ${estudiante} ${tut} ${practica} ${ev.estado}`);
            return corpus.includes(query);
        });
    }

    function renderEvaluacionesList() {
        if (!listaCuerpo) return;
        clear(listaCuerpo);
        clear(listaMas);

        const list = filteredEvaluaciones();
        if (list.length === 0) {
            const emptyState = h('div', { class: 'um-empty' },
                icon('fa-solid fa-magnifying-glass'),
                h('strong', {}, 'No evaluations match the filters'),
                h('span', {}, 'Try changing the search criteria or clear filters to view all evaluations.')
            );
            listaCuerpo.append(h('tr', {}, h('td', { colspan: '7' }, emptyState)));
            if (listaConteo) listaConteo.textContent = 'No results';
            return;
        }

        const visible = list.slice(0, limiteMostrado);
        visible.forEach((ev) => listaCuerpo.append(filaEvaluacion(ev)));

        if (listaConteo) {
            listaConteo.textContent = list.length <= limiteMostrado
                ? `Showing ${loc(list.length)} of ${loc(list.length)}`
                : `Showing ${loc(visible.length)} of ${loc(list.length)}`;
        }

        if (visible.length < list.length) {
            listaMas.append(h('button', {
                type: 'button',
                class: 'ev-btn ev-btn--sm ev-btn--soft',
                onclick: () => {
                    limiteMostrado += 15;
                    renderEvaluacionesList();
                }
            }, `View more evaluations (${loc(list.length - visible.length)} remaining)`));
        }
    }

    function glosario(r) {
        const dl = $('#dv-glosario'); clear(dl);
        const items = [
            ['Final grade', 'The highest score among the graded attempts of an evaluation.'],
            ['Percentage', 'Score divided by the maximum evaluation grade, allowing comparison across different scales.'],
            ['Passed', `Final score of ${loc(r.umbral_aprobacion_pct)} % or higher (3.0 out of 5.0).`],
            ['Pending grading', 'The student submitted the attempt, but the tutor has not graded the open questions yet.'],
            ['Question success rate', 'Correct answers among graded responses. An open question counts as correct starting from half its value.'],
            ['AI question', 'Suggested by AI from a topic or evidence. The tutor approves, edits, or rejects before publishing.'],
            ['Alerts', `Overdue grading: an attempt has waited ${r.dias_revision_atrasada} days or more without grading. Overdue unclosed: the deadline passed and it remains published. Old draft: ${r.dias_borrador_antiguo} days or more without publishing. Not taken: published ${r.dias_sin_intentos} days or more ago and no one has taken it.`],
            ['Privacy', 'This dashboard shows statistics and scores. It does not show student answers or tutor comments.'],
        ];
        items.forEach(([t, d]) => dl.append(h('dt', {}, t), h('dd', {}, d)));
    }

    function kpi(ic, valor, etiqueta, sub, atencion) {
        return h('div', { class: 'dv-kpi' + (atencion ? ' dv-kpi--attn' : '') },
            h('div', { class: 'dv-kpi-icon' }, icon(ic)),
            h('div', { class: 'dv-kpi-body' }, h('span', { class: 'dv-kpi-value' }, valor), h('span', { class: 'dv-kpi-label' }, etiqueta), h('span', { class: 'dv-kpi-sub' }, sub)));
    }

    function renderKpis(r) {
        const t = r.totales, d = r.desempeno, ia = r.ia, e = r.por_estado;
        const presentados = t.intentos_pendientes_revision + t.intentos_calificados;
        const equivale = d.promedio_pct === null ? 'No graded evaluations yet.' : `Equivalent to ${loc(d.promedio_pct / 20, 1)} out of 5.0 · ${plural(d.evaluaciones_calificadas, 'graded evaluation', 'graded evaluations')}.`;
        return h('div', { class: 'dv-kpis' },
            kpi('fa-solid fa-clipboard-question', n0(t.evaluaciones), 'Evaluations', `${n0(e.PUBLICADA)} published · ${n0(e.BORRADOR)} in draft · ${n0(e.CERRADA)} closed`),
            kpi('fa-solid fa-people-group', n0(t.practicas), 'Practices with evaluation', `${plural(t.tutores, 'tutor', 'tutors')} · ${plural(t.estudiantes, 'student', 'students')}`),
            kpi('fa-solid fa-paper-plane', n0(presentados), 'Submitted attempts', `${n0(t.intentos_en_curso)} in progress right now`),
            kpi('fa-solid fa-hourglass-half', n0(t.intentos_pendientes_revision), 'Pending grading', t.intentos_pendientes_revision ? 'Awaiting tutor grading.' : 'Everything is up to date.', r.alertas.some((a) => a.tipo === 'REVISION_ATRASADA')),
            kpi('fa-solid fa-chart-simple', pct(d.promedio_pct), 'Final grades average', equivale),
            kpi('fa-solid fa-circle-check', pct(d.aprobacion_pct), 'Pass rate', d.evaluaciones_calificadas ? `${n0(d.aprobadas)} passed · ${n0(d.reprobadas)} did not reach ${loc(r.umbral_aprobacion_pct)} %.` : 'No graded evaluations yet.'),
            kpi('fa-solid fa-wand-magic-sparkles', pct(ia.uso_pct), 'Questions generated with AI', ia.preguntas ? `${pct(ia.aceptacion_pct)} of tutor-reviewed questions were accepted.` : 'No questions were generated with AI.'),
            kpi('fa-solid fa-calendar-xmark', n0(t.evaluaciones_vencidas_sin_cerrar), 'Overdue unclosed', t.evaluaciones_vencidas_sin_cerrar ? 'Deadline passed and still published.' : 'None.', t.evaluaciones_vencidas_sin_cerrar > 0));
    }

    function tarjetaAlertas(r) {
        const MAX = 6;
        const lista = r.alertas.slice(0, MAX);
        const cuerpo = lista.length
            ? h('ul', { class: 'dv-alerts' }, lista.map((a) => {
                const [ic, t] = SEVERIDAD[a.severidad] || SEVERIDAD.BAJA;
                return h('li', {}, h('button', { type: 'button', class: `dv-alert dv-alert--${a.severidad.toLowerCase()}`, onclick: () => abrirDetalle(a.id_evaluacion) },
                    h('span', { class: 'dv-alert-sev' }, icon(ic), t),
                    h('span', {}, h('span', { class: 'dv-alert-title' }, `${TITULO_ALERTA[a.tipo] || a.tipo} · ${a.titulo}`),
                        h('span', { class: 'dv-alert-text' }, `${etiquetaPractica(a.id_practica)} · ${nombreTutor(a.id_tutor)}. ${mensajeAlerta(a)}`)),
                    icon('fa-solid fa-chevron-right dv-alert-go')));
            }))
            : vacio('No situations requiring attention.', 'fa-regular fa-circle-check');
        const mas = r.alertas.length > MAX ? h('div', { class: 'dv-more' }, h('button', { type: 'button', class: 'ev-btn ev-btn--sm ev-btn--ghost', onclick: () => {
            F.solo_alertas = true; const c = $('#f-alertas'); if (c) c.checked = true; cargarLista(true); $('#dv-lista').scrollIntoView({ behavior: 'smooth' });
        } }, `View all ${r.alertas.length} alerts in list`)) : null;
        return h('article', { class: 'dv-card dv-card--wide' },
            h('div', { class: 'dv-card-head' }, h('div', {}, h('h3', {}, 'Require attention'), h('p', {}, 'Sorted from most to least urgent. Click one to view evaluation.'))),
            cuerpo, mas);
    }

    function tarjetaEstado(r) {
        const e = r.por_estado;
        const partes = [{ etiqueta: 'Published', valor: e.PUBLICADA, clase: 'dv-s1' }, { etiqueta: 'In draft', valor: e.BORRADOR, clase: 'dv-s2' }, { etiqueta: 'Closed', valor: e.CERRADA, clase: 'dv-s3' }];
        const t = r.totales;
        const intentos = [{ etiqueta: 'In progress', valor: t.intentos_en_curso, clase: 'dv-s1' }, { etiqueta: 'To grade', valor: t.intentos_pendientes_revision, clase: 'dv-s2' }, { etiqueta: 'Graded', valor: t.intentos_calificados, clase: 'dv-s3' }];
        const grafico = h('div', {}, barraApilada(partes), h('h4', { class: 'dv-sub' }, 'Student attempt status'), barraApilada(intentos));
        return tarjeta({ titulo: 'Evaluation status', sub: 'Published are visible to students; drafts are prepared by tutors; closed no longer accept attempts.',
            grafico, columnas: [{ t: 'Concept' }, { t: 'Count', num: true }],
            filas: [...partes.map((p) => [`Evaluations (${p.etiqueta.toLowerCase()})`, loc(p.valor)]), ...intentos.map((p) => [`Attempts (${p.etiqueta.toLowerCase()})`, loc(p.valor)])] });
    }

    function tarjetaNotas(r) {
        const d = r.desempeno;
        const rangos = d.distribucion;
        const max = Math.max(0, ...rangos.map((x) => x.cantidad));
        const etiqueta = (x) => `${x.desde}–${x.hasta} %`;
        let grafico;
        if (!d.evaluaciones_calificadas) grafico = vacio('No graded evaluations yet.', 'fa-regular fa-clipboard');
        else {
            const cols = [];
            rangos.forEach((x, i) => {
                if (x.desde === r.umbral_aprobacion_pct) cols.push(h('i', { class: 'dv-pass-line', 'aria-hidden': 'true' }));
                cols.push(h('div', { class: 'dv-col' }, h('div', { class: `dv-bar dv-s1${x.cantidad ? '' : ' dv-bar--zero'}`, style: `height:${max ? x.cantidad / max * 100 : 0}%`, 'data-tip': `${etiqueta(x)} of maximum grade: ${plural(x.cantidad, 'evaluation', 'evaluations')}`, tabindex: '0' }, h('span', {}, String(x.cantidad)))));
            });
            grafico = h('div', {}, h('div', { class: 'dv-cols', role: 'img', 'aria-label': `Final grades by range: ${rangos.map((x) => `${etiqueta(x)}: ${x.cantidad}`).join(', ')}` }, cols),
                h('div', { class: 'dv-xaxis' }, rangos.map((x) => h('span', {}, etiqueta(x)))));
        }
        return tarjeta({ titulo: 'Final grades', sub: 'Graded evaluations by percentage of maximum grade.', grafico,
            columnas: [{ t: 'Range' }, { t: 'Evaluations', num: true }], filas: rangos.map((x) => [etiqueta(x), loc(x.cantidad)]),
            nota: `The dashed red line indicates minimum passing score (${loc(r.umbral_aprobacion_pct)} %).` });
    }

    function tarjetaIA(r) {
        const o = r.preguntas.por_origen, ia = r.ia;
        const grafico = h('div', {}, barraApilada([{ etiqueta: 'Generated with AI', valor: o.IA, clase: 'dv-s1' }, { etiqueta: 'Written by tutor', valor: o.MANUAL, clase: 'dv-s2' }]),
            ia.preguntas ? h('div', {}, h('h4', { class: 'dv-sub' }, 'Tutor actions on AI questions'),
                barrasH([{ etiqueta: 'Approved', valor: ia.aprobadas }, { etiqueta: 'Pending review', valor: ia.por_revisar }, { etiqueta: 'Rejected', valor: ia.rechazadas }], ia.preguntas, null)) : null);
        const prov = Object.entries(ia.por_proveedor).map(([k, v]) => `${k} (${v})`).join(', ') || 'none';
        return tarjeta({ titulo: 'Question origin', sub: 'How many suggested by AI and how many accepted by the tutor.', grafico,
            columnas: [{ t: 'Concept' }, { t: 'Questions', num: true }], filas: [['Generated with AI', loc(o.IA)], ['Written by tutor', loc(o.MANUAL)], ['AI approved', loc(ia.aprobadas)], ['AI pending review', loc(ia.por_revisar)], ['AI rejected', loc(ia.rechazadas)]],
            nota: `AI acceptance: ${pct(ia.aceptacion_pct)} of reviewed items. Generations: ${loc(ia.generaciones)}${ia.generaciones_fallidas ? ` (${loc(ia.generaciones_fallidas)} failed)` : ''}. Provider: ${prov}.` });
    }

    const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const nombreMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
    function tarjetaMeses(r) {
        const H = r.historial;
        const max = Math.max(0, ...H.flatMap((m) => [m.evaluaciones_creadas, m.intentos_enviados]));
        const barra = (v, clase, tip) => h('div', { class: `dv-bar ${clase}${v ? '' : ' dv-bar--zero'}`, style: `height:${max ? v / max * 100 : 0}%`, 'data-tip': tip, tabindex: '0' }, h('span', {}, String(v)));
        const grafico = !max ? vacio('No activity in these months yet.') : h('div', {},
            h('div', { class: 'dv-cols dv-cols--tight', role: 'img', 'aria-label': 'Recent months activity' },
                H.map((m) => h('div', { class: 'dv-col' }, barra(m.evaluaciones_creadas, 'dv-s1', `${nombreMes(m.mes)}: ${plural(m.evaluaciones_creadas, 'created evaluation', 'created evaluations')}`), barra(m.intentos_enviados, 'dv-s2', `${nombreMes(m.mes)}: ${plural(m.intentos_enviados, 'submitted attempt', 'submitted attempts')}`)))),
            h('div', { class: 'dv-xaxis dv-xaxis--tight' }, H.map((m) => h('span', {}, nombreMes(m.mes)))),
            h('div', { class: 'dv-legend' }, h('span', {}, h('i', { class: 'dv-key dv-s1' }), 'Created evaluations'), h('span', {}, h('i', { class: 'dv-key dv-s2' }), 'Submitted attempts')));
        return tarjeta({ titulo: 'Activity by month', sub: `Last ${H.length} months.`, grafico,
            columnas: [{ t: 'Month' }, { t: 'Created evaluations', num: true }, { t: 'Submitted attempts', num: true }], filas: H.map((m) => [nombreMes(m.mes), loc(m.evaluaciones_creadas), loc(m.intentos_enviados)]) });
    }

    function tarjetaTipos(r) {
        const t = r.preguntas.por_tipo, d = r.preguntas.por_dificultad;
        const total = Object.values(t).reduce((s, v) => s + v, 0);
        const fila = (etiqueta, valor) => ({ etiqueta, valor, texto: `${loc(valor)}${total ? ` · ${loc(valor / total * 100)} %` : ''}` });
        const grafico = !total ? vacio('No questions yet.') : h('div', { class: 'dv-two' },
            h('div', {}, h('h4', { class: 'dv-sub dv-sub--first' }, 'By type'),
                barrasH([fila('Multiple choice', t.OPCION_MULTIPLE), fila('True / False', t.VERDADERO_FALSO), fila('Open', t.ABIERTA)], total)),
            h('div', {}, h('h4', { class: 'dv-sub dv-sub--first' }, 'By difficulty'),
                barrasH([fila('Easy', d.FACIL), fila('Medium', d.MEDIA), fila('Hard', d.DIFICIL), fila('Undefined', d.SIN_DEFINIR)], total)));
        return tarjeta({ titulo: 'Questions', ancho: true, sub: `${plural(total, 'question in total', 'questions in total')}.`, grafico,
            columnas: [{ t: 'Category' }, { t: 'Questions', num: true }], filas: [['Multiple choice', loc(t.OPCION_MULTIPLE)], ['True / False', loc(t.VERDADERO_FALSO)], ['Open', loc(t.ABIERTA)], ['Easy', loc(d.FACIL)], ['Medium', loc(d.MEDIA)], ['Hard', loc(d.DIFICIL)], ['Undefined', loc(d.SIN_DEFINIR)]] });
    }

    function tarjetaTutores(r) {
        const filas = r.por_tutor.map((t) => h('tr', { tabindex: '0', onclick: () => filtrarTutor(t.id_tutor), onkeydown: (e) => { if (e.key === 'Enter') filtrarTutor(t.id_tutor); } },
            h('td', {}, h('span', { class: 'dv-cell-title' }, nombreTutor(t.id_tutor))),
            h('td', { class: 'num' }, loc(t.evaluaciones)), h('td', { class: 'num' }, loc(t.publicadas)), h('td', { class: 'num' }, loc(t.intentos_calificados)),
            h('td', { class: 'num' }, t.pendientes_revision ? h('span', { class: `dv-flag ${t.espera_max_dias >= r.dias_revision_atrasada ? '' : 'dv-flag--warn'}`, 'data-tip': `The oldest attempt has been waiting for ${dias(t.espera_max_dias)}`, tabindex: '0' }, icon('fa-solid fa-hourglass-half'), `${loc(t.pendientes_revision)} · ${dias(t.espera_max_dias)}`) : h('span', { class: 'dv-flag dv-flag--ok' }, icon('fa-solid fa-check'), 'Up to date')),
            h('td', { class: 'num' }, pct(t.promedio_pct)), h('td', { class: 'num' }, t.alertas ? loc(t.alertas) : '—')));
        return h('article', { class: 'dv-card dv-card--wide' },
            h('div', { class: 'dv-card-head' }, h('div', {}, h('h3', {}, 'Tutors'), h('p', {}, 'Sorted by most attempts awaiting grading. Click a tutor to filter the list below.'))),
            r.por_tutor.length ? tabla([{ t: 'Tutor' }, { t: 'Evaluations', num: true }, { t: 'Published', num: true }, { t: 'Graded', num: true }, { t: 'To grade', num: true }, { t: 'Average', num: true }, { t: 'Alerts', num: true }], filas, { clic: true }) : vacio('No tutors with evaluations yet.'));
    }
    function filtrarTutor(id) {
        if (stSelect) {
            stSelect.value = id;
            if (window.SPP && SPP.customSelect && typeof SPP.customSelect.sync === 'function') {
                SPP.customSelect.sync(stSelect);
            }
        }
        limiteMostrado = 15;
        renderEvaluacionesList();
        const lista = $('#dv-lista');
        if (lista) lista.scrollIntoView({ behavior: 'smooth' });
    }

    /* ---------- lista de evaluaciones (con filtros rápidos estilo usuarios) ---------- */
    function tarjetaLista(r) {
        bqInput = h('input', {
            type: 'search',
            placeholder: 'Search by title, student, tutor or practice…',
            'aria-label': 'Search by title, student, tutor or practice',
            maxlength: '100'
        });
        bqInput.addEventListener('input', () => {
            limiteMostrado = 15;
            renderEvaluacionesList();
        });
        bqInput.addEventListener('change', () => {
            limiteMostrado = 15;
            renderEvaluacionesList();
        });
        const searchWrap = h('div', { class: 'dv-search' },
            icon('fa-solid fa-magnifying-glass'),
            bqInput
        );

        seSelect = h('select', { id: 'f-estado', 'aria-label': 'Select status' }, [
            ['', 'All statuses'],
            ['PUBLICADA', 'Published'],
            ['BORRADOR', 'In draft'],
            ['CERRADA', 'Closed']
        ].map(([v, t]) => h('option', { value: v }, t)));
        seSelect.addEventListener('change', () => {
            limiteMostrado = 15;
            renderEvaluacionesList();
        });
        const stateWrap = h('div', { class: 'cp-input-wrap' },
            seSelect,
            icon('fa-solid fa-chevron-down right-icon')
        );

        stSelect = h('select', { id: 'f-tutor', 'aria-label': 'Select tutor' }, [
            h('option', { value: '' }, 'All tutors'),
            ...r.por_tutor.map((t) => h('option', { value: t.id_tutor }, nombreTutor(t.id_tutor)))
        ]);
        stSelect.addEventListener('change', () => {
            limiteMostrado = 15;
            renderEvaluacionesList();
        });
        const tutorWrap = h('div', { class: 'cp-input-wrap' },
            stSelect,
            icon('fa-solid fa-chevron-down right-icon')
        );

        caCheck = h('input', { type: 'checkbox', id: 'f-alertas' });
        caCheck.addEventListener('change', () => {
            limiteMostrado = 15;
            renderEvaluacionesList();
        });
        const checkWrap = h('label', { class: 'dv-check-pill' }, caCheck, h('span', {}, 'Only with alerts'));

        const btnClear = h('button', { type: 'button', class: 'um-ghost-btn', id: 'ev-btn-clear', 'aria-label': 'Clear filters' },
            icon('fa-solid fa-rotate-left'),
            'Clear'
        );
        btnClear.addEventListener('click', () => {
            bqInput.value = '';
            seSelect.value = '';
            stSelect.value = '';
            caCheck.checked = false;
            if (window.SPP && SPP.customSelect && typeof SPP.customSelect.sync === 'function') {
                SPP.customSelect.sync(seSelect);
                SPP.customSelect.sync(stSelect);
            }
            limiteMostrado = 15;
            renderEvaluacionesList();
        });

        listaCuerpo = h('tbody', {});
        listaConteo = h('span', { class: 'dv-count', 'aria-live': 'polite' });
        listaMas = h('div', { class: 'dv-more' });

        requestAnimationFrame(() => {
            if (window.SPP && SPP.customSelect && typeof SPP.customSelect.init === 'function') {
                SPP.customSelect.init('#dv-lista');
            }
        });

        return h('article', { class: 'dv-card dv-card--wide', id: 'dv-lista' },
            h('div', { class: 'dv-card-head' }, h('div', {}, h('h3', {}, 'All evaluations'), h('p', {}, 'Click a row to view question analysis and attempts.'))),
            h('div', { class: 'dv-filters' }, searchWrap, stateWrap, tutorWrap, checkWrap, btnClear, listaConteo),
            h('div', { class: 'dv-tablewrap' }, h('table', { class: 'dv-table dv-table--click' },
                h('thead', {}, h('tr', {}, [['Evaluation'], ['Tutor'], ['Status'], ['Questions', 1], ['Attempts', 1], ['Final grade', 1], ['Deadline']].map(([t, num]) => h('th', { scope: 'col', class: num ? 'num' : null }, t)))),
                listaCuerpo)),
            listaMas);
    }

    function subtitulo(ev) {
        const p = DIR.practicas[ev.id_practica];
        return `${nombreEstudiante(ev.id_estudiante)} · ${p ? (p.tipo || 'Practice') : 'practice not found'}`;
    }

    function filaEvaluacion(ev) {
        const abrir = () => abrirDetalle(ev.id_evaluacion);
        return h('tr', { tabindex: '0', onclick: abrir, onkeydown: (e) => { if (e.key === 'Enter') abrir(); } },
            h('td', {}, h('span', { class: 'dv-cell-title' }, ev.titulo), h('span', { class: 'dv-cell-sub' }, subtitulo(ev)),
                ev.alertas.length ? h('span', { class: 'dv-cell-sub' }, ev.alertas.map(bandera)) : null),
            h('td', {}, nombreTutor(ev.id_tutor)),
            h('td', {}, badge(ev.estado), ev.vencida && ev.estado === 'PUBLICADA' ? h('span', { class: 'dv-cell-sub' }, 'Overdue') : null),
            h('td', { class: 'num' }, loc(ev.total_preguntas), ev.preguntas_ia ? h('span', { class: 'dv-cell-sub' }, `${loc(ev.preguntas_ia)} with AI`) : null),
            h('td', { class: 'num' }, `${loc(ev.intentos_calificados)}/${loc(ev.intentos_enviados)}`, ev.pendientes_revision ? h('span', { class: 'dv-cell-sub' }, `${loc(ev.pendientes_revision)} to grade`) : null),
            h('td', { class: 'num' }, ev.nota_final === null ? '—' : h('span', { class: 'dv-pct' }, pct(ev.porcentaje_final), h('small', {}, `${loc(ev.nota_final, 2)} of ${loc(ev.nota_maxima, 1)}`))),
            h('td', {}, ev.fecha_limite ? fecha(ev.fecha_limite) : 'No deadline'));
    }

    function errorPanel(el, e, reintentar) {
        clear(el).append(h('div', { class: 'ev-empty' }, icon('fa-solid fa-plug-circle-exclamation'), (e && e.message) || 'Could not load information.',
            h('div', { class: 'ev-actions', style: 'justify-content:center' }, h('button', { type: 'button', class: 'ev-btn ev-btn--primary', onclick: reintentar }, icon('fa-solid fa-rotate'), 'Retry'))));
    }

    async function cargarPanel() {
        clear(contenido).append(h('p', { class: 'ev-loading' }, 'Loading…'));
        try {
            const [r, listRes] = await Promise.all([
                API.resumen(),
                API.listar({ limite: 100 })
            ]);
            absorber(r.directorio);
            if (listRes && listRes.directorio) absorber(listRes.directorio);
            RESUMEN = r;
            todasLasEvaluaciones = listRes?.items || [];
            limiteMostrado = 15;
            glosario(r);
            $('#panel-actualizado').textContent = `Updated ${fecha(r.generado_en)}.`;
            clear(contenido).append(
                renderKpis(r),
                h('div', { class: 'dv-grid' }, tarjetaAlertas(r), tarjetaEstado(r), tarjetaNotas(r), tarjetaIA(r), tarjetaMeses(r), tarjetaTipos(r), tarjetaTutores(r), tarjetaLista(r)));
            
            if (window.SPP && SPP.customSelect && typeof SPP.customSelect.init === 'function') {
                SPP.customSelect.init('#dv-lista');
            }
            renderEvaluacionesList();
        } catch (e) { errorPanel(contenido, e, cargarPanel); }
    }
    $('#btn-actualizar').addEventListener('click', (e) => ocupado(e.currentTarget, cargarPanel));

    /* ------------------------------------------------------------ DETALLE DE UNA EVALUACIÓN */
    const detalle = $('#detalle-contenido');
    let ultimoDetalle = null;
    $('#btn-volver').addEventListener('click', () => {
        const lista = $('#dv-lista');
        ver('panel', !lista);
        if (lista) {
            requestAnimationFrame(() => {
                lista.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    });

    async function abrirDetalle(id) {
        ver('detalle');
        $('#detalle-title').textContent = 'Loading…'; clear($('#detalle-badges')); clear(detalle);
        try {
            const d = await API.detalle(id);
            absorber(d.directorio);
            ultimoDetalle = d;
            pintarDetalle(d);
        } catch (e) {
            $('#detalle-title').textContent = 'Could not open evaluation';
            errorPanel(detalle, e, () => abrirDetalle(id));
        }
    }

    function dato(t, v) { return h('div', {}, h('dt', {}, t), h('dd', {}, v)); }
    function pintarDetalle(d) {
        $('#detalle-title').textContent = d.titulo;
        const b = $('#detalle-badges'); clear(b);
        EvalUI.add(b, badge(d.estado), d.vencida && d.estado === 'PUBLICADA' ? h('span', { class: 'ev-badge ev-badge--cerrada' }, icon('fa-regular fa-calendar-xmark'), 'Deadline passed') : null, d.alertas.map(bandera));
        const p = DIR.practicas[d.id_practica] || {};
        EvalUI.add(clear(detalle),
            h('dl', { class: 'dv-meta' },
                dato('Student', nombreEstudiante(d.id_estudiante)), dato('Tutor', nombreTutor(d.id_tutor)),
                dato('Practice', DIR.practicas[d.id_practica] ? `${p.tipo || 'Practice'}${p.institucion ? ` · ${p.institucion}` : ''}` : `${d.id_practica} (not found)`),
                dato('Created', fecha(d.fecha_evaluacion)), dato('Deadline', d.fecha_limite ? fecha(d.fecha_limite) : 'No deadline'),
                dato('Allowed attempts', String(d.intentos_permitidos)), dato('Max grade', loc(d.nota_maxima, 1)),
                dato('Results to student', d.mostrar_resultados ? 'Visible upon submission' : 'Hidden')),
            d.descripcion ? h('p', { class: 'dv-note', style: 'margin:-6px 0 18px' }, d.descripcion) : null,
            h('div', { class: 'ev-stats' },
                estadistica(d.total_preguntas, 'Questions', d.preguntas_ia ? `${d.preguntas_ia} with AI` : null),
                estadistica(d.intentos_enviados, 'Submitted attempts', `${d.intentos_iniciados} started`),
                estadistica(d.pendientes_revision, 'To grade', d.espera_max_dias !== null ? `waiting for ${dias(d.espera_max_dias)}` : null),
                estadistica(d.nota_final === null ? '—' : pct(d.porcentaje_final), 'Final grade', d.nota_final === null ? 'Ungraded' : `${loc(d.nota_final, 2)} of ${loc(d.nota_maxima, 1)}`)),
            d.alertas.length ? h('ul', { class: 'dv-alerts', style: 'margin-bottom:18px' }, d.alertas.map((a) => {
                const [ic, t] = SEVERIDAD[a.severidad] || SEVERIDAD.BAJA;
                return h('li', { class: `dv-alert dv-alert--${a.severidad.toLowerCase()}`, style: 'cursor:default' }, h('span', { class: 'dv-alert-sev' }, icon(ic), t), h('span', {}, h('span', { class: 'dv-alert-title' }, TITULO_ALERTA[a.tipo] || a.tipo), h('span', { class: 'dv-alert-text' }, mensajeAlerta(a))), h('span', {}));
            })) : null,
            pestanas(d));
    }
    const estadistica = (valor, etiqueta, nota) => h('div', { class: 'ev-stat' }, h('b', {}, String(valor)), h('span', {}, etiqueta), nota ? h('span', { style: 'display:block;font-size:11.5px;opacity:.75;margin-top:2px' }, nota) : null);

    function pestanas(d) {
        const defs = [['analisis', 'Question analysis', () => panelAnalisis(d)], ['intentos', 'Attempts', () => panelIntentos(d)], ['ia', 'AI usage', () => panelIA(d)]];
        const botones = defs.map(([k, t]) => h('button', { type: 'button', class: 'ev-tab', role: 'tab', 'aria-selected': k === 'analisis' ? 'true' : 'false', 'data-tab': k }, t));
        const paneles = defs.map(([k, , f]) => h('div', { 'data-panel': k, hidden: k !== 'analisis' }, f()));
        botones.forEach((btn) => btn.addEventListener('click', () => {
            botones.forEach((x) => x.setAttribute('aria-selected', String(x === btn)));
            paneles.forEach((pn) => { pn.hidden = pn.getAttribute('data-panel') !== btn.getAttribute('data-tab'); });
        }));
        return h('div', {}, h('div', { class: 'ev-tabs', role: 'tablist' }, botones), paneles);
    }

    const TIPO = EvalUI.TIPOS;
    function panelAnalisis(d) {
        if (!d.preguntas.length) return vacio('This evaluation does not have questions yet.', 'fa-regular fa-circle-question');
        const filas = d.preguntas.map((q) => {
            const claseAcierto = q.pct_acierto === null ? '' : q.pct_acierto >= 70 ? 'dv-fill--good' : q.pct_acierto >= 40 ? 'dv-fill--mid' : 'dv-fill--low';
            const calificadas = q.correctas + q.incorrectas;
            return h('tr', {},
                h('td', { class: 'num' }, String(q.orden)),
                h('td', {}, h('span', { class: 'dv-qtext' }, q.enunciado), q.estado_revision !== 'APROBADA' ? h('span', { class: 'dv-cell-sub' }, q.estado_revision === 'RECHAZADA' ? 'Rejected by tutor (not applied)' : 'Pending tutor review (not applied)') : null),
                h('td', {}, TIPO[q.tipo_pregunta] || q.tipo_pregunta), h('td', {}, EvalUI.badgeOrigen(q.origen)),
                h('td', {}, { FACIL: 'Easy', MEDIA: 'Medium', DIFICIL: 'Hard' }[q.dificultad] || '—'),
                h('td', { class: 'num' }, loc(q.valor_pregunta, 2)),
                h('td', {}, q.pct_acierto === null ? h('span', { class: 'dv-cell-sub' }, q.sin_calificar ? `${plural(q.sin_calificar, 'answer', 'answers')} ungraded` : 'No answers yet')
                    : h('div', { class: 'dv-acierto' }, h('div', { class: 'dv-track', 'data-tip': `${q.correctas} of ${calificadas} graded answers were correct`, tabindex: '0' }, h('div', { class: `dv-fill ${claseAcierto}`, style: `width:${q.pct_acierto}%` })), h('b', {}, pct(q.pct_acierto)),
                        h('small', {}, `${q.correctas} of ${calificadas} correct${q.sin_calificar ? ` · ${q.sin_calificar} ungraded` : ''}`))));
        });
        return h('div', {}, tabla([{ t: '#', num: true }, { t: 'Question' }, { t: 'Type' }, { t: 'Source' }, { t: 'Difficulty' }, { t: 'Value', num: true }, { t: 'Success rate' }], filas),
            h('p', { class: 'dv-note' }, 'Success rate = correct answers among graded responses. An open question counts as correct from half its value. For privacy, student answers are not displayed.'));
    }
    function panelIntentos(d) {
        if (!d.intentos.length) return vacio('The student has not started this evaluation yet.', 'fa-regular fa-hourglass');
        return tabla([{ t: 'Attempt', num: true }, { t: 'Status' }, { t: 'Start' }, { t: 'Submitted' }, { t: 'Grade', num: true }, { t: 'Percentage', num: true }, { t: 'Waiting', num: true }],
            d.intentos.map((i) => h('tr', {}, h('td', { class: 'num' }, String(i.numero_intento)), h('td', {}, badge(i.estado)), h('td', {}, fecha(i.fecha_inicio)), h('td', {}, i.fecha_envio ? fecha(i.fecha_envio) : '—'),
                h('td', { class: 'num' }, i.nota_obtenida === null ? '—' : `${loc(i.nota_obtenida, 2)} of ${loc(d.nota_maxima, 1)}`), h('td', { class: 'num' }, pct(i.porcentaje)),
                h('td', { class: 'num' }, i.dias_esperando === null ? '—' : dias(i.dias_esperando)))));
    }
    function panelIA(d) {
        const ia = d.preguntas.filter((q) => q.origen === 'IA');
        const cuenta = (e) => ia.filter((q) => q.estado_revision === e).length;
        const resumen = h('p', { class: 'dv-note', style: 'margin:0 0 14px' }, ia.length
            ? `${plural(ia.length, 'question was proposed', 'questions were proposed')} by AI: ${cuenta('APROBADA')} approved, ${cuenta('BORRADOR')} pending review and ${cuenta('RECHAZADA')} rejected.`
            : 'This evaluation does not use questions generated with AI.');
        if (!d.generaciones.length) return h('div', {}, resumen);
        return h('div', {}, resumen, tabla([{ t: 'Date' }, { t: 'Provider' }, { t: 'Model' }, { t: 'Result' }, { t: 'Requested', num: true }, { t: 'Generated', num: true }, { t: 'Duration', num: true }],
            d.generaciones.map((g) => h('tr', {}, h('td', {}, fecha(g.created_at)), h('td', {}, g.proveedor || '—'), h('td', {}, g.modelo || '—'),
                h('td', {}, g.estado === 'FALLIDA' ? h('span', { class: 'dv-flag' }, icon('fa-solid fa-circle-xmark'), 'Failed') : h('span', { class: 'dv-flag dv-flag--ok' }, icon('fa-solid fa-check'), g.estado === 'COMPLETADA' ? 'Completed' : g.estado)),
                h('td', { class: 'num' }, loc(g.cantidad_solicitada)), h('td', { class: 'num' }, loc(g.cantidad_generada)), h('td', { class: 'num' }, g.duracion_ms ? `${loc(g.duracion_ms / 1000, 1)} s` : '—')))));
    }

    /* ------------------------------------------------------------ exportación (Excel / CSV / JSON / PDF)
       Solo cifras y notas; igual que el panel, nunca incluye respuestas de estudiantes ni comentarios del tutor. */
    function datosExportables() {
        const r = RESUMEN;
        if (!r) return [];
        const t = r.totales, d = r.desempeno, ia = r.ia, e = r.por_estado, o = r.preguntas.por_origen, tp = r.preguntas.por_tipo, df = r.preguntas.por_dificultad;
        const ds = (id, title, columns, rows) => ({ id, title, columns: columns.map(([key, label, num]) => ({ key, label, num: Boolean(num) })), rows });
        return [
            ds('eval-cifras', 'General metrics', [['indicador', 'Metric'], ['valor', 'Value', true]], [
                ['Evaluations', t.evaluaciones], ['Published', e.PUBLICADA], ['In draft', e.BORRADOR], ['Closed', e.CERRADA], ['Practices with evaluation', t.practicas],
                ['Tutors', t.tutores], ['Students', t.estudiantes], ['Attempts in progress', t.intentos_en_curso], ['Attempts pending grading', t.intentos_pendientes_revision],
                ['Graded attempts', t.intentos_calificados], ['Final grades average (%)', d.promedio_pct], ['Pass rate (%)', d.aprobacion_pct],
                ['Graded evaluations', d.evaluaciones_calificadas], ['Passed', d.aprobadas], ['Failed', d.reprobadas], ['Questions with AI (%)', ia.uso_pct],
                ['Overdue unclosed evaluations', t.evaluaciones_vencidas_sin_cerrar]
            ].map(([indicador, valor]) => ({ indicador, valor }))),
            ds('eval-notas', 'Final grades by range', [['rango', 'Range (% of maximum grade)'], ['cantidad', 'Evaluations', true]], d.distribucion.map((x) => ({ rango: `${x.desde}–${x.hasta} %`, cantidad: x.cantidad }))),
            ds('eval-origen', 'Question origin', [['concepto', 'Concept'], ['preguntas', 'Questions', true]], [
                ['Generated with AI', o.IA], ['Written by tutor', o.MANUAL], ['AI approved', ia.aprobadas], ['AI pending review', ia.por_revisar], ['AI rejected', ia.rechazadas]
            ].map(([concepto, preguntas]) => ({ concepto, preguntas }))),
            ds('eval-meses', 'Activity by month', [['mes', 'Month'], ['creadas', 'Created evaluations', true], ['enviados', 'Submitted attempts', true]], r.historial.map((m) => ({ mes: m.mes, creadas: m.evaluaciones_creadas, enviados: m.intentos_enviados }))),
            ds('eval-preguntas', 'Questions by type and difficulty', [['categoria', 'Category'], ['preguntas', 'Questions', true]], [
                ['Multiple choice', tp.OPCION_MULTIPLE], ['True / False', tp.VERDADERO_FALSO], ['Open', tp.ABIERTA], ['Easy', df.FACIL], ['Medium', df.MEDIA], ['Hard', df.DIFICIL], ['Undefined', df.SIN_DEFINIR]
            ].map(([categoria, preguntas]) => ({ categoria, preguntas }))),
            ds('eval-tutores', 'Tutors', [['tutor', 'Tutor'], ['evaluaciones', 'Evaluations', true], ['publicadas', 'Published', true], ['calificados', 'Graded attempts', true], ['porCalificar', 'To grade', true], ['espera', 'Max wait (days)', true], ['promedio', 'Average (%)', true], ['alertas', 'Alerts', true]],
                r.por_tutor.map((x) => ({ tutor: nombreTutor(x.id_tutor), evaluaciones: x.evaluaciones, publicadas: x.publicadas, calificados: x.intentos_calificados, porCalificar: x.pendientes_revision, espera: x.espera_max_dias, promedio: x.promedio_pct, alertas: x.alertas }))),
            ds('eval-alertas', 'Alerts (require attention)', [['severidad', 'Severity'], ['tipo', 'Type'], ['evaluacion', 'Evaluation'], ['practica', 'Practice'], ['tutor', 'Tutor'], ['detalle', 'Detail']],
                r.alertas.map((a) => ({ severidad: (SEVERIDAD[a.severidad] || SEVERIDAD.BAJA)[1], tipo: TITULO_ALERTA[a.tipo] || a.tipo, evaluacion: a.titulo, practica: etiquetaPractica(a.id_practica), tutor: nombreTutor(a.id_tutor), detalle: mensajeAlerta(a) })))
        ];
    }

    /* ------------------------------------------------------------ arranque */
    if (EvalAPI.modo === 'mock') EvalUI.banner('Modo SIN backend: las cifras son datos de ejemplo.', 'fa-solid fa-flask', '');
    window.SPP_DIRECTOR = window.SPP_DIRECTOR || {};
    window.SPP_DIRECTOR.cargarEvaluaciones = cargarPanel;
    window.SPP_DIRECTOR.getExportData = datosExportables;
    cargarPanel();
});
