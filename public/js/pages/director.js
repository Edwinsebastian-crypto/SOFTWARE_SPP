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
    const reportsHeader = document.getElementById('reports-header') || document.querySelector('#reports .reports-header');
    const reportsTabsNav = document.getElementById('reports-tabs') || document.querySelector('#reports .reports-tabs');
    const normalReportButtons = Array.from(document.querySelectorAll('#reports .reports-tab-btn:not(#btn-evaluations-tab)'));
    const reportPanelIds = ['tab-general', 'tab-types', 'tab-practice', 'tab-feedback', 'tab-institutions'];

    SPP.panels.wireTabs(
        normalReportButtons,
        reportPanelIds.map((id) => document.getElementById(id)).filter(Boolean),
        (_button, index) => reportPanelIds[index]
    );

    const btnEvalTab = document.getElementById('btn-evaluations-tab');
    const tabEvaluations = document.getElementById('tab-evaluations');
    const btnEvalBackReports = document.getElementById('btn-eval-back-reports');

    const openEvaluationsView = () => {
        if (!tabEvaluations) return;
        reportPanelIds.forEach((id) => {
            const p = document.getElementById(id);
            if (p) p.style.display = 'none';
        });
        document.querySelectorAll('#reports .reports-tab-btn').forEach((b) => b.classList.remove('active'));
        if (btnEvalTab) btnEvalTab.classList.add('active');
        if (reportsHeader) reportsHeader.style.display = 'none';
        if (reportsTabsNav) reportsTabsNav.style.display = 'none';
        const accToolbar = document.getElementById('rep-accreditation-toolbar');
        if (accToolbar) accToolbar.style.display = 'none';
        tabEvaluations.style.display = '';
        if (window.SPP_DIRECTOR && typeof window.SPP_DIRECTOR.cargarEvaluaciones === 'function') {
            const cont = document.getElementById('panel-contenido');
            if (cont && (cont.children.length === 0 || cont.querySelector('.ev-loading'))) {
                window.SPP_DIRECTOR.cargarEvaluaciones();
            } else if (window.SPP && SPP.customSelect && typeof SPP.customSelect.init === 'function') {
                SPP.customSelect.init('#dv-lista');
            }
        }
        SPP.panels.resetScroll();
    };

    const closeEvaluationsView = () => {
        if (tabEvaluations) tabEvaluations.style.display = 'none';
        const vPanel = document.getElementById('view-panel');
        const vDetalle = document.getElementById('view-detalle');
        if (vPanel) vPanel.hidden = false;
        if (vDetalle) vDetalle.hidden = true;
        if (reportsHeader) reportsHeader.style.display = '';
        if (reportsTabsNav) reportsTabsNav.style.display = '';
        const accToolbar = document.getElementById('rep-accreditation-toolbar');
        if (accToolbar) accToolbar.style.display = '';
        document.querySelectorAll('#reports .reports-tab-btn').forEach((b) => b.classList.remove('active'));
        if (normalReportButtons[0]) normalReportButtons[0].click();
        SPP.panels.resetScroll();
    };

    if (btnEvalTab) {
        btnEvalTab.addEventListener('click', openEvaluationsView);
    }
    if (btnEvalBackReports) {
        btnEvalBackReports.addEventListener('click', closeEvaluationsView);
    }

    normalReportButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#reports .reports-tab-btn').forEach((b) => {
                if (b !== btn) b.classList.remove('active');
            });
            btn.classList.add('active');
            if (tabEvaluations) tabEvaluations.style.display = 'none';
            if (reportsHeader) reportsHeader.style.display = '';
            if (reportsTabsNav) reportsTabsNav.style.display = '';
        });
    });

    const sidebarReportsLink = document.querySelector('.app-navigation a[href="#reports"]');
    if (sidebarReportsLink) {
        sidebarReportsLink.addEventListener('click', () => {
            if (tabEvaluations && tabEvaluations.style.display !== 'none') {
                closeEvaluationsView();
            }
        });
    }

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
    const dias = (d) => plural(d, 'día', 'días');
    const DIR = { practicas: {}, tutores: {}, estudiantes: {} };
    const absorber = (d) => { if (d) for (const k of Object.keys(DIR)) Object.assign(DIR[k], d[k] || {}); };
    const nombreTutor = (id) => DIR.tutores[id] || `Tutor ${id}`;
    const nombreEstudiante = (id) => DIR.estudiantes[id] || `Estudiante ${id}`;
    const etiquetaPractica = (id) => {
        const p = DIR.practicas[id];
        return p ? `${p.estudiante || 'Estudiante'} · ${p.tipo || 'Práctica'}` : `Práctica ${id} (no encontrada)`;
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
        } }, icon('fa-solid fa-table'), 'Ver tabla') : null;
        return h('article', { class: 'dv-card' + (ancho ? ' dv-card--wide' : '') },
            h('div', { class: 'dv-card-head' }, h('div', { style: 'margin-right:auto;min-width:0' }, h('h3', {}, titulo), sub ? h('p', {}, sub) : null), boton),
            vistaGrafica, vistaTabla, nota ? h('p', { class: 'dv-note' }, nota) : null);
    }
    const vacio = (texto, ic) => h('div', { class: 'dv-empty' }, icon(ic || 'fa-regular fa-folder-open'), texto);

    /** Barra apilada: un segmento por categoría, con 2 px de separación y la cifra dentro si cabe. */
    function barraApilada(partes) {
        const total = partes.reduce((s, p) => s + p.valor, 0);
        if (!total) return vacio('Todavía no hay datos.');
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
    const SEVERIDAD = { ALTA: ['fa-solid fa-circle-exclamation', 'Alta'], MEDIA: ['fa-solid fa-triangle-exclamation', 'Media'], BAJA: ['fa-solid fa-circle-info', 'Baja'] };
    function mensajeAlerta(a) {
        switch (a.tipo) {
            case 'REVISION_ATRASADA': return `${plural(a.cantidad, 'intento espera', 'intentos esperan')} calificación; el más antiguo lleva ${dias(a.dias)}.`;
            case 'VENCIDA_SIN_CERRAR': return `La fecha límite pasó hace ${dias(a.dias)} y la evaluación sigue publicada.`;
            case 'BORRADOR_ANTIGUO': return `Lleva ${dias(a.dias)} en borrador sin publicarse.`;
            case 'SIN_INTENTOS': return `Publicada hace ${dias(a.dias)} y el estudiante aún no la presenta.`;
            default: return a.tipo;
        }
    }
    const TITULO_ALERTA = { REVISION_ATRASADA: 'Calificación atrasada', VENCIDA_SIN_CERRAR: 'Vencida sin cerrar', BORRADOR_ANTIGUO: 'Borrador antiguo', SIN_INTENTOS: 'Sin presentar' };
    function bandera(a) {
        const [ic, t] = SEVERIDAD[a.severidad] || SEVERIDAD.BAJA;
        return h('span', { class: `dv-flag ${a.severidad === 'ALTA' ? '' : 'dv-flag--warn'}`, 'data-tip': mensajeAlerta(a), tabindex: '0' }, icon(ic), `${TITULO_ALERTA[a.tipo] || a.tipo}`);
    }

    /* ------------------------------------------------------------ PANEL GENERAL */
    let RESUMEN = null;
    const F = { q: '', estado: '', id_tutor: '', solo_alertas: false };
    const LIMITE = 10;
    let offset = 0;
    let listaCuerpo = null, listaConteo = null, listaMas = null, cargandoLista = false;

    function glosario(r) {
        const dl = $('#dv-glosario'); clear(dl);
        const items = [
            ['Nota final', 'La mejor nota entre los intentos ya calificados de una evaluación.'],
            ['Porcentaje', 'Nota dividida entre la nota máxima de la evaluación; así se pueden comparar escalas distintas.'],
            ['Aprobada', `Nota final de ${loc(r.umbral_aprobacion_pct)} % o más (3,0 sobre 5,0).`],
            ['Pendiente de calificar', 'El estudiante ya envió el intento, pero el tutor aún no califica sus preguntas abiertas.'],
            ['Acierto de una pregunta', 'Respuestas correctas entre las respuestas ya calificadas. Una abierta cuenta como acierto desde la mitad de su valor.'],
            ['Pregunta con IA', 'Propuesta por la IA a partir de un tema o de las evidencias. El tutor la aprueba, edita o rechaza antes de publicar.'],
            ['Alertas', `Calificación atrasada: un intento lleva ${r.dias_revision_atrasada} días o más sin calificar. Vencida sin cerrar: pasó la fecha límite y sigue publicada. Borrador antiguo: ${r.dias_borrador_antiguo} días o más sin publicar. Sin presentar: publicada hace ${r.dias_sin_intentos} días o más y nadie la ha presentado.`],
            ['Privacidad', 'Este panel muestra cifras y notas. No muestra lo que escribieron los estudiantes ni los comentarios del tutor.'],
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
        const equivale = d.promedio_pct === null ? 'Aún no hay evaluaciones calificadas.' : `Equivale a ${loc(d.promedio_pct / 20, 1)} sobre 5,0 · ${plural(d.evaluaciones_calificadas, 'evaluación calificada', 'evaluaciones calificadas')}.`;
        return h('div', { class: 'dv-kpis' },
            kpi('fa-solid fa-clipboard-question', n0(t.evaluaciones), 'Evaluaciones', `${n0(e.PUBLICADA)} publicadas · ${n0(e.BORRADOR)} en borrador · ${n0(e.CERRADA)} cerradas`),
            kpi('fa-solid fa-people-group', n0(t.practicas), 'Prácticas con evaluación', `${plural(t.tutores, 'tutor', 'tutores')} · ${plural(t.estudiantes, 'estudiante', 'estudiantes')}`),
            kpi('fa-solid fa-paper-plane', n0(presentados), 'Intentos presentados', `${n0(t.intentos_en_curso)} en curso ahora mismo`),
            kpi('fa-solid fa-hourglass-half', n0(t.intentos_pendientes_revision), 'Pendientes de calificar', t.intentos_pendientes_revision ? 'Esperan la calificación del tutor.' : 'Todo está al día.', r.alertas.some((a) => a.tipo === 'REVISION_ATRASADA')),
            kpi('fa-solid fa-chart-simple', pct(d.promedio_pct), 'Promedio de notas finales', equivale),
            kpi('fa-solid fa-circle-check', pct(d.aprobacion_pct), 'Aprobación', d.evaluaciones_calificadas ? `${n0(d.aprobadas)} aprobaron · ${n0(d.reprobadas)} no llegaron al ${loc(r.umbral_aprobacion_pct)} %.` : 'Aún no hay evaluaciones calificadas.'),
            kpi('fa-solid fa-wand-magic-sparkles', pct(ia.uso_pct), 'Preguntas hechas con IA', ia.preguntas ? `${pct(ia.aceptacion_pct)} de las que el tutor ya revisó fueron aceptadas.` : 'Ninguna pregunta se generó con IA.'),
            kpi('fa-solid fa-calendar-xmark', n0(t.evaluaciones_vencidas_sin_cerrar), 'Vencidas sin cerrar', t.evaluaciones_vencidas_sin_cerrar ? 'Pasó la fecha límite y siguen publicadas.' : 'Ninguna.', t.evaluaciones_vencidas_sin_cerrar > 0));
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
            : vacio('No hay situaciones que atender.', 'fa-regular fa-circle-check');
        const mas = r.alertas.length > MAX ? h('div', { class: 'dv-more' }, h('button', { type: 'button', class: 'ev-btn ev-btn--sm ev-btn--ghost', onclick: () => {
            F.solo_alertas = true; const c = $('#f-alertas'); if (c) c.checked = true; cargarLista(true); $('#dv-lista').scrollIntoView({ behavior: 'smooth' });
        } }, `Ver las ${r.alertas.length} alertas en la lista`)) : null;
        return h('article', { class: 'dv-card dv-card--wide' },
            h('div', { class: 'dv-card-head' }, h('div', {}, h('h3', {}, 'Requieren atención'), h('p', {}, 'Ordenadas de la más urgente a la menos urgente. Toca una para ver la evaluación.'))),
            cuerpo, mas);
    }

    function tarjetaEstado(r) {
        const e = r.por_estado;
        const partes = [{ etiqueta: 'Publicadas', valor: e.PUBLICADA, clase: 'dv-s1' }, { etiqueta: 'En borrador', valor: e.BORRADOR, clase: 'dv-s2' }, { etiqueta: 'Cerradas', valor: e.CERRADA, clase: 'dv-s3' }];
        const t = r.totales;
        const intentos = [{ etiqueta: 'En curso', valor: t.intentos_en_curso, clase: 'dv-s1' }, { etiqueta: 'Por calificar', valor: t.intentos_pendientes_revision, clase: 'dv-s2' }, { etiqueta: 'Calificados', valor: t.intentos_calificados, clase: 'dv-s3' }];
        const grafico = h('div', {}, barraApilada(partes), h('h4', { class: 'dv-sub' }, 'Estado de los intentos de los estudiantes'), barraApilada(intentos));
        return tarjeta({ titulo: 'Estado de las evaluaciones', sub: 'Publicadas las ve el estudiante; en borrador aún las prepara el tutor; cerradas ya no admiten intentos.',
            grafico, columnas: [{ t: 'Concepto' }, { t: 'Cantidad', num: true }],
            filas: [...partes.map((p) => [`Evaluaciones ${p.etiqueta.toLowerCase()}`, loc(p.valor)]), ...intentos.map((p) => [`Intentos ${p.etiqueta.toLowerCase()}`, loc(p.valor)])] });
    }

    function tarjetaNotas(r) {
        const d = r.desempeno;
        const rangos = d.distribucion;
        const max = Math.max(0, ...rangos.map((x) => x.cantidad));
        const etiqueta = (x) => `${x.desde}–${x.hasta} %`;
        let grafico;
        if (!d.evaluaciones_calificadas) grafico = vacio('Aún no hay evaluaciones calificadas.', 'fa-regular fa-clipboard');
        else {
            const cols = [];
            rangos.forEach((x, i) => {
                if (x.desde === r.umbral_aprobacion_pct) cols.push(h('i', { class: 'dv-pass-line', 'aria-hidden': 'true' }));
                cols.push(h('div', { class: 'dv-col' }, h('div', { class: `dv-bar dv-s1${x.cantidad ? '' : ' dv-bar--zero'}`, style: `height:${max ? x.cantidad / max * 100 : 0}%`, 'data-tip': `${etiqueta(x)} de la nota máxima: ${plural(x.cantidad, 'evaluación', 'evaluaciones')}`, tabindex: '0' }, h('span', {}, String(x.cantidad)))));
            });
            grafico = h('div', {}, h('div', { class: 'dv-cols', role: 'img', 'aria-label': `Notas finales por rango: ${rangos.map((x) => `${etiqueta(x)}: ${x.cantidad}`).join(', ')}` }, cols),
                h('div', { class: 'dv-xaxis' }, rangos.map((x) => h('span', {}, etiqueta(x)))));
        }
        return tarjeta({ titulo: 'Notas finales', sub: 'Evaluaciones calificadas según el porcentaje de la nota máxima.', grafico,
            columnas: [{ t: 'Rango' }, { t: 'Evaluaciones', num: true }], filas: rangos.map((x) => [etiqueta(x), loc(x.cantidad)]),
            nota: `La línea roja punteada marca el mínimo para aprobar (${loc(r.umbral_aprobacion_pct)} %).` });
    }

    function tarjetaIA(r) {
        const o = r.preguntas.por_origen, ia = r.ia;
        const grafico = h('div', {}, barraApilada([{ etiqueta: 'Generadas con IA', valor: o.IA, clase: 'dv-s1' }, { etiqueta: 'Escritas por el tutor', valor: o.MANUAL, clase: 'dv-s2' }]),
            ia.preguntas ? h('div', {}, h('h4', { class: 'dv-sub' }, 'Qué hizo el tutor con las preguntas de la IA'),
                barrasH([{ etiqueta: 'Aprobadas', valor: ia.aprobadas }, { etiqueta: 'Por revisar', valor: ia.por_revisar }, { etiqueta: 'Rechazadas', valor: ia.rechazadas }], ia.preguntas, null)) : null);
        const prov = Object.entries(ia.por_proveedor).map(([k, v]) => `${k} (${v})`).join(', ') || 'ninguno';
        return tarjeta({ titulo: 'Origen de las preguntas', sub: 'Cuántas propone la IA y cuántas acepta el tutor.', grafico,
            columnas: [{ t: 'Concepto' }, { t: 'Preguntas', num: true }], filas: [['Generadas con IA', loc(o.IA)], ['Escritas por el tutor', loc(o.MANUAL)], ['IA aprobadas', loc(ia.aprobadas)], ['IA por revisar', loc(ia.por_revisar)], ['IA rechazadas', loc(ia.rechazadas)]],
            nota: `Aceptación de la IA: ${pct(ia.aceptacion_pct)} de lo ya revisado. Generaciones: ${loc(ia.generaciones)}${ia.generaciones_fallidas ? ` (${loc(ia.generaciones_fallidas)} fallidas)` : ''}. Proveedor: ${prov}.` });
    }

    const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const nombreMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
    function tarjetaMeses(r) {
        const H = r.historial;
        const max = Math.max(0, ...H.flatMap((m) => [m.evaluaciones_creadas, m.intentos_enviados]));
        const barra = (v, clase, tip) => h('div', { class: `dv-bar ${clase}${v ? '' : ' dv-bar--zero'}`, style: `height:${max ? v / max * 100 : 0}%`, 'data-tip': tip, tabindex: '0' }, h('span', {}, String(v)));
        const grafico = !max ? vacio('Todavía no hay actividad en estos meses.') : h('div', {},
            h('div', { class: 'dv-cols dv-cols--tight', role: 'img', 'aria-label': 'Actividad de los últimos meses' },
                H.map((m) => h('div', { class: 'dv-col' }, barra(m.evaluaciones_creadas, 'dv-s1', `${nombreMes(m.mes)}: ${plural(m.evaluaciones_creadas, 'evaluación creada', 'evaluaciones creadas')}`), barra(m.intentos_enviados, 'dv-s2', `${nombreMes(m.mes)}: ${plural(m.intentos_enviados, 'intento enviado', 'intentos enviados')}`)))),
            h('div', { class: 'dv-xaxis dv-xaxis--tight' }, H.map((m) => h('span', {}, nombreMes(m.mes)))),
            h('div', { class: 'dv-legend' }, h('span', {}, h('i', { class: 'dv-key dv-s1' }), 'Evaluaciones creadas'), h('span', {}, h('i', { class: 'dv-key dv-s2' }), 'Intentos enviados')));
        return tarjeta({ titulo: 'Actividad por mes', sub: `Últimos ${H.length} meses.`, grafico,
            columnas: [{ t: 'Mes' }, { t: 'Evaluaciones creadas', num: true }, { t: 'Intentos enviados', num: true }], filas: H.map((m) => [nombreMes(m.mes), loc(m.evaluaciones_creadas), loc(m.intentos_enviados)]) });
    }

    function tarjetaTipos(r) {
        const t = r.preguntas.por_tipo, d = r.preguntas.por_dificultad;
        const total = Object.values(t).reduce((s, v) => s + v, 0);
        const fila = (etiqueta, valor) => ({ etiqueta, valor, texto: `${loc(valor)}${total ? ` · ${loc(valor / total * 100)} %` : ''}` });
        const grafico = !total ? vacio('Todavía no hay preguntas.') : h('div', { class: 'dv-two' },
            h('div', {}, h('h4', { class: 'dv-sub dv-sub--first' }, 'Por tipo'),
                barrasH([fila('Opción múltiple', t.OPCION_MULTIPLE), fila('Verdadero / Falso', t.VERDADERO_FALSO), fila('Abierta', t.ABIERTA)], total)),
            h('div', {}, h('h4', { class: 'dv-sub dv-sub--first' }, 'Por dificultad con que se redactaron'),
                barrasH([fila('Fácil', d.FACIL), fila('Media', d.MEDIA), fila('Difícil', d.DIFICIL), fila('Sin definir', d.SIN_DEFINIR)], total)));
        return tarjeta({ titulo: 'Preguntas', ancho: true, sub: `${plural(total, 'pregunta en total', 'preguntas en total')}.`, grafico,
            columnas: [{ t: 'Categoría' }, { t: 'Preguntas', num: true }], filas: [['Opción múltiple', loc(t.OPCION_MULTIPLE)], ['Verdadero / Falso', loc(t.VERDADERO_FALSO)], ['Abierta', loc(t.ABIERTA)], ['Fácil', loc(d.FACIL)], ['Media', loc(d.MEDIA)], ['Difícil', loc(d.DIFICIL)], ['Sin definir', loc(d.SIN_DEFINIR)]] });
    }

    function tarjetaTutores(r) {
        const filas = r.por_tutor.map((t) => h('tr', { tabindex: '0', onclick: () => filtrarTutor(t.id_tutor), onkeydown: (e) => { if (e.key === 'Enter') filtrarTutor(t.id_tutor); } },
            h('td', {}, h('span', { class: 'dv-cell-title' }, nombreTutor(t.id_tutor))),
            h('td', { class: 'num' }, loc(t.evaluaciones)), h('td', { class: 'num' }, loc(t.publicadas)), h('td', { class: 'num' }, loc(t.intentos_calificados)),
            h('td', { class: 'num' }, t.pendientes_revision ? h('span', { class: `dv-flag ${t.espera_max_dias >= r.dias_revision_atrasada ? '' : 'dv-flag--warn'}`, 'data-tip': `El intento más antiguo espera hace ${dias(t.espera_max_dias)}`, tabindex: '0' }, icon('fa-solid fa-hourglass-half'), `${loc(t.pendientes_revision)} · ${dias(t.espera_max_dias)}`) : h('span', { class: 'dv-flag dv-flag--ok' }, icon('fa-solid fa-check'), 'Al día')),
            h('td', { class: 'num' }, pct(t.promedio_pct)), h('td', { class: 'num' }, t.alertas ? loc(t.alertas) : '—')));
        return h('article', { class: 'dv-card dv-card--wide' },
            h('div', { class: 'dv-card-head' }, h('div', {}, h('h3', {}, 'Tutores'), h('p', {}, 'Primero quienes tienen más intentos esperando calificación. Toca un tutor para filtrar la lista de abajo.'))),
            r.por_tutor.length ? tabla([{ t: 'Tutor' }, { t: 'Evaluaciones', num: true }, { t: 'Publicadas', num: true }, { t: 'Calificados', num: true }, { t: 'Por calificar', num: true }, { t: 'Promedio', num: true }, { t: 'Alertas', num: true }], filas, { clic: true }) : vacio('Todavía no hay tutores con evaluaciones.'));
    }
    function filtrarTutor(id) {
        F.id_tutor = id;
        const s = $('#f-tutor');
        if (s) {
            s.value = id;
            if (window.SPP && SPP.customSelect && typeof SPP.customSelect.sync === 'function') {
                SPP.customSelect.sync(s);
            }
        }
        cargarLista(true);
        $('#dv-lista').scrollIntoView({ behavior: 'smooth' });
    }

    /* ---------- lista de evaluaciones (con filtros) ---------- */
    function tarjetaLista(r) {
        const bq = h('input', { type: 'search', placeholder: 'Buscar por título…', 'aria-label': 'Buscar por título', maxlength: '100' });
        let temporizador = null;
        bq.addEventListener('input', () => { clearTimeout(temporizador); temporizador = setTimeout(() => { F.q = bq.value.trim(); cargarLista(true); }, 350); });
        const searchWrap = h('div', { class: 'dv-search' },
            icon('fa-solid fa-magnifying-glass'),
            bq
        );

        const se = h('select', { id: 'f-estado', 'aria-label': 'Seleccionar estado' }, [
            ['', 'Todos los estados'],
            ['PUBLICADA', 'Publicadas'],
            ['BORRADOR', 'En borrador'],
            ['CERRADA', 'Cerradas']
        ].map(([v, t]) => h('option', { value: v }, t)));
        se.addEventListener('change', () => { F.estado = se.value; cargarLista(true); });
        const stateWrap = h('div', { class: 'cp-input-wrap' },
            se,
            icon('fa-solid fa-chevron-down right-icon')
        );

        const st = h('select', { id: 'f-tutor', 'aria-label': 'Seleccionar tutor' }, [
            h('option', { value: '' }, 'Todos los tutores'),
            ...r.por_tutor.map((t) => h('option', { value: t.id_tutor }, nombreTutor(t.id_tutor)))
        ]);
        st.addEventListener('change', () => { F.id_tutor = st.value; cargarLista(true); });
        const tutorWrap = h('div', { class: 'cp-input-wrap' },
            st,
            icon('fa-solid fa-chevron-down right-icon')
        );

        const ca = h('input', { type: 'checkbox', id: 'f-alertas' });
        ca.addEventListener('change', () => { F.solo_alertas = ca.checked; cargarLista(true); });
        const checkWrap = h('label', { class: 'dv-check-pill' }, ca, h('span', {}, 'Solo con alertas'));

        const btnClear = h('button', { type: 'button', class: 'um-ghost-btn', id: 'ev-btn-clear', 'aria-label': 'Limpiar filtros' },
            icon('fa-solid fa-rotate-left'),
            'Clear'
        );
        btnClear.addEventListener('click', () => {
            bq.value = '';
            se.value = '';
            st.value = '';
            ca.checked = false;
            F.q = '';
            F.estado = '';
            F.id_tutor = '';
            F.solo_alertas = false;
            if (window.SPP && SPP.customSelect && typeof SPP.customSelect.sync === 'function') {
                SPP.customSelect.sync(se);
                SPP.customSelect.sync(st);
            }
            cargarLista(true);
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
            h('div', { class: 'dv-card-head' }, h('div', {}, h('h3', {}, 'Todas las evaluaciones'), h('p', {}, 'Toca una fila para ver el análisis por pregunta y los intentos.'))),
            h('div', { class: 'dv-filters' }, searchWrap, stateWrap, tutorWrap, checkWrap, btnClear, listaConteo),
            h('div', { class: 'dv-tablewrap' }, h('table', { class: 'dv-table dv-table--click' },
                h('thead', {}, h('tr', {}, [['Evaluación'], ['Tutor'], ['Estado'], ['Preguntas', 1], ['Intentos', 1], ['Nota final', 1], ['Fecha límite']].map(([t, num]) => h('th', { scope: 'col', class: num ? 'num' : null }, t)))),
                listaCuerpo)),
            listaMas);
    }

    function subtitulo(ev) {
        const p = DIR.practicas[ev.id_practica];
        return `${nombreEstudiante(ev.id_estudiante)} · ${p ? (p.tipo || 'Práctica') : 'práctica no encontrada'}`;
    }

    function filaEvaluacion(ev) {
        const abrir = () => abrirDetalle(ev.id_evaluacion);
        return h('tr', { tabindex: '0', onclick: abrir, onkeydown: (e) => { if (e.key === 'Enter') abrir(); } },
            h('td', {}, h('span', { class: 'dv-cell-title' }, ev.titulo), h('span', { class: 'dv-cell-sub' }, subtitulo(ev)),
                ev.alertas.length ? h('span', { class: 'dv-cell-sub' }, ev.alertas.map(bandera)) : null),
            h('td', {}, nombreTutor(ev.id_tutor)),
            h('td', {}, badge(ev.estado), ev.vencida && ev.estado === 'PUBLICADA' ? h('span', { class: 'dv-cell-sub' }, 'Vencida') : null),
            h('td', { class: 'num' }, loc(ev.total_preguntas), ev.preguntas_ia ? h('span', { class: 'dv-cell-sub' }, `${loc(ev.preguntas_ia)} con IA`) : null),
            h('td', { class: 'num' }, `${loc(ev.intentos_calificados)}/${loc(ev.intentos_enviados)}`, ev.pendientes_revision ? h('span', { class: 'dv-cell-sub' }, `${loc(ev.pendientes_revision)} por calificar`) : null),
            h('td', { class: 'num' }, ev.nota_final === null ? '—' : h('span', { class: 'dv-pct' }, pct(ev.porcentaje_final), h('small', {}, `${loc(ev.nota_final, 2)} de ${loc(ev.nota_maxima, 1)}`))),
            h('td', {}, ev.fecha_limite ? fecha(ev.fecha_limite) : 'Sin límite'));
    }

    async function cargarLista(reiniciar) {
        if (cargandoLista) return;
        cargandoLista = true;
        if (reiniciar) { offset = 0; clear(listaCuerpo); }
        clear(listaMas);
        try {
            const r = await API.listar({ ...F, solo_alertas: F.solo_alertas ? 'true' : undefined, limite: LIMITE, desplazamiento: offset });
            absorber(r.directorio);
            r.items.forEach((ev) => listaCuerpo.append(filaEvaluacion(ev)));
            offset += r.items.length;
            if (!r.total) listaCuerpo.append(h('tr', {}, h('td', { colspan: '7' }, vacio('Ninguna evaluación coincide con los filtros.', 'fa-solid fa-magnifying-glass'))));
            listaConteo.textContent = r.total ? `Mostrando ${loc(offset)} de ${loc(r.total)}` : '';
            if (offset < r.total) listaMas.append(h('button', { type: 'button', class: 'ev-btn ev-btn--sm ev-btn--soft', onclick: (e) => ocupado(e.currentTarget, () => cargarLista(false), 'Cargando…') }, `Ver ${Math.min(LIMITE, r.total - offset)} más`));
        } catch (e) { EvalUI.error(e); } finally { cargandoLista = false; }
    }

    function errorPanel(el, e, reintentar) {
        clear(el).append(h('div', { class: 'ev-empty' }, icon('fa-solid fa-plug-circle-exclamation'), (e && e.message) || 'No se pudo cargar la información.',
            h('div', { class: 'ev-actions', style: 'justify-content:center' }, h('button', { type: 'button', class: 'ev-btn ev-btn--primary', onclick: reintentar }, icon('fa-solid fa-rotate'), 'Reintentar'))));
    }

    async function cargarPanel() {
        clear(contenido).append(h('p', { class: 'ev-loading' }, 'Cargando…'));
        try {
            const r = await API.resumen();
            absorber(r.directorio);
            RESUMEN = r;
            glosario(r);
            $('#panel-actualizado').textContent = `Actualizado ${fecha(r.generado_en)}.`;
            clear(contenido).append(
                renderKpis(r),
                h('div', { class: 'dv-grid' }, tarjetaAlertas(r), tarjetaEstado(r), tarjetaNotas(r), tarjetaIA(r), tarjetaMeses(r), tarjetaTipos(r), tarjetaTutores(r), tarjetaLista(r)));
            offset = 0; F.q = ''; F.estado = ''; F.id_tutor = ''; F.solo_alertas = false;
            if (window.SPP && SPP.customSelect && typeof SPP.customSelect.init === 'function') {
                SPP.customSelect.init('#dv-lista');
            }
            await cargarLista(true);
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
        $('#detalle-title').textContent = 'Cargando…'; clear($('#detalle-badges')); clear(detalle);
        try {
            const d = await API.detalle(id);
            absorber(d.directorio);
            ultimoDetalle = d;
            pintarDetalle(d);
        } catch (e) {
            $('#detalle-title').textContent = 'No se pudo abrir la evaluación';
            errorPanel(detalle, e, () => abrirDetalle(id));
        }
    }

    function dato(t, v) { return h('div', {}, h('dt', {}, t), h('dd', {}, v)); }
    function pintarDetalle(d) {
        $('#detalle-title').textContent = d.titulo;
        const b = $('#detalle-badges'); clear(b);
        EvalUI.add(b, badge(d.estado), d.vencida && d.estado === 'PUBLICADA' ? h('span', { class: 'ev-badge ev-badge--cerrada' }, icon('fa-regular fa-calendar-xmark'), 'Fecha límite vencida') : null, d.alertas.map(bandera));
        const p = DIR.practicas[d.id_practica] || {};
        EvalUI.add(clear(detalle),
            h('dl', { class: 'dv-meta' },
                dato('Estudiante', nombreEstudiante(d.id_estudiante)), dato('Tutor', nombreTutor(d.id_tutor)),
                dato('Práctica', DIR.practicas[d.id_practica] ? `${p.tipo || 'Práctica'}${p.institucion ? ` · ${p.institucion}` : ''}` : `${d.id_practica} (no encontrada)`),
                dato('Creada', fecha(d.fecha_evaluacion)), dato('Fecha límite', d.fecha_limite ? fecha(d.fecha_limite) : 'Sin límite'),
                dato('Intentos permitidos', String(d.intentos_permitidos)), dato('Nota máxima', loc(d.nota_maxima, 1)),
                dato('Resultados al estudiante', d.mostrar_resultados ? 'Los ve al terminar' : 'Ocultos')),
            d.descripcion ? h('p', { class: 'dv-note', style: 'margin:-6px 0 18px' }, d.descripcion) : null,
            h('div', { class: 'ev-stats' },
                estadistica(d.total_preguntas, 'Preguntas', d.preguntas_ia ? `${d.preguntas_ia} con IA` : null),
                estadistica(d.intentos_enviados, 'Intentos enviados', `${d.intentos_iniciados} iniciados`),
                estadistica(d.pendientes_revision, 'Por calificar', d.espera_max_dias !== null ? `desde hace ${dias(d.espera_max_dias)}` : null),
                estadistica(d.nota_final === null ? '—' : pct(d.porcentaje_final), 'Nota final', d.nota_final === null ? 'Sin calificar' : `${loc(d.nota_final, 2)} de ${loc(d.nota_maxima, 1)}`)),
            d.alertas.length ? h('ul', { class: 'dv-alerts', style: 'margin-bottom:18px' }, d.alertas.map((a) => {
                const [ic, t] = SEVERIDAD[a.severidad] || SEVERIDAD.BAJA;
                return h('li', { class: `dv-alert dv-alert--${a.severidad.toLowerCase()}`, style: 'cursor:default' }, h('span', { class: 'dv-alert-sev' }, icon(ic), t), h('span', {}, h('span', { class: 'dv-alert-title' }, TITULO_ALERTA[a.tipo] || a.tipo), h('span', { class: 'dv-alert-text' }, mensajeAlerta(a))), h('span', {}));
            })) : null,
            pestanas(d));
    }
    const estadistica = (valor, etiqueta, nota) => h('div', { class: 'ev-stat' }, h('b', {}, String(valor)), h('span', {}, etiqueta), nota ? h('span', { style: 'display:block;font-size:11.5px;opacity:.75;margin-top:2px' }, nota) : null);

    function pestanas(d) {
        const defs = [['analisis', 'Análisis por pregunta', () => panelAnalisis(d)], ['intentos', 'Intentos', () => panelIntentos(d)], ['ia', 'Uso de IA', () => panelIA(d)]];
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
        if (!d.preguntas.length) return vacio('Esta evaluación todavía no tiene preguntas.', 'fa-regular fa-circle-question');
        const filas = d.preguntas.map((q) => {
            const claseAcierto = q.pct_acierto === null ? '' : q.pct_acierto >= 70 ? 'dv-fill--good' : q.pct_acierto >= 40 ? 'dv-fill--mid' : 'dv-fill--low';
            const calificadas = q.correctas + q.incorrectas;
            return h('tr', {},
                h('td', { class: 'num' }, String(q.orden)),
                h('td', {}, h('span', { class: 'dv-qtext' }, q.enunciado), q.estado_revision !== 'APROBADA' ? h('span', { class: 'dv-cell-sub' }, q.estado_revision === 'RECHAZADA' ? 'Rechazada por el tutor (no se aplica)' : 'Aún sin revisar por el tutor (no se aplica)') : null),
                h('td', {}, TIPO[q.tipo_pregunta] || q.tipo_pregunta), h('td', {}, EvalUI.badgeOrigen(q.origen)),
                h('td', {}, { FACIL: 'Fácil', MEDIA: 'Media', DIFICIL: 'Difícil' }[q.dificultad] || '—'),
                h('td', { class: 'num' }, loc(q.valor_pregunta, 2)),
                h('td', {}, q.pct_acierto === null ? h('span', { class: 'dv-cell-sub' }, q.sin_calificar ? `${plural(q.sin_calificar, 'respuesta', 'respuestas')} sin calificar` : 'Sin respuestas todavía')
                    : h('div', { class: 'dv-acierto' }, h('div', { class: 'dv-track', 'data-tip': `${q.correctas} de ${calificadas} respuestas calificadas fueron correctas`, tabindex: '0' }, h('div', { class: `dv-fill ${claseAcierto}`, style: `width:${q.pct_acierto}%` })), h('b', {}, pct(q.pct_acierto)),
                        h('small', {}, `${q.correctas} de ${calificadas} correctas${q.sin_calificar ? ` · ${q.sin_calificar} sin calificar` : ''}`))));
        });
        return h('div', {}, tabla([{ t: '#', num: true }, { t: 'Pregunta' }, { t: 'Tipo' }, { t: 'Origen' }, { t: 'Dificultad' }, { t: 'Valor', num: true }, { t: 'Acierto' }], filas),
            h('p', { class: 'dv-note' }, 'Acierto = respuestas correctas entre las ya calificadas. Una pregunta abierta cuenta como correcta desde la mitad de su valor. Por privacidad no se muestra lo que respondió el estudiante.'));
    }
    function panelIntentos(d) {
        if (!d.intentos.length) return vacio('El estudiante todavía no ha iniciado esta evaluación.', 'fa-regular fa-hourglass');
        return tabla([{ t: 'Intento', num: true }, { t: 'Estado' }, { t: 'Inicio' }, { t: 'Envío' }, { t: 'Nota', num: true }, { t: 'Porcentaje', num: true }, { t: 'Espera', num: true }],
            d.intentos.map((i) => h('tr', {}, h('td', { class: 'num' }, String(i.numero_intento)), h('td', {}, badge(i.estado)), h('td', {}, fecha(i.fecha_inicio)), h('td', {}, i.fecha_envio ? fecha(i.fecha_envio) : '—'),
                h('td', { class: 'num' }, i.nota_obtenida === null ? '—' : `${loc(i.nota_obtenida, 2)} de ${loc(d.nota_maxima, 1)}`), h('td', { class: 'num' }, pct(i.porcentaje)),
                h('td', { class: 'num' }, i.dias_esperando === null ? '—' : dias(i.dias_esperando)))));
    }
    function panelIA(d) {
        const ia = d.preguntas.filter((q) => q.origen === 'IA');
        const cuenta = (e) => ia.filter((q) => q.estado_revision === e).length;
        const resumen = h('p', { class: 'dv-note', style: 'margin:0 0 14px' }, ia.length
            ? `${plural(ia.length, 'pregunta fue propuesta', 'preguntas fueron propuestas')} por la IA: ${cuenta('APROBADA')} aprobadas, ${cuenta('BORRADOR')} por revisar y ${cuenta('RECHAZADA')} rechazadas.`
            : 'Esta evaluación no usa preguntas generadas con IA.');
        if (!d.generaciones.length) return h('div', {}, resumen);
        return h('div', {}, resumen, tabla([{ t: 'Fecha' }, { t: 'Proveedor' }, { t: 'Modelo' }, { t: 'Resultado' }, { t: 'Pedidas', num: true }, { t: 'Generadas', num: true }, { t: 'Duración', num: true }],
            d.generaciones.map((g) => h('tr', {}, h('td', {}, fecha(g.created_at)), h('td', {}, g.proveedor || '—'), h('td', {}, g.modelo || '—'),
                h('td', {}, g.estado === 'FALLIDA' ? h('span', { class: 'dv-flag' }, icon('fa-solid fa-circle-xmark'), 'Fallida') : h('span', { class: 'dv-flag dv-flag--ok' }, icon('fa-solid fa-check'), g.estado === 'COMPLETADA' ? 'Completada' : g.estado)),
                h('td', { class: 'num' }, loc(g.cantidad_solicitada)), h('td', { class: 'num' }, loc(g.cantidad_generada)), h('td', { class: 'num' }, g.duracion_ms ? `${loc(g.duracion_ms / 1000, 1)} s` : '—')))));
    }

    /* ------------------------------------------------------------ arranque */
    if (EvalAPI.modo === 'mock') EvalUI.banner('Modo SIN backend: las cifras son datos de ejemplo.', 'fa-solid fa-flask', '');
    window.SPP_DIRECTOR = window.SPP_DIRECTOR || {};
    window.SPP_DIRECTOR.cargarEvaluaciones = cargarPanel;
    cargarPanel();
});
