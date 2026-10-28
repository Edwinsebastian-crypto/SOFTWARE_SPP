/* global EvalUI, EvalAPI, SPP */
/* =========================================================================
   evaluacion-director.js — Sección de preguntas y evaluaciones del DIRECTOR.
   Permite al director consultar en modo SOLO LECTURA:
     1. Evaluaciones de la práctica activa (Borrador / No asignada, Publicada / En curso, Calificada, Cerrada).
     2. Preguntas que puso el tutor (opciones, respuesta correcta, criterios de calificación, valor y estado).
     3. Intentos del estudiante y respuestas que colocó en cada pregunta.
     4. Notas obtenidas por pregunta, nota final y retroalimentación del tutor.
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    const panelPreguntas = document.getElementById('questions-panel');
    if (!panelPreguntas) return;

    if (typeof EvalUI === 'undefined' || typeof EvalAPI === 'undefined') {
        console.warn('evaluacion-director.js: EvalUI o EvalAPI no disponibles.');
        return;
    }

    const { h, icon, $, clear, toast, ocupado, badge, badgeOrigen, nota, fecha, plural, TIPOS } = EvalUI;
    const API = EvalAPI.director;

    let PRACTICA_ACTIVA = null;
    let ESTUDIANTE_ACTIVO = null;

    const vistas = {
        lista: $('#dir-q-view-lista'),
        eval: $('#dir-q-view-eval'),
        intento: $('#dir-q-view-intento')
    };

    const estado = {
        evaluaciones: [],
        evalActual: null,
        intentos: [],
        intentoActual: null,
        tab: 'preguntas'
    };

    function cambiarVista(nombre) {
        Object.entries(vistas).forEach(([k, el]) => {
            if (el) el.hidden = (k !== nombre);
        });
        resetScrollDirector();
    }

    function resetScrollDirector() {
        const shell = $('.app-shell');
        const wrapper = $('.practice-content-wrapper');
        const evWrapper = panelPreguntas.querySelector('.ev-wrapper');
        window.scrollTo(0, 0);
        if (shell) shell.scrollTop = 0;
        if (wrapper) wrapper.scrollTop = 0;
        if (evWrapper) evWrapper.scrollTop = 0;
    }

    /**
     * Resuelve la práctica actualmente seleccionada en el módulo de Prácticas del director.
     */
    function resolverPracticaActiva() {
        if (window.SPP_DIRECTOR?.currentPractice) {
            PRACTICA_ACTIVA = window.SPP_DIRECTOR.currentPractice;
        } else if (typeof window.SPP_DIRECTOR?.getCurrentPractice === 'function') {
            PRACTICA_ACTIVA = window.SPP_DIRECTOR.getCurrentPractice();
        } else {
            const selector = document.getElementById('practice-selector');
            if (selector && selector.value) {
                PRACTICA_ACTIVA = { id: selector.value, code: selector.value };
            }
        }

        if (PRACTICA_ACTIVA) {
            ESTUDIANTE_ACTIVO = PRACTICA_ACTIVA.student || PRACTICA_ACTIVA.studentName || '';
        }
        return PRACTICA_ACTIVA;
    }

    /* =========================================================================
       1. LISTA DE EVALUACIONES DE LA PRÁCTICA
       ========================================================================= */
    const ctxEl = $('#dir-q-lista-contexto');
    const btnRecargar = $('#dir-q-btn-recargar');
    if (btnRecargar) {
        btnRecargar.addEventListener('click', (e) => ocupado(e.currentTarget, cargarListaEvaluaciones));
    }

    async function cargarListaEvaluaciones() {
        resolverPracticaActiva();
        cambiarVista('lista');

        const cont = clear($('#dir-q-lista-contenido'));
        cont.appendChild(h('p', { class: 'ev-loading' }, 'Cargando evaluaciones…'));

        if (!PRACTICA_ACTIVA || !PRACTICA_ACTIVA.id) {
            clear(cont).appendChild(h('div', { class: 'ev-empty' },
                icon('fa-regular fa-folder-open'),
                'Selecciona primero una práctica para ver sus evaluaciones.'
            ));
            actualizarKpisLista([]);
            return;
        }

        const practiceId = String(PRACTICA_ACTIVA.id || PRACTICA_ACTIVA.code || '');
        if (ctxEl) {
            const nombreEst = ESTUDIANTE_ACTIVO || 'Estudiante asignado';
            const codPractica = PRACTICA_ACTIVA.code || PRACTICA_ACTIVA.id;
            ctxEl.textContent = `Práctica #${codPractica} · ${nombreEst}${PRACTICA_ACTIVA.tutor ? ' · Tutor: ' + PRACTICA_ACTIVA.tutor : ''}`;
        }

        try {
            const r = await API.listar({ id_practica: practiceId, limite: 100 });
            const lista = r?.items || (Array.isArray(r) ? r : []);
            estado.evaluaciones = lista;

            clear(cont);
            actualizarKpisLista(lista);

            if (!lista.length) {
                cont.appendChild(h('div', { class: 'ev-empty' },
                    icon('fa-regular fa-clipboard'),
                    'Aún no hay evaluaciones creadas para esta práctica.',
                    h('p', { class: 'ev-sub', style: 'margin-top:8px' },
                        'El tutor asignado puede crear evaluaciones con preguntas manuales o generadas con IA.')
                ));
                return;
            }

            lista.forEach((ev) => cont.appendChild(crearTarjetaEvaluacion(ev)));
        } catch (e) {
            clear(cont).appendChild(h('div', { class: 'ev-empty' },
                icon('fa-solid fa-plug-circle-xmark'),
                (e && e.message) || 'No se pudieron cargar las evaluaciones de la práctica.',
                h('div', { style: 'margin-top:16px' },
                    h('button', { type: 'button', class: 'ev-btn ev-btn--dark', onclick: cargarListaEvaluaciones },
                        icon('fa-solid fa-rotate'), 'Reintentar'
                    )
                )
            ));
            actualizarKpisLista([]);
        }
    }

    function actualizarKpisLista(lista) {
        const kTotal = $('#dir-kpi-total-evals');
        const kAsignadas = $('#dir-kpi-assigned');
        const kEnCurso = $('#dir-kpi-in-progress');
        const kPromedio = $('#dir-kpi-avg-grade');

        if (!kTotal) return;

        const total = lista.length;
        let asignadas = 0;
        let enCurso = 0;
        let sumaNotas = 0;
        let cantCalificadas = 0;

        lista.forEach((ev) => {
            if (ev.estado === 'PUBLICADA' || ev.estado === 'CERRADA') asignadas++;

            const enviados = Number(ev.intentos_enviados) || 0;
            const iniciados = Number(ev.intentos_iniciados) || 0;
            if (ev.estado === 'PUBLICADA' && iniciados > enviados) {
                enCurso++;
            }

            if (ev.nota_final !== null && ev.nota_final !== undefined) {
                sumaNotas += Number(ev.nota_final);
                cantCalificadas++;
            }
        });

        kTotal.textContent = String(total);
        kAsignadas.textContent = String(asignadas);
        kEnCurso.textContent = String(enCurso);
        kPromedio.textContent = cantCalificadas > 0 ? (sumaNotas / cantCalificadas).toFixed(1) + ' / 5.0' : '—';
    }

    /**
     * Determina la insignia de estado detallada de una evaluación:
     * - Si está en borrador: todavía no se le ha asignado al estudiante.
     * - Si está publicada: si está en curso, enviada (pendiente revisión), calificada o sin iniciar.
     * - Si está cerrada.
     */
    function insigniaEstadoEvaluacion(ev) {
        if (ev.estado === 'BORRADOR') {
            return h('span', { class: 'ev-badge ev-badge--borrador', title: 'El tutor aún no ha publicado esta evaluación' },
                icon('fa-regular fa-clock'), 'No asignada al estudiante (Borrador)'
            );
        }

        if (ev.estado === 'PUBLICADA') {
            const iniciados = Number(ev.intentos_iniciados) || 0;
            const enviados = Number(ev.intentos_enviados) || 0;
            const calificados = Number(ev.intentos_calificados) || 0;
            const pendientes = Number(ev.pendientes_revision) || 0;

            if (iniciados > enviados) {
                return h('span', { class: 'ev-badge ev-badge--en_curso', title: 'El estudiante está respondiendo la evaluación en este momento' },
                    icon('fa-solid fa-hourglass-half'), 'En curso'
                );
            }
            if (pendientes > 0) {
                return h('span', { class: 'ev-badge ev-badge--enviado', title: 'El estudiante envió su intento y espera calificación del tutor' },
                    icon('fa-regular fa-clock'), 'Enviado · Pendiente de revisión'
                );
            }
            if (calificados > 0 || ev.nota_final !== null) {
                return h('span', { class: 'ev-badge ev-badge--calificado', title: 'Evaluación presentada y calificada' },
                    icon('fa-solid fa-circle-check'), 'Calificada'
                );
            }
            return h('span', { class: 'ev-badge ev-badge--publicada', title: 'Asignada al estudiante, pendiente por iniciar' },
                icon('fa-solid fa-circle-check'), 'Asignada (Sin iniciar)'
            );
        }

        if (ev.estado === 'CERRADA') {
            return h('span', { class: 'ev-badge ev-badge--cerrada', title: 'Evaluación cerrada' },
                icon('fa-solid fa-lock'), 'Cerrada'
            );
        }

        return badge(ev.estado);
    }

    function crearTarjetaEvaluacion(ev) {
        const abrir = () => abrirDetalleEvaluacion(ev.id_evaluacion);

        const card = h('div', {
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
                h('div', { class: 'ev-badges', style: 'margin-top:8px' },
                    insigniaEstadoEvaluacion(ev),
                    ev.vencida && ev.estado === 'PUBLICADA' ? h('span', { class: 'ev-badge ev-badge--cerrada' }, icon('fa-regular fa-calendar-xmark'), 'Fecha límite vencida') : null,
                    ev.preguntas_pendientes ? h('span', { class: 'ev-badge ev-badge--borrador' }, `${ev.preguntas_pendientes} por revisar por tutor`) : null
                ),
                h('div', { class: 'ev-card-meta' },
                    h('span', {}, icon('fa-regular fa-circle-question'), plural(ev.total_preguntas, 'pregunta', 'preguntas')),
                    ev.preguntas_ia ? h('span', {}, icon('fa-solid fa-wand-magic-sparkles'), `${ev.preguntas_ia} con IA`) : null,
                    h('span', {}, icon('fa-regular fa-user'), `${ev.intentos_presentados ?? ev.intentos_enviados ?? ev.intentos_iniciados ?? 0} / ${ev.intentos_permitidos} ${ev.intentos_permitidos === 1 ? 'intento' : 'intentos'}`),
                    ev.fecha_limite ? h('span', {}, icon('fa-regular fa-calendar'), 'Límite: ' + fecha(ev.fecha_limite)) : h('span', {}, icon('fa-regular fa-calendar'), 'Sin límite')
                )
            ),
            ev.nota_final !== null && ev.nota_final !== undefined
                ? h('div', { class: 'ev-nota' }, nota(ev.nota_final), h('small', {}, 'de ' + ev.nota_maxima))
                : h('div', { class: 'ev-nota' }, '—', h('small', {}, 'Sin calificar')),
            h('button', {
                type: 'button',
                class: 'ev-go',
                'aria-label': 'Ver evaluación ' + ev.titulo,
                onclick: (e) => { e.stopPropagation(); abrir(); }
            }, icon('fa-solid fa-arrow-right'))
        );

        return card;
    }

    /* =========================================================================
       2. DETALLE DE EVALUACIÓN (PREGUNTAS DEL TUTOR + INTENTOS DEL ESTUDIANTE)
       ========================================================================= */
    const btnVolverLista = $('#dir-q-btn-volver-lista');
    if (btnVolverLista) {
        btnVolverLista.addEventListener('click', () => {
            cambiarVista('lista');
            cargarListaEvaluaciones();
        });
    }

    const tabPreguntas = $('#dir-q-tab-preguntas');
    const tabResultados = $('#dir-q-tab-resultados');

    if (tabPreguntas && tabResultados) {
        tabPreguntas.addEventListener('click', () => cambiarTabEvaluacion('preguntas'));
        tabResultados.addEventListener('click', () => cambiarTabEvaluacion('resultados'));
    }

    function cambiarTabEvaluacion(nombreTab) {
        estado.tab = nombreTab;
        if (tabPreguntas) tabPreguntas.setAttribute('aria-selected', String(nombreTab === 'preguntas'));
        if (tabResultados) tabResultados.setAttribute('aria-selected', String(nombreTab === 'resultados'));

        const panelP = $('#dir-q-panel-preguntas');
        const panelR = $('#dir-q-panel-resultados');
        if (panelP) panelP.hidden = (nombreTab !== 'preguntas');
        if (panelR) panelR.hidden = (nombreTab !== 'resultados');

        if (nombreTab === 'resultados' && estado.evalActual) {
            cargarIntentosEvaluacion(estado.evalActual.id_evaluacion);
        }
    }

    async function abrirDetalleEvaluacion(idEvaluacion) {
        cambiarVista('eval');
        $('#dir-q-eval-title').textContent = 'Cargando evaluación…';
        clear($('#dir-q-eval-badges'));
        clear($('#dir-q-eval-stats'));
        const descEl = $('#dir-q-eval-desc');
        if (descEl) descEl.textContent = '';
        clear($('#dir-q-panel-preguntas')).appendChild(h('p', { class: 'ev-loading' }, 'Cargando preguntas…'));
        clear($('#dir-q-panel-resultados'));

        try {
            const ev = await API.obtenerEvaluacion(idEvaluacion);
            estado.evalActual = ev;
            renderDetalleEvaluacion(ev);
            cambiarTabEvaluacion(estado.tab || 'preguntas');
        } catch (e) {
            $('#dir-q-eval-title').textContent = 'No se pudo cargar la evaluación';
            clear($('#dir-q-panel-preguntas')).appendChild(h('div', { class: 'ev-empty' },
                icon('fa-solid fa-triangle-exclamation'),
                (e && e.message) || 'Error al obtener la información de la evaluación.',
                h('div', { style: 'margin-top:14px' },
                    h('button', { type: 'button', class: 'ev-btn ev-btn--dark', onclick: () => abrirDetalleEvaluacion(idEvaluacion) },
                        icon('fa-solid fa-rotate'), 'Reintentar'
                    )
                )
            ));
        }
    }

    function renderDetalleEvaluacion(ev) {
        $('#dir-q-eval-title').textContent = ev.titulo;

        const b = clear($('#dir-q-eval-badges'));
        EvalUI.add(b,
            insigniaEstadoEvaluacion(ev),
            h('span', { class: 'ev-badge' }, icon('fa-regular fa-star'), `Nota máx. ${ev.nota_maxima}`),
            h('span', { class: 'ev-badge' }, icon('fa-solid fa-rotate-right'), plural(ev.intentos_permitidos, 'intento permitido', 'intentos permitidos')),
            ev.fecha_limite ? h('span', { class: 'ev-badge' }, icon('fa-regular fa-calendar'), 'Límite: ' + fecha(ev.fecha_limite)) : h('span', { class: 'ev-badge' }, icon('fa-regular fa-calendar'), 'Sin límite de entrega')
        );

        const descEl = $('#dir-q-eval-desc');
        if (descEl) {
            descEl.textContent = ev.descripcion && ev.descripcion.trim() ? ev.descripcion : 'Sin instrucciones adicionales.';
        }

        // Stats KPIs
        const st = clear($('#dir-q-eval-stats'));
        const stat = (val, etiqueta, extra) => h('div', { class: 'ev-stat' },
            h('b', {}, String(val)),
            h('span', {}, etiqueta),
            extra ? h('span', { style: 'display:block; font-size:11px; opacity:.75; margin-top:2px;' }, extra) : null
        );

        const notaFinalTxt = ev.nota_final !== null && ev.nota_final !== undefined
            ? `${nota(ev.nota_final)} / ${ev.nota_maxima}`
            : 'Sin calificar';

        EvalUI.add(st,
            stat(ev.total_preguntas, 'Preguntas creadas', `${ev.preguntas_aprobadas} aprobadas`),
            stat(`${ev.intentos_presentados || 0} / ${ev.intentos_permitidos}`, 'Intentos del estudiante', ev.intentos_permitidos > 1 ? 'Intentos múltiples' : 'Intento único'),
            stat(ev.preguntas_pendientes ? `${ev.preguntas_pendientes} pendientes` : 'Al día', 'Revisión del tutor', ev.estado === 'BORRADOR' ? 'No publicada aún' : 'Publicada'),
            stat(notaFinalTxt, 'Nota final registrada', ev.nota_final !== null ? 'Calificación actual' : 'Pendiente')
        );

        renderPreguntasTutor(ev);
    }

    /* -------------------------------------------------------------------------
       Tab 1: Preguntas creadas por el Tutor
       ------------------------------------------------------------------------- */
    function renderPreguntasTutor(ev) {
        const cont = clear($('#dir-q-panel-preguntas'));
        const preguntas = ev.preguntas || [];

        if (!preguntas.length) {
            cont.appendChild(h('div', { class: 'ev-empty' },
                icon('fa-regular fa-circle-question'),
                'Esta evaluación todavía no tiene preguntas agregadas por el tutor.'
            ));
            return;
        }

        const stack = h('div', { class: 'ev-stack' });
        preguntas.forEach((p, idx) => {
            stack.appendChild(crearTarjetaPreguntaTutor(p, idx + 1));
        });
        cont.appendChild(stack);
    }

    function crearTarjetaPreguntaTutor(p, num) {
        const card = h('article', {
            class: 'ev-q' + (p.origen === 'IA' ? ' ev-q--ia' : '') + (p.estado_revision === 'RECHAZADA' ? ' ev-q--rechazada' : '')
        },
            h('div', { class: 'ev-q-top' },
                h('span', { class: 'ev-q-num' }, `Pregunta ${num}`),
                badgeOrigen(p.origen),
                h('span', { class: 'ev-badge' }, TIPOS[p.tipo_pregunta] || p.tipo_pregunta),
                h('span', { class: 'ev-badge' }, `Valor: ${p.valor_pregunta} pts`),
                p.estado_revision === 'APROBADA'
                    ? h('span', { class: 'ev-badge ev-badge--aprobada' }, icon('fa-solid fa-check'), 'Aprobada por tutor')
                    : p.estado_revision === 'RECHAZADA'
                        ? h('span', { class: 'ev-badge ev-badge--rechazada' }, icon('fa-solid fa-ban'), 'Rechazada por tutor')
                        : h('span', { class: 'ev-badge ev-badge--borrador' }, icon('fa-regular fa-clock'), 'Por revisar por tutor')
            ),
            h('div', { class: 'ev-q-text' }, p.enunciado)
        );

        // Opciones (si es opción múltiple o verdadero/falso)
        if (p.opciones && p.opciones.length > 0) {
            const ul = h('ul', { class: 'ev-q-opts' });
            p.opciones.forEach((opc) => {
                const esOk = !!opc.es_correcta;
                ul.appendChild(h('li', { class: esOk ? 'is-ok' : '' },
                    icon(esOk ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'),
                    h('span', { style: esOk ? 'font-weight:700;' : '' }, opc.texto),
                    esOk ? h('small', { style: 'margin-left:auto; font-weight:600; opacity:.85;' }, '(Respuesta correcta)') : null
                ));
            });
            card.appendChild(ul);
        }

        // Criterio de calificación para preguntas abiertas
        if (p.tipo_pregunta === 'ABIERTA' && p.respuesta_esperada) {
            card.appendChild(h('div', { class: 'ev-q-note' },
                h('b', {}, 'Criterio de calificación / Respuesta esperada: '),
                p.respuesta_esperada
            ));
        }

        // Explicación
        if (p.explicacion) {
            card.appendChild(h('div', { class: 'ev-q-note', style: 'background:rgba(40,131,96,.12); color:var(--text-primary);' },
                h('b', {}, 'Explicación del tutor: '),
                p.explicacion
            ));
        }

        return card;
    }

    /* -------------------------------------------------------------------------
       Tab 2: Respuestas e Intentos del Estudiante
       ------------------------------------------------------------------------- */
    async function cargarIntentosEvaluacion(idEvaluacion) {
        const cont = clear($('#dir-q-panel-resultados'));
        cont.appendChild(h('p', { class: 'ev-loading' }, 'Cargando intentos y respuestas del estudiante…'));

        try {
            const res = await API.listarIntentos(idEvaluacion);
            let listaIntentos = [];
            if (Array.isArray(res)) {
                listaIntentos = res;
            } else if (res && typeof res === 'object') {
                if (Array.isArray(res.items)) {
                    listaIntentos = res.items;
                } else if (Array.isArray(res.intentos)) {
                    listaIntentos = res.intentos;
                } else {
                    listaIntentos = Object.entries(res)
                        .filter(([k, v]) => !isNaN(Number(k)) && v && typeof v === 'object' && v.id_intento)
                        .map(([, v]) => v);
                }
            }
            if (!listaIntentos.length && Array.isArray(estado.evalActual?.intentos) && estado.evalActual.intentos.length) {
                listaIntentos = estado.evalActual.intentos;
            }
            estado.intentos = listaIntentos;
            clear(cont);

            if (!estado.intentos.length) {
                const esBorrador = estado.evalActual?.estado === 'BORRADOR';
                cont.appendChild(h('div', { class: 'ev-empty' },
                    icon('fa-regular fa-hourglass-half'),
                    esBorrador
                        ? 'Esta evaluación aún no ha sido asignada al estudiante (está en borrador).'
                        : 'El estudiante aún no ha iniciado ningún intento en esta evaluación.'
                ));
                return;
            }

            const filas = estado.intentos.map((it) => {
                let badgeEstado = badge(it.estado);
                if (it.estado === 'EN_CURSO') {
                    badgeEstado = h('span', { class: 'ev-badge ev-badge--en_curso' }, icon('fa-solid fa-hourglass-half'), 'En curso');
                } else if (it.estado === 'ENVIADO') {
                    badgeEstado = h('span', { class: 'ev-badge ev-badge--enviado' }, icon('fa-regular fa-clock'), `Enviado (${it.respuestas_pendientes || 0} por calificar)`);
                } else if (it.estado === 'CALIFICADO') {
                    badgeEstado = h('span', { class: 'ev-badge ev-badge--calificado' }, icon('fa-solid fa-circle-check'), 'Calificado');
                }

                const notaTxt = it.nota_obtenida !== null && it.nota_obtenida !== undefined
                    ? `${nota(it.nota_obtenida)} / ${estado.evalActual?.nota_maxima || 5.0}`
                    : '—';

                return h('tr', {},
                    h('td', { style: 'font-weight:600;' }, `Intento #${it.numero_intento}`),
                    h('td', {}, badgeEstado),
                    h('td', {}, fecha(it.fecha_inicio)),
                    h('td', {}, it.fecha_envio ? fecha(it.fecha_envio) : h('span', { style: 'color:var(--text-muted); font-style:italic;' }, 'Presentando ahora…')),
                    h('td', { style: 'font-weight:700;' }, notaTxt),
                    h('td', { style: 'text-align:right;' },
                        h('button', {
                            type: 'button',
                            class: 'ev-btn ev-btn--sm ev-btn--dark',
                            onclick: () => abrirDetalleIntento(it.id_intento)
                        }, icon('fa-solid fa-eye'), 'Ver respuestas')
                    )
                );
            });

            const tablaWrap = h('div', { class: 'dv-tablewrap', style: 'overflow-x:auto;' },
                h('table', { class: 'ev-table', style: 'width:100%; min-width:600px;' },
                    h('thead', {},
                        h('tr', {},
                            ['Intento', 'Estado', 'Inicio', 'Envío', 'Nota', 'Acción'].map((col) =>
                                h('th', { style: col === 'Acción' ? 'text-align:right;' : '' }, col)
                            )
                        )
                    ),
                    h('tbody', {}, filas)
                )
            );

            cont.appendChild(tablaWrap);
        } catch (e) {
            clear(cont).appendChild(h('div', { class: 'ev-empty' },
                icon('fa-solid fa-plug-circle-xmark'),
                (e && e.message) || 'Error al cargar los intentos del estudiante.',
                h('div', { style: 'margin-top:14px' },
                    h('button', { type: 'button', class: 'ev-btn ev-btn--dark', onclick: () => cargarIntentosEvaluacion(idEvaluacion) },
                        icon('fa-solid fa-rotate'), 'Reintentar'
                    )
                )
            ));
        }
    }

    /* =========================================================================
       3. DETALLE DE UN INTENTO Y RESPUESTAS DEL ESTUDIANTE
       ========================================================================= */
    const btnVolverEval = $('#dir-q-btn-volver-eval');
    if (btnVolverEval) {
        btnVolverEval.addEventListener('click', () => {
            cambiarVista('eval');
            cambiarTabEvaluacion('resultados');
        });
    }

    async function abrirDetalleIntento(idIntento) {
        cambiarVista('intento');
        $('#dir-q-intento-title').textContent = 'Cargando respuestas del intento…';
        clear($('#dir-q-intento-badges'));
        const cont = clear($('#dir-q-intento-contenido'));
        cont.appendChild(h('p', { class: 'ev-loading' }, 'Cargando respuestas…'));

        try {
            const it = await API.verIntento(idIntento);
            estado.intentoActual = it;
            renderDetalleIntento(it);
        } catch (e) {
            $('#dir-q-intento-title').textContent = 'No se pudo abrir el intento';
            clear($('#dir-q-intento-contenido')).appendChild(h('div', { class: 'ev-empty' },
                icon('fa-solid fa-triangle-exclamation'),
                (e && e.message) || 'Error al obtener las respuestas del intento.',
                h('div', { style: 'margin-top:14px' },
                    h('button', { type: 'button', class: 'ev-btn ev-btn--dark', onclick: () => abrirDetalleIntento(idIntento) },
                        icon('fa-solid fa-rotate'), 'Reintentar'
                    )
                )
            ));
        }
    }

    function renderDetalleIntento(it) {
        const nombreEst = ESTUDIANTE_ACTIVO ? `${ESTUDIANTE_ACTIVO}` : `Estudiante #${it.id_estudiante}`;
        $('#dir-q-intento-title').textContent = `${nombreEst} · Intento #${it.numero_intento}`;

        const b = clear($('#dir-q-intento-badges'));
        let badgeEstado = badge(it.estado);
        if (it.estado === 'EN_CURSO') {
            badgeEstado = h('span', { class: 'ev-badge ev-badge--en_curso' }, icon('fa-solid fa-hourglass-half'), 'En curso (estudiante respondiendo)');
        } else if (it.estado === 'ENVIADO') {
            badgeEstado = h('span', { class: 'ev-badge ev-badge--enviado' }, icon('fa-regular fa-clock'), 'Enviado · Pendiente de calificación');
        } else if (it.estado === 'CALIFICADO') {
            badgeEstado = h('span', { class: 'ev-badge ev-badge--calificado' }, icon('fa-solid fa-circle-check'), 'Calificado');
        }

        EvalUI.add(b,
            badgeEstado,
            h('span', { class: 'ev-badge' }, icon('fa-regular fa-star'), `Nota: ${nota(it.nota_obtenida)} / ${it.nota_maxima}`),
            it.fecha_envio ? h('span', { class: 'ev-badge' }, icon('fa-regular fa-clock'), 'Enviado: ' + fecha(it.fecha_envio)) : h('span', { class: 'ev-badge' }, icon('fa-solid fa-spinner fa-spin'), 'En curso'),
            h('span', { class: 'ev-badge' }, icon('fa-regular fa-calendar'), 'Iniciado: ' + fecha(it.fecha_inicio))
        );

        const cont = clear($('#dir-q-intento-contenido'));
        const respuestas = it.respuestas || [];

        if (!respuestas.length) {
            cont.appendChild(h('div', { class: 'ev-empty' },
                icon('fa-regular fa-folder-open'),
                'No hay respuestas registradas para este intento.'
            ));
            return;
        }

        respuestas.forEach((r, idx) => {
            cont.appendChild(crearFilaRespuestaEstudiante(it, r, idx + 1));
        });
    }

    function crearFilaRespuestaEstudiante(it, r, num) {
        const esAbierta = r.tipo_pregunta === 'ABIERTA';
        let claseAns = '';
        if (r.es_correcta === true) {
            claseAns = ' ev-ans--ok';
        } else if (r.es_correcta === false) {
            claseAns = ' ev-ans--bad';
        }

        const notaObt = r.nota_obtenida !== null && r.nota_obtenida !== undefined ? nota(r.nota_obtenida) : '—';

        const card = h('article', { class: 'ev-q' },
            h('div', { class: 'ev-q-top' },
                h('span', { class: 'ev-q-num' }, `Pregunta ${num}`),
                h('span', { class: 'ev-badge' }, TIPOS[r.tipo_pregunta] || r.tipo_pregunta),
                h('span', { class: 'ev-badge' }, `Valor: ${r.valor_pregunta} pts`),
                r.pendiente
                    ? h('span', { class: 'ev-badge ev-badge--enviado' }, icon('fa-regular fa-clock'), 'Pendiente de calificar')
                    : h('span', { class: 'ev-badge ev-badge--calificado' }, icon('fa-solid fa-circle-check'), `Calificación: ${notaObt} / ${r.valor_pregunta} pts`),
                r.es_correcta === true
                    ? h('span', { class: 'ev-badge ev-badge--aprobada' }, icon('fa-solid fa-check'), 'Correcta')
                    : r.es_correcta === false
                        ? h('span', { class: 'ev-badge ev-badge--rechazada' }, icon('fa-solid fa-xmark'), 'Incorrecta')
                        : null
            ),
            h('div', { class: 'ev-q-text' }, r.enunciado),
            h('div', { style: 'margin-top:10px;' },
                h('small', { style: 'font-weight:700; text-transform:uppercase; font-size:11px; color:var(--text-muted);' }, 'Respuesta colocada por el estudiante:'),
                h('div', { class: 'ev-ans' + claseAns },
                    r.respuesta && r.respuesta.trim() ? r.respuesta : '(Sin responder)'
                )
            )
        );

        // Si fue cerrada y falló, mostrar respuesta correcta
        if (!esAbierta && r.es_correcta === false && r.opcion_correcta) {
            card.appendChild(h('div', { class: 'ev-q-note', style: 'background:rgba(40,131,96,.12); margin-top:10px;' },
                h('b', {}, 'Opción correcta esperada: '),
                r.opcion_correcta
            ));
        }

        // Criterio de calificación de pregunta abierta
        if (esAbierta && r.respuesta_esperada) {
            card.appendChild(h('div', { class: 'ev-q-note', style: 'margin-top:10px;' },
                h('b', {}, 'Criterio de evaluación / Respuesta esperada: '),
                r.respuesta_esperada
            ));
        }

        // Retroalimentación o comentarios del tutor
        if (r.retros && r.retros.length > 0) {
            r.retros.forEach((ret) => {
                card.appendChild(h('div', { class: 'ev-retro', style: 'margin-top:10px;' },
                    icon('fa-solid fa-comment-dots'),
                    h('b', { style: 'margin-left:6px;' }, 'Retroalimentación del tutor: '),
                    ret.comentario,
                    ret.fecha ? h('small', { style: 'display:block; opacity:.7; margin-top:3px;' }, fecha(ret.fecha)) : null
                ));
            });
        }

        return card;
    }

    /* =========================================================================
       4. CONECTORES Y EVENTOS EXTERNOS
       ========================================================================= */
    // Evento disparado cuando el selector de prácticas del director cambia
    window.addEventListener('spp:director-practice-changed', (e) => {
        if (e.detail?.practice) {
            PRACTICA_ACTIVA = e.detail.practice;
            ESTUDIANTE_ACTIVO = PRACTICA_ACTIVA.student || PRACTICA_ACTIVA.studentName || '';
            if (panelPreguntas && panelPreguntas.style.display !== 'none') {
                cargarListaEvaluaciones();
            }
        }
    });

    const qBtn = document.getElementById('questions-btn');
    const qCard = document.getElementById('lb-card-questions');
    if (qBtn) {
        qBtn.addEventListener('click', () => {
            setTimeout(cargarListaEvaluaciones, 10);
        });
    }
    if (qCard) {
        qCard.addEventListener('click', (e) => {
            if (!e.target.closest('#questions-btn')) {
                setTimeout(cargarListaEvaluaciones, 10);
            }
        });
    }

    const qBack = document.getElementById('questionsBack');
    if (qBack) {
        qBack.addEventListener('click', () => {
            cambiarVista('lista');
        });
    }

    // Exponer API global para el controlador de navegación
    window.SPP_EVAL_DIRECTOR = {
        abrir: () => {
            cargarListaEvaluaciones();
        },
        volverALista: () => {
            cambiarVista('lista');
        },
        recargar: () => {
            cargarListaEvaluaciones();
        }
    };
});
