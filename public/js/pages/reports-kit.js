/* =========================================================================
   reports-kit.js — Building blocks of the Reports panel (Director).

   Same visual language as the Evaluations dashboard (classes .dv-*): KPI tiles, cards with a CSS chart and a
   "View table" switch, stacked bars, horizontal bars and column charts. No chart library: the CSP only allows
   our own scripts, and plain HTML/CSS charts print well.

   Every card that has data registers a "dataset" ({ id, title, columns, rows }) in a registry, so the same
   information can be shown as a chart, as a table and exported (Excel, CSV, JSON, PDF).

     SPP.reportKit.h(tag, attrs, ...children)
     SPP.reportKit.kpis(tab, id, title, items)             KPI tiles (+ dataset)
     SPP.reportKit.card(tab, dataset, { sub, chart, wide, note })
     SPP.reportKit.stack / hbars / columns / table / empty
     SPP.reportKit.openExport(options)                      export dialog
     SPP.reportKit.printSheet({ title, subtitle, datasets, mode })
   ========================================================================= */
(function () {
    'use strict';
    const SPP = window.SPP || (window.SPP = {});

    // ------------------------------------------------------------------ formatting
    const fmt = (n, decimals) => (n === null || n === undefined || n === '' || Number.isNaN(Number(n))
        ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: decimals === undefined ? 0 : decimals }));
    const pct = (n, decimals) => (n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : fmt(n, decimals === undefined ? 1 : decimals) + ' %');
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthLabel = (m) => MONTHS[Number(String(m).slice(5, 7)) - 1] + ' ' + String(m).slice(2, 4);
    const plural = (n, one, many) => fmt(n) + ' ' + (Number(n) === 1 ? one : many);
    const dateTime = (iso) => {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    const day = (value) => (value ? String(value).slice(0, 10) : '—');

    // ------------------------------------------------------------------ DOM
    /** h('div', { class: 'x', onclick: fn, 'data-tip': 'text' }, 'text', otherNode, [list]) */
    function h(tag, attrs, ...children) {
        const el = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([key, value]) => {
            if (value === null || value === undefined || value === false) return;
            if (key === 'class') el.className = value;
            else if (key === 'style') el.setAttribute('style', value);
            else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
            else if (key === 'hidden' || key === 'checked' || key === 'disabled' || key === 'selected') el[key] = Boolean(value);
            else if (key === 'value') el.value = value;
            else el.setAttribute(key, value === true ? '' : value);
        });
        const add = (child) => {
            if (child === null || child === undefined || child === false) return;
            if (Array.isArray(child)) child.forEach(add);
            else el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
        };
        children.forEach(add);
        return el;
    }
    const icon = (classes) => h('i', { class: classes, 'aria-hidden': 'true' });
    const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

    // ------------------------------------------------------------------ dataset registry (one entry per report tab)
    const registry = new Map(); // tab -> { label, datasets: Map(id -> dataset) }
    function resetTab(tab, label) {
        registry.set(tab, { label: label || tab, datasets: new Map() });
    }
    function register(tab, dataset) {
        if (!registry.has(tab)) resetTab(tab);
        registry.get(tab).datasets.set(dataset.id, dataset);
        return dataset;
    }

    // ------------------------------------------------------------------ charts
    const empty = (text, ic) => h('div', { class: 'dv-empty' }, icon(ic || 'fa-regular fa-folder-open'), text);

    /** Table. columns: [{ key, label, num, render(value,row) }] */
    function table(columns, rows, options) {
        const o = options || {};
        if (!rows || !rows.length) return empty(o.empty || 'There is no data yet.');
        return h('div', { class: 'dv-tablewrap' },
            h('table', { class: 'dv-table' + (o.striped ? ' rp-striped' : '') },
                h('thead', {}, h('tr', {}, columns.map((c) => h('th', { scope: 'col', class: c.num ? 'num' : null }, c.label)))),
                h('tbody', {}, rows.map((row) => h('tr', {}, columns.map((c) => {
                    const raw = row[c.key];
                    let content;
                    if (c.render) content = c.render(raw, row);
                    else if (typeof raw === 'number') content = fmt(raw, c.decimals === undefined ? (Number.isInteger(raw) ? 0 : 2) : c.decimals);
                    else content = raw === null || raw === undefined || raw === '' ? '—' : raw;
                    return h('td', { class: c.num ? 'num' : null }, content);
                }))))));
    }

    /** One stacked bar. parts: [{ label, value, cls }] (cls: dv-s1 | dv-s2 | dv-s3 | rp-s4). */
    function stack(parts, options) {
        const o = options || {};
        const total = parts.reduce((sum, p) => sum + (Number(p.value) || 0), 0);
        if (!total) return empty(o.empty || 'There is no data yet.');
        return h('div', { class: o.compact ? 'rp-stack-compact' : null },
            h('div', { class: 'dv-stack', role: 'img', 'aria-label': parts.map((p) => p.label + ': ' + p.value).join(', ') },
                parts.map((p) => h('div', {
                    class: 'dv-seg ' + p.cls + (p.value ? '' : ' dv-seg--zero'), style: 'flex:' + (p.value || 0) + ' 1 0',
                    'data-tip': p.label + ': ' + fmt(p.value) + ' (' + fmt(p.value / total * 100, 1) + ' %)', tabindex: '0'
                }, p.value / total >= 0.08 ? String(p.value) : ''))),
            o.legend === false ? null : h('div', { class: 'dv-legend' }, parts.map((p) => h('span', {},
                h('i', { class: 'dv-key ' + p.cls }), p.label + ' ', h('b', {}, fmt(p.value)), ' (' + fmt(p.value / total * 100) + ' %)'))));
    }

    /** Horizontal bars. items: [{ label, value, text, tip, cls }] */
    function hbars(items, options) {
        const o = options || {};
        if (!items || !items.length) return empty(o.empty || 'There is no data yet.');
        const max = o.max || Math.max(1, ...items.map((i) => Number(i.value) || 0));
        return h('div', { class: 'dv-hbars' }, items.map((i) => h('div', { class: 'dv-hrow' },
            h('span', { class: 'dv-hrow-label', title: i.label }, i.label),
            h('div', { class: 'dv-track', 'data-tip': i.tip || (i.label + ': ' + (i.text || fmt(i.value, 2))), tabindex: '0' },
                h('div', { class: 'dv-fill ' + (i.cls || ''), style: 'width:' + Math.max(0, Math.min(100, (Number(i.value) || 0) / max * 100)) + '%' })),
            h('span', { class: 'dv-hrow-val' }, i.text || fmt(i.value, 2)))));
    }

    /**
     * Column chart (one or several series per label).
     * labels: ['Jan 26', ...]  series: [{ name, cls, values: [] }]  options: { tight, passBefore: index, empty }
     */
    function columns(labels, series, options) {
        const o = options || {};
        const max = Math.max(0, ...series.flatMap((s) => s.values.map((v) => Number(v) || 0)));
        if (!max) return empty(o.empty || 'There is no activity yet.');
        const cols = [];
        labels.forEach((label, index) => {
            if (o.passBefore === index) cols.push(h('i', { class: 'dv-pass-line', 'aria-hidden': 'true' }));
            cols.push(h('div', { class: 'dv-col' }, series.map((s) => {
                const value = Number(s.values[index]) || 0;
                return h('div', {
                    class: 'dv-bar ' + s.cls + (value ? '' : ' dv-bar--zero'), style: 'height:' + (value / max * 100) + '%',
                    'data-tip': label + ' · ' + s.name + ': ' + fmt(value), tabindex: '0'
                }, h('span', {}, String(value)));
            })));
        });
        return h('div', {},
            h('div', { class: 'dv-cols' + (o.tight ? ' dv-cols--tight' : ''), role: 'img', 'aria-label': series[0].name + ' by ' + labels.join(', ') }, cols),
            h('div', { class: 'dv-xaxis' + (o.tight ? ' dv-xaxis--tight' : '') }, labels.map((l) => h('span', {}, l))),
            series.length > 1 || o.legend ? h('div', { class: 'dv-legend' }, series.map((s) => h('span', {}, h('i', { class: 'dv-key ' + s.cls }), s.name))) : null);
    }

    // ------------------------------------------------------------------ KPI tiles and cards
    /** KPI tiles (markup only). items: [{ icon, value, label, sub, attn }] */
    function kpiGrid(items, extraClass) {
        return h('div', { class: 'dv-kpis ' + (extraClass || '') }, items.map((k) => h('div', { class: 'dv-kpi' + (k.attn ? ' dv-kpi--attn' : '') },
            h('div', { class: 'dv-kpi-icon' }, icon(k.icon)),
            h('div', { class: 'dv-kpi-body' }, h('span', { class: 'dv-kpi-value' + (String(k.value).length > 8 ? ' rp-kpi-text' : '') }, k.value), h('span', { class: 'dv-kpi-label' }, k.label), k.sub ? h('span', { class: 'dv-kpi-sub' }, k.sub) : null))));
    }

    /** KPI tiles that are also exportable. items: [{ icon, value, label, sub, attn, raw }]  raw = numeric value used for the export */
    function kpis(tab, id, title, items) {
        const grid = kpiGrid(items, 'rp-kpis');
        grid.setAttribute('data-ds', tab + ':' + id);
        register(tab, {
            id, title, node: grid, columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }, { key: 'detail', label: 'Detail' }],
            rows: items.map((k) => ({ metric: k.label, value: k.raw !== undefined ? k.raw : k.value, detail: k.sub || '' }))
        });
        return grid;
    }

    /**
     * Card with a chart and, behind the "View table" button, the same data as a table.
     * dataset: { id, title, columns, rows }  — registered for export unless dataset.noExport.
     */
    function card(tab, dataset, options) {
        const o = options || {};
        const chart = h('div', { class: 'rp-chart' }, o.chart);
        const hasTable = dataset.columns && dataset.rows && !o.noTable;
        const tableView = hasTable ? h('div', { class: 'rp-tableview', hidden: true }, table(dataset.columns, dataset.rows, { empty: 'There is no data yet.' })) : null;
        const toggle = hasTable ? h('button', {
            type: 'button', class: 'dv-toggle', 'aria-pressed': 'false',
            onclick: () => {
                const open = toggle.getAttribute('aria-pressed') === 'true';
                toggle.setAttribute('aria-pressed', String(!open));
                tableView.hidden = open;
                chart.hidden = !open;
            }
        }, icon('fa-solid fa-table'), 'View table') : null;
        const node = h('article', { class: 'dv-card' + (o.wide ? ' dv-card--wide' : ''), 'data-ds': tab + ':' + dataset.id },
            h('div', { class: 'dv-card-head' }, h('div', { style: 'margin-right:auto;min-width:0' }, h('h3', {}, dataset.title), o.sub ? h('p', {}, o.sub) : null), toggle),
            chart, tableView, o.note ? h('p', { class: 'dv-note' }, o.note) : null);
        if (!dataset.noExport) register(tab, Object.assign({}, dataset, { node }));
        return node;
    }

    // ------------------------------------------------------------------ export dialog
    /**
     * options: {
     *   title, subtitle,
     *   filters: [{ id, label, options: [{ value, label }] }]      optional groups of checkboxes (e.g. programs)
     *   sections: [{ id, label, hint, group }]                      what to include
     *   build({ sections: Set, filters: { [id]: Set }, format }) -> { datasets, base, title, subtitle, json?, mode? }
     *   formats: ['xlsx','csv','json','pdf']                        default: all
     * }
     */
    const FORMATS = {
        xlsx: { label: 'Excel', ext: '.xlsx', ic: 'fa-solid fa-file-excel', hint: 'One sheet per item' },
        csv: { label: 'CSV', ext: '.csv / .zip', ic: 'fa-solid fa-file-csv', hint: 'Plain text; .zip if several' },
        json: { label: 'JSON', ext: '.json', ic: 'fa-solid fa-file-code', hint: 'Structured data' },
        pdf: { label: 'PDF', ext: 'print', ic: 'fa-solid fa-file-pdf', hint: 'Opens the print dialog' }
    };

    let dialog = null;
    function closeDialog() {
        if (dialog) { dialog.remove(); dialog = null; }
        document.removeEventListener('keydown', onEscape);
    }
    function onEscape(e) { if (e.key === 'Escape') closeDialog(); }

    function openExport(options) {
        closeDialog();
        const formats = options.formats || ['xlsx', 'csv', 'json', 'pdf'];
        const state = { format: formats[0], sections: new Set(options.sections.filter((s) => s.checked !== false).map((s) => s.id)), filters: {} };
        (options.filters || []).forEach((f) => { state.filters[f.id] = new Set(f.options.map((opt) => opt.value)); });

        const message = h('p', { class: 'rp-ex-msg', role: 'status', 'aria-live': 'polite' });
        const exportButton = h('button', { type: 'button', class: 'am-btn-confirm', style: 'margin:0' }, icon('fa-solid fa-download'), ' Export');

        const checkRow = (checked, label, hint, onchange, extraClass) => {
            const input = h('input', { type: 'checkbox', checked });
            input.addEventListener('change', () => onchange(input.checked));
            return { row: h('label', { class: 'rp-ex-check' + (extraClass ? ' ' + extraClass : '') }, input, h('span', {}, h('b', {}, label), hint ? h('small', {}, hint) : null)), input };
        };

        const refresh = () => {
            exportButton.disabled = state.sections.size === 0 || Object.values(state.filters).some((set) => set.size === 0);
            message.textContent = state.sections.size === 0 ? 'Select at least one item to export.' : '';
        };

        const blocks = [];
        (options.filters || []).forEach((filter) => {
            const rows = filter.options.map((opt) => checkRow(true, opt.label, opt.hint, (on) => { on ? state.filters[filter.id].add(opt.value) : state.filters[filter.id].delete(opt.value); refresh(); }));
            const all = h('button', { type: 'button', class: 'rp-ex-link' }, 'Select / clear all');
            all.addEventListener('click', () => {
                const allOn = state.filters[filter.id].size === filter.options.length;
                state.filters[filter.id] = new Set(allOn ? [] : filter.options.map((opt) => opt.value));
                rows.forEach((r) => { r.input.checked = !allOn; });
                refresh();
            });
            blocks.push(h('fieldset', { class: 'rp-ex-group' }, h('legend', {}, filter.label, all), h('div', { class: 'rp-ex-list' }, rows.map((r) => r.row))));
        });

        const groups = [];
        options.sections.forEach((s) => {
            let g = groups.find((x) => x.name === (s.group || ''));
            if (!g) { g = { name: s.group || '', items: [] }; groups.push(g); }
            g.items.push(s);
        });
        const sectionInputs = [];
        const sectionBlock = h('fieldset', { class: 'rp-ex-group' });
        const allSections = h('button', { type: 'button', class: 'rp-ex-link' }, 'Select / clear all');
        allSections.addEventListener('click', () => {
            const allOn = state.sections.size === options.sections.length;
            state.sections = new Set(allOn ? [] : options.sections.map((s) => s.id));
            sectionInputs.forEach((i) => { i.checked = !allOn; });
            refresh();
        });
        sectionBlock.appendChild(h('legend', {}, options.sectionsLabel || 'Data to include', allSections));
        const sectionList = h('div', { class: 'rp-ex-list' });
        groups.forEach((g) => {
            if (g.name) sectionList.appendChild(h('p', { class: 'rp-ex-heading' }, g.name));
            g.items.forEach((s) => {
                const r = checkRow(state.sections.has(s.id), s.label, s.hint, (on) => { on ? state.sections.add(s.id) : state.sections.delete(s.id); refresh(); });
                sectionInputs.push(r.input);
                sectionList.appendChild(r.row);
            });
        });
        sectionBlock.appendChild(sectionList);
        blocks.push(sectionBlock);

        const formatBlock = h('fieldset', { class: 'rp-ex-group' }, h('legend', {}, 'Format'),
            h('div', { class: 'rp-ex-formats', role: 'radiogroup' }, formats.map((key) => {
                const f = FORMATS[key];
                const input = h('input', { type: 'radio', name: 'rp-format', value: key, checked: key === state.format });
                input.addEventListener('change', () => { state.format = key; });
                return h('label', { class: 'rp-ex-format' }, input, h('span', {}, icon(f.ic), h('b', {}, f.label), h('small', {}, f.hint)));
            })));
        blocks.push(formatBlock);

        exportButton.addEventListener('click', async () => {
            exportButton.disabled = true;
            try {
                const result = await options.build({ sections: new Set(state.sections), filters: state.filters, format: state.format });
                runExport(Object.assign({ format: state.format }, result));
                closeDialog();
            } catch (err) {
                message.textContent = (err && err.message) || 'The file could not be generated.';
                exportButton.disabled = false;
            }
        });

        const box = h('div', { class: 'am-modal rp-ex-box', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rp-ex-title' },
            h('button', { type: 'button', class: 'am-modal-close', 'aria-label': 'Close', onclick: closeDialog }, icon('fa-solid fa-xmark')),
            h('h3', { class: 'am-modal-title', id: 'rp-ex-title' }, options.title),
            options.subtitle ? h('p', { class: 'rp-ex-sub' }, options.subtitle) : null,
            h('div', { class: 'rp-ex-body' }, blocks),
            message,
            h('div', { class: 'am-actions rp-ex-actions' }, h('button', { type: 'button', class: 'am-btn-cancel', style: 'margin:0', onclick: closeDialog }, 'Cancel'), exportButton));
        dialog = h('div', { class: 'am-modal-overlay rp-ex-overlay', style: 'display:flex' }, box);
        dialog.addEventListener('mousedown', (e) => { if (e.target === dialog) closeDialog(); });
        document.body.appendChild(dialog);
        document.addEventListener('keydown', onEscape);
        refresh();
        const first = box.querySelector('input'); if (first) first.focus();
    }

    // ------------------------------------------------------------------ running an export
    /** Raw JSON of datasets: { id: { title, rows: [...] } } with the column keys of each dataset. */
    function datasetsToJson(datasets) {
        return Object.fromEntries(datasets.map((d) => [d.id, { title: d.title, columns: d.columns.map((c) => c.label), rows: d.rows }]));
    }

    function runExport(job) {
        const E = SPP.exporter;
        const datasets = job.datasets || [];
        const base = job.base || 'report';
        switch (job.format) {
            case 'xlsx':
                E.download(E.fileName(base, 'xlsx'), E.xlsx(datasets));
                break;
            case 'csv':
                if (datasets.length === 1) E.download(E.fileName(base, 'csv'), new Blob(['﻿' + E.csv(datasets[0])], { type: 'text/csv;charset=utf-8' }));
                else E.download(E.fileName(base, 'zip'), E.zip(datasets.map((d) => ({ name: E.slug(d.title || d.id) + '.csv', data: '﻿' + E.csv(d) }))));
                break;
            case 'json': {
                const payload = job.json || { title: job.title || base, generatedAt: new Date().toISOString(), data: datasetsToJson(datasets) };
                E.download(E.fileName(base, 'json'), new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
                break;
            }
            case 'pdf':
                printSheet({ title: job.title || base, subtitle: job.subtitle, datasets, mode: job.mode || 'panel' });
                break;
            default:
                throw new Error('Unknown export format');
        }
    }

    // ------------------------------------------------------------------ print / PDF
    /**
     * Builds a printable sheet and opens the browser print dialog ("Save as PDF").
     * mode 'panel'  : the same cards (charts) the director sees, without the "View table" buttons.
     * mode 'tables' : every dataset as a plain table.
     */
    function buildSheet(options) {
        const mode = options.mode || 'panel';
        const sheet = h('div', { class: 'rp-sheet dv-wrapper', 'aria-hidden': 'true' },
            h('header', { class: 'rp-sheet-head' }, h('h1', {}, options.title), h('p', {}, [options.subtitle, 'Generated ' + dateTime(new Date().toISOString())].filter(Boolean).join(' · '))));
        const kpiNodes = [];
        const cardNodes = [];
        options.datasets.forEach((d) => {
            if (mode === 'panel' && d.node) {
                const copy = d.node.cloneNode(true);
                // the sheet always shows the chart (never the alternate table view the director may have opened)
                copy.querySelectorAll('.dv-toggle, .rp-tableview').forEach((n) => n.remove());
                copy.querySelectorAll('.rp-chart[hidden]').forEach((n) => { n.hidden = false; });
                copy.querySelectorAll('[tabindex]').forEach((n) => n.removeAttribute('tabindex'));
                (copy.classList.contains('rp-kpis') ? kpiNodes : cardNodes).push(copy);
            } else {
                cardNodes.push(h('article', { class: 'dv-card dv-card--wide rp-sheet-table' }, h('div', { class: 'dv-card-head' }, h('h3', {}, d.title)),
                    table(d.columns.map((c) => Object.assign({}, c, { num: c.num })), d.rows)));
            }
        });
        kpiNodes.forEach((n) => sheet.appendChild(n));
        if (cardNodes.length) sheet.appendChild(h('div', { class: 'dv-grid rp-sheet-grid' }, cardNodes));
        return sheet;
    }

    function printSheet(options) {
        document.querySelectorAll('.rp-sheet').forEach((n) => n.remove());
        const sheet = buildSheet(options);
        document.body.appendChild(sheet);
        document.body.classList.add('rp-printing');
        const page = h('style', {}, '@page { size: A4 ' + (options.mode === 'tables' ? 'landscape' : 'portrait') + '; margin: 12mm; }');
        document.head.appendChild(page);
        const originalTitle = document.title;
        document.title = 'SPP ' + options.title;
        const cleanup = () => {
            document.body.classList.remove('rp-printing');
            document.title = originalTitle;
            sheet.remove();
            page.remove();
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
        // let the browser lay the sheet out before opening the dialog
        setTimeout(() => window.print(), 80);
    }

    // ------------------------------------------------------------------ section header with the usual buttons
    /** Toolbar of a tab: matching the Evaluations panel style (dv-head + dv-help). */
    function toolbar(options) {
        const frag = document.createDocumentFragment();

        const updatedFormatted = options.updated
            ? (typeof EvalUI !== 'undefined' && typeof EvalUI.fecha === 'function' ? EvalUI.fecha(options.updated) : dateTime(options.updated))
            : '';
        const updatedSpan = h('span', { class: 'rp-updated' }, updatedFormatted ? 'Actualizado ' + updatedFormatted + '.' : '');

        const subText = options.sub ? options.sub + ' ' : '';
        const subP = h('p', { class: 'ev-sub' }, subText, updatedSpan);

        const textDiv = h('div', { class: 'dv-head-text' },
            options.title ? h('h2', {}, options.title) : null,
            subP
        );

        const refreshBtn = options.onRefresh
            ? h('button', { type: 'button', class: 'ev-btn ev-btn--sm ev-btn--ghost', onclick: (e) => options.onRefresh(e.currentTarget) }, icon('fa-solid fa-rotate'), 'Refresh')
            : null;

        const exportBtn = options.onExport
            ? h('button', { type: 'button', class: 'ev-btn ev-btn--sm ev-btn--dark', onclick: options.onExport }, icon('fa-solid fa-download'), 'Export panel')
            : null;

        const headerEl = h('header', { class: 'dv-head' }, textDiv, refreshBtn, exportBtn);
        frag.appendChild(headerEl);

        if (options.glossary && Array.isArray(options.glossary) && options.glossary.length) {
            const dl = h('dl', {});
            options.glossary.forEach(([term, desc]) => {
                dl.appendChild(h('dt', {}, term));
                dl.appendChild(h('dd', {}, desc));
            });
            const details = h('details', { class: 'dv-help' },
                h('summary', {}, icon('fa-solid fa-circle-info'), '¿Cómo se leen estas cifras?'),
                dl
            );
            frag.appendChild(details);
        }

        return frag;
    }

    SPP.reportKit = {
        h, icon, clear, fmt, pct, plural, monthLabel, dateTime, day,
        resetTab, register, registry, table, stack, hbars, columns, kpiGrid, kpis, card, empty, toolbar,
        openExport, closeDialog, runExport, printSheet, buildSheet, datasetsToJson, FORMATS
    };
})();
