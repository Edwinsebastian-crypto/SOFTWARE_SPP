/* =========================================================================
   tutor.api.js — What is specific to the TUTOR: question bank (CRUD in the
   database), assigning questions to the student's practice and grade registration.
   (The part shared with the advisor lives in teacher.api.js.)
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
    const $ = (selector, root) => (root || document).querySelector(selector);
    const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
    const TOPICS = { pedagogy: 'Pedagogy', didactics: 'Didactics', assessment: 'Assessment' };

    const bankPanel = $('#question-bank-panel');
    const createPanel = $('#create-question-panel');
    const list = $('#qbList');
    if (!list) return;
    const template = $('.qb-card', list).cloneNode(true);
    const searchInput = $('#qbSearchInput');
    const topicFilter = $('#qbFilterTopic');
    const scrollToTop = () => { window.scrollTo(0, 0); const shell = $('.app-shell'); if (shell) shell.scrollTop = 0; };

    let editingId = null;
    let questions = [];

    // ---------- the original form did not ask for a "topic": it is added ----------
    const practiceTypeField = $('#cpPracticeType').closest('.cp-field');
    const topicField = practiceTypeField.cloneNode(true);
    const topicLabel = $('label', topicField);
    if (topicLabel) { topicLabel.textContent = 'Topic'; topicLabel.setAttribute('for', 'cpTopic'); }
    const topicSelect = $('select', topicField);
    topicSelect.id = 'cpTopic';
    topicSelect.innerHTML = '<option value="" selected disabled>Select the topic</option>' +
        Object.entries(TOPICS).map(([value, text]) => `<option value="${value}">${text}</option>`).join('');
    practiceTypeField.insertAdjacentElement('beforebegin', topicField);

    const fields = {
        statement: $('#cpStatement'), topic: topicSelect, practiceType: $('#cpPracticeType'),
        questionType: $('#cpQuestionType'), value: $('#cpValue')
    };
    const resetForm = () => {
        fields.statement.value = '';
        [fields.topic, fields.practiceType, fields.questionType, fields.value].forEach((select) => { select.selectedIndex = 0; });
        editingId = null;
        const title = $('#create-question-title'); if (title) title.textContent = 'Create Question';
    };

    const createButton = $('#qbCreateBtn');
    const cancelButton = $('#cpCancelBtn');
    const saveButton = $('#cpSaveBtn');

    function showForm(visible) {
        bankPanel.style.display = visible ? 'none' : 'flex';
        createPanel.style.display = visible ? 'flex' : 'none';
        scrollToTop();
    }
    createButton.addEventListener('click', () => { resetForm(); showForm(true); });
    cancelButton.addEventListener('click', () => { resetForm(); showForm(false); });

    saveButton.addEventListener('click', async () => {
        const body = {
            statement: fields.statement.value, topic: fields.topic.value, practiceType: fields.practiceType.value,
            questionType: fields.questionType.value, value: fields.value.value
        };
        if (!body.statement.trim()) { alert('Please write the question statement.'); return; }
        if (!body.topic) { alert('Select the question topic.'); return; }
        if (!body.questionType) { alert('Select the question type.'); return; }
        if (!body.value) { alert('Select the question value.'); return; }
        try {
            if (editingId) await SPP.put(`/api/questions/${editingId}`, body);
            else await SPP.post('/api/questions', body);
            alert('Question saved successfully');
            resetForm(); showForm(false);
            await load();
        } catch (e) { SPP.showError(e); }
    });

    // ---------- list ----------
    function questionCard(question) {
        const card = template.cloneNode(true);
        card.dataset.topic = question.topic;
        const spans = $$('.qb-card-head > span', card);
        if (spans[0]) spans[0].textContent = 'ID: ' + question.code;
        const tag = $('.qb-tag', card); if (tag) tag.textContent = TOPICS[question.topic] || question.topic;
        $('.qb-card-question', card).textContent = question.statement;
        $('.qb-card-date', card).textContent = 'Date: ' + SPP.formatDate(question.createdAt);

        $('.qb-icon-del', card).addEventListener('click', async () => {
            if (!confirm('Delete the question "' + question.statement + '"?')) return;
            try { await SPP.del(`/api/questions/${question.id}`); await load(); } catch (e) { SPP.showError(e); }
        });
        $('.qb-icon-edit', card).addEventListener('click', () => {
            editingId = question.id;
            fields.statement.value = question.statement;
            fields.topic.value = question.topic;
            fields.practiceType.value = question.practiceType || '';
            fields.questionType.value = question.questionType;
            fields.value.value = String(question.value);
            const title = $('#create-question-title'); if (title) title.textContent = 'Edit Question';
            showForm(true);
        });
        $('.qb-icon-dup', card).addEventListener('click', async () => {
            try {
                await SPP.post('/api/questions', {
                    statement: question.statement, topic: question.topic, practiceType: question.practiceType,
                    questionType: question.questionType, value: question.value
                });
                await load();
            } catch (e) { SPP.showError(e); }
        });

        // New button: assign this question to the selected practice (the student will see it in "My Questions")
        const assignButton = document.createElement('button');
        assignButton.type = 'button';
        assignButton.className = 'qb-icon-btn qb-icon-assign';
        assignButton.title = 'Assign to the selected practice';
        assignButton.setAttribute('aria-label', 'Assign question to the practice');
        assignButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        assignButton.addEventListener('click', async () => {
            const practice = window.SPP_TEACHER && window.SPP_TEACHER.state.practice;
            if (!practice) { alert('Select a practice first.'); return; }
            if (!confirm('Assign this question to ' + practice.student + '?')) return;
            try {
                await SPP.post(`/api/practices/${practice.id}/questions`, { questionId: question.id });
                alert('Question assigned');
            } catch (e) { SPP.showError(e); }
        });
        $('.qb-card-actions', card).appendChild(assignButton);
        return card;
    }

    async function load() {
        const query = new URLSearchParams();
        if (searchInput && searchInput.value.trim()) query.set('search', searchInput.value.trim());
        if (topicFilter && topicFilter.value !== 'all') query.set('topic', topicFilter.value);
        try {
            questions = (await SPP.get('/api/questions?' + query.toString())).questions;
        } catch (e) { SPP.showError(e); return; }
        list.innerHTML = '';
        if (!questions.length) {
            const empty = document.createElement('p');
            empty.style.cssText = 'padding:16px;opacity:.7';
            empty.textContent = 'There are no questions in the bank.';
            list.appendChild(empty);
            return;
        }
        questions.forEach((question) => list.appendChild(questionCard(question)));
    }
    let debounce = null;
    if (searchInput) searchInput.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(load, 250); });
    if (topicFilter) topicFilter.addEventListener('change', load);

        load();
});
