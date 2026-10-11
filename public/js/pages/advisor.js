/* =========================================================================
   advisor.js — Navigation specific to the ADVISOR panel.
   The common flow (practice > logbook > activities > evidence) lives in
   core/panels.js; the data and the feedback form live in teacher.api.js.
   The advisor has no questions section.
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
    SPP.panels.wireStandardFlow({ questions: 'none' });

    // "..." menus of the template evidence / feedback cards (rendered cards bind themselves)
    document.querySelectorAll('.ev-card, .feedback-card').forEach(SPP.panels.bindMenu);
});
