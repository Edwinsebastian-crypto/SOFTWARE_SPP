/* =========================================================================
   reports.js — The five tabs of "Reports and Statistics" (General, Types, Practice, Feedback, Institutions)
   plus the export hook of the Evaluations panel.

   Data: GET /api/reports/dashboard (computed from PostgreSQL on every request, nothing is hardcoded).
   Every card is built with SPP.reportKit (same look as the Evaluations dashboard) and registers its data, so the
   Director can export a whole tab, several tabs or only some cards (Excel / CSV / JSON / PDF).
   ========================================================================= */
(function () {
    'use strict';
    const SPP = window.SPP;
    const K = SPP.reportKit;
    const { h, icon, fmt, pct, plural, monthLabel, day } = K;

    const TABS = [
        { key: 'general', label: 'General', root: 'rp-general', header: 'rp-general-header' },
        { key: 'types', label: 'Types', root: 'rp-types', header: 'rp-types-header' },
        { key: 'practice', label: 'Practice', root: 'rp-practice', header: 'rp-practice-header' },
        { key: 'feedback', label: 'Feedback', root: 'rp-feedback', header: 'rp-feedback-header' },
        { key: 'institutions', label: 'Institutions', root: 'rp-institutions', header: 'rp-institutions-header' }
    ];

    let dashboard = null;
    let loading = false;

    const sum = (list, pick) => list.reduce((total, item) => total + (Number(pick(item)) || 0), 0);
    const share = (part, total) => (total ? Math.round((1000 * part) / total) / 10 : 0);
    /** Colour of a bar by a 0-100 value (same thresholds as the "acierto" bars of Evaluations). */
    const level = (value) => (value >= 70 ? 'dv-fill--good' : value >= 40 ? 'dv-fill--mid' : 'dv-fill--low');
    const gradeLevel = (grade) => (grade >= 4 ? 'dv-fill--good' : grade >= 3 ? 'dv-fill--mid' : 'dv-fill--low');
    const STATUS = {
        active: { label: 'Active', cls: 'dv-s1' },
        completed: { label: 'Completed', cls: 'dv-s3' },
        cancelled: { label: 'Cancelled', cls: 'dv-s2' }
    };

    const practiceTable = [
        { key: 'code', label: 'Practice ID' },
        { key: 'student', label: 'Student' },
        { key: 'institution', label: 'Institution' }
    ];

    const grid = (...cards) => h('div', { class: 'dv-grid' }, cards);

    // ------------------------------------------------------------------ GENERAL
    function renderGeneral(d) {
        const T = 'general';
        const g = d.general;
        const nodes = [];
        nodes.push(K.kpis(T, 'kpis', 'Key figures', [
            { icon: 'fa-solid fa-copy', value: fmt(g.totalPractices), raw: g.totalPractices, label: 'Total practices', sub: plural(g.students, 'student', 'students') + ' · ' + plural(g.tutors, 'tutor', 'tutors') },
            { icon: 'fa-solid fa-file-circle-check', value: fmt(g.activePractices), raw: g.activePractices, label: 'Active', sub: pct(share(g.activePractices, g.totalPractices)) + ' of the practices' },
            { icon: 'fa-solid fa-flag-checkered', value: fmt(g.completedPractices), raw: g.completedPractices, label: 'Completed', sub: pct(share(g.completedPractices, g.totalPractices)) + ' of the practices' },
            { icon: 'fa-solid fa-ban', value: fmt(g.cancelledPractices), raw: g.cancelledPractices, label: 'Cancelled', sub: pct(share(g.cancelledPractices, g.totalPractices)) + ' dropout rate' },
            { icon: 'fa-solid fa-chart-simple', value: g.gradedPractices ? fmt(g.averageGrade, 2) : '—', raw: g.averageGrade, label: 'Average final grade', sub: plural(g.gradedPractices, 'graded practice', 'graded practices') + ' · scale 0 – 5' },
            { icon: 'fa-solid fa-circle-check', value: g.gradedPractices ? pct(g.approvalRate) : '—', raw: g.approvalRate, label: 'Approval rate', sub: 'Final grade of 3.0 or higher' },
            { icon: 'fa-regular fa-clock', value: fmt(g.loggedHours), raw: g.loggedHours, label: 'Hours logged', sub: pct(g.hoursCompletion) + ' of ' + fmt(g.requiredHours) + ' required' },
            { icon: 'fa-solid fa-building-columns', value: fmt(g.institutions), raw: g.institutions, label: 'Institutions with practices', sub: plural(g.advisors, 'advisor', 'advisors') + ' involved' }
        ]));

        const statusRows = g.statusBreakdown.map((s) => ({ status: s.label, practices: s.count, share: s.percent }));
        const byLabel = { Active: STATUS.active, Completed: STATUS.completed, Cancelled: STATUS.cancelled };
        const statusCard = K.card(T, {
            id: 'status', title: 'Practice status', columns: [{ key: 'status', label: 'Status' }, { key: 'practices', label: 'Practices', num: true }, { key: 'share', label: 'Share (%)', num: true, decimals: 1 }], rows: statusRows
        }, {
            sub: 'How the practices are distributed right now.',
            chart: K.stack(g.statusBreakdown.map((s) => ({ label: s.label, value: s.count, cls: (byLabel[s.label] || STATUS.active).cls })), { empty: 'There are no practices registered yet.' })
        });

        // grades: from lowest to highest, with the pass line before 3.0
        const order = ['Below 3.0', '3.0 - 3.9', '4.0 - 5.0', 'Not graded'];
        const bands = order.map((label) => g.gradeBands.find((b) => b.label === label) || { label, count: 0 });
        const gradeCard = K.card(T, {
            id: 'grades', title: 'Final grades', columns: [{ key: 'range', label: 'Range' }, { key: 'practices', label: 'Practices', num: true }], rows: bands.map((b) => ({ range: b.label, practices: b.count }))
        }, {
            sub: 'Practices by final grade.',
            chart: K.columns(bands.map((b) => b.label.replace(' - ', ' – ')), [{ name: 'Practices', cls: 'dv-s1', values: bands.map((b) => b.count) }], { passBefore: 1, empty: 'There are no practices registered yet.' }),
            note: 'The dashed line marks the minimum grade to pass (3.0).'
        });

        const monthCard = K.card(T, {
            id: 'monthly', title: 'Practices started per month', columns: [{ key: 'month', label: 'Month' }, { key: 'practices', label: 'Practices', num: true }], rows: g.byMonth.map((m) => ({ month: m.month, practices: m.count }))
        }, {
            wide: true, sub: 'Last 12 months, by start date.',
            chart: K.columns(g.byMonth.map((m) => monthLabel(m.month)), [{ name: 'Practices started', cls: 'dv-s1', values: g.byMonth.map((m) => m.count) }], { tight: true, empty: 'No practice started in the last 12 months.' })
        });

        const programCard = K.card(T, {
            id: 'programs', title: 'Practices by program', columns: [{ key: 'program', label: 'Program' }, { key: 'practices', label: 'Practices', num: true }], rows: g.byProgram.map((p) => ({ program: p.name, practices: p.count }))
        }, { sub: 'Program of the student.', chart: K.hbars(g.byProgram.map((p) => ({ label: p.name, value: p.count, text: fmt(p.count) })), { empty: 'There are no practices registered yet.' }) });

        const institutionCard = K.card(T, {
            id: 'institutions', title: 'Top institutions', columns: [{ key: 'institution', label: 'Institution' }, { key: 'practices', label: 'Practices', num: true }], rows: g.topInstitutions.map((p) => ({ institution: p.name, practices: p.count }))
        }, { sub: 'Institutions that host the most practices.', chart: K.hbars(g.topInstitutions.map((p) => ({ label: p.name, value: p.count, text: fmt(p.count) })), { empty: 'There are no practices registered yet.' }) });

        const tutorCard = K.card(T, {
            id: 'tutors', title: 'Top tutors', columns: [{ key: 'tutor', label: 'Tutor' }, { key: 'practices', label: 'Practices', num: true }], rows: g.topTutors.map((p) => ({ tutor: p.name || 'Unassigned', practices: p.count }))
        }, { sub: 'Tutors with the most practices assigned.', chart: K.hbars(g.topTutors.map((p) => ({ label: p.name || 'Unassigned', value: p.count, text: fmt(p.count) })), { empty: 'There are no tutors assigned to practices yet.' }) });

        nodes.push(grid(statusCard, gradeCard, monthCard, programCard, institutionCard, tutorCard));
        return nodes;
    }

    // ------------------------------------------------------------------ TYPES
    function renderTypes(d) {
        const T = 'types';
        const types = d.types;
        const totalPractices = sum(types, (t) => t.practices);
        const graded = types.filter((t) => t.averageGrade > 0);
        const top = types[0];
        const best = graded.slice().sort((a, b) => b.averageGrade - a.averageGrade)[0];
        const lowest = types.filter((t) => t.approvalRate > 0 || t.averageGrade > 0).sort((a, b) => a.approvalRate - b.approvalRate)[0];
        const nodes = [K.kpis(T, 'kpis', 'Key figures', [
            { icon: 'fa-solid fa-layer-group', value: fmt(types.length), raw: types.length, label: 'Practice types in use', sub: plural(totalPractices, 'practice', 'practices') + ' in total' },
            { icon: 'fa-solid fa-ranking-star', value: top ? top.name : '—', raw: top ? top.name : '', label: 'Most used type', sub: top ? plural(top.practices, 'practice', 'practices') + ' · ' + pct(top.percent) + ' of the total' : 'No practices yet.' },
            { icon: 'fa-solid fa-star', value: best ? fmt(best.averageGrade, 2) : '—', raw: best ? best.averageGrade : null, label: 'Highest average grade', sub: best ? best.name : 'No graded practices yet.' },
            { icon: 'fa-solid fa-triangle-exclamation', value: lowest ? pct(lowest.approvalRate) : '—', raw: lowest ? lowest.approvalRate : null, label: 'Lowest approval rate', sub: lowest ? lowest.name : 'No graded practices yet.', attn: Boolean(lowest && lowest.approvalRate < 70) }
        ])];

        const participation = K.card(T, {
            id: 'participation', title: 'Participation by type',
            columns: [{ key: 'type', label: 'Practice type' }, { key: 'students', label: 'Students', num: true }, { key: 'practices', label: 'Practices', num: true }, { key: 'percent', label: '% of practices', num: true, decimals: 1 }],
            rows: types.map((t) => ({ type: t.name, students: t.students, practices: t.practices, percent: t.percent }))
        }, { sub: 'Students enrolled in each practice type and its share of all practices.', chart: K.hbars(types.map((t) => ({ label: t.name, value: t.students, text: fmt(t.students) + ' · ' + pct(t.percent) })), { empty: 'There are no practice types with practices yet.' }) });

        const parts = (t) => [{ label: STATUS.active.label, value: t.active, cls: STATUS.active.cls }, { label: STATUS.completed.label, value: t.completed, cls: STATUS.completed.cls }, { label: STATUS.cancelled.label, value: t.cancelled, cls: STATUS.cancelled.cls }];
        const statusChart = types.length ? h('div', { class: 'rp-strows' },
            h('div', { class: 'dv-legend rp-legend-top' }, Object.values(STATUS).map((s) => h('span', {}, h('i', { class: 'dv-key ' + s.cls }), s.label))),
            types.map((t) => h('div', { class: 'rp-strow' }, h('span', { class: 'dv-hrow-label', title: t.name }, t.name), K.stack(parts(t), { legend: false }), h('span', { class: 'dv-hrow-val' }, fmt(t.practices))))) : K.empty('There are no practice types with practices yet.');
        const statusCard = K.card(T, {
            id: 'status', title: 'Status by type',
            columns: [{ key: 'type', label: 'Practice type' }, { key: 'active', label: 'Active', num: true }, { key: 'completed', label: 'Completed', num: true }, { key: 'cancelled', label: 'Cancelled', num: true }],
            rows: types.map((t) => ({ type: t.name, active: t.active, completed: t.completed, cancelled: t.cancelled }))
        }, { sub: 'Active, completed and cancelled practices of each type.', chart: statusChart });

        const gradeCard = K.card(T, {
            id: 'grade', title: 'Average grade by type',
            columns: [{ key: 'type', label: 'Practice type' }, { key: 'average', label: 'Average grade', num: true, decimals: 2 }],
            rows: types.map((t) => ({ type: t.name, average: t.averageGrade || null }))
        }, { sub: 'Only graded practices (scale 0 – 5).', chart: K.hbars(types.filter((t) => t.averageGrade > 0).map((t) => ({ label: t.name, value: t.averageGrade, text: fmt(t.averageGrade, 2), cls: gradeLevel(t.averageGrade) })), { max: 5, empty: 'No graded practices yet.' }) });

        const approvalCard = K.card(T, {
            id: 'approval', title: 'Approval rate by type',
            columns: [{ key: 'type', label: 'Practice type' }, { key: 'rate', label: 'Approval rate (%)', num: true, decimals: 1 }],
            rows: types.map((t) => ({ type: t.name, rate: t.averageGrade > 0 ? t.approvalRate : null }))
        }, { sub: 'Graded practices with a final grade of 3.0 or higher.', chart: K.hbars(types.filter((t) => t.averageGrade > 0).map((t) => ({ label: t.name, value: t.approvalRate, text: pct(t.approvalRate), cls: level(t.approvalRate) })), { max: 100, empty: 'No graded practices yet.' }) });

        const summaryColumns = [
            { key: 'type', label: 'Practice type' }, { key: 'semester', label: 'Semester', num: true }, { key: 'requiredHours', label: 'Required hours', num: true },
            { key: 'practices', label: 'Practices', num: true }, { key: 'students', label: 'Students', num: true }, { key: 'percent', label: '% of practices', num: true, decimals: 1 },
            { key: 'active', label: 'Active', num: true }, { key: 'completed', label: 'Completed', num: true }, { key: 'cancelled', label: 'Cancelled', num: true },
            { key: 'averageGrade', label: 'Average grade', num: true, decimals: 2 }, { key: 'approvalRate', label: 'Approval rate (%)', num: true, decimals: 1 }
        ];
        const summaryRows = types.map((t) => ({
            type: t.name, semester: t.semester, requiredHours: t.requiredHours, practices: t.practices, students: t.students, percent: t.percent,
            active: t.active, completed: t.completed, cancelled: t.cancelled, averageGrade: t.averageGrade || null, approvalRate: t.averageGrade > 0 ? t.approvalRate : null
        }));
        const summaryCard = K.card(T, { id: 'summary', title: 'Summary table', columns: summaryColumns, rows: summaryRows },
            { wide: true, sub: 'Everything about each practice type in one table.', noTable: true, chart: K.table(summaryColumns, summaryRows, { empty: 'There are no practice types with practices yet.' }) });

        nodes.push(grid(participation, statusCard, gradeCard, approvalCard, summaryCard));
        return nodes;
    }

    // ------------------------------------------------------------------ PRACTICE
    function renderPractice(d) {
        const T = 'practice';
        const p = d.practice;
        const a = p.activities;
        const nodes = [K.kpis(T, 'kpis', 'Key figures', [
            { icon: 'fa-regular fa-file-lines', value: fmt(p.total), raw: p.total, label: 'Total practices', sub: plural(p.totalStudents, 'student teacher', 'student teachers') },
            { icon: 'fa-solid fa-triangle-exclamation', value: fmt(p.withoutEvidence), raw: p.withoutEvidence, label: 'Without evidence', sub: p.withoutEvidence ? 'No evidence uploaded yet.' : 'Every practice has evidence.', attn: p.withoutEvidence > 0 },
            { icon: 'fa-solid fa-list-check', value: fmt(a.total), raw: a.total, label: 'Activities', sub: plural(a.graded, 'graded activity', 'graded activities') },
            { icon: 'fa-regular fa-clock', value: pct(p.hours.percent), raw: p.hours.percent, label: 'Hours completed', sub: fmt(p.hours.logged) + ' of ' + fmt(p.hours.required) + ' required hours' },
            { icon: 'fa-regular fa-calendar', value: fmt(p.endingSoon.length), raw: p.endingSoon.length, label: 'Ending in 30 days', sub: p.endingSoon.length ? 'Active practices close to their end date.' : 'None.' },
            { icon: 'fa-solid fa-calendar-xmark', value: fmt(p.overdue.length), raw: p.overdue.length, label: 'Past their end date', sub: p.overdue.length ? 'Still active after the end date.' : 'None.', attn: p.overdue.length > 0 }
        ])];

        const statusCard = K.card(T, {
            id: 'status', title: 'Logbook status', columns: [{ key: 'status', label: 'Status' }, { key: 'practices', label: 'Practices', num: true }, { key: 'share', label: 'Share (%)', num: true, decimals: 1 }],
            rows: p.status.map((s) => ({ status: s.label, practices: s.count, share: s.percent }))
        }, { sub: 'Active logbooks versus closed ones (completed or cancelled).', chart: K.stack(p.status.map((s, i) => ({ label: s.label, value: s.count, cls: i === 0 ? 'dv-s1' : 'dv-s3' })), { empty: 'There are no practices registered yet.' }) });

        const activityParts = [
            { label: 'Graded', value: a.graded, cls: 'dv-s3' },
            { label: 'With tutor feedback', value: a.completed, cls: 'dv-s1' },
            { label: 'Evidence awaiting feedback', value: a.pendingReview, cls: 'dv-s2' },
            { label: 'No evidence yet', value: a.pending, cls: 'rp-s4' }
        ];
        const activitiesCard = K.card(T, {
            id: 'activities', title: 'Activities progress', columns: [{ key: 'state', label: 'State' }, { key: 'activities', label: 'Activities', num: true }],
            rows: activityParts.map((s) => ({ state: s.label, activities: s.value }))
        }, { sub: 'Where each activity of the logbooks currently stands.', chart: K.stack(activityParts, { empty: 'There are no activities yet.' }), note: a.graded ? 'Average grade of the graded activities: ' + fmt(a.averageGrade, 2) + ' / 5.0.' : null });

        const hoursCard = K.card(T, {
            id: 'hours', title: 'Hours', columns: [{ key: 'concept', label: 'Concept' }, { key: 'hours', label: 'Hours', num: true }],
            rows: [{ concept: 'Required', hours: p.hours.required }, { concept: 'Logged', hours: p.hours.logged }, { concept: 'Completion (%)', hours: p.hours.percent }]
        }, {
            sub: 'Hours registered in the evidence versus the hours the practice types require.',
            chart: K.hbars([{ label: 'Required', value: p.hours.required, text: fmt(p.hours.required) + ' h' }, { label: 'Logged', value: p.hours.logged, text: fmt(p.hours.logged) + ' h · ' + pct(p.hours.percent), cls: 'dv-fill--good' }], { max: Math.max(p.hours.required, p.hours.logged, 1) }),
            note: 'Cancelled practices are not counted.'
        });

        const progressCard = K.card(T, {
            id: 'progress', title: 'Lowest hours progress', columns: [{ key: 'code', label: 'Practice ID' }, { key: 'student', label: 'Student' }, { key: 'logged', label: 'Logged h', num: true }, { key: 'required', label: 'Required h', num: true }, { key: 'percent', label: 'Progress (%)', num: true }],
            rows: p.lowestProgress
        }, { sub: 'Active practices that are further behind (top 10).', chart: K.hbars(p.lowestProgress.map((r) => ({ label: r.student + ' · ' + r.code, value: r.percent, text: pct(r.percent, 0) + ' · ' + fmt(r.logged) + '/' + fmt(r.required) + ' h', cls: level(r.percent) })), { max: 100, empty: 'There are no active practices.' }) });

        const endingCols = [{ key: 'code', label: 'Practice ID' }, { key: 'student', label: 'Student' }, { key: 'institution', label: 'Institution' }, { key: 'endDate', label: 'End date', render: (v) => day(v) }];
        const endingCard = K.card(T, {
            id: 'ending', title: 'Ending in the next 30 days', columns: endingCols.concat([{ key: 'daysLeft', label: 'Days left', num: true }]), rows: p.endingSoon
        }, { wide: true, noTable: true, sub: 'Active practices whose end date is within a month.', chart: K.table(endingCols.concat([{ key: 'daysLeft', label: 'Days left', num: true }]), p.endingSoon, { empty: 'No active practice ends within the next 30 days.' }) });

        const overdueCols = endingCols.concat([{ key: 'daysOverdue', label: 'Days overdue', num: true }]);
        const overdueCard = K.card(T, { id: 'overdue', title: 'Past their end date', columns: overdueCols, rows: p.overdue },
            { wide: true, noTable: true, sub: 'Practices that are still active after their end date.', chart: K.table(overdueCols, p.overdue, { empty: 'No active practice is past its end date.' }) });

        const noEvidenceCard = K.card(T, { id: 'noEvidence', title: 'Practices without evidence', columns: practiceTable, rows: p.withoutEvidenceList },
            { wide: true, noTable: true, sub: 'No evidence has been uploaded to any activity (up to 100 most recent).', chart: K.table(practiceTable, p.withoutEvidenceList, { empty: 'Every practice already has evidence uploaded.' }) });

        nodes.push(grid(statusCard, activitiesCard, hoursCard, progressCard, endingCard, overdueCard, noEvidenceCard));
        return nodes;
    }

    // ------------------------------------------------------------------ FEEDBACK
    function renderFeedback(d) {
        const T = 'feedback';
        const f = d.feedback;
        const total = d.practice.total;
        const nodes = [K.kpis(T, 'kpis', 'Key figures', [
            { icon: 'fa-solid fa-comments', value: fmt(f.tutorFeedback), raw: f.tutorFeedback, label: 'Tutor feedback', sub: 'Comments written by academic tutors.' },
            { icon: 'fa-solid fa-comment-dots', value: fmt(f.advisorFeedback), raw: f.advisorFeedback, label: 'Advisor feedback', sub: 'Comments written by pedagogical advisors.' },
            { icon: 'fa-solid fa-clipboard-check', value: pct(f.evidence.reviewedPercent), raw: f.evidence.reviewedPercent, label: 'Evidence with feedback', sub: fmt(f.evidence.total - f.evidence.none) + ' of ' + fmt(f.evidence.total) + ' evidence items' },
            { icon: 'fa-solid fa-scale-balanced', value: total ? fmt((f.tutorFeedback + f.advisorFeedback) / total, 1) : '—', raw: total ? Math.round(10 * (f.tutorFeedback + f.advisorFeedback) / total) / 10 : null, label: 'Feedback per practice', sub: 'Tutor and advisor comments together.' },
            { icon: 'fa-solid fa-triangle-exclamation', value: fmt(f.practicesWithoutTutorFeedback), raw: f.practicesWithoutTutorFeedback, label: 'Without tutor feedback', sub: pct(share(f.practicesWithoutTutorFeedback, total), 0) + ' of the practices', attn: f.practicesWithoutTutorFeedback > 0 },
            { icon: 'fa-solid fa-triangle-exclamation', value: fmt(f.practicesWithoutAdvisorFeedback), raw: f.practicesWithoutAdvisorFeedback, label: 'Without advisor feedback', sub: pct(share(f.practicesWithoutAdvisorFeedback, total), 0) + ' of the practices', attn: f.practicesWithoutAdvisorFeedback > 0 }
        ])];

        const monthCard = K.card(T, {
            id: 'monthly', title: 'Feedback per month', columns: [{ key: 'month', label: 'Month' }, { key: 'tutor', label: 'Tutor', num: true }, { key: 'advisor', label: 'Advisor', num: true }], rows: f.byMonth
        }, {
            wide: true, sub: 'Comments written in the last 12 months.',
            chart: K.columns(f.byMonth.map((m) => monthLabel(m.month)), [{ name: 'Tutor', cls: 'dv-s1', values: f.byMonth.map((m) => m.tutor) }, { name: 'Advisor', cls: 'dv-s2', values: f.byMonth.map((m) => m.advisor) }], { tight: true, legend: true, empty: 'No feedback was written in the last 12 months.' })
        });

        const e = f.evidence;
        const coverageParts = [
            { label: 'Tutor and advisor', value: e.both, cls: 'dv-s3' }, { label: 'Tutor only', value: e.tutorOnly, cls: 'dv-s1' },
            { label: 'Advisor only', value: e.advisorOnly, cls: 'dv-s2' }, { label: 'No feedback', value: e.none, cls: 'rp-s4' }
        ];
        const coverageCard = K.card(T, {
            id: 'coverage', title: 'Evidence coverage', columns: [{ key: 'feedback', label: 'Feedback received' }, { key: 'evidence', label: 'Evidence items', num: true }],
            rows: coverageParts.map((s) => ({ feedback: s.label, evidence: s.value }))
        }, { sub: 'Who has already commented on each evidence item.', chart: K.stack(coverageParts, { empty: 'There is no evidence uploaded yet.' }) });

        const rank = (list, none) => K.hbars(list.map((r) => ({ label: r.name, value: r.count, text: fmt(r.count) })), { empty: none });
        const tutorsCard = K.card(T, { id: 'tutors', title: 'Most active tutors', columns: [{ key: 'tutor', label: 'Tutor' }, { key: 'feedback', label: 'Feedback', num: true }], rows: f.topTutors.map((r) => ({ tutor: r.name, feedback: r.count })) },
            { sub: 'Tutors with the most comments (top 5).', chart: rank(f.topTutors, 'There is no tutor feedback yet.') });
        const advisorsCard = K.card(T, { id: 'advisors', title: 'Most active advisors', columns: [{ key: 'advisor', label: 'Advisor' }, { key: 'feedback', label: 'Feedback', num: true }], rows: f.topAdvisors.map((r) => ({ advisor: r.name, feedback: r.count })) },
            { sub: 'Advisors with the most comments (top 5).', chart: rank(f.topAdvisors, 'There is no advisor feedback yet.') });

        const noTutor = K.card(T, { id: 'noTutor', title: 'Practices without tutor feedback', columns: practiceTable, rows: f.withoutTutorFeedbackList },
            { wide: true, noTable: true, sub: 'No tutor comment on any evidence (up to 100 most recent).', chart: K.table(practiceTable, f.withoutTutorFeedbackList, { empty: 'Every practice already has tutor feedback.' }) });
        const noAdvisor = K.card(T, { id: 'noAdvisor', title: 'Practices without advisor feedback', columns: practiceTable, rows: f.withoutAdvisorFeedbackList },
            { wide: true, noTable: true, sub: 'No advisor comment on any evidence (up to 100 most recent).', chart: K.table(practiceTable, f.withoutAdvisorFeedbackList, { empty: 'Every practice already has advisor feedback.' }) });

        nodes.push(grid(monthCard, coverageCard, tutorsCard, advisorsCard, noTutor, noAdvisor));
        return nodes;
    }

    // ------------------------------------------------------------------ INSTITUTIONS
    function renderInstitutions(d) {
        const T = 'institutions';
        const i = d.institutions;
        const details = i.details;
        const nodes = [K.kpis(T, 'kpis', 'Key figures', [
            { icon: 'fa-solid fa-building-columns', value: fmt(i.total), raw: i.total, label: 'Institutions registered', sub: plural(i.withPractices, 'institution', 'institutions') + ' with practices' },
            { icon: 'fa-solid fa-user-graduate', value: fmt(i.withActiveStudents), raw: i.withActiveStudents, label: 'With active student teachers', sub: 'At least one active practice.' },
            { icon: 'fa-solid fa-flag-checkered', value: fmt(i.completedOnly), raw: i.completedOnly, label: 'Only completed practices', sub: 'No active practice right now.' },
            { icon: 'fa-solid fa-people-group', value: fmt(i.totalStudents), raw: i.totalStudents, label: 'Student teachers hosted', sub: 'Distinct students with a practice.' }
        ])];

        const distribution = K.card(T, {
            id: 'distribution', title: 'Student teachers per institution', columns: [{ key: 'institution', label: 'Institution' }, { key: 'students', label: 'Student teachers', num: true }], rows: i.distribution.map((r) => ({ institution: r.name, students: r.count }))
        }, { sub: 'Institutions that host the most student teachers.', chart: K.hbars(i.distribution.slice(0, 10).map((r) => ({ label: r.name, value: r.count, text: fmt(r.count) })), { empty: 'There are no institutions with practices yet.' }), note: i.distribution.length > 10 ? 'Top 10 shown. The table lists all of them.' : null });

        const parts = (r) => [
            { label: 'Active', value: r.activePractices, cls: STATUS.active.cls }, { label: 'Completed', value: r.completedPractices, cls: STATUS.completed.cls },
            { label: 'Cancelled', value: Math.max(0, r.practices - r.activePractices - r.completedPractices), cls: STATUS.cancelled.cls }
        ];
        const statusChart = details.length ? h('div', { class: 'rp-strows' },
            h('div', { class: 'dv-legend rp-legend-top' }, Object.values(STATUS).map((s) => h('span', {}, h('i', { class: 'dv-key ' + s.cls }), s.label))),
            details.slice(0, 10).map((r) => h('div', { class: 'rp-strow' }, h('span', { class: 'dv-hrow-label', title: r.institution }, r.institution), K.stack(parts(r), { legend: false }), h('span', { class: 'dv-hrow-val' }, fmt(r.practices))))) : K.empty('There are no institutions with practices yet.');
        const statusCard = K.card(T, {
            id: 'status', title: 'Practices by status', columns: [{ key: 'institution', label: 'Institution' }, { key: 'active', label: 'Active', num: true }, { key: 'completed', label: 'Completed', num: true }, { key: 'cancelled', label: 'Cancelled', num: true }],
            rows: details.map((r) => { const [a, c, x] = parts(r); return { institution: r.institution, active: a.value, completed: c.value, cancelled: x.value }; })
        }, { sub: 'Active, completed and cancelled practices of each institution.', chart: statusChart });

        const graded = details.filter((r) => r.averageGrade > 0);
        const gradeCard = K.card(T, {
            id: 'grade', title: 'Average grade by institution', columns: [{ key: 'institution', label: 'Institution' }, { key: 'average', label: 'Average grade', num: true, decimals: 2 }], rows: details.map((r) => ({ institution: r.institution, average: r.averageGrade || null }))
        }, { sub: 'Only graded practices (scale 0 – 5).', chart: K.hbars(graded.slice(0, 10).map((r) => ({ label: r.institution, value: r.averageGrade, text: fmt(r.averageGrade, 2), cls: gradeLevel(r.averageGrade) })), { max: 5, empty: 'No graded practices yet.' }) });

        const detailColumns = [
            { key: 'institution', label: 'Institution' }, { key: 'taxId', label: 'Tax ID (NIT)' }, { key: 'address', label: 'Address' }, { key: 'manager', label: 'Manager' }, { key: 'email', label: 'Email' },
            { key: 'students', label: 'Student teachers', num: true }, { key: 'practices', label: 'Practices', num: true }, { key: 'activeStudents', label: 'Active student teachers', num: true },
            { key: 'completedStudents', label: 'Completed student teachers', num: true }, { key: 'averageGrade', label: 'Average grade', num: true, decimals: 2 }
        ];
        const detailRows = details.map((r) => Object.assign({}, r, { averageGrade: r.averageGrade || null }));
        const detailCard = K.card(T, { id: 'details', title: 'Institution details', columns: detailColumns, rows: detailRows },
            { wide: true, noTable: true, sub: 'Contact data and activity of every institution with practices.', chart: K.table(detailColumns, detailRows, { empty: 'There are no institutions with practices yet.' }) });

        nodes.push(grid(distribution, statusCard, gradeCard, detailCard));
        return nodes;
    }

    const RENDERERS = { general: renderGeneral, types: renderTypes, practice: renderPractice, feedback: renderFeedback, institutions: renderInstitutions };

    // ------------------------------------------------------------------ export dialog of the five tabs
    function exportTabs(currentKey) {
        const ordered = TABS.slice().sort((a, b) => (a.key === currentKey ? -1 : b.key === currentKey ? 1 : 0));
        const sections = [];
        ordered.forEach((tab) => {
            const entry = K.registry.get(tab.key);
            if (!entry) return;
            entry.datasets.forEach((ds) => sections.push({ id: tab.key + ':' + ds.id, label: ds.title, group: tab.label + (tab.key === currentKey ? ' (this tab)' : ''), checked: tab.key === currentKey }));
        });
        const current = TABS.find((t) => t.key === currentKey);
        K.openExport({
            title: 'Export reports',
            subtitle: 'Choose the information you need. You can include other tabs too.',
            sections,
            build: ({ sections: selected }) => {
                const datasets = [];
                TABS.forEach((tab) => {
                    const entry = K.registry.get(tab.key);
                    if (!entry) return;
                    entry.datasets.forEach((ds) => {
                        if (selected.has(tab.key + ':' + ds.id)) datasets.push(Object.assign({}, ds, { id: tab.key + '-' + ds.id, title: tab.label + ' · ' + ds.title }));
                    });
                });
                const tabsUsed = new Set([...selected].map((s) => s.split(':')[0]));
                const only = tabsUsed.size === 1 ? current && tabsUsed.has(current.key) ? current : TABS.find((t) => tabsUsed.has(t.key)) : null;
                return {
                    datasets,
                    base: only ? 'reports-' + only.key : 'reports',
                    title: only ? 'Reports · ' + only.label : 'Reports',
                    subtitle: 'Reports and Statistics',
                    mode: 'panel',
                    json: { title: only ? 'Reports · ' + only.label : 'Reports', generatedAt: new Date().toISOString(), data: K.datasetsToJson(datasets.map((d) => Object.assign({}, d, { columns: d.columns }))) }
                };
            }
        });
    }

    // ------------------------------------------------------------------ rendering
    const TAB_META = {
        general: {
            title: 'General',
            sub: 'Overview of the status and indicators of professional practices.',
            glossary: [
                ['Total de prácticas', 'Cantidad acumulada de prácticas profesionales registradas en el sistema.'],
                ['Tasa de aprobación', 'Porcentaje de prácticas con nota final de 60 % o más (3,0 sobre 5,0).'],
                ['Horas registradas', 'Horas totales de actividades y bitácoras reportadas frente a las horas requeridas.'],
                ['Promedio final', 'Calificación promedio obtenida en las prácticas ya calificadas y finalizadas.'],
                ['Distribución de estados', 'Prácticas clasificadas en Activas (en curso), Completadas o Canceladas.'],
                ['Instituciones vinculadas', 'Empresas y centros educativos con convenios vigentes y practicantes asignados.']
            ]
        },
        types: {
            title: 'Types',
            sub: 'Distribution, hours compliance and performance across practice types.',
            glossary: [
                ['Tipos de práctica', 'Modalidades curriculares autorizadas para el desarrollo de la práctica profesional.'],
                ['Horas requeridas', 'Cantidad mínima reglamentaria de horas a cumplir para cada modalidad.'],
                ['Distribución de estudiantes', 'Proporción de practicantes inscritos en cada tipo respecto al total del programa.'],
                ['Cumplimiento de horas', 'Porcentaje promedio de horas ejecutadas sobre las horas estipuladas.'],
                ['Rendimiento académico', 'Promedio de notas finales y porcentaje de aprobación por modalidad de práctica.']
            ]
        },
        practice: {
            title: 'Practice',
            sub: 'Detailed tracking of students, hours, academic progress and tutors.',
            glossary: [
                ['Identificador de práctica', 'Código único de seguimiento asignado a cada práctica profesional.'],
                ['Horas válidas', 'Horas reportadas en bitácoras que ya cuentan con el visto bueno del tutor asignado.'],
                ['Porcentaje de avance', 'Progreso horario acumulado en relación con la meta total establecida.'],
                ['Nota definitiva', 'Calificación final asignada al consolidar las evaluaciones y el desempeño en la práctica.'],
                ['Estado de la práctica', 'Indica si la práctica está Activa (en desarrollo), Completada o Cancelada.']
            ]
        },
        feedback: {
            title: 'Feedback',
            sub: 'Monitoring of tutor observations, evaluation comments and response times.',
            glossary: [
                ['Retroalimentaciones', 'Comentarios y orientaciones pedagógicas emitidas por los tutores en las entregas.'],
                ['Tiempo medio de respuesta', 'Días promedio que tarda el tutor en responder y retroalimentar una actividad enviada.'],
                ['Revisiones pendientes', 'Entregas o bitácoras enviadas por el practicante que aún esperan comentarios.'],
                ['Acompañamiento docente', 'Frecuencia y oportunidad de la orientación cualitativa ofrecida por los tutores.']
            ]
        },
        institutions: {
            title: 'Institutions',
            sub: 'Partner entities, convention coverage and student placement statistics.',
            glossary: [
                ['Institución receptora', 'Organización, empresa o colegio formalmente registrado donde se realiza la práctica.'],
                ['Capacidad y asignación', 'Total de prácticas profesionales activas e históricas albergadas en cada institución.'],
                ['Asesores institucionales', 'Profesionales designados por la entidad receptora para coordinar el trabajo en sede.'],
                ['Tasa de éxito institucional', 'Desempeño promedio y porcentaje de aprobación de estudiantes por entidad.']
            ]
        }
    };

    function paintHeader(key, updated) {
        const tab = TABS.find((t) => t.key === key);
        if (!tab || !tab.header) return;
        const headContainer = document.getElementById(tab.header);
        if (!headContainer) return;

        const existingUpdated = headContainer.querySelector('.rp-updated');
        if (existingUpdated && headContainer.querySelector('.dv-head')) {
            if (updated) {
                const formatted = (typeof EvalUI !== 'undefined' && typeof EvalUI.fecha === 'function')
                    ? EvalUI.fecha(updated)
                    : K.dateTime(updated);
                existingUpdated.textContent = 'Actualizado ' + formatted + '.';
            }
            return;
        }

        const meta = TAB_META[key] || { title: tab.label, sub: '', glossary: [] };
        const toolbarNode = K.toolbar({
            title: meta.title,
            sub: meta.sub,
            glossary: meta.glossary,
            updated: updated,
            onRefresh: (button) => reload(button),
            onExport: () => exportTabs(key)
        });
        K.clear(headContainer).append(toolbarNode);
    }

    function showLoadingState() {
        // Ensure all tab headers are rendered and visible
        TABS.forEach((tab) => {
            paintHeader(tab.key, dashboard ? dashboard.generatedAt : null);
        });

        // Hide accreditation toolbar while loading
        const acc = document.getElementById('rep-accreditation-toolbar');
        if (acc) acc.style.display = 'none';

        // Clear each tab content root and show ONLY Cargando...
        TABS.forEach((tab) => {
            const root = document.getElementById(tab.root);
            if (root) {
                K.clear(root).append(h('p', { class: 'ev-loading' }, 'Cargando…'));
            }
        });
    }

    function paint(key) {
        const tab = TABS.find((t) => t.key === key);
        const root = document.getElementById(tab.root);
        if (!root) return;
        K.resetTab(key, tab.label);
        let body;
        try {
            body = RENDERERS[key](dashboard);
        } catch (err) {
            console.error('[reports] could not draw ' + key, err);
            body = [K.empty('This tab could not be drawn: ' + err.message, 'fa-solid fa-plug-circle-exclamation')];
        }

        // Update header with fresh generated date
        paintHeader(key, dashboard.generatedAt);

        // Restore accreditation toolbar if on General tab
        if (key === 'general') {
            const acc = document.getElementById('rep-accreditation-toolbar');
            if (acc) acc.style.display = '';
        }

        K.clear(root).append(...body);
    }

    function showMessage(node) {
        TABS.forEach((tab) => {
            const root = document.getElementById(tab.root);
            if (root) K.clear(root).append(node.cloneNode(true));
        });
    }

    async function reload(button) {
        if (loading) return;
        loading = true;

        if (button) {
            button.disabled = true;
            button.classList.add('is-busy');
        }
        document.body.classList.add('is-loading-wait');
        showLoadingState();

        try {
            if (window.SPP_ACCREDITATION && typeof window.SPP_ACCREDITATION.reload === 'function') {
                window.SPP_ACCREDITATION.reload().catch(() => {});
            }
            dashboard = (await SPP.get('/api/reports/dashboard')).dashboard;
            TABS.forEach((tab) => paint(tab.key));
        } catch (err) {
            if (!dashboard) showMessage(h('div', { class: 'dv-empty' }, icon('fa-solid fa-plug-circle-exclamation'), (err && err.message) || 'The reports could not be loaded.'));
            else SPP.showError(err);
        } finally {
            loading = false;
            if (button) {
                button.disabled = false;
                button.classList.remove('is-busy');
            }
            document.body.classList.remove('is-loading-wait');
        }
    }

    // ------------------------------------------------------------------ Evaluations panel: export hook
    function wireEvaluationsExport() {
        const button = document.getElementById('btn-export-evaluaciones');
        if (!button) return;
        button.addEventListener('click', () => {
            const provider = window.SPP_DIRECTOR && window.SPP_DIRECTOR.getExportData;
            const datasets = provider ? provider() : [];
            if (!datasets.length) { SPP.showError(new Error('The evaluations are still loading. Try again in a moment.')); return; }
            K.openExport({
                title: 'Export evaluations',
                subtitle: 'Figures and grades only. Student answers and tutor comments are never included.',
                sections: datasets.map((ds) => ({ id: ds.id, label: ds.title })),
                build: ({ sections: selected }) => {
                    const chosen = datasets.filter((ds) => selected.has(ds.id));
                    return { datasets: chosen, base: 'evaluations', title: 'Evaluations', subtitle: 'Read-only summary of all program evaluations', mode: 'tables' };
                }
            });
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        wireEvaluationsExport();
        if (TABS.some((t) => document.getElementById(t.root))) reload();
    });

    window.SPP_REPORTS = { reload: () => reload(), tabs: TABS };
})();
