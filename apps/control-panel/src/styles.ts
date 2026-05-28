// Stylesheet string used by the control panel HTML page — console layout with status cards, two-column skill library and action panel.
export const controlPanelStyles = `
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f0f2f5;
  color: #333;
  padding: 20px 24px;
}

/* --- Page Header --- */
.page-header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  margin-bottom: 20px;
}
.title-block { min-width: 0; }
.header-actions { display: flex; align-items: center; justify-content: flex-end; padding-top: 4px; }
h1 { font-size: 1.5rem; margin-bottom: 4px; }
h2 { font-size: 1.05rem; margin: 0; }
h3 { font-size: 0.9rem; margin: 14px 0 6px; color: #555; }
.subtitle { color: #888; font-size: 0.82rem; }
.language-control { display: inline-flex; gap: 8px; align-items: center; font-size: 0.85rem; color: #555; }
.language-control select { padding: 5px 8px; border: 1px solid #ccc; border-radius: 4px; background: #fff; font-size: 0.82rem; }

/* --- Status Cards --- */
#status-cards {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.stat-card {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px 20px;
  min-width: 120px;
  flex: 1;
  text-align: center;
}
.stat-card .stat-value {
  font-size: 1.6rem;
  font-weight: 700;
  color: #1a1a2e;
}
.stat-card .stat-label {
  font-size: 0.78rem;
  color: #888;
  margin-top: 2px;
}

/* --- Main Two-Column Layout --- */
.main-columns {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 20px;
  align-items: start;
}

/* --- Card Base --- */
.card {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px 20px;
}
.card-header {
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
}

/* --- Skill Library Toolbar --- */
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  align-items: center;
}
.toolbar input[type="text"] {
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.82rem;
  flex: 1;
  min-width: 140px;
}
.toolbar select {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  font-size: 0.82rem;
}

/* --- Buttons --- */
button {
  padding: 7px 14px;
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  font-size: 0.82rem;
  transition: background 0.15s;
}
button:hover { background: #e8e8e8; }
button.primary { background: #0066cc; color: #fff; border-color: #0055aa; }
button.primary:hover { background: #0055aa; }
button.danger { background: #cc3300; color: #fff; border-color: #aa2a00; }
button.danger:hover { background: #aa2a00; }
button:disabled { opacity: 0.5; cursor: default; }

/* --- Action buttons in right panel --- */
.action-buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

/* --- Task suggestions (muted) --- */
.task-suggestions-muted {
  display: flex;
  gap: 8px;
  opacity: 0.6;
}
.task-suggestions-muted:hover { opacity: 1; }

/* --- Table --- */
table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
th, td { padding: 7px 10px; text-align: left; border-bottom: 1px solid #f0f0f0; }
th { font-weight: 600; background: #fafafa; color: #555; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.3px; }
tr:hover { background: #f8f9fa; }

/* --- Status Badge --- */
.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.72rem;
  font-weight: 600;
}
.status-pass { background: #d4edda; color: #155724; }
.status-fail { background: #f8d7da; color: #721c24; }
.status-fixable { background: #fff3cd; color: #856404; }

/* --- Agent Chip --- */
.agent-chip {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 0.72rem;
  background: #e8eaf6;
  color: #3949ab;
  margin-right: 3px;
}

/* --- Selected Skill --- */
.selected-skill-name { font-size: 1rem; font-weight: 600; margin-bottom: 2px; }
.selected-skill-info { font-size: 0.82rem; color: #888; margin-bottom: 10px; }

/* --- Right panel select --- */
#target-agent-select {
  width: 100%;
  padding: 7px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.82rem;
  margin-bottom: 8px;
}

/* --- Compat result card --- */
#compat-result-card { margin-bottom: 8px; }
.compat-card { padding: 8px; background: #fafafa; border-radius: 6px; border: 1px solid #eee; }
.compat-reason { font-size: 0.82rem; color: #666; margin-top: 6px; }
.compat-action { font-size: 0.82rem; color: #555; margin-top: 4px; }

/* --- Status summary table inside cards --- */
#discover-summary table { margin-bottom: 8px; }
#discover-summary td { padding: 3px 10px 3px 0; font-size: 0.82rem; }

/* --- System Diagnostics Drawer --- */
#system-diagnostics-drawer {
  margin-top: 20px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}
#system-diagnostics-drawer > summary {
  padding: 12px 20px;
  font-size: 0.92rem;
  font-weight: 600;
  color: #555;
  cursor: pointer;
  list-style: none;
}
#system-diagnostics-drawer > summary::before {
  content: '\\25B6';
  display: inline-block;
  margin-right: 8px;
  font-size: 0.7rem;
  transition: transform 0.2s;
}
#system-diagnostics-drawer[open] > summary::before {
  transform: rotate(90deg);
}
.diagnostics-content {
  padding: 0 20px 16px;
}

/* --- Raw Output (collapsed by default) --- */
#raw-output-details { margin-top: 8px; }
#raw-output-details > summary {
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  color: #666;
  margin-bottom: 8px;
}
pre {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.78rem;
  max-height: 360px;
  overflow-y: auto;
}

/* --- Pagination --- */
#discover-pagination {
  margin-top: 8px;
}

/* --- Responsive --- */
@media (max-width: 768px) {
  .page-header { flex-direction: column; margin-bottom: 16px; }
  .header-actions { width: 100%; justify-content: flex-start; padding-top: 0; }
  .main-columns { grid-template-columns: 1fr; }
  #status-cards { flex-direction: column; }
  .toolbar { flex-direction: column; }
  .toolbar input[type="text"],
  .toolbar select { width: 100%; }
}
`;
