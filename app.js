// Données et règles du compagnon ESO.
// La page HTML contient les éléments, app.css leur apparence, et ce fichier leur comportement.
(() => {
  'use strict';

  const STORAGE_KEY = 'journal-tamriel-v1';
  const ALIGNMENT_KEY = 'journal-tamriel-alignment-v1';
  const SHOW_COMPLETED_KEY = 'journal-tamriel-show-completed-v1';
  const BACKUP_FORMAT_VERSION = 1;
  // Les resets du serveur EU sont à 03:00 UTC toute l'année.
  const RESET_UTC_HOUR = 3;
  const DEFAULT_TASKS = [
    { id: 'starter-dungeon', title: 'Daily dungeon', category: 'daily', priority: 'normal' },
    { id: 'starter-battleground', title: 'Daily battleground', category: 'daily', priority: 'normal' },
    { id: 'starter-writs', title: 'Daily crafting writs', category: 'daily', priority: 'normal' },
    { id: 'starter-antiquities', title: 'Antiquities', category: 'other', priority: 'normal' },
    { id: 'starter-telvar', title: 'Telvar', category: 'other', priority: 'normal' }
  ];
  const $ = id => document.getElementById(id);

  // Une journée ESO va de 03:00 UTC à 02:59 UTC le lendemain.
  function esoDay(date = new Date()) {
    const logicalDate = new Date(date.getTime() - RESET_UTC_HOUR * 60 * 60 * 1000);
    return toDateInputValue(logicalDate);
  }
  function toDateInputValue(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }
  function dateFromKey(key) { return new Date(`${key}T12:00:00Z`); }
  function formatDate(key, options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) {
    return new Intl.DateTimeFormat('fr-FR', { ...options, timeZone: 'Europe/Paris' }).format(dateFromKey(key));
  }

  // La période hebdomadaire générique commence le dimanche à 03:00 UTC.
  function esoWeek(key) {
    const sunday = dateFromKey(key);
    sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
    return toDateInputValue(sunday);
  }
  function migrateWeeks(weeks = {}) {
    const migrated = {};
    for (const [key, state] of Object.entries(weeks)) {
      const oldWeekStart = dateFromKey(key);
      if (oldWeekStart.getUTCDay() === 2) oldWeekStart.setUTCDate(oldWeekStart.getUTCDate() - 2);
      const newKey = toDateInputValue(oldWeekStart);
      migrated[newKey] ||= { done: {} };
      Object.assign(migrated[newKey].done, state?.done || {});
    }
    return migrated;
  }
  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved) return freshData();
      if (saved.version === 2) return {
        version: 2,
        tasks: (saved.tasks || []).map(task => ({ id: task.id, title: task.title || task.name || 'Tâche sans nom', category: task.category || 'other', priority: task.priority || 'normal' })),
        days: saved.days || {}, weeks: migrateWeeks(saved.weeks), notes: saved.notes || []
      };

      // Migration des données de la toute première maquette vers le nouveau modèle.
      const migrated = freshData();
      if (Array.isArray(saved.tasks)) {
        migrated.tasks = saved.tasks.map((task, index) => ({
          id: task.id || `migrated-${index}`,
          title: task.title || task.name || 'Tâche sans nom',
          category: task.category === 'weekly' ? 'weekly' : (task.category === 'daily' ? 'daily' : 'other'),
          priority: task.priority || 'normal'
        }));
      }
      if (saved.days && typeof saved.days === 'object') {
        for (const [date, oldState] of Object.entries(saved.days)) {
          migrated.days[date] = { done: oldState.done || {} };
          if (oldState.note) migrated.notes.push({ id: `migrated-note-${date}`, date, title: 'Note de voyage', body: oldState.note, updatedAt: new Date().toISOString() });
        }
      }
      return migrated;
    } catch {
      return freshData();
    }
  }
  function freshData() {
    return { version: 2, tasks: DEFAULT_TASKS.map(task => ({ ...task })), days: {}, weeks: {}, notes: [] };
  }

  const data = loadData();
  let selectedDay = esoDay();
  let editingTaskId = null;
  let draggedTaskId = null;
  let toastTimer;
  let showCompleted = false;

  try { showCompleted = localStorage.getItem(SHOW_COMPLETED_KEY) === 'true'; } catch { /* Le filtre reste utilisable pendant cette session. */ }

  let alignLeft = false;
  try { alignLeft = localStorage.getItem(ALIGNMENT_KEY) === 'left'; } catch { /* Le choix reste utilisable même si le stockage est désactivé. */ }
  function updateAlignmentButton() {
    document.body.classList.toggle('layout-left', alignLeft);
    $('alignToggle').setAttribute('aria-pressed', String(alignLeft));
    $('alignToggle').textContent = alignLeft ? '↔ Centrer' : '⇤ Aligner à gauche';
    $('alignToggle').title = alignLeft ? 'Centrer le contenu' : 'Aligner le contenu à gauche';
  }
  $('alignToggle').addEventListener('click', () => {
    alignLeft = !alignLeft;
    try { localStorage.setItem(ALIGNMENT_KEY, alignLeft ? 'left' : 'center'); } catch { /* Le bouton reste fonctionnel pour cette session. */ }
    updateAlignmentButton();
  });
  updateAlignmentButton();

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function isBackup(value) {
    if (!isRecord(value) || value.app !== 'eso-companion' || value.formatVersion !== BACKUP_FORMAT_VERSION || !isRecord(value.data)) return false;
    const backup = value.data;
    if (backup.version !== 2 || !Array.isArray(backup.tasks) || !Array.isArray(backup.notes) || !isRecord(backup.days) || !isRecord(backup.weeks)) return false;
    const validTasks = backup.tasks.every(task => isRecord(task) && typeof task.id === 'string' && typeof task.title === 'string' && ['daily', 'weekly', 'other'].includes(task.category));
    const validNotes = backup.notes.every(note => isRecord(note) && typeof note.id === 'string' && typeof note.body === 'string');
    const validPeriods = bucket => Object.values(bucket).every(period => isRecord(period) && isRecord(period.done));
    return validTasks && validNotes && validPeriods(backup.days) && validPeriods(backup.weeks);
  }
  function exportBackup() {
    const backup = {
      app: 'eso-companion',
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      data: { version: data.version, tasks: data.tasks, days: data.days, weeks: data.weeks, notes: data.notes }
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `eso-companion-backup-${esoDay()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Sauvegarde téléchargée');
  }
  function taskState(task, date = selectedDay) {
    const bucket = task.category === 'weekly' ? data.weeks : data.days;
    const key = task.category === 'weekly' ? esoWeek(date) : date;
    if (!bucket[key]) bucket[key] = { done: {} };
    return bucket[key];
  }
  function isDone(task, date = selectedDay) { return Boolean(taskState(task, date).done[task.id]); }
  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1900);
  }
  function addBadge(parent, text, className = '') {
    const badge = document.createElement('span');
    badge.className = `badge ${className}`.trim();
    badge.textContent = text;
    parent.append(badge);
  }
  function renderTasks() {
    const lists = { daily: $('taskListDaily'), weekly: $('taskListWeekly'), other: $('taskListOther') };
    for (const list of Object.values(lists)) list.replaceChildren();
    const tasksByCategory = {
      daily: data.tasks.filter(task => task.category === 'daily'),
      weekly: data.tasks.filter(task => task.category === 'weekly'),
      other: data.tasks.filter(task => task.category !== 'daily' && task.category !== 'weekly')
    };
    for (const [category, tasks] of Object.entries(tasksByCategory)) {
      const visibleTasks = showCompleted ? tasks : tasks.filter(task => !isDone(task));
      if (!visibleTasks.length) {
        const empty = document.createElement('div'); empty.className = 'empty';
        empty.textContent = tasks.length ? 'Toutes les tâches de cette catégorie sont terminées.' : category === 'daily' ? 'Aucune tâche quotidienne.' : category === 'weekly' ? 'Aucune tâche hebdomadaire.' : 'Aucune autre tâche.';
        lists[category].append(empty);
      }
    }
    for (const task of data.tasks) {
      if (!showCompleted && isDone(task)) continue;
      const category = task.category === 'daily' || task.category === 'weekly' ? task.category : 'other';
      const list = lists[category];
      const row = document.createElement('div');
      row.className = `task${isDone(task) ? ' done' : ''}`;
      const check = document.createElement('input');
      check.type = 'checkbox'; check.className = 'check'; check.checked = isDone(task);
      check.setAttribute('aria-label', `Marquer ${task.title} comme terminée`);
      check.addEventListener('change', () => {
        taskState(task).done[task.id] = check.checked;
        saveData(); render();
      });
      const content = document.createElement('div'); content.className = 'task-name';
      content.append(document.createTextNode(task.title));
      const meta = document.createElement('div'); meta.className = 'task-meta';
      if (task.priority === 'high') addBadge(meta, 'Priorité haute', 'high');
      if (task.priority === 'low') addBadge(meta, 'Priorité basse', 'low');
      content.append(meta);
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'task-edit'; edit.textContent = 'Modifier';
      edit.addEventListener('click', () => {
        editingTaskId = task.id;
        $('taskInput').value = task.title;
        $('categoryInput').value = task.category;
        $('priorityInput').value = task.priority;
        $('taskSubmit').textContent = 'Enregistrer les modifications';
        $('cancelTaskEdit').classList.remove('hidden');
        $('addDetails').open = true;
        $('taskInput').scrollIntoView({ behavior: 'smooth', block: 'center' });
        $('taskInput').focus({ preventScroll: true });
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete'; remove.textContent = '×';
      remove.title = 'Supprimer cette tâche'; remove.setAttribute('aria-label', `Supprimer ${task.title}`);
      remove.addEventListener('click', () => {
        if (editingTaskId === task.id) resetTaskEditor();
        data.tasks = data.tasks.filter(item => item.id !== task.id);
        saveData(); render(); showToast('Tâche supprimée de ta liste');
      });
      const dragHandle = document.createElement('button'); dragHandle.type = 'button'; dragHandle.className = 'drag-handle';
      dragHandle.textContent = '⠿'; dragHandle.title = 'Faire glisser pour réordonner';
      dragHandle.setAttribute('aria-label', `Réordonner ${task.title}`);
      dragHandle.draggable = true;
      dragHandle.addEventListener('dragstart', event => {
        draggedTaskId = task.id;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', task.id);
        row.classList.add('dragging');
      });
      dragHandle.addEventListener('dragend', () => {
        draggedTaskId = null;
        document.querySelectorAll('.task.dragging, .task.drag-over').forEach(element => element.classList.remove('dragging', 'drag-over'));
      });
      row.addEventListener('dragover', event => {
        const draggedTask = data.tasks.find(item => item.id === draggedTaskId);
        if (!draggedTask || draggedTaskId === task.id || (draggedTask.category || 'other') !== (task.category || 'other')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        row.classList.add('drag-over');
      });
      row.addEventListener('dragleave', event => {
        if (!row.contains(event.relatedTarget)) row.classList.remove('drag-over');
      });
      row.addEventListener('drop', event => {
        event.preventDefault();
        const sourceId = draggedTaskId || event.dataTransfer.getData('text/plain');
        const sourceTask = data.tasks.find(item => item.id === sourceId);
        if (!sourceTask || (sourceTask.category || 'other') !== (task.category || 'other')) return;
        const categoryTasks = data.tasks.filter(item => (item.category || 'other') === (task.category || 'other'));
        const fromIndex = categoryTasks.findIndex(item => item.id === sourceId);
        const toIndex = categoryTasks.findIndex(item => item.id === task.id);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
        const [movedTask] = categoryTasks.splice(fromIndex, 1);
        const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex;
        categoryTasks.splice(insertAt, 0, movedTask);
        data.tasks = data.tasks.filter(item => (item.category || 'other') !== (task.category || 'other')).concat(categoryTasks);
        saveData(); render(); showToast('Ordre des tâches mis à jour');
      });
      row.append(dragHandle, check, content, edit, remove); list.append(row);
    }
    const dailyDone = tasksByCategory.daily.filter(task => isDone(task)).length;
    const weeklyDone = tasksByCategory.weekly.filter(task => isDone(task)).length;
    $('dailyProgressLabel').textContent = `${dailyDone} / ${tasksByCategory.daily.length} terminée${dailyDone > 1 ? 's' : ''}`;
    $('dailyProgressFill').style.width = `${tasksByCategory.daily.length ? (dailyDone / tasksByCategory.daily.length) * 100 : 0}%`;
    $('weeklyProgressLabel').textContent = `${weeklyDone} / ${tasksByCategory.weekly.length} terminée${weeklyDone > 1 ? 's' : ''}`;
    $('weeklyProgressFill').style.width = `${tasksByCategory.weekly.length ? (weeklyDone / tasksByCategory.weekly.length) * 100 : 0}%`;
    $('remaining').textContent = String(data.tasks.length - data.tasks.filter(task => isDone(task)).length);
    const completedTotal = data.tasks.filter(task => isDone(task)).length;
    $('completedToggle').textContent = showCompleted ? `Masquer terminées (${completedTotal})` : `Afficher terminées (${completedTotal})`;
    $('completedToggle').setAttribute('aria-pressed', String(showCompleted));
    $('weeklyCount').textContent = `${tasksByCategory.weekly.length} tâche${tasksByCategory.weekly.length > 1 ? 's' : ''}`;
    $('otherCount').textContent = `${tasksByCategory.other.length} tâche${tasksByCategory.other.length > 1 ? 's' : ''}`;
    $('listDate').textContent = formatDate(selectedDay);
  }
  function resetNoteForm() {
    $('noteId').value = ''; $('noteTitle').value = ''; $('noteBody').value = '';
    $('noteDate').value = esoDay(); $('charCount').textContent = '0 / 5000';
    $('saveNote').textContent = 'Enregistrer la note'; $('cancelEdit').classList.add('hidden');
    $('noteEditorSummary').textContent = '＋ Nouvelle note'; $('noteEditor').open = false;
  }
  function renderNotes() {
    const list = $('noteList'); list.replaceChildren();
    const query = $('noteSearch').value.trim().toLocaleLowerCase('fr');
    const notes = [...data.notes].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .filter(note => !query || `${note.title} ${note.body} ${note.date}`.toLocaleLowerCase('fr').includes(query));
    if (!notes.length) {
      const empty = document.createElement('div'); empty.className = 'empty';
      empty.textContent = query ? 'Aucune note ne correspond à cette recherche.' : 'Tes notes enregistrées apparaîtront ici.';
      list.append(empty); return;
    }
    for (const note of notes) {
      const article = document.createElement('article'); article.className = 'note-item';
      const head = document.createElement('div'); head.className = 'note-item-head';
      const headingGroup = document.createElement('div');
      const title = document.createElement('h3'); title.textContent = note.title || 'Note sans titre';
      const date = document.createElement('div'); date.className = 'note-date'; date.textContent = note.date ? formatDate(note.date, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      headingGroup.append(title, date);
      const actions = document.createElement('div'); actions.className = 'note-item-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Modifier';
      edit.addEventListener('click', () => {
        $('noteId').value = note.id; $('noteTitle').value = note.title || ''; $('noteDate').value = note.date || selectedDay;
        $('noteBody').value = note.body; $('charCount').textContent = `${note.body.length} / 5000`;
        $('saveNote').textContent = 'Enregistrer les changements'; $('cancelEdit').classList.remove('hidden');
        $('noteEditorSummary').textContent = 'Modifier la note'; $('noteEditor').open = true; $('noteTitle').focus();
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Supprimer';
      remove.addEventListener('click', () => { data.notes = data.notes.filter(item => item.id !== note.id); saveData(); renderNotes(); showToast('Note supprimée'); });
      actions.append(edit, remove); head.append(headingGroup, actions);
      const preview = document.createElement('div'); preview.className = 'note-preview'; preview.textContent = note.body;
      article.append(head, preview); list.append(article);
    }
  }
  function render() { renderTasks(); renderNotes(); }

  function resetTaskEditor() {
    editingTaskId = null;
    $('addForm').reset();
    $('taskSubmit').textContent = '＋ Ajouter à ma liste';
    $('cancelTaskEdit').classList.add('hidden');
  }

  $('resetDay').addEventListener('click', () => {
    for (const task of data.tasks) taskState(task).done[task.id] = false;
    saveData(); render(); showToast('Cases décochées pour la période correspondante');
  });
  $('completedToggle').addEventListener('click', () => {
    showCompleted = !showCompleted;
    try { localStorage.setItem(SHOW_COMPLETED_KEY, String(showCompleted)); } catch { /* Le filtre reste utilisable pendant cette session. */ }
    renderTasks();
  });
  $('addForm').addEventListener('submit', event => {
    event.preventDefault();
    const title = $('taskInput').value.trim(); if (!title) return;
    if (editingTaskId) {
      const task = data.tasks.find(item => item.id === editingTaskId);
      if (task) Object.assign(task, { title, category: $('categoryInput').value, priority: $('priorityInput').value });
      resetTaskEditor(); saveData(); render(); showToast('Tâche modifiée');
    } else {
      data.tasks.push({ id: crypto.randomUUID ? crypto.randomUUID() : `task-${Date.now()}`, title, category: $('categoryInput').value, priority: $('priorityInput').value });
      saveData(); $('addForm').reset(); render(); $('taskInput').focus();
    }
  });
  $('cancelTaskEdit').addEventListener('click', resetTaskEditor);
  $('noteBody').addEventListener('input', event => { $('charCount').textContent = `${event.target.value.length} / 5000`; });
  $('noteForm').addEventListener('submit', event => {
    event.preventDefault();
    const id = $('noteId').value || (crypto.randomUUID ? crypto.randomUUID() : `note-${Date.now()}`);
    const existingIndex = data.notes.findIndex(note => note.id === id);
    const note = { id, title: $('noteTitle').value.trim(), date: $('noteDate').value || selectedDay, body: $('noteBody').value.trim(), updatedAt: new Date().toISOString() };
    if (existingIndex >= 0) data.notes[existingIndex] = note; else data.notes.push(note);
    saveData(); resetNoteForm(); renderNotes(); showToast('Note enregistrée');
  });
  $('cancelEdit').addEventListener('click', resetNoteForm);
  $('noteSearch').addEventListener('input', renderNotes);
  $('exportBackup').addEventListener('click', exportBackup);
  $('importBackupTrigger').addEventListener('click', () => $('importBackupFile').click());
  $('importBackupFile').addEventListener('change', async event => {
    const input = event.currentTarget;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (!isBackup(backup)) {
        showToast('Ce fichier ne correspond pas à une sauvegarde ESO Companion');
        return;
      }
      if (!window.confirm('Cette sauvegarde remplacera les tâches, la progression et les notes de cet appareil. Continuer ?')) return;
      const previous = { tasks: data.tasks, days: data.days, weeks: data.weeks, notes: data.notes };
      data.tasks = backup.data.tasks;
      data.days = backup.data.days;
      data.weeks = migrateWeeks(backup.data.weeks);
      data.notes = backup.data.notes;
      try {
        saveData();
      } catch {
        Object.assign(data, previous);
        showToast('Impossible d’enregistrer cette sauvegarde sur cet appareil');
        return;
      }
      render();
      showToast('Sauvegarde restaurée');
    } catch {
      showToast('Impossible de lire ce fichier JSON');
    }
  });

  // Au changement de période serveur, l'onglet bascule automatiquement vers la nouvelle journée ESO.
  let activeLogicalDay = esoDay();
  function scheduleResetCheck() {
    const now = new Date();
    const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RESET_UTC_HOUR));
    if (nextReset <= now) nextReset.setUTCDate(nextReset.getUTCDate() + 1);
    setTimeout(() => {
      const newLogicalDay = esoDay();
      if (newLogicalDay !== activeLogicalDay) {
        if (selectedDay === activeLogicalDay) selectedDay = newLogicalDay;
        activeLogicalDay = newLogicalDay;
        $('noteDate').value = selectedDay;
        render(); showToast('Nouvelle journée ESO');
      }
      scheduleResetCheck();
    }, Math.max(1000, nextReset.getTime() - now.getTime() + 300));
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      const newLogicalDay = esoDay();
      if (newLogicalDay !== activeLogicalDay) {
        if (selectedDay === activeLogicalDay) selectedDay = newLogicalDay;
        activeLogicalDay = newLogicalDay; $('noteDate').value = selectedDay; render();
      }
    }
  });

  $('noteDate').value = selectedDay;
  render();
  scheduleResetCheck();
})();
