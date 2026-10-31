/* =========================================================================
   ui.js — Utilidades de interfaz compartidas (Core SPP / Evaluaciones).
   Todo el contenido dinámico se inserta con textContent (nunca innerHTML), así
   que lo que escriban estudiantes, tutores o la IA no puede inyectar HTML.
   ========================================================================= */
(function (global) {
    'use strict';
    const UI = {};

    /** h('div', {class:'x', onclick:fn, 'data-id':3}, 'texto', nodoHijo, [..]) */
    UI.h = function (tag, props, ...children) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(props || {})) {
            if (v === undefined || v === null || v === false) continue;
            if (k === 'class') el.className = v;
            else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
            else if (k === 'value') el.value = v;
            else if (v === true) el.setAttribute(k, '');
            else el.setAttribute(k, v);
        }
        const add = (c) => {
            if (c === null || c === undefined || c === false) return;
            if (Array.isArray(c)) return c.forEach(add);
            el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
        };
        children.forEach(add);
        return el;
    };
    const h = UI.h;

    UI.icon = (cls) => h('i', { class: cls, 'aria-hidden': 'true' });
    /** Como append(), pero ignora null/undefined/false (append() los escribiría como texto). */
    UI.add = (el, ...nodos) => { nodos.flat().forEach((n) => { if (n !== null && n !== undefined && n !== false) el.append(n); }); return el; };
    UI.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
    UI.$ = (sel, root) => (root || document).querySelector(sel);
    UI.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

    /* ---------- formato ---------- */
    UI.fecha = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d)) return '—';
        return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
            d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    };
    UI.nota = (n) => (n === null || n === undefined) ? '—' : Number(n).toFixed(2);
    UI.num = (n) => (n === null || n === undefined) ? '' : String(Number(n));
    UI.plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

    /* ---------- toasts ---------- */
    UI.toast = function (mensaje, tipo) {
        let cont = document.getElementById('ev-toasts');
        if (!cont) { cont = h('div', { id: 'ev-toasts', 'aria-live': 'polite' }); document.body.appendChild(cont); }
        const t = h('div', { class: 'ev-toast ev-toast--' + (tipo || 'ok'), role: 'status' },
            UI.icon(tipo === 'error' ? 'fa-solid fa-circle-exclamation' : tipo === 'aviso' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-check'),
            h('span', {}, mensaje));
        cont.appendChild(t);
        setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 300); }, tipo === 'error' ? 6500 : 3800);
    };

    /* ---------- modal ---------- */
    UI.modal = function ({ titulo, contenido, ancho, onClose, cerrarAfuera = false }) {
        const prevFocus = document.activeElement;
        const cerrar = () => {
            overlay.remove();
            document.removeEventListener('keydown', onKey);
            if (prevFocus && prevFocus.focus) prevFocus.focus();
            if (onClose) onClose();
        };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } };
        const caja = h('div', { class: 'ev-modal', role: 'dialog', 'aria-modal': 'true', style: ancho ? `max-width:${ancho}px` : null },
            h('button', { type: 'button', class: 'ev-modal-close', 'aria-label': 'Cerrar', onclick: cerrar }, UI.icon('fa-solid fa-xmark')),
            h('h3', { class: 'ev-modal-title' }, titulo),
            contenido);
        const overlay = h('div', { class: 'ev-modal-overlay' }, caja);
        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) {
                if (cerrarAfuera) {
                    cerrar();
                } else {
                    caja.classList.remove('ev-modal--shake');
                    void caja.offsetWidth;
                    caja.classList.add('ev-modal--shake');
                }
            }
        });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(overlay);
        const first = caja.querySelector('input,textarea,select,button:not(.ev-modal-close)');
        if (first) setTimeout(() => first.focus(), 30);
        return { el: caja, close: cerrar };
    };

    UI.confirmar = function ({ titulo, mensaje, ok, peligro }) {
        return new Promise((resolve) => {
            let resuelto = false;
            const fin = (v) => { if (!resuelto) { resuelto = true; resolve(v); } };
            const m = UI.modal({
                titulo: titulo || '¿Confirmas?', ancho: 460, onClose: () => fin(false),
                contenido: h('div', {},
                    h('p', { class: 'ev-confirm-text' }, mensaje),
                    h('div', { class: 'ev-actions' },
                        h('button', { type: 'button', class: 'ev-btn ev-btn--soft', onclick: () => { fin(false); m.close(); } }, 'Cancelar'),
                        h('button', { type: 'button', class: 'ev-btn ' + (peligro ? 'ev-btn--danger' : 'ev-btn--dark'), onclick: () => { fin(true); m.close(); } }, ok || 'Aceptar'))),
            });
        });
    };

    /* ---------- botón ocupado ---------- */
    UI.ocupado = async function (btn, fn, textoOcupado) {
        if (btn.disabled) return;
        const html = Array.from(btn.childNodes);
        btn.disabled = true;
        btn.classList.add('is-busy');
        document.body.classList.add('is-loading-wait');
        if (textoOcupado) { UI.clear(btn); btn.append(UI.icon('fa-solid fa-spinner fa-spin'), ' ' + textoOcupado); }
        try { return await fn(); }
        finally {
            btn.disabled = false; btn.classList.remove('is-busy');
            document.body.classList.remove('is-loading-wait');
            if (textoOcupado) { UI.clear(btn); html.forEach((n) => btn.appendChild(n)); }
        }
    };

    UI.error = (e) => UI.toast((e && e.message) || 'Ocurrió un error inesperado.', 'error');

    /* ---------- insignias ---------- */
    const ESTADOS = {
        BORRADOR: ['Borrador', 'fa-regular fa-pen-to-square'], PUBLICADA: ['Publicada', 'fa-solid fa-circle-check'],
        CERRADA: ['Cerrada', 'fa-solid fa-lock'], EN_CURSO: ['En curso', 'fa-solid fa-hourglass-half'],
        ENVIADO: ['Pendiente de revisión', 'fa-regular fa-clock'], CALIFICADO: ['Calificado', 'fa-solid fa-circle-check'],
        APROBADA: ['Aprobada', 'fa-solid fa-check'], RECHAZADA: ['Rechazada', 'fa-solid fa-ban'],
    };
    UI.badge = (estado, textoPropio) => {
        const [t, ic] = ESTADOS[estado] || [estado, 'fa-solid fa-circle'];
        return h('span', { class: 'ev-badge ev-badge--' + String(estado).toLowerCase() }, UI.icon(ic), textoPropio || t);
    };
    UI.badgeOrigen = (origen) => origen === 'IA'
        ? h('span', { class: 'ev-badge ev-badge--ia' }, UI.icon('fa-solid fa-wand-magic-sparkles'), 'IA')
        : h('span', { class: 'ev-badge ev-badge--manual' }, UI.icon('fa-solid fa-pen'), 'Manual');
    UI.TIPOS = { OPCION_MULTIPLE: 'Opción múltiple', VERDADERO_FALSO: 'Verdadero / Falso', ABIERTA: 'Abierta' };

    /* ---------- navegación de la carcasa ---------- */
    UI.habilitarEnlacesExternos = function () {
        const nav = document.querySelector('.app-navigation');
        if (!nav) return;
        nav.addEventListener('click', (e) => {
            const a = e.target.closest('a[data-external], a[data-externo]');
            if (a) e.stopPropagation();
        }, true);
        const activo = document.querySelector('.app-nav-link[data-active], .app-nav-link[data-activo]');
        if (activo) { activo.classList.add('app-nav-link--active'); activo.setAttribute('aria-current', 'page'); }
    };

    UI.banner = function (texto, icono, clase) {
        const cont = document.getElementById('ev-banner');
        if (!cont) return;
        cont.appendChild(h('div', { class: 'ev-banner ' + (clase || '') }, UI.icon(icono || 'fa-solid fa-circle-info'), h('span', {}, texto)));
    };

    global.EvalUI = UI;
    if (global.SPP) global.SPP.UI = UI;
})(window);
