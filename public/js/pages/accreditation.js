/* =========================================================================
   accreditation.js — "Accreditation indicators" panel of Reports > General.

   The indicators are computed from PostgreSQL and SAVED in MongoDB (collection `indicadoresacreditacion`),
   one document per program and year. Besides the headline figures, each document keeps the complete information
   needed for an accreditation file: summary, practice types, grades, teacher support, partner institutions,
   tutors, advisors and the practice-by-practice roster.

   API:  GET  /api/reports?year=2026          -> { indicators }   (read from MongoDB)
         POST /api/reports/generate { year }  -> { indicators }   (compute from PostgreSQL + save in MongoDB)
   ========================================================================= */
(function () {
    'use strict';
    const SPP = window.SPP;
    const K = SPP.reportKit;
    const { h, icon, fmt, pct, plural, dateTime } = K;

    let year = new Date().getFullYear();
    let indicators = [];
    let openId = null; // programId whose detail is open
    let openTab = 'overview';
    let busy = false;
    let notice = '';
    let failure = '';

    const num = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? 0 : Number(v));
    const sum = (list, pick) => list.reduce((total, item) => total + num(pick(item)), 0);
    const round = (n, d) => { const f = 10 ** (d === undefined ? 1 : d); return Math.round(n * f) / f; };
    const ratio = (part, total, d) => (total ? round((100 * part) / total, d === undefined ? 1 : d) : 0);

    /** Documents saved by the first version only contain the headline figures. */
    const isLegacy = (i) => i.version === null || i.version === undefined || !i.summary || i.summary.practices === null || i.summary.practices === undefined;
    const practicesOf = (i) => (isLegacy(i) ? sum(i.practicesByType || [], (t) => t.count) : num(i.summary.practices));
    const summaryOf = (i) => (isLegacy(i) ? {
        practices: practicesOf(i), active: null, completed: null, cancelled: null, graded: null, averageGrade: null, approved: null, approvalRate: null,
        requiredHours: null, loggedHours: null, hoursCompletion: null
    } : i.summary);

    const root = () => document.getElementById('rep-accreditation-toolbar');

    // ------------------------------------------------------------------ totals of the year
    function totals(list) {
        const done = list.filter((i) => !isLegacy(i));
        const graded = sum(done, (i) => i.summary.graded);
        const practices = sum(list, practicesOf);
        const institutions = new Set();
        const advisors = new Set();
        list.forEach((i) => {
            (i.partnerInstitutions || []).forEach((p) => institutions.add(p.taxId || p.institutionName));
            (i.advisors || []).forEach((a) => advisors.add(a.document));
        });
        return {
            programs: list.length,
            practices,
            activeStudents: sum(list, (i) => i.activeStudentsTotal),
            activeTutors: sum(list, (i) => i.activeTutors),
            institutions: institutions.size || null,
            advisors: advisors.size || null,
            averageGrade: graded ? round(sum(done, (i) => num(i.summary.averageGrade) * num(i.summary.graded)) / graded, 2) : null,
            approvalRate: graded ? ratio(sum(done, (i) => i.summary.approved), graded) : null,
            dropoutRate: practices ? ratio(sum(list, (i) => (isLegacy(i) ? num(i.dropoutRate) * practicesOf(i) / 100 : i.summary.cancelled)), practices) : 0,
            duration: practices ? Math.round(sum(list, (i) => num(i.averagePracticeDurationDays) * practicesOf(i)) / practices) : 0,
            tutorFeedback: sum(list, (i) => i.teacherSupport && i.teacherSupport.tutorFeedbackCount),
            advisorFeedback: sum(list, (i) => i.teacherSupport && i.teacherSupport.advisorFeedbackCount),
            completed: done.length ? sum(done, (i) => i.summary.completed) : null,
            latest: list.map((i) => i.generatedAt).filter(Boolean).sort().pop() || null
        };
    }

    // ------------------------------------------------------------------ datasets (tables) used by the detail and by the export
    const PROGRAM = [{ key: 'programId', label: 'Program ID' }, { key: 'program', label: 'Program' }];
    const withProgram = (i, row) => Object.assign({ year: i.year, programId: i.programId, program: i.programName }, row);
    const YEAR = [{ key: 'year', label: 'Year' }];

    const DATASETS = {
        programs: {
            title: 'Program summary',
            columns: YEAR.concat(PROGRAM, [
                { key: 'faculty', label: 'Faculty' }, { key: 'totalStudents', label: 'Students (total)', num: true }, { key: 'activeStudents', label: 'Active students', num: true },
                { key: 'activeTutors', label: 'Active tutors', num: true }, { key: 'practices', label: 'Practices', num: true }, { key: 'active', label: 'Active practices', num: true },
                { key: 'completed', label: 'Completed practices', num: true }, { key: 'cancelled', label: 'Cancelled practices', num: true }, { key: 'graded', label: 'Graded practices', num: true },
                { key: 'averageGrade', label: 'Average grade', num: true, decimals: 2 }, { key: 'minGrade', label: 'Lowest grade', num: true, decimals: 2 }, { key: 'maxGrade', label: 'Highest grade', num: true, decimals: 2 },
                { key: 'approved', label: 'Approved', num: true }, { key: 'failed', label: 'Failed', num: true }, { key: 'approvalRate', label: 'Approval rate (%)', num: true, decimals: 1 },
                { key: 'requiredHours', label: 'Required hours', num: true }, { key: 'loggedHours', label: 'Logged hours', num: true }, { key: 'hoursCompletion', label: 'Hours completed (%)', num: true, decimals: 1 },
                { key: 'activities', label: 'Activities', num: true }, { key: 'evidences', label: 'Evidence items', num: true }, { key: 'dropoutRate', label: 'Dropout rate (%)', num: true, decimals: 1 },
                { key: 'duration', label: 'Average duration (days)', num: true }, { key: 'tutorFeedback', label: 'Tutor feedback', num: true }, { key: 'advisorFeedback', label: 'Advisor feedback', num: true },
                { key: 'withoutTutorFeedback', label: 'Practices without tutor feedback', num: true }, { key: 'withoutAdvisorFeedback', label: 'Practices without advisor feedback', num: true },
                { key: 'generatedAt', label: 'Generated at' }
            ]),
            rows: (i) => {
                const s = summaryOf(i);
                const t = i.teacherSupport || {};
                return [withProgram(i, {
                    faculty: i.faculty, totalStudents: i.totalStudents, activeStudents: i.activeStudentsTotal, activeTutors: i.activeTutors, practices: s.practices, active: s.active,
                    completed: s.completed, cancelled: s.cancelled, graded: s.graded, averageGrade: s.averageGrade, minGrade: s.minGrade, maxGrade: s.maxGrade, approved: s.approved, failed: s.failed,
                    approvalRate: s.approvalRate, requiredHours: s.requiredHours, loggedHours: s.loggedHours, hoursCompletion: s.hoursCompletion, activities: s.activities, evidences: s.evidences,
                    dropoutRate: i.dropoutRate, duration: i.averagePracticeDurationDays, tutorFeedback: t.tutorFeedbackCount, advisorFeedback: t.advisorFeedbackCount,
                    withoutTutorFeedback: t.practicesWithoutTutorFeedback, withoutAdvisorFeedback: t.practicesWithoutAdvisorFeedback, generatedAt: i.generatedAt
                })];
            }
        },
        types: {
            title: 'Practice types',
            columns: YEAR.concat(PROGRAM, [
                { key: 'typeId', label: 'Type ID' }, { key: 'type', label: 'Practice type' }, { key: 'semester', label: 'Semester', num: true }, { key: 'requiredHours', label: 'Required hours', num: true },
                { key: 'count', label: 'Practices', num: true }, { key: 'students', label: 'Students', num: true }, { key: 'averageGrade', label: 'Average grade', num: true, decimals: 2 }, { key: 'approvalRate', label: 'Approval rate (%)', num: true, decimals: 1 }
            ]),
            rows: (i) => (i.practicesByType || []).map((t) => withProgram(i, t))
        },
        grades: {
            title: 'Grade distribution',
            columns: YEAR.concat(PROGRAM, [{ key: 'range', label: 'Grade range' }, { key: 'studentCount', label: 'Students', num: true }]),
            rows: (i) => (i.gradeDistribution || []).map((g) => withProgram(i, g))
        },
        support: {
            title: 'Teacher support (feedback)',
            columns: YEAR.concat(PROGRAM, [
                { key: 'tutorFeedbackCount', label: 'Tutor feedback', num: true }, { key: 'advisorFeedbackCount', label: 'Advisor feedback', num: true },
                { key: 'practicesWithoutTutorFeedback', label: 'Practices without tutor feedback', num: true }, { key: 'practicesWithoutAdvisorFeedback', label: 'Practices without advisor feedback', num: true },
                { key: 'feedbackPerPractice', label: 'Feedback per practice', num: true, decimals: 1 }
            ]),
            rows: (i) => [withProgram(i, i.teacherSupport || {})]
        },
        institutions: {
            title: 'Partner institutions',
            columns: YEAR.concat(PROGRAM, [
                { key: 'taxId', label: 'Tax ID (NIT)' }, { key: 'institutionName', label: 'Institution' }, { key: 'address', label: 'Address' }, { key: 'manager', label: 'Manager' }, { key: 'email', label: 'Email' },
                { key: 'practiceCount', label: 'Practices', num: true }, { key: 'studentCount', label: 'Students', num: true }, { key: 'activeCount', label: 'Active', num: true },
                { key: 'completedCount', label: 'Completed', num: true }, { key: 'averageGrade', label: 'Average grade', num: true, decimals: 2 }
            ]),
            rows: (i) => (i.partnerInstitutions || []).map((p) => withProgram(i, p))
        },
        tutors: {
            title: 'Academic tutors',
            columns: YEAR.concat(PROGRAM, [
                { key: 'document', label: 'Document' }, { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'practices', label: 'Practices', num: true }, { key: 'students', label: 'Students', num: true },
                { key: 'activePractices', label: 'Active practices', num: true }, { key: 'feedbackCount', label: 'Feedback given', num: true }, { key: 'averageGrade', label: 'Average grade', num: true, decimals: 2 }
            ]),
            rows: (i) => (i.tutors || []).map((t) => withProgram(i, t))
        },
        advisors: {
            title: 'Pedagogical advisors',
            columns: YEAR.concat(PROGRAM, [
                { key: 'document', label: 'Document' }, { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'practices', label: 'Practices', num: true }, { key: 'students', label: 'Students', num: true },
                { key: 'activePractices', label: 'Active practices', num: true }, { key: 'feedbackCount', label: 'Feedback given', num: true }, { key: 'averageGrade', label: 'Average grade', num: true, decimals: 2 }
            ]),
            rows: (i) => (i.advisors || []).map((a) => withProgram(i, a))
        },
        practices: {
            title: 'Practice roster',
            columns: YEAR.concat(PROGRAM, [
                { key: 'practiceId', label: 'Practice ID' }, { key: 'studentDocumentType', label: 'Doc. type' }, { key: 'studentDocument', label: 'Student document' }, { key: 'studentName', label: 'Student' },
                { key: 'studentEmail', label: 'Student email' }, { key: 'studentStatus', label: 'Student status' }, { key: 'typeId', label: 'Type ID' }, { key: 'type', label: 'Practice type' },
                { key: 'taxId', label: 'Institution NIT' }, { key: 'institution', label: 'Institution' }, { key: 'tutorDocument', label: 'Tutor document' }, { key: 'tutor', label: 'Tutor' },
                { key: 'advisorDocument', label: 'Advisor document' }, { key: 'advisor', label: 'Advisor' }, { key: 'startDate', label: 'Start date' }, { key: 'endDate', label: 'End date' },
                { key: 'durationDays', label: 'Duration (days)', num: true }, { key: 'status', label: 'Status' }, { key: 'finalGrade', label: 'Final grade', num: true, decimals: 2 },
                { key: 'finalObservation', label: 'Final observation' }, { key: 'requiredHours', label: 'Required hours', num: true }, { key: 'loggedHours', label: 'Logged hours', num: true },
                { key: 'activities', label: 'Activities', num: true }, { key: 'evidences', label: 'Evidence items', num: true }, { key: 'tutorFeedback', label: 'Tutor feedback', num: true }, { key: 'advisorFeedback', label: 'Advisor feedback', num: true }
            ]),
            rows: (i) => (i.practices || []).map((p) => withProgram(i, p))
        }
    };
    const SECTION_HINTS = {
        programs: 'One row per program with every indicator',
        types: 'Practices, students, average grade and approval per type',
        grades: 'Students per grade range',
        support: 'Tutor and advisor feedback',
        institutions: 'NIT, address, manager and contact',
        tutors: 'Document, e-mail and workload',
        advisors: 'Document, e-mail and workload',
        practices: 'Student by student: every practice with its data'
    };

    /** Builds one exportable dataset for the given programs. */
    function dataset(key, list) {
        const def = DATASETS[key];
        return { id: 'accreditation-' + key, title: def.title, columns: def.columns, rows: list.flatMap((i) => def.rows(i)) };
    }

    // ------------------------------------------------------------------ rendering
    function banner(text, tone) {
        return h('div', { class: 'rp-note rp-note--' + (tone || 'info'), role: 'status' }, icon(tone === 'warn' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-info'), h('span', {}, text));
    }

    function header() {
        const input = h('input', { id: 'ind-year', type: 'number', min: '2000', max: '2100', value: String(year), 'aria-label': 'Year' });
        input.addEventListener('change', () => {
            const value = Number(input.value);
            if (!Number.isInteger(value) || value < 2000 || value > 2100) { input.value = String(year); return; }
            year = value; openId = null; load();
        });
        const generate = h('button', { type: 'button', class: 'cp-btn cp-btn-save', id: 'ind-generate', style: 'margin:0', disabled: busy, onclick: generateAndSave },
            busy ? 'Generating…' : 'Generate and save');
        const exportButton = h('button', { type: 'button', class: 'rp-acc-export', disabled: !indicators.length, onclick: openExport }, icon('fa-solid fa-download'), 'Export data');
        const latest = totals(indicators).latest;
        return h('div', { class: 'rp-acc-head' },
            h('div', { class: 'rp-acc-title' }, h('h3', {}, 'Accreditation indicators'),
                h('p', {}, latest ? 'Generated ' + dateTime(latest) : 'Computed from the practicum database and saved in MongoDB.')),
            h('div', { class: 'rp-acc-controls' }, h('label', { for: 'ind-year' }, 'Year'), input, exportButton, generate));
    }

    function programTable(list) {
        const rows = list.map((i) => {
            const s = summaryOf(i);
            const t = i.teacherSupport || {};
            return {
                id: i.programId, program: i.programName, faculty: i.faculty || '—', students: i.activeStudentsTotal, practices: s.practices, completed: s.completed,
                grade: s.averageGrade, approval: s.approvalRate, dropout: i.dropoutRate, duration: i.averagePracticeDurationDays, feedback: num(t.tutorFeedbackCount) + ' / ' + num(t.advisorFeedbackCount),
                institutions: (i.partnerInstitutions || []).length, legacy: isLegacy(i)
            };
        });
        const columns = [
            { key: 'program', label: 'Program', render: (v, r) => h('span', {}, h('span', { class: 'dv-cell-title' }, v), h('span', { class: 'dv-cell-sub' }, r.faculty + (r.legacy ? ' · summary only' : ''))) },
            { key: 'students', label: 'Active students', num: true },
            { key: 'practices', label: 'Practices', num: true },
            { key: 'completed', label: 'Completed', num: true, render: (v) => (v === null ? '—' : fmt(v)) },
            { key: 'grade', label: 'Avg. grade', num: true, render: (v) => (v === null || v === 0 ? '—' : fmt(v, 2)) },
            { key: 'approval', label: 'Approval', num: true, render: (v) => (v === null ? '—' : pct(v)) },
            { key: 'dropout', label: 'Dropout', num: true, render: (v) => pct(v) },
            { key: 'duration', label: 'Avg. duration', num: true, render: (v) => fmt(v) + ' d' },
            { key: 'feedback', label: 'Feedback (tutor / advisor)', num: true },
            {
                key: 'id', label: '', render: (v) => h('button', {
                    type: 'button', class: 'ev-btn ev-btn--sm ' + (openId === v ? 'ev-btn--dark' : 'ev-btn--ghost'), 'aria-expanded': String(openId === v),
                    onclick: () => { openId = openId === v ? null : v; openTab = 'overview'; render(); if (openId) { const d = document.getElementById('rp-acc-detail'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }
                }, openId === v ? 'Hide detail' : 'View detail')
            }
        ];
        return K.table(columns, rows, { empty: 'No programs.' });
    }

    // ----- detail of one program
    function detail(i) {
        const s = summaryOf(i);
        const legacy = isLegacy(i);
        const tabs = [
            ['overview', 'Overview'], ['types', 'Practice types'], ['support', 'Teacher support'],
            ['institutions', 'Institutions (' + (i.partnerInstitutions || []).length + ')'], ['practices', 'Practices (' + (i.practices || []).length + ')']
        ];
        const panels = {
            overview: () => overview(i, s, legacy), types: () => typesPanel(i), support: () => supportPanel(i),
            institutions: () => tablePanel('institutions', i), practices: () => rosterPanel(i)
        };
        const panelHolder = h('div', { class: 'rp-acc-panel' }, panels[openTab]());
        const buttons = tabs.map(([key, label]) => h('button', {
            type: 'button', class: 'ev-tab', role: 'tab', 'aria-selected': String(openTab === key),
            onclick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (openTab === key) return;
                openTab = key;
                buttons.forEach((b, idx) => b.setAttribute('aria-selected', String(tabs[idx][0] === key)));
                K.clear(panelHolder).append(panels[key]());
            }
        }, label));
        return h('article', { class: 'dv-card dv-card--wide rp-acc-detail', id: 'rp-acc-detail' },
            h('div', { class: 'dv-card-head' }, h('div', { style: 'margin-right:auto;min-width:0' }, h('h3', {}, i.programName + ' · ' + i.year),
                h('p', {}, [i.faculty, i.generatedAt ? 'Generated ' + dateTime(i.generatedAt) : null, 'Program ID ' + i.programId].filter(Boolean).join(' · '))),
            h('button', { type: 'button', class: 'dv-toggle', onclick: () => { openId = null; render(); } }, icon('fa-solid fa-xmark'), 'Close')),
            legacy ? banner('This program was saved with an earlier version of the indicators and only has the headline figures. Click “Generate and save” to store the complete information (practices, students, tutors, institutions...).', 'warn') : null,
            h('div', { class: 'ev-tabs', role: 'tablist' }, buttons),
            panelHolder);
    }

    function overview(i, s, legacy) {
        const dash = (v, f) => (v === null || v === undefined ? '—' : f(v));
        const kpis = K.kpiGrid([
            { icon: 'fa-solid fa-user-graduate', value: dash(i.activeStudentsTotal, fmt), label: 'Active students', sub: i.totalStudents != null ? 'of ' + fmt(i.totalStudents) + ' registered' : null },
            { icon: 'fa-solid fa-chalkboard-user', value: dash(i.activeTutors, fmt), label: 'Active tutors' },
            { icon: 'fa-solid fa-copy', value: fmt(s.practices), label: 'Practices', sub: legacy ? null : fmt(s.active) + ' active · ' + fmt(s.completed) + ' completed · ' + fmt(s.cancelled) + ' cancelled' },
            { icon: 'fa-solid fa-chart-simple', value: s.graded ? fmt(s.averageGrade, 2) : '—', label: 'Average grade', sub: s.graded ? fmt(s.minGrade, 1) + ' lowest · ' + fmt(s.maxGrade, 1) + ' highest' : 'No graded practices' },
            { icon: 'fa-solid fa-circle-check', value: s.graded ? pct(s.approvalRate) : '—', label: 'Approval rate', sub: s.graded ? fmt(s.approved) + ' approved · ' + fmt(s.failed) + ' failed' : null },
            { icon: 'fa-regular fa-clock', value: legacy ? '—' : pct(s.hoursCompletion), label: 'Hours completed', sub: legacy ? null : fmt(s.loggedHours) + ' of ' + fmt(s.requiredHours) + ' required' },
            { icon: 'fa-solid fa-ban', value: pct(i.dropoutRate), label: 'Dropout rate', sub: 'Cancelled practices' },
            { icon: 'fa-regular fa-calendar', value: fmt(i.averagePracticeDurationDays) + ' d', label: 'Average duration', sub: legacy ? null : fmt(s.activities) + ' activities · ' + fmt(s.evidences) + ' evidence items' }
        ]);
        const statusCard = K.card('acc', { id: 'x', title: 'Practice status', noExport: true }, {
            noTable: true, sub: 'Practices of ' + i.year + ' by status.',
            chart: legacy ? K.empty('Not available in this version of the indicators.') : K.stack([
                { label: 'Active', value: s.active, cls: 'dv-s1' }, { label: 'Completed', value: s.completed, cls: 'dv-s3' }, { label: 'Cancelled', value: s.cancelled, cls: 'dv-s2' }
            ], { empty: 'No practices in ' + i.year + '.' })
        });
        const dist = i.gradeDistribution || [];
        const order = ['0.1-2.9', '3.0-3.9', '4.0-5.0'];
        const bands = order.map((r) => dist.find((g) => g.range === r) || { range: r, studentCount: 0 });
        const gradeCard = K.card('acc', { id: 'y', title: 'Grade distribution', noExport: true, columns: [{ key: 'range', label: 'Range' }, { key: 'students', label: 'Students', num: true }], rows: bands.map((b) => ({ range: b.range, students: b.studentCount })) }, {
            sub: 'Students by final grade.', chart: K.columns(['Below 3.0', '3.0 – 3.9', '4.0 – 5.0'], [{ name: 'Students', cls: 'dv-s1', values: bands.map((b) => b.studentCount) }], { passBefore: 1, empty: 'No graded practices yet.' }),
            note: 'The dashed line marks the minimum grade to pass (3.0).'
        });
        return h('div', {}, kpis, h('div', { class: 'dv-grid' }, statusCard, gradeCard));
    }

    function tablePanel(key, i) {
        const def = DATASETS[key];
        const columns = def.columns.filter((c) => !['year', 'programId', 'program'].includes(c.key));
        return K.table(columns, def.rows(i), { empty: 'There is no information of this kind in the saved indicator.' });
    }

    function typesPanel(i) {
        const types = i.practicesByType || [];
        const chart = K.hbars(types.map((t) => ({ label: t.type, value: t.count, text: fmt(t.count) + (t.averageGrade ? ' · avg ' + fmt(t.averageGrade, 2) : '') })), { empty: 'No practices in ' + i.year + '.' });
        return h('div', {}, h('div', { class: 'rp-acc-chart' }, chart), tablePanel('types', i));
    }

    function supportPanel(i) {
        const t = i.teacherSupport || {};
        const total = num(t.tutorFeedbackCount) + num(t.advisorFeedbackCount);
        const kpis = K.kpiGrid([
            { icon: 'fa-solid fa-comments', value: fmt(t.tutorFeedbackCount), label: 'Tutor feedback' },
            { icon: 'fa-solid fa-comment-dots', value: fmt(t.advisorFeedbackCount), label: 'Advisor feedback' },
            { icon: 'fa-solid fa-triangle-exclamation', value: t.practicesWithoutTutorFeedback === null || t.practicesWithoutTutorFeedback === undefined ? '—' : fmt(t.practicesWithoutTutorFeedback), label: 'Without tutor feedback', attn: num(t.practicesWithoutTutorFeedback) > 0 },
            { icon: 'fa-solid fa-triangle-exclamation', value: t.practicesWithoutAdvisorFeedback === null || t.practicesWithoutAdvisorFeedback === undefined ? '—' : fmt(t.practicesWithoutAdvisorFeedback), label: 'Without advisor feedback', attn: num(t.practicesWithoutAdvisorFeedback) > 0 }
        ]);
        const teacherColumns = (key) => DATASETS[key].columns.filter((c) => !['year', 'programId', 'program'].includes(c.key));
        return h('div', {}, kpis,
            total ? K.stack([{ label: 'Tutor', value: num(t.tutorFeedbackCount), cls: 'dv-s1' }, { label: 'Advisor', value: num(t.advisorFeedbackCount), cls: 'dv-s2' }]) : K.empty('No feedback was written for the practices of ' + i.year + '.'),
            h('h4', { class: 'dv-sub' }, 'Academic tutors'), K.table(teacherColumns('tutors'), DATASETS.tutors.rows(i), { empty: 'No tutors saved for this program.' }),
            h('h4', { class: 'dv-sub' }, 'Pedagogical advisors'), K.table(teacherColumns('advisors'), DATASETS.advisors.rows(i), { empty: 'No advisors saved for this program.' }));
    }

    function rosterPanel(i) {
        const all = DATASETS.practices.rows(i);
        const columns = DATASETS.practices.columns.filter((c) => !['year', 'programId', 'program', 'studentDocumentType', 'typeId', 'taxId', 'tutorDocument', 'advisorDocument', 'finalObservation', 'studentStatus', 'studentEmail'].includes(c.key))
            .map((c) => (c.key === 'status' ? Object.assign({}, c, { render: (v) => h('span', { class: 'dv-flag ' + (v === 'cancelled' ? '' : v === 'completed' ? 'dv-flag--ok' : 'dv-flag--warn') }, v || '—') }) : c));
        const holder = h('div', {});
        const count = h('span', { class: 'dv-count' });
        const search = h('input', { type: 'search', placeholder: 'Search student, tutor, institution…', 'aria-label': 'Search practices', maxlength: '80' });
        const paint = () => {
            const q = search.value.trim().toLowerCase();
            const rows = q ? all.filter((r) => [r.studentName, r.studentDocument, r.tutor, r.advisor, r.institution, r.practiceId, r.type].some((v) => String(v || '').toLowerCase().includes(q))) : all;
            K.clear(holder).append(K.table(columns, rows.slice(0, 300), { empty: all.length ? 'No practice matches the search.' : 'No practices in ' + i.year + '.' }));
            count.textContent = rows.length ? 'Showing ' + fmt(Math.min(300, rows.length)) + ' of ' + fmt(rows.length) : '';
        };
        let timer = null;
        search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(paint, 200); });
        paint();
        return h('div', {}, h('div', { class: 'dv-filters' }, h('div', { class: 'dv-search' }, icon('fa-solid fa-magnifying-glass'), search), count),
            holder, h('p', { class: 'dv-note' }, 'The export includes more columns (documents, e-mails, observations, hours and feedback per practice).'));
    }

    // ----- whole panel
    function render() {
        const el = root();
        if (!el) return;
        K.clear(el);
        el.appendChild(header());
        if (failure) { el.appendChild(banner(failure, 'warn')); }
        if (notice) { el.appendChild(banner(notice, 'ok')); }
        if (!indicators.length) {
            el.appendChild(K.empty('There are no indicators saved for ' + year + ' yet. Click “Generate and save” to compute them from the practicum database and store them in MongoDB.', 'fa-regular fa-clipboard'));
            return;
        }
        const legacyCount = indicators.filter(isLegacy).length;
        if (legacyCount) el.appendChild(banner(legacyCount + (legacyCount === 1 ? ' program was' : ' programs were') + ' saved with an earlier version that only keeps the headline figures. Click “Generate and save” to store the complete information of ' + year + '.', 'warn'));
        const t = totals(indicators);
        const dash = (v, f) => (v === null || v === undefined ? '—' : f(v));
        el.appendChild(K.kpiGrid([
            { icon: 'fa-solid fa-graduation-cap', value: fmt(t.programs), label: 'Programs', sub: plural(t.practices, 'practice', 'practices') + ' in ' + year },
            { icon: 'fa-solid fa-user-graduate', value: fmt(t.activeStudents), label: 'Active students' },
            { icon: 'fa-solid fa-chalkboard-user', value: fmt(t.activeTutors), label: 'Active tutors', sub: t.advisors ? plural(t.advisors, 'advisor', 'advisors') + ' in practices' : null },
            { icon: 'fa-solid fa-building-columns', value: dash(t.institutions, fmt), label: 'Partner institutions' },
            { icon: 'fa-solid fa-chart-simple', value: dash(t.averageGrade, (v) => fmt(v, 2)), label: 'Average grade', sub: 'Scale 0 – 5' },
            { icon: 'fa-solid fa-circle-check', value: dash(t.approvalRate, pct), label: 'Approval rate', sub: 'Grade of 3.0 or higher' },
            { icon: 'fa-solid fa-ban', value: pct(t.dropoutRate), label: 'Dropout rate', sub: 'Cancelled practices' },
            { icon: 'fa-solid fa-comments', value: fmt(t.tutorFeedback) + ' / ' + fmt(t.advisorFeedback), label: 'Tutor / advisor feedback', sub: fmt(t.duration) + ' days average duration' }
        ], 'rp-acc-kpis'));
        el.appendChild(programTable(indicators));
        const open = indicators.find((i) => i.programId === openId);
        if (open) el.appendChild(detail(open));
    }

    // ------------------------------------------------------------------ data
    function enrichSemesters(list, pTypes) {
        if (!pTypes || !pTypes.length || !list || !list.length) return;
        const typeMap = new Map();
        pTypes.forEach((pt) => {
            if (pt.id) typeMap.set(String(pt.id).trim().toLowerCase(), pt.semester);
            if (pt.code) typeMap.set(String(pt.code).trim().toLowerCase(), pt.semester);
            if (pt.name) typeMap.set(String(pt.name).trim().toLowerCase(), pt.semester);
        });
        list.forEach((ind) => {
            (ind.practicesByType || []).forEach((t) => {
                if (t.semester === null || t.semester === undefined) {
                    const found = (t.typeId && typeMap.get(String(t.typeId).trim().toLowerCase())) ||
                                  (t.type && typeMap.get(String(t.type).trim().toLowerCase()));
                    if (found !== undefined && found !== null) {
                        t.semester = found;
                    }
                }
            });
        });
    }

    async function load() {
        failure = ''; notice = '';
        try {
            const [repRes, typesRes] = await Promise.all([
                SPP.get('/api/reports?year=' + encodeURIComponent(year)),
                SPP.get('/api/practice-types').catch(() => null)
            ]);
            indicators = repRes.indicators || [];
            if (typesRes && typesRes.practiceTypes) {
                enrichSemesters(indicators, typesRes.practiceTypes);
            }
        } catch (err) {
            indicators = [];
            failure = (err && err.message) || 'The indicators could not be loaded.';
        }
        render();
    }

    async function generateAndSave() {
        if (busy) return;
        busy = true; failure = ''; notice = ''; render();
        try {
            const [result, typesRes] = await Promise.all([
                SPP.post('/api/reports/generate', { year }),
                SPP.get('/api/practice-types').catch(() => null)
            ]);
            indicators = result.indicators || [];
            if (typesRes && typesRes.practiceTypes) {
                enrichSemesters(indicators, typesRes.practiceTypes);
            }
            notice = 'Saved ' + plural(indicators.length, 'program', 'programs') + ' for ' + year + ' in MongoDB, with the complete information of the practices.';
            if (window.SPP_REPORTS) window.SPP_REPORTS.reload();
        } catch (err) {
            SPP.showError(err);
        } finally {
            busy = false; render();
        }
    }

    // ------------------------------------------------------------------ export
    const jsonOf = (i, sections) => {
        const out = { programId: i.programId, programName: i.programName, faculty: i.faculty, year: i.year, generatedAt: i.generatedAt, version: i.version };
        if (sections.has('programs')) Object.assign(out, { totalStudents: i.totalStudents, activeStudents: i.activeStudentsTotal, activeTutors: i.activeTutors, summary: i.summary, dropoutRate: i.dropoutRate, averagePracticeDurationDays: i.averagePracticeDurationDays });
        if (sections.has('types')) out.practicesByType = i.practicesByType;
        if (sections.has('grades')) out.gradeDistribution = i.gradeDistribution;
        if (sections.has('support')) out.teacherSupport = i.teacherSupport;
        if (sections.has('institutions')) out.partnerInstitutions = i.partnerInstitutions;
        if (sections.has('tutors')) out.tutors = i.tutors;
        if (sections.has('advisors')) out.advisors = i.advisors;
        if (sections.has('practices')) out.practices = i.practices;
        return out;
    };

    function openExport() {
        if (!indicators.length) return;
        K.openExport({
            title: 'Export accreditation data · ' + year,
            subtitle: 'Choose the programs and the information to include. Excel gives one sheet per item.',
            filters: [{ id: 'programs', label: 'Programs', options: indicators.map((i) => ({ value: i.programId, label: i.programName, hint: plural(practicesOf(i), 'practice', 'practices') })) }],
            sectionsLabel: 'Information to include',
            sections: Object.keys(DATASETS).map((key) => ({ id: key, label: DATASETS[key].title, hint: SECTION_HINTS[key] })),
            build: ({ sections, filters }) => {
                const chosen = indicators.filter((i) => filters.programs.has(i.programId));
                if (!chosen.length) throw new Error('Select at least one program.');
                const datasets = Object.keys(DATASETS).filter((key) => sections.has(key)).map((key) => dataset(key, chosen));
                const label = chosen.length === 1 ? chosen[0].programName : plural(chosen.length, 'program', 'programs');
                return {
                    datasets,
                    base: 'accreditation-' + year + (chosen.length === 1 ? '-' + chosen[0].programId : ''),
                    title: 'Accreditation indicators ' + year,
                    subtitle: label,
                    mode: 'tables',
                    json: { title: 'Accreditation indicators ' + year, year, generatedAt: new Date().toISOString(), programs: chosen.map((i) => jsonOf(i, sections)) }
                };
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!root()) return;
        render();
        load();
    });

    window.SPP_ACCREDITATION = { reload: load, datasets: DATASETS };
})();
