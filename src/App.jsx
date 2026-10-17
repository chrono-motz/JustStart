import { useEffect, useMemo, useState } from 'react'
import {
  evaluateCandidates,
  getPrerequisiteStatus,
  selectRecommendedNode,
} from './domain/selection.js'
import { loadWorkspace, saveWorkspace } from './domain/persistence.js'
import { formatDueDate, initialNodes, projects } from './data/sampleData.js'

const todayLabel = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}).format(new Date())

function progressValue(node) {
  return Math.round((node.progress ?? 0) * 100)
}

function statusLabel(node) {
  if (node.status === 'done') return 'Complete'
  if (node.status === 'skipped') return 'Skipped'
  if ((node.progress ?? 0) > 0) return `${progressValue(node)}% in progress`
  return 'Not started'
}

function getBrowserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function readStoredWorkspace() {
  const fallback = { nodes: initialNodes, activeProject: 'Compiler Design', autoStart: true }
  const workspace = loadWorkspace(getBrowserStorage(), fallback)
  return {
    nodes: Array.isArray(workspace.nodes) ? workspace.nodes : initialNodes,
    activeProject: typeof workspace.activeProject === 'string' ? workspace.activeProject : fallback.activeProject,
    autoStart: typeof workspace.autoStart === 'boolean' ? workspace.autoStart : fallback.autoStart,
  }
}

function Icon({ name }) {
  const paths = {
    home: 'M3 10.8 12 3l9 7.8M5.5 9.8V21h13V9.8M9 21v-6h6v6',
    layers: 'M12 3 3 7.5l9 4.5 9-4.5L12 3Zm-9 9 9 4.5 9-4.5M3 16.5l9 4.5 9-4.5',
    graph: 'M5 19V9m0 10h14M5 9l5 5 4-8 5 3',
    settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-5v2m0 13v2M4.6 4.6 6 6m12-1.4-1.4 1.4M3 12h2m14 0h2M4.6 19.4 6 18m12 1.4-1.4-1.4',
    arrow: 'M5 12h13m-5-5 5 5-5 5',
    check: 'm5 12 4 4L19 6',
    lock: 'M7 10V8a5 5 0 0 1 10 0v2m-11 0h12v9H6v-9Z',
    external: 'M14 5h5v5m-1-4-8 8M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    plus: 'M12 5v14M5 12h14',
    skip: 'm5 5 14 14m0-14L5 19',
  }
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? paths.arrow} />
    </svg>
  )
}

function App() {
  const [storedWorkspace] = useState(readStoredWorkspace)
  const [nodes, setNodes] = useState(storedWorkspace.nodes)
  const [activeProject, setActiveProject] = useState(storedWorkspace.activeProject)
  const [screen, setScreen] = useState(storedWorkspace.autoStart ? 'start' : 'plan')
  const [previewNode, setPreviewNode] = useState(null)
  const [catchUpOpen, setCatchUpOpen] = useState(false)
  const [autoStart, setAutoStart] = useState(storedWorkspace.autoStart)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    saveWorkspace(getBrowserStorage(), { nodes, activeProject, autoStart })
  }, [activeProject, autoStart, nodes])

  const projectNodes = useMemo(
    () => nodes.filter((node) => activeProject === 'All focus areas' || node.project === activeProject),
    [activeProject, nodes],
  )

  const recommendation = useMemo(
    () => selectRecommendedNode(projectNodes, { now: Date.now(), seed: todayLabel }),
    [projectNodes],
  )

  const evaluated = useMemo(() => evaluateCandidates(projectNodes), [projectNodes])
  const readyCount = evaluated.filter((item) => item.eligible).length
  const completedCount = projectNodes.filter((node) => node.status === 'done').length
  const inProgressCount = projectNodes.filter((node) => node.status === 'in_progress').length
  const projectProgress = projectNodes.length
    ? Math.round(projectNodes.reduce((sum, node) => sum + (node.progress ?? 0), 0) / projectNodes.length * 100)
    : 0

  function showNotice(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2800)
  }

  function updateNode(nodeId, action) {
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId) return node
      if (action === 'done') return { ...node, progress: 1, mastery: Math.max(node.mastery ?? 0, 0.75), status: 'done' }
      if (action === 'partial') return { ...node, progress: Math.min(0.9, Math.max(node.progress ?? 0, 0.25) + 0.25), status: 'in_progress' }
      if (action === 'skip') return { ...node, status: 'skipped' }
      if (action === 'elsewhere') return { ...node, progress: Math.max(node.progress ?? 0, 0.65), status: 'in_progress' }
      return node
    }))
    const messages = {
      done: 'Nice. The next step is ready when you are.',
      partial: 'Saved as partial progress. No lost momentum.',
      skip: 'Skipped for now. It will stay out of the way.',
      elsewhere: 'Progress updated from your work elsewhere.',
    }
    showNotice(messages[action])
    setPreviewNode(null)
    setCatchUpOpen(false)
  }

  function openSource(node) {
    if (window.justStart?.openResource) {
      window.justStart.openResource(node.resource.path).then((result) => {
        if (!result?.ok) showNotice(result?.error ?? 'Unable to open this resource.')
      })
      return
    }
    window.open(node.resource.path, '_blank', 'noopener,noreferrer')
  }

  function toggleAutoStart() {
    const nextValue = !autoStart
    if (window.justStart?.setLoginAutoStart) {
      window.justStart.setLoginAutoStart(nextValue).then((result) => {
        if (!result?.ok) {
          showNotice(result?.error ?? 'Unable to update auto-start.')
          return
        }
        setAutoStart(nextValue)
      })
      return
    }
    setAutoStart(nextValue)
  }

  function selectProject(project) {
    setActiveProject(project)
    setScreen('start')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">J</div>
          <div>
            <div className="brand-name">just start</div>
            <div className="brand-caption">begin with less friction</div>
          </div>
        </div>

        <div className="sidebar-section-label">Workspace</div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          <button className={screen === 'start' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('start')}>
            <Icon name="home" /> <span>Start</span><span className="nav-pill">1</span>
          </button>
          <button className={screen === 'plan' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('plan')}>
            <Icon name="layers" /> <span>My plan</span>
          </button>
          <button className="nav-item" onClick={() => showNotice('The graph view is coming after the MVP.') }>
            <Icon name="graph" /> <span>Graph</span><span className="soon-pill">soon</span>
          </button>
        </nav>

        <div className="sidebar-section-label project-label">Focus areas</div>
        <div className="project-list">
          {projects.map((project) => (
            <button
              key={project.name}
              className={activeProject === project.name ? 'project-item active' : 'project-item'}
              onClick={() => selectProject(project.name)}
            >
              <span className={`project-dot ${project.color}`} />
              <span>{project.name}</span>
              {project.name !== 'All focus areas' && <span className="project-count">{nodes.filter((node) => node.project === project.name).length}</span>}
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="auto-start-card">
            <div className="auto-start-heading"><span className="status-dot" /> Auto-start</div>
            <p>Show one useful next step when you open Just Start.</p>
            <button className={autoStart ? 'toggle on' : 'toggle'} onClick={toggleAutoStart} aria-label="Toggle auto-start">
              <span /> {autoStart ? 'On' : 'Off'}
            </button>
          </div>
          <button className="nav-item settings-item" onClick={() => showNotice('Settings will keep your local folders and preferences.') }>
            <Icon name="settings" /> <span>Settings</span>
          </button>
          <div className="profile-row"><div className="avatar">A</div><div><strong>Alex</strong><span>Local workspace</span></div><span className="more">•••</span></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-separator">/</span><strong>{activeProject}</strong></div>
          <div className="topbar-actions"><span className="saved-indicator"><span className="saved-dot" /> Saved locally</span><button className="icon-button" aria-label="Settings" onClick={() => showNotice('Your progress is stored in this browser for now.')}><Icon name="settings" /></button></div>
        </header>

        {screen === 'start' ? (
          <>
            <section className="welcome-row">
              <div><p className="overline">{todayLabel}</p><h1>Good morning, Alex<span className="wave">✦</span></h1><p className="welcome-copy">You do not need to plan the whole day. Just begin with the next useful thing.</p></div>
              <button className="ghost-button" onClick={() => setCatchUpOpen(true)}><Icon name="plus" /> Log work from elsewhere</button>
            </section>

            {recommendation ? (
              <section className="focus-card">
                <div className="focus-main">
                  <div className="card-topline"><span className="focus-label"><span className="pulse-dot" /> Your next best start</span><span className="date-chip">Due {formatDueDate(recommendation.deadline)}</span></div>
                  <div className="recommendation-eyebrow">{recommendation.eyebrow}</div>
                  <h2>{recommendation.title}</h2>
                  <p className="focus-description">{recommendation.description}</p>
                  <div className="meta-row"><span><span className="meta-icon">◷</span> {recommendation.estimatedMinutes} min</span><span><span className="meta-icon">◌</span> {recommendation.resource.type === 'pdf' ? 'PDF preview' : 'Resource'}</span><span><span className="meta-icon">↗</span> {recommendation.project}</span></div>
                  <div className="question-box"><div className="question-label">Start with a question</div><p>{recommendation.question}</p></div>
                  <div className="focus-actions"><button className="primary-button" onClick={() => setPreviewNode(recommendation)}>Start this <Icon name="arrow" /></button><button className="secondary-button" onClick={() => updateNode(recommendation.id, 'done')}><Icon name="check" /> Mark done</button><button className="icon-action" onClick={() => updateNode(recommendation.id, 'skip')} aria-label="Skip this item"><Icon name="skip" /></button></div>
                </div>
                <div className="document-preview" onClick={() => setPreviewNode(recommendation)} role="button" tabIndex="0" onKeyDown={(event) => event.key === 'Enter' && setPreviewNode(recommendation)}>
                  <div className="preview-toolbar"><span className="preview-file"><span className="pdf-icon">PDF</span> {recommendation.resource.label}</span><span>1 / 14</span></div>
                  <div className="preview-page"><div className="page-kicker">{recommendation.project}</div><div className="page-title">{recommendation.title}</div><div className="page-line wide" /><div className="page-line" /><div className="page-diagram"><span /><span /><span /></div><div className="page-line" /><div className="page-line short" /></div>
                  <div className="preview-caption"><span>Click to open a focused preview</span><Icon name="external" /></div>
                </div>
              </section>
            ) : (
              <section className="empty-state"><div className="empty-icon">✓</div><h2>Nothing is waiting on you.</h2><p>You have completed or skipped every item in this focus area.</p><button className="primary-button" onClick={() => setScreen('plan')}>Review your plan <Icon name="arrow" /></button></section>
            )}

            <section className="dashboard-grid">
              <div className="path-card panel-card"><div className="panel-heading"><div><p className="overline">Completion path</p><h3>{activeProject}</h3></div><button className="text-button" onClick={() => setScreen('plan')}>View full plan <Icon name="arrow" /></button></div><div className="progress-summary"><div className="progress-big">{projectProgress}<span>%</span></div><div><strong>overall progress</strong><p>{completedCount} complete · {inProgressCount} in motion</p></div><div className="progress-track"><span style={{ width: `${projectProgress}%` }} /></div></div><div className="path-list">{projectNodes.slice(0, 6).map((node) => <PathRow key={node.id} node={node} nodes={projectNodes} onClick={() => setPreviewNode(node)} />)}</div></div>
              <div className="today-card panel-card"><div className="panel-heading"><div><p className="overline">Today</p><h3>A little momentum</h3></div><span className="today-spark">✦</span></div><div className="stat-stack"><div className="stat-line"><span className="stat-number">{readyCount}</span><span><strong>ready to start</strong><small>after prerequisite checks</small></span></div><div className="stat-line"><span className="stat-number">{inProgressCount}</span><span><strong>in progress</strong><small>keep the thread warm</small></span></div><div className="stat-line"><span className="stat-number">{Math.max(0, projectNodes.length - completedCount)}</span><span><strong>still ahead</strong><small>no need to solve today</small></span></div></div><div className="tiny-tip"><span>✦</span><p><strong>Small is a strategy.</strong><br />A 10-minute start counts as a real start.</p></div></div>
            </section>
          </>
        ) : (
          <PlanScreen nodes={projectNodes} onOpen={(node) => setPreviewNode(node)} onBack={() => setScreen('start')} />
        )}
      </main>

      {notice && <div className="toast" role="status"><span className="toast-check">✓</span>{notice}</div>}
      {previewNode && <SessionModal node={previewNode} onClose={() => setPreviewNode(null)} onOpen={() => openSource(previewNode)} onAction={updateNode} />}
      {catchUpOpen && <CatchUpModal nodes={nodes} onClose={() => setCatchUpOpen(false)} onAction={updateNode} />}
    </div>
  )
}

function PathRow({ node, nodes, onClick }) {
  const gate = getPrerequisiteStatus(node, nodes)
  const isBlocked = node.status !== 'done' && !gate.satisfied
  return <button className="path-row" onClick={onClick}><span className={node.status === 'done' ? 'row-status done' : isBlocked ? 'row-status blocked' : node.status === 'in_progress' ? 'row-status current' : 'row-status'}>{node.status === 'done' ? <Icon name="check" /> : isBlocked ? <Icon name="lock" /> : ''}</span><span className="row-title"><strong>{node.title}</strong><small>{isBlocked ? gate.blockedReasons[0] : statusLabel(node)}</small></span><span className="row-progress"><span style={{ width: `${progressValue(node)}%` }} /></span><span className="row-arrow">›</span></button>
}

function PlanScreen({ nodes, onOpen, onBack }) {
  const groups = [...new Set(nodes.map((node) => node.project))]
  return <section className="plan-screen"><div className="plan-header"><div><p className="overline">Your plan</p><h1>Everything has a place.</h1><p className="welcome-copy">The graph stays in the background. Your next action stays in front.</p></div><button className="ghost-button" onClick={onBack}>Back to start <Icon name="arrow" /></button></div><div className="plan-toolbar"><span>{nodes.length} nodes in this view</span><span className="legend"><span className="legend-dot done" /> done <span className="legend-dot current" /> in progress <span className="legend-dot locked" /> locked</span></div>{groups.map((group) => <div className="plan-group" key={group}><div className="group-title"><span className="project-dot violet" />{group}<span>{nodes.filter((node) => node.project === group && node.status === 'done').length}/{nodes.filter((node) => node.project === group).length}</span></div><div className="plan-grid">{nodes.filter((node) => node.project === group).map((node) => <PlanNode key={node.id} node={node} nodes={nodes} onOpen={onOpen} />)}</div></div>)}</section>
}

function PlanNode({ node, nodes, onOpen }) {
  const gate = getPrerequisiteStatus(node, nodes)
  const locked = node.status !== 'done' && !gate.satisfied
  return <button className={locked ? 'plan-node locked' : node.status === 'done' ? 'plan-node done' : 'plan-node'} onClick={() => onOpen(node)}><div className="plan-node-top"><span className="node-index">{node.eyebrow.split('·')[1]?.trim() ?? '•'}</span><span className="node-state">{node.status === 'done' ? 'Done' : locked ? 'Locked' : 'Open'}</span></div><h3>{node.title}</h3><p>{locked ? gate.blockedReasons[0] : node.description}</p><div className="node-footer"><span>{progressValue(node)}%</span><span className="mini-track"><span style={{ width: `${progressValue(node)}%` }} /></span><span>{formatDueDate(node.deadline)}</span></div></button>
}

function SessionModal({ node, onClose, onOpen, onAction }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="session-modal" role="dialog" aria-modal="true" aria-label={`Start ${node.title}`}><div className="modal-top"><div><span className="focus-label"><span className="pulse-dot" /> Focus session</span><p className="modal-eyebrow">{node.eyebrow}</p></div><button className="modal-close" onClick={onClose} aria-label="Close">×</button></div><div className="modal-content"><div className="modal-question"><p className="overline">Before you open the source</p><h2>{node.question}</h2><p className="modal-note">Take a guess first. This turns a preview into an active start.</p><div className="answer-line">Write one sentence in your head, then open the resource.</div></div><div className="modal-resource"><div className="resource-header"><span className="pdf-icon">PDF</span><div><strong>{node.resource.label}</strong><span>{node.estimatedMinutes} minute focus · {node.project}</span></div></div><div className="modal-page"><div className="page-kicker">{node.project}</div><div className="page-title">{node.title}</div><div className="page-line wide" /><div className="page-line" /><div className="page-diagram"><span /><span /><span /></div><div className="page-line" /><div className="page-line short" /></div><button className="open-source" onClick={onOpen}>Open source <Icon name="external" /></button></div></div><div className="modal-actions"><button className="secondary-button" onClick={() => onAction(node.id, 'partial')}>Partly done</button><button className="primary-button" onClick={() => onAction(node.id, 'done')}>Mark complete <Icon name="check" /></button><button className="modal-skip" onClick={() => onAction(node.id, 'skip')}>Skip for now</button></div></section></div>
}

function CatchUpModal({ nodes, onClose, onAction }) {
  const unfinished = nodes.filter((node) => node.status !== 'done')
  const [selectedId, setSelectedId] = useState(unfinished[0]?.id ?? '')
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="small-modal" role="dialog" aria-modal="true"><div className="modal-top"><div><span className="focus-label"><span className="pulse-dot" /> Quick update</span><h2>What did you work on?</h2></div><button className="modal-close" onClick={onClose} aria-label="Close">×</button></div><p className="modal-note">Keep your plan honest without needing to do the work inside Just Start.</p><label className="select-label" htmlFor="catch-up-node">Choose a topic</label><select id="catch-up-node" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{unfinished.map((node) => <option key={node.id} value={node.id}>{node.project} · {node.title}</option>)}</select><button className="primary-button full-button" onClick={() => selectedId && onAction(selectedId, 'elsewhere')}>Save 65% progress <Icon name="check" /></button></section></div>
}

export default App
