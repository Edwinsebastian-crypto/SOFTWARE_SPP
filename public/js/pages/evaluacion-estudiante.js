/* global EvalUI, EvalAPI */
/* =========================================================================
   evaluacion-estudiante.js — Pantalla del estudiante: ver evaluaciones asignadas,
   presentarlas pregunta por pregunta (autoguardado) y ver el resultado.
   Habla solo con window.EvalAPI.
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
    'use strict';
    if (!document.getElementById('view-lista') && !document.getElementById('lista-contenido')) return;

    const { h, icon, $, clear, toast, confirmar, ocupado, badge, nota, fecha, plural, TIPOS } = EvalUI;
    const API = EvalAPI.estudiante;
    EvalUI.habilitarEnlacesExternos();

    const vistas = { lista: $('#view-lista'), quiz: $('#view-quiz'), resultado: $('#view-resultado') };
    function ver(n) {
        Object.entries(vistas).forEach(([k, el]) => { if (el) el.hidden = k !== n; });
        window.scrollTo(0, 0); const s = $('.app-shell'); if (s) s.scrollTop = 0; const w = $('.ev-wrapper'); if (w) w.scrollTop = 0;
    }

    /* ================================================================= LISTA */
    async function cargarLista() {
        const cont = clear($('#lista-contenido'));
        cont.appendChild(h('p', { class: 'ev-loading' }, 'Cargando…'));
        try {
            const lista = await API.misEvaluaciones();
            clear(cont);
            if (!lista.length) return cont.appendChild(h('div', { class: 'ev-empty' }, icon('fa-regular fa-face-smile'), 'Todavía no tienes evaluaciones asignadas.'));
            lista.forEach((ev) => cont.appendChild(tarjeta(ev)));
        } catch (e) {
            clear(cont).appendChild(h('div', { class: 'ev-empty' }, icon('fa-solid fa-plug-circle-xmark'), e.message,
                h('div', { style: 'margin-top:16px' }, h('button', { type: 'button', class: 'ev-btn ev-btn--dark', onclick: cargarLista }, icon('fa-solid fa-rotate'), 'Reintentar'))));
        }
    }
    function tarjeta(ev) {
        const abierto = ev.id_intento_abierto !== null;
        let accion;
        if (abierto) accion = ['Continuar', 'fa-solid fa-play', 'ev-btn--gold', () => iniciar(ev.id_evaluacion)];
        else if (ev.puede_intentar) accion = [ev.intentos_usados ? 'Nuevo intento' : 'Comenzar', 'fa-solid fa-play', 'ev-btn--primary', () => confirmarInicio(ev)];
        const verRes = ev.id_ultimo_intento ? ['Ver resultado', 'fa-solid fa-chart-simple', 'ev-btn--dark', () => abrirResultado(ev.id_ultimo_intento)] : null;
        const estadoTxt = abierto ? badge('EN_CURSO') : ev.ultimo_intento_estado ? badge(ev.ultimo_intento_estado) : ev.estado === 'CERRADA' ? badge('CERRADA') : null;
        return h('div', { class: 'ev-card' },
            h('div', { class: 'ev-card-icon' }, icon('fa-solid fa-circle-question')),
            h('div', { class: 'ev-card-body' },
                h('div', { class: 'ev-card-title' }, ev.titulo),
                ev.descripcion ? h('p', { class: 'ev-sub' }, ev.descripcion) : null,
                h('div', { class: 'ev-badges', style: 'margin-top:8px' }, estadoTxt),
                h('div', { class: 'ev-card-meta' },
                    h('span', {}, icon('fa-regular fa-circle-question'), plural(ev.total_preguntas, 'pregunta', 'preguntas')),
                    h('span', {}, icon('fa-solid fa-rotate-right'), `Intentos: ${ev.intentos_usados} de ${ev.intentos_permitidos}`),
                    ev.fecha_limite ? h('span', {}, icon('fa-regular fa-calendar'), 'Límite: ' + fecha(ev.fecha_limite)) : null)),
            ev.nota_final !== null ? h('div', { class: 'ev-nota' }, nota(ev.nota_final), h('small', {}, 'de ' + ev.nota_maxima)) : null,
            h('div', { class: 'ev-toolbar' }, verRes && !abierto ? btn(...verRes) : null, accion ? btn(...accion) : null));
    }
    function btn(txt, ic, cls, fn) { const b = h('button', { type: 'button', class: 'ev-btn ev-btn--sm ' + cls }, icon(ic), txt); b.addEventListener('click', () => ocupado(b, fn)); return b; }
    async function confirmarInicio(ev) {
        const ok = await confirmar({ titulo: ev.titulo, ok: 'Comenzar', mensaje: `Tienes ${plural(ev.total_preguntas, 'pregunta', 'preguntas')}. Tus respuestas se guardan automáticamente y puedes salir y continuar después; solo cuenta lo que envíes al final.` + (ev.fecha_limite ? ` Recuerda: el límite es ${fecha(ev.fecha_limite)}.` : '') });
        if (ok) await iniciar(ev.id_evaluacion);
    }
    async function iniciar(id) {
        try {
            const it = await API.iniciarIntento(id);
            if (it.estado === 'EN_CURSO') abrirQuiz(it); else mostrarResultado(it);
        } catch (e) { EvalUI.error(e); cargarLista(); }
    }
    async function abrirResultado(id) { try { mostrarResultado(await API.verIntento(id)); } catch (e) { EvalUI.error(e); } }

    /* ================================================================== QUIZ */
    let Q = null;   // { it, idx, resp: {id_pregunta: {id_opcion, respuesta}}, timers }
    function abrirQuiz(it) {
        Q = { it, idx: 0, resp: {}, timers: {}, pendientesGuardar: new Set() };
        it.respuestas.forEach((r) => { Q.resp[r.id_pregunta] = { id_opcion: r.id_opcion, respuesta: r.respuesta }; });
        const primera = it.preguntas.findIndex((p) => !contestada(p));
        Q.idx = primera === -1 ? 0 : primera;
        ver('quiz'); pintarQuiz();
    }
    const contestada = (p) => { const r = Q.resp[p.id_pregunta]; return !!r && (p.tipo_pregunta === 'ABIERTA' ? !!(r.respuesta && r.respuesta.trim()) : r.id_opcion !== null && r.id_opcion !== undefined); };

    function pintarQuiz() {
        const it = Q.it, total = it.preguntas.length, p = it.preguntas[Q.idx];
        const hechas = it.preguntas.filter(contestada).length;
        const cont = clear($('#quiz-contenido'));

        const progreso = h('div', { class: 'qz-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(hechas) }, h('span', { style: `width:${total ? hechas / total * 100 : 0}%` }));
        const dots = h('div', { class: 'qz-dots', role: 'group', 'aria-label': 'Ir a una pregunta' }, it.preguntas.map((q, i) =>
            h('button', { type: 'button', class: 'qz-dot' + (contestada(q) ? ' is-done' : '') + (i === Q.idx ? ' is-now' : ''), 'aria-label': `Pregunta ${i + 1}${contestada(q) ? ' (respondida)' : ''}`, 'aria-current': i === Q.idx ? 'step' : null, onclick: () => ir(i) }, String(i + 1))));

        const tarjeta = h('div', { class: 'qz-card' },
            h('div', { class: 'qz-meta' }, h('span', { class: 'ev-badge' }, TIPOS[p.tipo_pregunta]), h('span', { class: 'ev-badge' }, icon('fa-regular fa-star'), `Vale ${p.valor_pregunta}`)),
            h('div', { class: 'qz-q', id: 'qz-enunciado' }, p.enunciado));
        const actual = Q.resp[p.id_pregunta] || {};
        if (p.tipo_pregunta === 'ABIERTA') {
            const ta = h('textarea', { class: 'ev-textarea', maxlength: '10000', 'aria-labelledby': 'qz-enunciado', placeholder: 'Escribe tu respuesta aquí…' }, actual.respuesta || '');
            ta.addEventListener('input', () => { Q.resp[p.id_pregunta] = { id_opcion: null, respuesta: ta.value }; programarGuardado(p.id_pregunta); actualizarProgresoSuave(); });
            ta.addEventListener('blur', () => guardarYa(p.id_pregunta));
            tarjeta.appendChild(h('div', { class: 'qz-open' }, ta));
        } else {
            const vf = p.tipo_pregunta === 'VERDADERO_FALSO';
            tarjeta.appendChild(h('div', { class: 'qz-opts' + (vf ? ' qz-opts--vf' : ''), role: 'group', 'aria-labelledby': 'qz-enunciado' }, p.opciones.map((o, i) =>
                h('button', { type: 'button', class: 'qz-opt', 'aria-pressed': String(actual.id_opcion === o.id_opcion), onclick: () => elegir(p, o) },
                    vf ? null : h('span', { class: 'qz-opt-letter' }, String.fromCharCode(65 + i)), h('span', {}, o.texto)))));
        }

        const ultima = Q.idx === total - 1;
        const enviar = h('button', { type: 'button', class: 'ev-btn ev-btn--gold' }, icon('fa-solid fa-paper-plane'), 'Enviar evaluación');
        enviar.addEventListener('click', () => ocupado(enviar, enviarTodo));
        EvalUI.add(cont, 
            h('div', { class: 'qz-top' }, h('button', { type: 'button', class: 'ev-btn ev-btn--sm ev-btn--ghost', onclick: salirDelQuiz }, icon('fa-solid fa-arrow-left'), 'Salir'),
                h('div', { class: 'qz-title' }, it.titulo), h('span', { class: 'qz-count' }, `Pregunta ${Q.idx + 1} de ${total} · ${hechas} respondidas`)),
            progreso, dots, tarjeta,
            h('div', { class: 'qz-save', id: 'qz-save', 'aria-live': 'polite' }, ''),
            h('div', { class: 'qz-nav' },
                h('button', { type: 'button', class: 'ev-btn ev-btn--soft', disabled: Q.idx === 0, onclick: () => ir(Q.idx - 1) }, icon('fa-solid fa-arrow-left'), 'Anterior'),
                ultima ? enviar : h('button', { type: 'button', class: 'ev-btn ev-btn--dark', onclick: () => ir(Q.idx + 1) }, 'Siguiente', icon('fa-solid fa-arrow-right'))));
    }
    function actualizarProgresoSuave() {
        const total = Q.it.preguntas.length, hechas = Q.it.preguntas.filter(contestada).length;
        const bar = $('.qz-progress > span'); if (bar) bar.style.width = (total ? hechas / total * 100 : 0) + '%';
        const dots = document.querySelectorAll('.qz-dot'); Q.it.preguntas.forEach((q, i) => { if (dots[i]) dots[i].classList.toggle('is-done', contestada(q)); });
        const c = $('.qz-count'); if (c) c.textContent = `Pregunta ${Q.idx + 1} de ${total} · ${hechas} respondidas`;
    }
    function estadoGuardado(t) { const el = $('#qz-save'); if (el) el.textContent = t; }

    function elegir(p, o) {
        Q.resp[p.id_pregunta] = { id_opcion: o.id_opcion, respuesta: o.texto };
        document.querySelectorAll('.qz-opt').forEach((b, i) => b.setAttribute('aria-pressed', String(p.opciones[i].id_opcion === o.id_opcion)));
        actualizarProgresoSuave();
        guardarYa(p.id_pregunta);
    }
    function programarGuardado(id) { clearTimeout(Q.timers[id]); estadoGuardado('Escribiendo…'); Q.timers[id] = setTimeout(() => guardarYa(id), 900); }
    async function guardarYa(id) {
        clearTimeout(Q.timers[id]); delete Q.timers[id];
        const r = Q.resp[id]; if (!r) return;
        const intento = Q.it.id_intento;
        Q.pendientesGuardar.add(id); estadoGuardado('Guardando…');
        try { await API.guardarRespuesta(intento, id, { id_opcion: r.id_opcion ?? null, respuesta: r.respuesta ?? null }); estadoGuardado('Guardado ✓'); }
        catch (e) {
            estadoGuardado('No se pudo guardar');
            toast(e.message, 'error');
            if (e.status === 409) { Q = null; ver('lista'); cargarLista(); }
        } finally { if (Q) Q.pendientesGuardar.delete(id); }
    }
    async function guardarTodoPendiente() {
        if (!Q) return;
        const ids = Object.keys(Q.timers).filter((k) => Q.timers[k]);
        for (const k of Q.it.preguntas.map((p) => p.id_pregunta)) { if (Q.timers[k]) await guardarYa(k); }
        while (Q && Q.pendientesGuardar.size) await new Promise((r) => setTimeout(r, 60));
        return ids;
    }
    async function ir(i) { if (!Q) return; await guardarTodoPendiente(); if (!Q) return; Q.idx = Math.max(0, Math.min(Q.it.preguntas.length - 1, i)); pintarQuiz(); window.scrollTo(0, 0); }
    async function salirDelQuiz() { await guardarTodoPendiente(); Q = null; ver('lista'); cargarLista(); toast('Tu avance quedó guardado. Puedes continuar cuando quieras.'); window.updateStudentQuestionsPill?.(); }

    async function enviarTodo() {
        await guardarTodoPendiente();
        if (!Q) return;
        const sin = Q.it.preguntas.filter((p) => !contestada(p)).length;
        const ok = await confirmar({ titulo: 'Enviar evaluación', ok: 'Enviar', mensaje: (sin ? `Te ${sin === 1 ? 'falta' : 'faltan'} ${plural(sin, 'pregunta por responder', 'preguntas por responder')} (contarán como 0). ` : '') + 'Una vez enviada no podrás cambiar tus respuestas. ¿Enviar ahora?' });
        if (!ok) return;
        try { const it = await API.enviarIntento(Q.it.id_intento); Q = null; mostrarResultado(it); toast('Evaluación enviada.'); window.updateStudentQuestionsPill?.(); }
        catch (e) { EvalUI.error(e); if (e.status === 409) { Q = null; ver('lista'); cargarLista(); window.updateStudentQuestionsPill?.(); } }
    }

    /* ============================================================== RESULTADO */
    function mostrarResultado(it) {
        ver('resultado');
        const cont = clear($('#resultado-contenido'));
        const calificado = it.estado === 'CALIFICADO';
        const pendientes = it.respuestas.filter((r) => r.pendiente_revision).length;
        cont.appendChild(h('div', { class: 'qz-card qz-result' },
            h('h2', { class: 'ev-section-title', style: 'font-size:22px' }, it.titulo),
            calificado
                ? h('div', {}, h('div', { class: 'qz-score' }, nota(it.nota_obtenida), h('small', {}, ' / ' + it.nota_maxima)), h('p', { class: 'ev-sub', style: 'margin-top:10px' }, `Intento ${it.numero_intento} · enviado ${fecha(it.fecha_envio)}`))
                : h('div', {}, h('div', { class: 'ev-badges', style: 'justify-content:center' }, badge('ENVIADO')),
                    h('p', { class: 'ev-sub', style: 'margin-top:12px;font-size:16px' }, `Tu tutor está revisando ${plural(pendientes, 'respuesta abierta', 'respuestas abiertas')}. Cuando termine verás aquí tu nota.`)),
            h('div', { class: 'ev-actions', style: 'justify-content:center' }, h('button', { type: 'button', class: 'ev-btn ev-btn--dark', onclick: () => { ver('lista'); cargarLista(); } }, icon('fa-solid fa-arrow-left'), 'Volver a mis evaluaciones'))));

        const revision = h('div', { class: 'qz-review' });
        it.preguntas.forEach((p, n) => {
            const r = it.respuestas.find((x) => x.id_pregunta === p.id_pregunta) || {};
            const tarj = h('article', { class: 'ev-q' },
                h('div', { class: 'ev-q-top' }, h('span', { class: 'ev-q-num' }, 'Pregunta ' + (n + 1)), h('span', { class: 'ev-badge' }, TIPOS[p.tipo_pregunta]),
                    it.resultados_visibles && r.nota_obtenida !== null && r.nota_obtenida !== undefined ? h('span', { class: 'ev-badge ' + (r.es_correcta ? 'ev-badge--calificado' : 'ev-badge--rechazada') }, `${nota(r.nota_obtenida)} / ${p.valor_pregunta}`) : null,
                    r.pendiente_revision ? badge('ENVIADO', 'Por calificar') : null),
                h('div', { class: 'ev-q-text' }, p.enunciado));
            if (p.tipo_pregunta === 'ABIERTA') {
                tarj.appendChild(h('div', { class: 'ev-ans' }, r.respuesta && r.respuesta.trim() ? r.respuesta : '(sin responder)'));
                if (p.respuesta_esperada) tarj.appendChild(h('div', { class: 'ev-q-note' }, h('b', {}, 'Criterio de calificación: '), p.respuesta_esperada));
            } else if (it.resultados_visibles) {
                tarj.appendChild(h('ul', { class: 'ev-q-opts' }, p.opciones.map((o) => {
                    const mia = r.id_opcion === o.id_opcion;
                    return h('li', { class: o.es_correcta ? 'is-ok' : (mia ? 'ev-ans--bad' : '') }, icon(o.es_correcta ? 'fa-solid fa-circle-check' : mia ? 'fa-solid fa-circle-xmark' : 'fa-regular fa-circle'), o.texto, mia ? h('b', {}, ' ← tu respuesta') : null);
                })));
            } else {
                tarj.appendChild(h('div', { class: 'ev-ans' }, r.respuesta || '(sin responder)'));
            }
            if (p.explicacion) tarj.appendChild(h('div', { class: 'ev-q-note' }, h('b', {}, 'Explicación: '), p.explicacion));
            (r.retroalimentacion || []).forEach((t) => tarj.appendChild(h('div', { class: 'ev-retro' }, h('b', {}, 'Tu tutor: '), t)));
            revision.appendChild(tarj);
        });
        EvalUI.add(cont, h('h3', { class: 'ev-section-title' }, it.resultados_visibles ? 'Revisión de tus respuestas' : 'Tus respuestas'), revision);
    }

    // Si el estudiante cierra la pestaña a mitad de una pregunta abierta, se intenta guardar lo pendiente.
    window.addEventListener('pagehide', () => { if (Q) Object.keys(Q.timers).forEach((k) => { if (Q.timers[k]) guardarYa(k); }); });

    // Si está integrado en student.html, recarga la lista al entrar a la sección de preguntas
    const btnQuestions = document.getElementById('questions-btn');
    if (btnQuestions) {
        btnQuestions.addEventListener('click', () => {
            setTimeout(() => {
                ver('lista');
                cargarLista();
            }, 60);
        });
    }

    const btnQuestionsBack = document.getElementById('questionsBack');
    if (btnQuestionsBack) {
        btnQuestionsBack.addEventListener('click', () => {
            ver('lista');
            window.updateStudentQuestionsPill?.();
        });
    }

    cargarLista();
});
