/* global EvalUI, EvalAPI */
/* =========================================================================
   evaluacion-tutor.js — Pantalla del tutor: crear evaluaciones, agregar preguntas
   (manual o generadas con IA a partir de tema/evidencias), revisar, publicar y
   calificar. Habla solo con window.EvalAPI.
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
    'use strict';
    if (!document.getElementById('view-lista') && !document.getElementById('lista-contenido')) return;

    const { h, icon, $, clear, toast, modal, confirmar, ocupado, badge, badgeOrigen, nota, fecha, plural, TIPOS } = EvalUI;
    const API = EvalAPI.tutor;
    EvalUI.habilitarEnlacesExternos();

    const qs = new URLSearchParams(location.search);
    let PRACTICA = qs.get('practica') || '';
    let ESTUDIANTE = qs.get('estudiante') || '';

    /** Detecta la práctica activa seleccionada en el panel de tutor, o la primera si no hay parámetro. */
    async function resolverPractica() {
        const actual = window.SPP_TEACHER?.state?.practice;
        if (actual && (actual.id || actual.code)) {
            PRACTICA = String(actual.id || actual.code || '');
            ESTUDIANTE = String(actual.student || actual.studentName || '');
        } else if (!PRACTICA) {
            const r = await fetch('/api/practices', { credentials: 'same-origin' });
            const lista = r.ok ? (await r.json()).practices || [] : [];
            const p = lista.find((x) => x.status === 'active') || lista[0];
            if (p) { PRACTICA = p.id; ESTUDIANTE = p.student || ESTUDIANTE; }
        }
        const ctxEl = $('#lista-contexto');
        if (ctxEl) ctxEl.textContent = PRACTICA ? `Práctica ${PRACTICA}${ESTUDIANTE ? ' · ' + ESTUDIANTE : ''}` : 'No tienes prácticas asignadas.';
    }

    const vistas = { lista: $('#view-lista'), editor: $('#view-editor'), intento: $('#view-intento') };
    function ver(nombre) {
        Object.entries(vistas).forEach(([k, el]) => { if (el) el.hidden = k !== nombre; });
        const shell = $('.app-shell'); window.scrollTo(0, 0); if (shell) shell.scrollTop = 0;
        const w = $('.ev-wrapper'); if (w) w.scrollTop = 0;
    }
    const estado = { ev: null, tab: 'preguntas' };

    /* ------------------------------------------------------------ avisos de modo */
    (async () => {
        try {
            const s = await EvalAPI.health();
            if (s && s.ia && s.ia.proveedor === 'mock') EvalUI.banner('El backend usa la IA SIMULADA (no hay ANTHROPIC_API_KEY). Las preguntas generadas serán sencillas; configura la clave para usar IA real.', 'fa-solid fa-flask', 'ev-banner--info');
        } catch (e) { /* si no hay backend, el error se muestra al cargar la lista */ }
    })();

    /* ================================================================= LISTA */
    const ctxEl = $('#lista-contexto');
    if (ctxEl && PRACTICA) ctxEl.textContent = `Práctica #${PRACTICA} · Estudiante #${ESTUDIANTE}`;
    const btnNueva = $('#btn-nueva');
    if (btnNueva) btnNueva.addEventListener('click', () => modalEvaluacion());

    async function cargarLista() {
        const cont = clear($('#lista-contenido'));
        cont.appendChild(h('p', { class: 'ev-loading' }, 'Cargando…'));
        try {
            const lista = await API.listarEvaluaciones({ id_practica: PRACTICA });
            clear(cont);
            if (!lista.length) {
                cont.appendChild(h('div', { class: 'ev-empty' }, icon('fa-regular fa-clipboard'), 'Aún no hay evaluaciones para esta práctica.', h('br'), 'Crea la primera con «Nueva evaluación».'));
                return;
            }
            lista.forEach((ev) => cont.appendChild(tarjeta(ev)));
            window.SPP_TEACHER?.updateQuestionsPill?.();
        } catch (e) {
            clear(cont);
            cont.appendChild(h('div', { class: 'ev-empty' }, icon('fa-solid fa-plug-circle-xmark'), e.message,
                h('div', { style: 'margin-top:16px' }, h('button', { type: 'button', class: 'ev-btn ev-btn--dark', onclick: cargarLista }, icon('fa-solid fa-rotate'), 'Reintentar'))));
        }
    }
    function tarjeta(ev) {
        const abrir = () => abrirEditor(ev.id_evaluacion);
        return h('div', {
            class: 'ev-card',
            role: 'button',
            tabindex: '0',
            style: 'cursor: pointer;',
            onclick: abrir,
            onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } }
        },
            h('div', { class: 'ev-card-icon' }, icon('fa-solid fa-circle-question')),
            h('div', { class: 'ev-card-body' },
                h('div', { class: 'ev-card-title' }, ev.titulo),
                h('div', { class: 'ev-badges', style: 'margin-top:8px' }, badge(ev.estado),
                    ev.preguntas_pendientes ? badge('BORRADOR', plural(ev.preguntas_pendientes, 'por revisar', 'por revisar')) : null),
                h('div', { class: 'ev-card-meta' },
                    h('span', {}, icon('fa-regular fa-circle-question'), plural(ev.preguntas_aprobadas, 'pregunta aprobada', 'preguntas aprobadas')),
                    h('span', {}, icon('fa-regular fa-user'), plural(ev.intentos_presentados, 'intento', 'intentos')),
                    ev.fecha_limite ? h('span', {}, icon('fa-regular fa-calendar'), 'Límite: ' + fecha(ev.fecha_limite)) : null)),
            ev.nota_final !== null ? h('div', { class: 'ev-nota' }, nota(ev.nota_final), h('small', {}, 'de ' + ev.nota_maxima)) : null,
            h('button', {
                type: 'button',
                class: 'ev-go',
                'aria-label': 'Abrir ' + ev.titulo,
                onclick: (e) => { e.stopPropagation(); abrir(); }
            }, icon('fa-solid fa-arrow-right')));
    }

    /* ----------------------------------------------- modal: crear / editar evaluación */
    function modalEvaluacion(ev) {
        const edit = !!ev;
        const bloqueado = edit && ev.intentos_presentados > 0;
        const titulo = h('input', { class: 'ev-input', type: 'text', maxlength: '200', value: edit ? ev.titulo : '', placeholder: 'Ej. Evaluación de la planeación de clase' });
        const desc = h('textarea', { class: 'ev-textarea', maxlength: '4000', placeholder: 'Instrucciones o contexto para el estudiante (opcional)' }, edit ? ev.descripcion || '' : '');
        const intentos = h('input', { class: 'ev-input', type: 'number', min: '1', max: '10', value: edit ? ev.intentos_permitidos : 1, disabled: bloqueado });
        const maxima = h('input', { class: 'ev-input', type: 'number', min: '1', max: '100', step: '0.5', value: edit ? ev.nota_maxima : 5, disabled: bloqueado });
        const limite = h('input', { class: 'ev-input', type: 'datetime-local', value: edit && ev.fecha_limite ? aLocal(ev.fecha_limite) : '' });
        const mostrar = h('input', { type: 'checkbox', checked: edit ? ev.mostrar_resultados : true });
        const guardar = h('button', { type: 'button', class: 'ev-btn ev-btn--dark' }, edit ? 'Guardar cambios' : 'Crear evaluación');
        const m = modal({ titulo: edit ? 'Editar evaluación' : 'Nueva evaluación', ancho: 600, contenido: h('form', { class: 'ev-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); guardar.click(); } },
            h('div', { class: 'ev-field' }, h('label', {}, 'Título'), titulo),
            h('div', { class: 'ev-field' }, h('label', {}, 'Descripción'), desc),
            h('div', { class: 'ev-row' },
                h('div', { class: 'ev-field' }, h('label', {}, 'Intentos permitidos'), intentos),
                h('div', { class: 'ev-field' }, h('label', {}, 'Nota máxima'), maxima)),
            bloqueado ? h('p', { class: 'ev-hint' }, 'Ya hay intentos presentados: no se puede cambiar la nota máxima ni los intentos.') : null,
            h('div', { class: 'ev-field' }, h('label', {}, 'Fecha límite (opcional)'), limite, h('span', { class: 'ev-hint' }, 'Pasada esta fecha el estudiante ya no puede iniciar ni enviar.')),
            h('label', { class: 'ev-check' }, mostrar, 'Mostrar al estudiante las respuestas correctas al terminar'),
            h('div', { class: 'ev-actions' }, h('button', { type: 'button', class: 'ev-btn ev-btn--soft', onclick: () => m.close() }, 'Cancelar'), guardar)) });
        guardar.addEventListener('click', () => ocupado(guardar, async () => {
            titulo.classList.remove('is-error');
            if (titulo.value.trim().length < 3) { titulo.classList.add('is-error'); titulo.focus(); return toast('El título debe tener al menos 3 caracteres.', 'error'); }
            const cuerpo = { titulo: titulo.value.trim(), descripcion: desc.value.trim() || null, fecha_limite: limite.value ? new Date(limite.value).toISOString() : null, mostrar_resultados: mostrar.checked };
            if (!bloqueado) { cuerpo.intentos_permitidos = Number(intentos.value) || 1; cuerpo.nota_maxima = Number(maxima.value) || 5; }
            try {
                if (edit) { estado.ev = await API.editarEvaluacion(ev.id_evaluacion, cuerpo); m.close(); renderEditor(); toast('Evaluación actualizada.'); }
                else { const nuevo = await API.crearEvaluacion({ ...cuerpo, id_practica: PRACTICA, id_estudiante: ESTUDIANTE }); m.close(); toast('Evaluación creada. Agrega preguntas manualmente o genéralas con IA.'); await abrirEditor(nuevo.id_evaluacion); }
            } catch (e) { EvalUI.error(e); }
        }));
    }
    function aLocal(iso) { const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }

    /* ================================================================= EDITOR */
    async function abrirEditor(id, tab) {
        estado.tab = tab || 'preguntas';
        ver('editor');
        $('#editor-title').textContent = 'Loading evaluation…';
        clear($('#editor-badges'));
        clear($('#editor-acciones'));
        clear($('#editor-stats'));
        clear($('#editor-agregar'));
        const tabPreguntas = $('#tabpanel-preguntas');
        if (tabPreguntas) clear(tabPreguntas).appendChild(h('p', { class: 'ev-loading' }, 'Loading questions…'));
        clear($('#tabpanel-resultados'));
        try {
            estado.ev = await API.obtenerEvaluacion(id);
            renderEditor();
        } catch (e) {
            ver('lista');
            return EvalUI.error(e);
        }
    }
    $('#btn-volver-lista').addEventListener('click', () => { ver('lista'); cargarLista(); });
    $('#tab-preguntas').addEventListener('click', () => cambiarTab('preguntas'));
    $('#tab-resultados').addEventListener('click', () => cambiarTab('resultados'));
    function cambiarTab(t) {
        estado.tab = t;
        $('#tab-preguntas').setAttribute('aria-selected', String(t === 'preguntas'));
        $('#tab-resultados').setAttribute('aria-selected', String(t === 'resultados'));
        $('#tabpanel-preguntas').hidden = t !== 'preguntas';
        $('#tabpanel-resultados').hidden = t !== 'resultados';
        if (t === 'resultados') cargarResultados();
    }
    const editable = (ev) => ev.estado !== 'CERRADA' && ev.intentos_presentados === 0;

    function renderEditor() {
        const ev = estado.ev;
        $('#editor-title').textContent = ev.titulo;
        const bs = clear($('#editor-badges'));
        EvalUI.add(bs, badge(ev.estado), h('span', { class: 'ev-badge' }, icon('fa-regular fa-star'), `Nota máx. ${ev.nota_maxima}`),
            h('span', { class: 'ev-badge' }, icon('fa-solid fa-rotate-right'), plural(ev.intentos_permitidos, 'intento', 'intentos')),
            ev.fecha_limite ? h('span', { class: 'ev-badge' }, icon('fa-regular fa-calendar'), fecha(ev.fecha_limite)) : null);

        // acciones principales
        const acc = clear($('#editor-acciones'));
        const btn = (txt, ic, cls, fn) => { const b = h('button', { type: 'button', class: 'ev-btn ev-btn--sm ' + cls }, icon(ic), txt); b.addEventListener('click', () => ocupado(b, fn)); return b; };
        if (ev.estado !== 'CERRADA') acc.appendChild(h('button', { type: 'button', class: 'ev-btn ev-btn--sm ev-btn--ghost', onclick: () => modalEvaluacion(ev) }, icon('fa-solid fa-pen'), 'Editar'));
        if (ev.estado === 'BORRADOR') {
            const puedePublicar = (ev.preguntas_aprobadas || 0) > 0;
            const bPub = btn('Publicar al estudiante', 'fa-solid fa-paper-plane', puedePublicar ? 'ev-btn--primary' : 'ev-btn--disabled', async () => {
                if (!puedePublicar) {
                    return toast('Debes aprobar al menos una pregunta antes de publicar la evaluación.', 'aviso');
                }
                if (ev.preguntas_pendientes && !(await confirmar({ titulo: 'Hay preguntas sin revisar', mensaje: `${plural(ev.preguntas_pendientes, 'pregunta sigue', 'preguntas siguen')} en borrador y NO será visible para el estudiante. ¿Publicar de todos modos?`, ok: 'Publicar' }))) return;
                try { estado.ev = await API.publicar(ev.id_evaluacion); renderEditor(); toast('Evaluación publicada: el estudiante ya puede presentarla.'); } catch (e) { EvalUI.error(e); }
            });
            if (!puedePublicar) {
                bPub.disabled = true;
                bPub.title = 'Aprueba al menos una pregunta antes de publicar';
                bPub.style.cursor = 'not-allowed';
            }
            acc.appendChild(bPub);
        }
        if (ev.estado === 'PUBLICADA' && ev.intentos_presentados === 0) acc.appendChild(btn('Volver a borrador', 'fa-solid fa-eye-slash', 'ev-btn--soft', async () => {
            try { estado.ev = await API.despublicar(ev.id_evaluacion); renderEditor(); toast('La evaluación volvió a borrador.'); } catch (e) { EvalUI.error(e); }
        }));
        if (ev.estado === 'PUBLICADA') acc.appendChild(btn('Cerrar', 'fa-solid fa-lock', 'ev-btn--dark', async () => {
            if (!(await confirmar({ titulo: 'Cerrar evaluación', mensaje: 'El estudiante ya no podrá presentarla y los intentos en curso se enviarán con lo que hayan respondido.', ok: 'Cerrar evaluación' }))) return;
            try { estado.ev = await API.cerrar(ev.id_evaluacion); renderEditor(); toast('Evaluación cerrada.'); } catch (e) { EvalUI.error(e); }
        }));
        if (ev.intentos_presentados === 0) acc.appendChild(btn('Eliminar', 'fa-solid fa-trash', 'ev-btn--danger', async () => {
            if (!(await confirmar({ titulo: 'Eliminar evaluación', mensaje: 'Se borrarán la evaluación y todas sus preguntas. No se puede deshacer.', ok: 'Eliminar', peligro: true }))) return;
            try { await API.eliminarEvaluacion(ev.id_evaluacion); toast('Evaluación eliminada.'); ver('lista'); cargarLista(); } catch (e) { EvalUI.error(e); }
        }));

        // estadísticas
        const st = clear($('#editor-stats'));
        [[ev.preguntas_aprobadas, 'Preguntas aprobadas'], [ev.preguntas_pendientes, 'Por revisar'], [ev.intentos_presentados, 'Intentos'], [ev.nota_final === null ? '—' : nota(ev.nota_final), 'Nota final']]
            .forEach(([v, t]) => st.appendChild(h('div', { class: 'ev-stat' }, h('b', {}, v), h('span', {}, t))));

        // agregar preguntas
        const ag = clear($('#editor-agregar'));
        if (editable(ev)) {
            EvalUI.add(ag, 
                h('button', { type: 'button', class: 'ev-btn ev-btn--gold', onclick: () => modalGenerar() }, icon('fa-solid fa-wand-magic-sparkles'), 'Generar con IA'),
                h('button', { type: 'button', class: 'ev-btn ev-btn--dark', onclick: () => modalPregunta() }, icon('fa-solid fa-plus'), 'Agregar pregunta manual'));
        } else {
            ag.appendChild(h('p', { class: 'ev-hint' }, ev.estado === 'CERRADA' ? 'La evaluación está cerrada.' : 'Ya hay intentos presentados: las preguntas no se pueden modificar.'));
        }
        renderPreguntas();
        cambiarTab(estado.tab);
    }

    /* ---------------------------------------------------------- lista de preguntas */
    function renderPreguntas() {
        const ev = estado.ev, cont = clear($('#tabpanel-preguntas'));
        if (editable(ev) && ev.preguntas_pendientes) {
            const b = h('button', { type: 'button', class: 'ev-btn ev-btn--sm ev-btn--dark' }, icon('fa-solid fa-check-double'), 'Aprobar todas');
            b.addEventListener('click', () => ocupado(b, async () => { try { const r = await API.aprobarTodas(ev.id_evaluacion); toast(`${plural(r.aprobadas, 'pregunta aprobada', 'preguntas aprobadas')}.`); await recargar(); } catch (e) { EvalUI.error(e); } }));
            cont.appendChild(h('div', { class: 'ev-revision' }, icon('fa-solid fa-triangle-exclamation'), `${plural(ev.preguntas_pendientes, 'pregunta generada con IA espera', 'preguntas generadas con IA esperan')} tu revisión. Solo las aprobadas verá el estudiante.`, b));
        }
        if (!ev.preguntas.length) {
            cont.appendChild(h('div', { class: 'ev-empty' }, icon('fa-regular fa-circle-question'), 'Esta evaluación aún no tiene preguntas.'));
            return;
        }
        const lista = h('div', { class: 'ev-stack' });
        ev.preguntas.forEach((p, i) => lista.appendChild(tarjetaPregunta(p, i + 1)));
        cont.appendChild(lista);
    }
    async function recargar() { estado.ev = await API.obtenerEvaluacion(estado.ev.id_evaluacion); renderEditor(); }

    function tarjetaPregunta(p, n) {
        const ed = editable(estado.ev);
        const accion = (ic, tit, cls, fn) => h('button', { type: 'button', class: 'ev-icon-btn ' + cls, title: tit, 'aria-label': tit, onclick: fn }, icon(ic));
        const revisar = (fn, msg) => async () => { try { await fn(p.id_pregunta); toast(msg); await recargar(); } catch (e) { EvalUI.error(e); } };
        const tools = h('div', { class: 'ev-q-tools' });
        if (ed) {
            if (p.estado_revision !== 'APROBADA') tools.appendChild(accion('fa-solid fa-check', 'Aprobar', 'ev-icon-btn--ok', revisar(API.aprobarPregunta, 'Pregunta aprobada.')));
            if (p.estado_revision !== 'RECHAZADA') tools.appendChild(accion('fa-solid fa-ban', 'Rechazar', 'ev-icon-btn--bad', revisar(API.rechazarPregunta, 'Pregunta rechazada.')));
            tools.appendChild(accion('fa-solid fa-pen', 'Editar', '', () => modalPregunta(p)));
            tools.appendChild(accion('fa-solid fa-trash', 'Eliminar', 'ev-icon-btn--bad', async () => {
                if (!(await confirmar({ titulo: 'Eliminar pregunta', mensaje: '¿Eliminar esta pregunta?', ok: 'Eliminar', peligro: true }))) return;
                try { await API.eliminarPregunta(p.id_pregunta); toast('Pregunta eliminada.'); await recargar(); } catch (e) { EvalUI.error(e); }
            }));
        }
        return h('article', { class: 'ev-q' + (p.origen === 'IA' ? ' ev-q--ia' : '') + (p.estado_revision === 'RECHAZADA' ? ' ev-q--rechazada' : '') },
            h('div', { class: 'ev-q-top' },
                h('span', { class: 'ev-q-num' }, 'Pregunta ' + n), badgeOrigen(p.origen),
                p.estado_revision !== 'APROBADA' || p.origen === 'IA' ? badge(p.estado_revision === 'BORRADOR' ? 'BORRADOR' : p.estado_revision, p.estado_revision === 'BORRADOR' ? 'Por revisar' : null) : null,
                h('span', { class: 'ev-badge' }, TIPOS[p.tipo_pregunta]), h('span', { class: 'ev-badge' }, 'Valor ' + p.valor_pregunta), tools),
            h('div', { class: 'ev-q-text' }, p.enunciado),
            p.opciones.length ? h('ul', { class: 'ev-q-opts' }, p.opciones.map((o) => h('li', { class: o.es_correcta ? 'is-ok' : '' }, icon(o.es_correcta ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'), o.texto))) : null,
            p.respuesta_esperada ? h('div', { class: 'ev-q-note' }, h('b', {}, 'Criterio de calificación: '), p.respuesta_esperada) : null,
            p.explicacion ? h('div', { class: 'ev-q-note' }, h('b', {}, 'Explicación: '), p.explicacion) : null);
    }

    /* -------------------------------------------------- modal: pregunta manual / edición */
    function modalPregunta(p) {
        const edit = !!p;
        let tipo = edit ? p.tipo_pregunta : 'OPCION_MULTIPLE';
        let ops = edit && p.opciones.length ? p.opciones.map((o) => ({ texto: o.texto, es_correcta: o.es_correcta })) : [];
        const enun = h('textarea', { class: 'ev-textarea', maxlength: '4000', placeholder: 'Escribe la pregunta…' }, edit ? p.enunciado : '');
        const valor = h('input', { class: 'ev-input', type: 'number', min: '0.5', max: '100', step: '0.5', value: edit ? p.valor_pregunta : 1 });
        const expl = h('textarea', { class: 'ev-textarea', style: 'height:64px', maxlength: '4000', placeholder: 'Por qué la respuesta es correcta (opcional, se muestra al estudiante al final)' }, edit ? p.explicacion || '' : '');
        const rubrica = h('textarea', { class: 'ev-textarea', style: 'height:80px', maxlength: '4000', placeholder: 'Criterios o respuesta modelo para calificar (opcional)' }, edit ? p.respuesta_esperada || '' : '');
        const zonaOps = h('div', { class: 'ev-field' });
        const zonaRub = h('div', { class: 'ev-field' }, h('label', {}, 'Criterio de calificación'), rubrica);
        const seg = h('div', { class: 'ev-seg', role: 'group', 'aria-label': 'Tipo de pregunta' });

        function pintarOpciones() {
            clear(zonaOps);
            if (tipo === 'ABIERTA') { zonaOps.hidden = true; zonaRub.hidden = false; return; }
            zonaOps.hidden = true; zonaOps.hidden = false; zonaRub.hidden = true;
            if (tipo === 'VERDADERO_FALSO') {
                const v = ops.length === 2 && ops[0].texto === 'Verdadero' ? ops : [{ texto: 'Verdadero', es_correcta: true }, { texto: 'Falso', es_correcta: false }];
                ops = v;
            } else {
                if (ops.length < 2 || (ops.length === 2 && ops[0].texto === 'Verdadero')) ops = [{ texto: '', es_correcta: true }, { texto: '', es_correcta: false }, { texto: '', es_correcta: false }, { texto: '', es_correcta: false }];
            }
            zonaOps.appendChild(h('label', {}, tipo === 'VERDADERO_FALSO' ? 'Respuesta correcta' : 'Opciones (marca la correcta)'));
            ops.forEach((o, i) => {
                const radio = h('input', { type: 'radio', name: 'correcta', checked: o.es_correcta, 'aria-label': 'Es la correcta', onchange: () => { ops.forEach((x, j) => { x.es_correcta = j === i; }); } });
                if (tipo === 'VERDADERO_FALSO') { zonaOps.appendChild(h('label', { class: 'ev-check' }, radio, o.texto)); return; }
                const t = h('input', { class: 'ev-input', type: 'text', maxlength: '1000', placeholder: 'Opción ' + String.fromCharCode(65 + i), value: o.texto, oninput: (e) => { o.texto = e.target.value; } });
                const quitar = h('button', { type: 'button', class: 'ev-icon-btn ev-icon-btn--bad', title: 'Quitar opción', 'aria-label': 'Quitar opción', disabled: ops.length <= 2, onclick: () => { const eraCorrecta = o.es_correcta; ops.splice(i, 1); if (eraCorrecta) ops[0].es_correcta = true; pintarOpciones(); } }, icon('fa-solid fa-xmark'));
                zonaOps.appendChild(h('div', { class: 'ev-opt-edit' }, radio, t, quitar));
            });
            if (tipo === 'OPCION_MULTIPLE' && ops.length < 6) zonaOps.appendChild(h('button', { type: 'button', class: 'ev-btn ev-btn--sm ev-btn--ghost', style: 'width:fit-content', onclick: () => { ops.push({ texto: '', es_correcta: false }); pintarOpciones(); } }, icon('fa-solid fa-plus'), 'Agregar opción'));
        }
        function pintarTipo() {
            clear(seg);
            Object.entries(TIPOS).forEach(([k, v]) => seg.appendChild(h('button', { type: 'button', 'aria-pressed': String(k === tipo), onclick: () => { if (k !== tipo) { tipo = k; ops = []; pintarTipo(); pintarOpciones(); } } }, v)));
        }
        pintarTipo(); pintarOpciones();

        const guardar = h('button', { type: 'button', class: 'ev-btn ev-btn--dark' }, edit ? 'Guardar cambios' : 'Agregar pregunta');
        const m = modal({ titulo: edit ? 'Editar pregunta' : 'Nueva pregunta', contenido: h('div', { class: 'ev-form' },
            h('div', { class: 'ev-field' }, h('label', {}, 'Tipo'), seg),
            h('div', { class: 'ev-field' }, h('label', {}, 'Enunciado'), enun),
            zonaOps, zonaRub,
            h('div', { class: 'ev-field' }, h('label', {}, 'Explicación'), expl),
            h('div', { class: 'ev-field', style: 'max-width:200px' }, h('label', {}, 'Valor (peso)'), valor, h('span', { class: 'ev-hint' }, 'Pesa en la nota final respecto a las demás.')),
            h('div', { class: 'ev-actions' }, h('button', { type: 'button', class: 'ev-btn ev-btn--soft', onclick: () => m.close() }, 'Cancelar'), guardar)) });
        guardar.addEventListener('click', () => ocupado(guardar, async () => {
            if (enun.value.trim().length < 3) return toast('Escribe el enunciado de la pregunta.', 'error');
            if (tipo !== 'ABIERTA' && ops.some((o) => !o.texto.trim())) return toast('Completa el texto de todas las opciones o quita las que sobren.', 'error');
            const cuerpo = {
                tipo_pregunta: tipo, enunciado: enun.value.trim(), valor_pregunta: Number(valor.value) || 1,
                explicacion: expl.value.trim() || null, respuesta_esperada: tipo === 'ABIERTA' ? (rubrica.value.trim() || null) : null,
                opciones: tipo === 'ABIERTA' ? [] : ops.map((o) => ({ texto: o.texto.trim(), es_correcta: !!o.es_correcta })),
            };
            try {
                if (edit) await API.editarPregunta(p.id_pregunta, cuerpo); else await API.crearPregunta(estado.ev.id_evaluacion, cuerpo);
                m.close(); toast(edit ? 'Pregunta actualizada.' : 'Pregunta agregada.'); await recargar();
            } catch (e) { EvalUI.error(e); }
        }));
    }

    /* ----------------------------------------------------- modal: generar con IA */
    function modalGenerar() {
        let tipos = new Set(['OPCION_MULTIPLE']);
        let dificultad = 'MEDIA';
        const tema = h('textarea', { class: 'ev-textarea', maxlength: '30000', placeholder: 'Escribe un tema o pega un texto de contexto (opcional si eliges evidencias). Ej. «Estrategias de evaluación formativa en primaria».' });
        const evidBox = h('div', { class: 'ev-evid' }, h('p', { class: 'ev-hint' }, 'Cargando evidencias…'));
        const cantidad = h('input', { type: 'number', min: '1', max: '30', value: '5', 'aria-label': 'Cantidad de preguntas' });
        const stepper = h('div', { class: 'ev-stepper' },
            h('button', { type: 'button', 'aria-label': 'Menos', onclick: () => { cantidad.value = Math.max(1, (Number(cantidad.value) || 1) - 1); } }, '−'), cantidad,
            h('button', { type: 'button', 'aria-label': 'Más', onclick: () => { cantidad.value = Math.min(30, (Number(cantidad.value) || 1) + 1); } }, '+'));
        const chips = h('div', { class: 'ev-chips' });
        const pintarChips = () => { clear(chips); Object.entries(TIPOS).forEach(([k, v]) => chips.appendChild(h('button', { type: 'button', class: 'ev-chip', 'aria-pressed': String(tipos.has(k)), onclick: () => { if (tipos.has(k)) { if (tipos.size > 1) tipos.delete(k); } else tipos.add(k); pintarChips(); } }, icon(tipos.has(k) ? 'fa-solid fa-check' : 'fa-regular fa-circle'), v))); };
        pintarChips();
        const seg = h('div', { class: 'ev-seg' });
        const pintarDif = () => { clear(seg); [['FACIL', 'Fácil'], ['MEDIA', 'Media'], ['DIFICIL', 'Difícil'], ['MIXTA', 'Mixta']].forEach(([k, v]) => seg.appendChild(h('button', { type: 'button', 'aria-pressed': String(k === dificultad), onclick: () => { dificultad = k; pintarDif(); } }, v))); };
        pintarDif();
        const instr = h('textarea', { class: 'ev-textarea', style: 'height:64px', maxlength: '1000', placeholder: 'Opcional. Ej. «Enfócate en la reflexión pedagógica» o «preguntas de aplicación, no de memoria».' });
        const valor = h('input', { class: 'ev-input', type: 'number', min: '0.5', max: '100', step: '0.5', value: '1' });
        const generar = h('button', { type: 'button', class: 'ev-btn ev-btn--gold' }, icon('fa-solid fa-wand-magic-sparkles'), 'Generar preguntas');
        const cuerpo = h('div', { class: 'ev-form' });
        const formulario = h('div', { class: 'ev-form' },
            h('div', { class: 'ev-field' }, h('label', {}, 'Tema o contexto'), tema),
            h('div', { class: 'ev-field' }, h('label', {}, 'Evidencias del estudiante como contexto'), evidBox,
                h('span', { class: 'ev-hint' }, 'Se leen los textos de las evidencias y sus archivos (PDF, Word, PowerPoint, texto e imágenes).')),
            h('div', { class: 'ev-row' },
                h('div', { class: 'ev-field' }, h('label', {}, 'Cantidad de preguntas'), stepper),
                h('div', { class: 'ev-field' }, h('label', {}, 'Valor de cada pregunta'), valor)),
            h('div', { class: 'ev-field' }, h('label', {}, 'Tipos de pregunta'), chips),
            h('div', { class: 'ev-field' }, h('label', {}, 'Dificultad'), seg),
            h('div', { class: 'ev-field' }, h('label', {}, 'Indicaciones adicionales'), instr),
            h('p', { class: 'ev-hint' }, 'Las preguntas generadas quedan como «Por revisar»: tú decides cuáles aprobar antes de publicar.'),
            h('div', { class: 'ev-actions' }, h('button', { type: 'button', class: 'ev-btn ev-btn--soft', onclick: () => m.close() }, 'Cancelar'), generar));
        cuerpo.appendChild(formulario);
        const m = modal({ titulo: 'Generar preguntas con IA', ancho: 680, contenido: cuerpo });

        // evidencias
        const MAX_EVIDENCIAS = 3;
        API.listarEvidencias(PRACTICA).then((lista) => {
            clear(evidBox);
            if (!lista.length) return evidBox.appendChild(h('p', { class: 'ev-hint' }, 'Esta práctica aún no tiene evidencias.'));

            const contadorEl = h('div', { class: 'ev-hint', style: 'margin-bottom:6px;font-weight:600' }, `Selecciona hasta ${MAX_EVIDENCIAS} evidencias (0/${MAX_EVIDENCIAS}):`);
            evidBox.appendChild(contadorEl);

            const actualizarLimite = () => {
                const checked = $$checks(evidBox);
                contadorEl.textContent = `Selecciona hasta ${MAX_EVIDENCIAS} evidencias (${checked.length}/${MAX_EVIDENCIAS}):`;
                const inputs = evidBox.querySelectorAll('input[type=checkbox]');
                inputs.forEach((input) => {
                    if (!input.checked) {
                        input.disabled = checked.length >= MAX_EVIDENCIAS;
                    }
                });
            };

            lista.forEach((e, i) => {
                const nombreLimpio = (e.descripcion && e.descripcion.trim()) || `Evidencia ${i + 1}`;
                const check = h('input', {
                    type: 'checkbox',
                    value: e.id_evidencia,
                    'data-nombre': nombreLimpio,
                    onchange: () => {
                        const checked = $$checks(evidBox);
                        if (checked.length > MAX_EVIDENCIAS) {
                            check.checked = false;
                            toast(`Máximo ${MAX_EVIDENCIAS} evidencias como contexto para optimizar la generación.`, 'aviso');
                        }
                        actualizarLimite();
                    }
                });

                const subtitulo = [
                    e.nombre_actividad && e.nombre_actividad.toLowerCase() !== 'activity' ? e.nombre_actividad : null,
                    e.horas_realizadas ? e.horas_realizadas + ' h' : null,
                    e.archivos && e.archivos.length ? (e.archivos.map((a) => a.nombre).join(', ') || plural(e.archivos.length, 'archivo', 'archivos')) : null,
                ].filter(Boolean).join(' · ');

                evidBox.appendChild(h('label', {}, check,
                    h('span', {}, nombreLimpio, subtitulo ? h('small', {}, subtitulo) : null)));
            });
        }).catch((e) => { clear(evidBox); evidBox.appendChild(h('p', { class: 'ev-hint' }, 'No se pudieron cargar las evidencias: ' + e.message)); });

        generar.addEventListener('click', async () => {
            const fuentes = [];
            if (tema.value.trim()) fuentes.push({ tipo: 'TEMA_LIBRE', texto: tema.value.trim() });
            const checksEv = $$checks(evidBox);
            if (checksEv.length > MAX_EVIDENCIAS) return toast(`Puedes seleccionar máximo ${MAX_EVIDENCIAS} evidencias como contexto.`, 'error');
            checksEv.forEach((c) => fuentes.push({ tipo: 'EVIDENCIA', id_referencia: c.value, nombre: c.dataset.nombre }));
            if (!fuentes.length) return toast('Escribe un tema o elige al menos una evidencia.', 'error');
            if (tema.value.trim() && tema.value.trim().length < 10) return toast('El tema es muy corto: describe un poco más.', 'error');
            const cant = Math.min(30, Math.max(1, Number(cantidad.value) || 1));
            clear(cuerpo).appendChild(h('div', { class: 'ev-generando', role: 'status' }, icon('fa-solid fa-wand-magic-sparkles fa-beat'),
                h('p', {}, 'Leyendo el contenido y redactando ' + plural(cant, 'pregunta', 'preguntas') + '…'), h('p', { class: 'ev-hint' }, 'Puede tardar hasta un minuto. No cierres esta ventana.')));
            try {
                const r = await API.generar(estado.ev.id_evaluacion, { fuentes, cantidad: cant, tipos: [...tipos], dificultad, instrucciones: instr.value.trim() || null, valor_por_pregunta: Number(valor.value) || 1 });
                m.close();
                toast(`Se generaron ${plural(r.cantidad_generada, 'pregunta', 'preguntas')}. Revísalas y apruébalas.`);
                (r.advertencias || []).forEach((a) => toast(a, 'aviso'));
                await recargar();
            } catch (e) {
                clear(cuerpo).appendChild(formulario); EvalUI.error(e);
            }
        });
    }
    const $$checks = (box) => Array.from(box.querySelectorAll('input[type=checkbox]:checked'));

    /* ============================================================== RESULTADOS */
    async function cargarResultados() {
        const cont = clear($('#tabpanel-resultados'));
        cont.appendChild(h('p', { class: 'ev-loading' }, 'Cargando…'));
        try {
            const lista = await API.listarIntentos(estado.ev.id_evaluacion);
            clear(cont);
            if (!lista.length) return cont.appendChild(h('div', { class: 'ev-empty' }, icon('fa-regular fa-hourglass-half'), 'Nadie ha presentado esta evaluación todavía.'));
            const filas = lista.map((i) => h('tr', {},
                h('td', {}, 'Estudiante #' + i.id_estudiante + ' · intento ' + i.numero_intento),
                h('td', {}, badge(i.estado, i.estado === 'ENVIADO' ? plural(i.respuestas_pendientes, 'por calificar', 'por calificar') : null)),
                h('td', {}, i.fecha_envio ? fecha(i.fecha_envio) : 'En curso'),
                h('td', {}, h('b', {}, nota(i.nota_obtenida)), ' / ' + estado.ev.nota_maxima),
                h('td', {}, h('button', { type: 'button', class: 'ev-btn ev-btn--sm ev-btn--dark', disabled: i.estado === 'EN_CURSO', onclick: () => abrirIntento(i.id_intento) }, 'Ver y calificar'))));
            cont.appendChild(h('table', { class: 'ev-table' }, h('thead', {}, h('tr', {}, ['Intento', 'Estado', 'Enviado', 'Nota', ''].map((t) => h('th', {}, t)))), h('tbody', {}, filas)));
        } catch (e) { clear(cont).appendChild(h('div', { class: 'ev-empty' }, icon('fa-solid fa-plug-circle-xmark'), e.message)); }
    }
    $('#btn-volver-editor').addEventListener('click', () => { ver('editor'); estado.tab = 'resultados'; recargar(); });

    async function abrirIntento(id) {
        try { renderIntento(await API.verIntento(id)); ver('intento'); } catch (e) { EvalUI.error(e); }
    }
    function renderIntento(it) {
        $('#intento-title').textContent = `Estudiante #${it.id_estudiante} · intento ${it.numero_intento}`;
        const bs = clear($('#intento-badges'));
        EvalUI.add(bs, badge(it.estado), h('span', { class: 'ev-badge' }, icon('fa-regular fa-star'), `Nota ${nota(it.nota_obtenida)} / ${it.nota_maxima}`), it.fecha_envio ? h('span', { class: 'ev-badge' }, icon('fa-regular fa-clock'), fecha(it.fecha_envio)) : null);
        const cont = clear($('#intento-contenido'));
        it.respuestas.forEach((r, n) => cont.appendChild(filaRespuesta(it, r, n + 1)));
    }
    function filaRespuesta(it, r, n) {
        const abierta = r.tipo_pregunta === 'ABIERTA';
        const clase = r.pendiente ? '' : r.es_correcta === true ? ' ev-ans--ok' : r.es_correcta === false ? ' ev-ans--bad' : '';
        const caja = h('article', { class: 'ev-q' },
            h('div', { class: 'ev-q-top' }, h('span', { class: 'ev-q-num' }, 'Pregunta ' + n), h('span', { class: 'ev-badge' }, TIPOS[r.tipo_pregunta]), h('span', { class: 'ev-badge' }, 'Valor ' + r.valor_pregunta),
                r.pendiente ? badge('ENVIADO', 'Por calificar') : h('span', { class: 'ev-badge ev-badge--calificado' }, `${nota(r.nota_obtenida)} / ${r.valor_pregunta}`)),
            h('div', { class: 'ev-q-text' }, r.enunciado),
            h('div', { class: 'ev-ans' + clase }, r.respuesta && r.respuesta.trim() ? r.respuesta : '(sin responder)'));
        if (!abierta && r.es_correcta === false && r.opcion_correcta) caja.appendChild(h('div', { class: 'ev-q-note' }, h('b', {}, 'Respuesta correcta: '), r.opcion_correcta));
        if (abierta && r.respuesta_esperada) caja.appendChild(h('div', { class: 'ev-q-note' }, h('b', {}, 'Criterio de calificación: '), r.respuesta_esperada));
        (r.retros || []).forEach((x) => caja.appendChild(h('div', { class: 'ev-retro' }, x.comentario)));
        if (r.id_respuesta) {
            const com = h('input', { class: 'ev-input', type: 'text', maxlength: '4000', placeholder: abierta ? 'Retroalimentación para el estudiante (opcional)' : 'Agregar un comentario para el estudiante' });
            if (abierta) {
                const val = h('input', { class: 'ev-input', type: 'number', min: '0', max: r.valor_pregunta, step: '0.25', value: r.nota_obtenida === null ? '' : r.nota_obtenida });
                const b = h('button', { type: 'button', class: 'ev-btn ev-btn--sm ev-btn--primary' }, icon('fa-solid fa-floppy-disk'), r.pendiente ? 'Calificar' : 'Actualizar nota');
                b.addEventListener('click', () => ocupado(b, async () => {
                    if (val.value === '') return toast('Escribe la nota de esta pregunta.', 'error');
                    try { renderIntento(await API.calificar(r.id_respuesta, { nota_obtenida: Number(val.value), comentario: com.value.trim() || null })); toast('Calificación guardada.'); } catch (e) { EvalUI.error(e); }
                }));
                caja.appendChild(h('div', { class: 'ev-grade' }, h('div', { class: 'ev-field', style: 'max-width:160px;flex:none' }, h('label', {}, `Nota (0 – ${r.valor_pregunta})`), val), h('div', { class: 'ev-field' }, h('label', {}, 'Comentario'), com), b));
            } else {
                const b = h('button', { type: 'button', class: 'ev-btn ev-btn--sm ev-btn--dark' }, 'Comentar');
                b.addEventListener('click', () => ocupado(b, async () => {
                    if (!com.value.trim()) return toast('Escribe el comentario.', 'error');
                    try { renderIntento(await API.comentar(r.id_respuesta, com.value.trim())); toast('Comentario enviado.'); } catch (e) { EvalUI.error(e); }
                }));
                caja.appendChild(h('div', { class: 'ev-grade' }, h('div', { class: 'ev-field' }, com), b));
            }
        }
        return caja;
    }

    // Si está integrado en tutor.html, recarga la lista al entrar a la sección de preguntas
    const btnPreguntas = document.getElementById('preguntas-preguntas-btn');
    if (btnPreguntas) {
        btnPreguntas.addEventListener('click', () => {
            resolverPractica().catch(() => {}).then(() => {
                ver('lista');
                cargarLista();
            });
        });
    }

    const qCardTutor = document.getElementById('lb-card-questions') || document.getElementById('lb-card-tutor-questions');
    if (qCardTutor) {
        qCardTutor.addEventListener('click', (e) => {
            if (!e.target.closest('#preguntas-preguntas-btn') && !e.target.closest('.lb-action-btn')) {
                resolverPractica().catch(() => {}).then(() => {
                    ver('lista');
                    cargarLista();
                });
            }
        });
    }

    const btnQuestionsBack = document.getElementById('questionsBack');
    if (btnQuestionsBack) {
        btnQuestionsBack.addEventListener('click', () => {
            ver('lista');
            window.SPP_TEACHER?.updateQuestionsPill?.();
        });
    }

    window.SPP_EVAL_TUTOR = {
        abrir: () => {
            resolverPractica().catch(() => {}).then(() => {
                ver('lista');
                cargarLista();
            });
        },
        volverALista: () => {
            ver('lista');
        },
        recargar: () => {
            cargarLista();
        }
    };

    resolverPractica().catch(() => {}).then(cargarLista);
});
