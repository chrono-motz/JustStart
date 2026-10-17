import { useEffect, useMemo, useRef, useState } from 'react'
import {
  evaluateCandidates,
  getPrerequisiteStatus,
  selectRecommendedNode,
} from './domain/selection.js'
import { loadWorkspace, saveWorkspace } from './domain/persistence.js'
import { browserResourceUrl, createImportedNode, resourceLabel } from './domain/resources.js'
import { parseQuestionPack } from './domain/questionPacks.js'
import { isResearchResource, researchMetadataFromFile, researchNodeFields } from './domain/research.js'
import { createDriveClient, DRIVE_APP_FOLDER_NAME } from './domain/drive.js'
import { requestDriveAccess } from './domain/googleAuth.js'
import { makeSyncEnvelope, mergeWorkspaces, normaliseSyncedWorkspace } from './domain/sync.js'
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

function resourceBadge(node) {
  const kind = node?.resource?.type ?? 'other'
  const labels = {
    pdf: 'PDF',
    document: 'DOC',
    spreadsheet: 'SHEET',
    presentation: 'SLIDES',
    image: 'IMAGE',
    video: 'VIDEO',
    audio: 'AUDIO',
    archive: 'ZIP',
    code: 'CODE',
    text: 'TEXT',
    other: 'FILE',
  }
  return labels[kind] ?? 'FILE'
}

function resourceDescription(node) {
  if (node?.resource?.type === 'pdf') return 'PDF preview'
  return `${resourceBadge(node)} resource`
}

function getBrowserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const THEME_STORAGE_KEY = 'just-start.theme'
const DRIVE_STATE_STORAGE_KEY = 'just-start.drive'
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

function readStoredTheme() {
  try {
    return getBrowserStorage()?.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function readStoredDriveState() {
  try {
    const raw = getBrowserStorage()?.getItem(DRIVE_STATE_STORAGE_KEY)
    const value = raw ? JSON.parse(raw) : null
    return value && typeof value === 'object' ? value : { connected: false }
  } catch {
    return { connected: false }
  }
}

function deviceId() {
  try {
    const storage = getBrowserStorage()
    const existing = storage?.getItem('just-start.device')
    if (existing) return existing
    const next = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(16).slice(2)}`
    storage?.setItem('just-start.device', next)
    return next
  } catch {
    return 'browser-device'
  }
}

function syncWorkspaceValue(nodes, focusAreas, activeProject, autoStart) {
  return {
    nodes: nodes.map((node) => {
      if (!node?.resource?.temporary) return node
      const { path: _temporaryPath, unavailable: _unavailable, ...resource } = node.resource
      return { ...node, resource }
    }),
    projects: focusAreas,
    activeProject,
    autoStart,
  }
}

function readStoredWorkspace() {
  const fallback = {
    nodes: initialNodes,
    projects: projects.filter((project) => project.name !== 'All focus areas'),
    activeProject: 'Compiler Design',
    autoStart: true,
  }
  const workspace = loadWorkspace(getBrowserStorage(), fallback)
  const storedNodes = Array.isArray(workspace.nodes) ? workspace.nodes : initialNodes
  const storedProjects = Array.isArray(workspace.projects) && workspace.projects.length ? workspace.projects : fallback.projects
  const researchLibrary = fallback.projects.find((project) => project.name === 'Research Library')
  const workspaceProjects = storedProjects.some((project) => project.name === 'Research Library')
    ? storedProjects
    : [...storedProjects, researchLibrary]
  return {
    nodes: storedNodes.map((node) => {
      if (!node?.resource?.temporary || !/^blob:/i.test(node.resource.path ?? '')) return node
      const { path: _temporaryPath, ...resource } = node.resource
      return { ...node, resource: { ...resource, unavailable: true } }
    }),
    projects: workspaceProjects,
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
    moon: 'M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z',
    sun: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    cloud: 'M7.5 18.5h9a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.4 9.2 4.5 4.5 0 0 0 7.5 18.5Z',
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
  const [theme, setTheme] = useState(readStoredTheme)
  const [driveConnection, setDriveConnection] = useState(readStoredDriveState)
  const [driveToken, setDriveToken] = useState('')
  const [driveBusy, setDriveBusy] = useState(false)
  const [nodes, setNodes] = useState(storedWorkspace.nodes)
  const [focusAreas, setFocusAreas] = useState(storedWorkspace.projects)
  const [activeProject, setActiveProject] = useState(storedWorkspace.activeProject)
  const [screen, setScreen] = useState(storedWorkspace.autoStart ? 'start' : 'plan')
  const [previewNode, setPreviewNode] = useState(null)
  const [catchUpOpen, setCatchUpOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importDestination, setImportDestination] = useState({ project: storedWorkspace.activeProject === 'All focus areas' ? '' : storedWorkspace.activeProject, parentId: '' })
  const [topicModalOpen, setTopicModalOpen] = useState(false)
  const [autoStart, setAutoStart] = useState(storedWorkspace.autoStart)
  const [notice, setNotice] = useState('')
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)
  const driveSyncInFlight = useRef(false)
  const driveDeviceId = useMemo(deviceId, [])
  const driveClient = useMemo(
    () => driveToken ? createDriveClient({ accessToken: driveToken }) : null,
    [driveToken],
  )

  useEffect(() => {
    saveWorkspace(getBrowserStorage(), { nodes, projects: focusAreas, activeProject, autoStart })
  }, [activeProject, autoStart, focusAreas, nodes])

  useEffect(() => {
    try {
      getBrowserStorage()?.setItem(DRIVE_STATE_STORAGE_KEY, JSON.stringify(driveConnection))
    } catch {
      // Drive connection metadata is only a convenience; OAuth remains the source of access.
    }
  }, [driveConnection])

  useEffect(() => {
    if (!driveClient || driveBusy) return undefined
    const timer = window.setTimeout(async () => {
      try {
        await driveClient.putWorkspaceFile(makeSyncEnvelope(
          syncWorkspaceValue(nodes, focusAreas, activeProject, autoStart),
          driveDeviceId,
          new Date(),
        ))
        setDriveConnection((current) => ({ ...current, connected: true, lastSyncedAt: new Date().toISOString() }))
      } catch {
        showNotice('Drive sync paused. Your local changes are still safe.')
      }
    }, 900)
    const poll = window.setInterval(async () => {
      if (driveSyncInFlight.current || driveBusy) return
      driveSyncInFlight.current = true
      try {
        const remoteFile = await driveClient.getWorkspaceFile()
        const remoteWorkspace = normaliseSyncedWorkspace(remoteFile?.content, null)
        if (!remoteWorkspace) return
        const mergedWorkspace = mergeWorkspaces(
          syncWorkspaceValue(nodes, focusAreas, activeProject, autoStart),
          remoteWorkspace,
        )
        setNodes(mergedWorkspace.nodes)
        setFocusAreas(mergedWorkspace.projects)
        setActiveProject(mergedWorkspace.activeProject || activeProject)
        setAutoStart(typeof mergedWorkspace.autoStart === 'boolean' ? mergedWorkspace.autoStart : autoStart)
        await driveClient.putWorkspaceFile(makeSyncEnvelope(mergedWorkspace, driveDeviceId, new Date()), {
          fileId: remoteFile?.id,
        })
        setDriveConnection((current) => ({ ...current, connected: true, lastSyncedAt: new Date().toISOString() }))
      } catch {
        // Keep working locally; the next poll or token refresh can recover sync.
      } finally {
        driveSyncInFlight.current = false
      }
    }, 60_000)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(poll)
    }
  }, [activeProject, autoStart, driveBusy, driveClient, driveDeviceId, focusAreas, nodes])

  useEffect(() => {
    if (!driveToken) return undefined
    const refresh = window.setTimeout(async () => {
      try {
        const { accessToken } = await requestDriveAccess({ clientId: GOOGLE_CLIENT_ID })
        setDriveToken(accessToken)
      } catch {
        showNotice('Drive access expired. Click Reconnect Drive to continue syncing.')
      }
    }, 45 * 60 * 1000)
    return () => window.clearTimeout(refresh)
  }, [driveToken])

  useEffect(() => {
    try {
      getBrowserStorage()?.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Theme preference remains usable when browser storage is unavailable.
    }
  }, [theme])

  const allProjects = useMemo(() => [{ name: 'All focus areas', color: 'ink' }, ...focusAreas], [focusAreas])

  const activeArea = useMemo(
    () => focusAreas.find((focusArea) => focusArea.name === activeProject) ?? { name: activeProject, mode: 'study' },
    [activeProject, focusAreas],
  )

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
    const sourcePath = node?.resource?.path
    const browserUrl = browserResourceUrl(node?.resource)
    const driveFileId = node?.resource?.driveFileId
    if (driveFileId && !browserUrl && !sourcePath) {
      if (!driveClient) {
        showNotice('Connect Google Drive to open this file on this device.')
        return
      }
      const opened = window.open(driveClient.webViewUrl(driveFileId), '_blank', 'noopener,noreferrer')
      if (!opened) showNotice('The browser blocked the Drive file window. Allow pop-ups for Just Start.')
      return
    }
    if (!browserUrl && !sourcePath) {
      showNotice('This resource needs to be added again before it can open.')
      return
    }
    if (window.justStart?.openResource && sourcePath && !/^(?:blob|data):/i.test(sourcePath)) {
      window.justStart.openResource(sourcePath).then((result) => {
        if (!result?.ok) showNotice(result?.error ?? 'Unable to open this resource.')
      })
      return
    }
    const opened = window.open(browserUrl, '_blank', 'noopener,noreferrer')
    if (!opened) showNotice('The browser blocked the resource window. Allow pop-ups for Just Start.')
  }

  async function connectGoogleDrive() {
    if (driveBusy) return
    setDriveBusy(true)
    try {
      const { accessToken } = await requestDriveAccess({ clientId: GOOGLE_CLIENT_ID })
      const client = createDriveClient({ accessToken })
      const remoteFile = await client.getWorkspaceFile()
      const localWorkspace = syncWorkspaceValue(nodes, focusAreas, activeProject, autoStart)
      const remoteWorkspace = remoteFile ? normaliseSyncedWorkspace(remoteFile.content, null) : null
      const mergedWorkspace = remoteWorkspace
        ? mergeWorkspaces(localWorkspace, remoteWorkspace)
        : localWorkspace
      const written = await client.putWorkspaceFile(
        makeSyncEnvelope(mergedWorkspace, driveDeviceId, new Date()),
        remoteFile?.id ? { fileId: remoteFile.id } : {},
      )
      setNodes(Array.isArray(mergedWorkspace.nodes) ? mergedWorkspace.nodes : nodes)
      setFocusAreas(Array.isArray(mergedWorkspace.projects) ? mergedWorkspace.projects : focusAreas)
      setActiveProject(mergedWorkspace.activeProject || activeProject)
      setAutoStart(typeof mergedWorkspace.autoStart === 'boolean' ? mergedWorkspace.autoStart : autoStart)
      setDriveToken(accessToken)
      setDriveConnection({
        connected: true,
        folderId: written?.parents?.[0] || remoteFile?.parents?.[0],
        workspaceFileId: written?.id || remoteFile?.id,
        lastSyncedAt: new Date().toISOString(),
      })
      showNotice(`Google Drive connected. ${remoteWorkspace ? 'Workspace merged.' : `${DRIVE_APP_FOLDER_NAME} folder created.`}`)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Google Drive connection failed.')
    } finally {
      setDriveBusy(false)
    }
  }

  function disconnectGoogleDrive() {
    setDriveToken('')
    setDriveConnection({ connected: false })
    showNotice('Google Drive disconnected on this device. Local work remains available.')
  }

  async function addFiles(fileList, destination) {
    const files = Array.from(fileList ?? [])
    if (!files.length) return
    const uploading = Boolean(driveClient)
    if (uploading) setDriveBusy(true)
    const projectName = destination?.project || (activeProject === 'All focus areas' ? 'Imported resources' : activeProject)
    const projectMode = destination?.projectMode || focusAreas.find((focusArea) => focusArea.name === projectName)?.mode || 'study'
    const imported = []
    try {
      for (const [index, file] of files.entries()) {
        const node = createImportedNode(file, projectName, nodes.length + index)
        const shouldTreatAsResearch = projectMode === 'research' && isResearchResource(file)
        if (shouldTreatAsResearch) {
          const metadata = researchMetadataFromFile(file)
          Object.assign(node, researchNodeFields(metadata, projectName))
          node.title = metadata.title
          node.eyebrow = `${projectName} · paper`
          node.description = [
            metadata.authors.length ? metadata.authors.join(', ') : 'Author not inferred',
            metadata.year ?? 'Year unknown',
            metadata.doi ? `DOI ${metadata.doi}` : null,
          ].filter(Boolean).join(' · ')
        } else if (destination?.parentId && projectMode !== 'research') {
          node.parents = [destination.parentId]
          node.progressThreshold = 0.65
        }
        const fileName = String(file.name ?? '').toLowerCase()
        const mayBeQuestionPack = /\.(?:json|md|markdown)$/.test(fileName)
        if (mayBeQuestionPack && typeof file.text === 'function') {
          try {
            const text = await file.text()
            const pack = parseQuestionPack(text, file.name)
            if (pack) {
              node.title = pack.title
              node.description = `${pack.questions.length} questions${pack.subject ? ` · ${pack.subject}` : ''}. Optional answers and solutions are kept with the pack.`
              node.questionPack = pack
              node.resource.type = 'text'
            }
          } catch {
            // The file is still a normal resource when its contents cannot be read.
          }
        }
        if (driveClient) {
          try {
            const uploaded = await driveClient.uploadFile({
              name: file.name,
              mimeType: file.type || 'application/octet-stream',
              content: file,
            })
            node.resource = {
              ...node.resource,
              driveFileId: uploaded.id,
              driveWebViewUrl: driveClient.webViewUrl(uploaded.id),
              source: 'google-drive',
            }
          } catch {
            showNotice(`${file.name} stayed local because Drive upload failed.`)
          }
        }
        imported.push(node)
      }
    } finally {
      if (uploading) setDriveBusy(false)
    }
    if (projectName !== 'Imported resources' && !focusAreas.some((project) => project.name === projectName)) {
      setFocusAreas((current) => [...current, { name: projectName, color: projectMode === 'research' ? 'blue' : 'violet', mode: projectMode }])
    }
    setNodes((current) => [...current, ...imported])
    setActiveProject(projectName)
    setScreen('plan')
    showNotice(`${imported.length} ${imported.length === 1 ? 'resource' : 'resources'} added to ${projectName}.`)
  }

  function handleFileInput(event) {
    addFiles(event.target.files, importDestination)
    event.target.value = ''
  }

  function openImportModal(destination = {}) {
    setImportDestination({
      project: destination.project ?? (activeProject === 'All focus areas' ? '' : activeProject),
      parentId: destination.parentId ?? '',
      projectMode: destination.projectMode ?? focusAreas.find((focusArea) => focusArea.name === (destination.project ?? activeProject))?.mode ?? 'study',
    })
    setImportModalOpen(true)
  }

  function chooseImportDestination(destination) {
    setImportDestination(destination)
    setImportModalOpen(false)
    window.setTimeout(() => {
      if (destination.mode === 'folder') folderInputRef.current?.click()
      else fileInputRef.current?.click()
    }, 0)
  }

  function createTopic({ title, project, parentId, description, question, mode }) {
    const projectName = project.name
    const node = {
      id: `topic-${Date.now()}`,
      project: projectName,
      kind: mode === 'research' ? 'research-topic' : 'topic',
      title,
      eyebrow: `${projectName} · topic`,
      description: description || `A new topic in ${projectName}.`,
      resource: { type: 'other', label: 'Topic' },
      progress: 0,
      status: 'todo',
      importance: 0.6,
      unlockValue: 0.6,
      startability: 0.75,
      estimatedMinutes: 15,
    }
    if (parentId && mode !== 'research') {
      node.parents = [parentId]
      node.progressThreshold = 0.65
    }
    if (!focusAreas.some((focusArea) => focusArea.name === projectName)) {
      setFocusAreas((current) => [...current, { ...project, mode }])
    }
    setNodes((current) => [...current, node])
    setActiveProject(projectName)
    setTopicModalOpen(false)
    setScreen('plan')
    showNotice(`Topic added to ${projectName}.`)
  }

  function removeNode(nodeId) {
    const removed = nodes.find((node) => node.id === nodeId)
    if (!removed) return
    setNodes((current) => current
      .filter((node) => node.id !== nodeId)
      .map((node) => {
        if (!Array.isArray(node.parents)) return node
        const parents = node.parents.filter((parent) => (typeof parent === 'object' ? parent.id : parent) !== nodeId)
        return parents.length ? { ...node, parents } : (() => { const { parents: _parents, progressThreshold: _threshold, ...withoutGate } = node; return withoutGate })()
      }))
    showNotice(`Removed ${removed.title}. Its children are now independent.`)
  }

  function removeFocusArea(projectName) {
    if (!window.confirm(`Remove ${projectName} and its topics from this workspace?`)) return
    setFocusAreas((current) => current.filter((project) => project.name !== projectName))
    setNodes((current) => current.filter((node) => node.project !== projectName))
    if (activeProject === projectName) setActiveProject('All focus areas')
    showNotice(`Removed ${projectName}.`)
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

  function toggleTheme() {
    setTheme((current) => current === 'dark' ? 'light' : 'dark')
  }

  function selectProject(project) {
    setActiveProject(project)
    const selectedArea = focusAreas.find((focusArea) => focusArea.name === project)
    setScreen(selectedArea?.mode === 'research' ? 'plan' : 'start')
  }

  return (
    <div className="app-shell" data-theme={theme}>
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
          {allProjects.map((project) => (
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
          <button className="project-item add-project-item" onClick={() => setTopicModalOpen(true)}><Icon name="plus" /><span>New focus area</span></button>
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
          <button className="nav-item theme-toggle" onClick={toggleTheme} aria-pressed={theme === 'dark'} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} /> <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button className="nav-item drive-toggle" onClick={driveToken ? disconnectGoogleDrive : connectGoogleDrive} disabled={driveBusy} aria-label={driveToken ? 'Disconnect Google Drive' : 'Connect Google Drive'}>
            <Icon name="cloud" /> <span>{driveBusy ? 'Connecting…' : driveToken ? 'Drive synced' : driveConnection.connected ? 'Reconnect Drive' : 'Connect Google Drive'}</span>
          </button>
          <div className="profile-row"><div className="avatar">A</div><div><strong>Alex</strong><span>Local workspace</span></div><span className="more">•••</span></div>
        </div>
      </aside>

      <main className="main-content">
        <input ref={fileInputRef} className="hidden-file-input" type="file" multiple accept="*/*" onChange={handleFileInput} />
        <input ref={folderInputRef} className="hidden-file-input" type="file" multiple accept="*/*" webkitdirectory="" directory="" onChange={handleFileInput} />
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-separator">/</span><strong>{activeProject}</strong></div>
          <div className="topbar-actions"><span className="saved-indicator"><span className="saved-dot" /> Saved locally</span><button className="icon-button" aria-label="Settings" onClick={() => showNotice('Your progress is stored in this browser for now.')}><Icon name="settings" /></button></div>
        </header>

        {screen === 'start' ? (
          <>
            <section className="welcome-row">
              <div><p className="overline">{todayLabel}</p><h1>Good morning, Alex<span className="wave">✦</span></h1><p className="welcome-copy">You do not need to plan the whole day. Just begin with the next useful thing.</p></div>
              <div className="welcome-actions"><button className="ghost-button" onClick={() => openImportModal()}><Icon name="plus" /> Add resources</button><button className="ghost-button secondary-ghost" onClick={() => setCatchUpOpen(true)}>Log work elsewhere</button></div>
            </section>

            {recommendation ? (
              <section className="focus-card">
                <div className="focus-main">
                  <div className="card-topline"><span className="focus-label"><span className="pulse-dot" /> Your next best start</span><span className="date-chip">Due {formatDueDate(recommendation.deadline)}</span></div>
                  <div className="recommendation-eyebrow">{recommendation.eyebrow}</div>
                  <h2>{recommendation.title}</h2>
                  <p className="focus-description">{recommendation.description}</p>
                  <div className="meta-row"><span><span className="meta-icon">◷</span> {recommendation.estimatedMinutes ?? 10} min</span><span><span className="meta-icon">◌</span> {resourceDescription(recommendation)}</span><span><span className="meta-icon">↗</span> {recommendation.project}</span></div>
                  <div className="focus-actions"><button className="primary-button" onClick={() => setPreviewNode(recommendation)}>Start this <Icon name="arrow" /></button><button className="secondary-button" onClick={() => updateNode(recommendation.id, 'done')}><Icon name="check" /> Mark done</button><button className="icon-action" onClick={() => updateNode(recommendation.id, 'skip')} aria-label="Skip this item"><Icon name="skip" /></button></div>
                </div>
                <div className="document-preview" onClick={() => setPreviewNode(recommendation)} role="button" tabIndex="0" onKeyDown={(event) => event.key === 'Enter' && setPreviewNode(recommendation)}>
                  <div className="preview-toolbar"><span className="preview-file"><span className="pdf-icon">{resourceBadge(recommendation)}</span> {resourceLabel(recommendation.resource)}</span><span>Ready to open</span></div>
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
          <PlanScreen nodes={projectNodes} area={activeArea} onOpen={(node) => setPreviewNode(node)} onBack={() => setScreen('start')} onAddFiles={() => openImportModal()} onAddFolder={() => openImportModal({ mode: 'folder' })} onAddTopic={() => setTopicModalOpen(true)} onAddChild={(node) => openImportModal({ project: node.project, parentId: node.id })} onRemoveNode={removeNode} onRemoveProject={removeFocusArea} />
        )}
      </main>

      {notice && <div className="toast" role="status"><span className="toast-check">✓</span>{notice}</div>}
      {previewNode && <SessionModal node={previewNode} onClose={() => setPreviewNode(null)} onOpen={() => openSource(previewNode)} onAction={updateNode} />}
      {catchUpOpen && <CatchUpModal nodes={nodes} onClose={() => setCatchUpOpen(false)} onAction={updateNode} />}
      {importModalOpen && <ImportModal focusAreas={focusAreas} nodes={nodes} initialDestination={importDestination} onClose={() => setImportModalOpen(false)} onChoose={chooseImportDestination} />}
      {topicModalOpen && <TopicModal focusAreas={focusAreas} nodes={nodes} activeProject={activeProject} onClose={() => setTopicModalOpen(false)} onCreate={createTopic} />}
    </div>
  )
}

function PathRow({ node, nodes, onClick }) {
  const gate = getPrerequisiteStatus(node, nodes)
  const isBlocked = node.status !== 'done' && !gate.satisfied
  return <button className="path-row" onClick={onClick}><span className={node.status === 'done' ? 'row-status done' : isBlocked ? 'row-status blocked' : node.status === 'in_progress' ? 'row-status current' : 'row-status'}>{node.status === 'done' ? <Icon name="check" /> : isBlocked ? <Icon name="lock" /> : ''}</span><span className="row-title"><strong>{node.title}</strong><small>{isBlocked ? gate.blockedReasons[0] : statusLabel(node)}</small></span><span className="row-progress"><span style={{ width: `${progressValue(node)}%` }} /></span><span className="row-arrow">›</span></button>
}

function PlanScreen({ nodes, area, onOpen, onBack, onAddFiles, onAddFolder, onAddTopic, onAddChild, onRemoveNode, onRemoveProject }) {
  const [expandedGroups, setExpandedGroups] = useState({})
  const groups = [...new Set(nodes.map((node) => node.project))]
  const isResearch = area?.mode === 'research'
  if (isResearch && nodes.length === 0) {
    return <section className="plan-screen"><div className="plan-header"><div><p className="overline">Research library</p><h1>Read broadly. Connect later.</h1><p className="welcome-copy">Papers are grouped by topic, not locked behind a prerequisite chain.</p></div><div className="plan-actions"><button className="ghost-button" onClick={onAddTopic}><Icon name="plus" /> New topic</button><button className="ghost-button" onClick={onAddFiles}><Icon name="plus" /> Add files</button><button className="ghost-button" onClick={onAddFolder}><Icon name="layers" /> Add folder</button><button className="ghost-button" onClick={onBack}>Back to start <Icon name="arrow" /></button></div></div><div className="plan-toolbar"><span>0 papers and research resources · kept concise</span><span className="legend"><span className="legend-dot locked" /> topic shelf</span></div><section className="empty-state"><div className="empty-icon">+</div><h2>Your research library is ready.</h2><p>Add papers or folders from your phone or desktop. Just Start can open files available on the device where you add them; files left only on another laptop need to be moved or added there first.</p><div className="focus-actions"><button className="primary-button" onClick={onAddFiles}><Icon name="plus" /> Add papers</button><button className="secondary-button" onClick={onAddFolder}><Icon name="layers" /> Add a folder</button></div></section></section>
  }
  return <section className="plan-screen"><div className="plan-header"><div><p className="overline">{isResearch ? 'Research library' : 'Your plan'}</p><h1>{isResearch ? 'Read broadly. Connect later.' : 'Everything has a place.'}</h1><p className="welcome-copy">{isResearch ? 'Papers are grouped by topic, not locked behind a prerequisite chain.' : 'The graph stays in the background. Your next action stays in front.'}</p></div><div className="plan-actions"><button className="ghost-button" onClick={onAddTopic}><Icon name="plus" /> New topic</button><button className="ghost-button" onClick={onAddFiles}><Icon name="plus" /> Add files</button><button className="ghost-button" onClick={onAddFolder}><Icon name="layers" /> Add folder</button><button className="ghost-button" onClick={onBack}>Back to start <Icon name="arrow" /></button></div></div><div className="plan-toolbar"><span>{nodes.length} {isResearch ? 'papers and research resources' : 'nodes'} · kept concise</span><span className="legend"><span className="legend-dot done" /> done <span className="legend-dot current" /> in progress {isResearch ? <><span className="legend-dot locked" /> topic shelf</> : <><span className="legend-dot locked" /> locked</>}</span></div>{groups.map((group) => { const groupNodes = nodes.filter((node) => node.project === group); const expanded = expandedGroups[group]; const visibleNodes = expanded ? groupNodes : groupNodes.slice(0, 8); return <div className="plan-group" key={group}><div className="group-title"><span className={`project-dot ${isResearch ? 'blue' : 'violet'}`} />{group}<span>{groupNodes.filter((node) => node.status === 'done').length}/{groupNodes.length}</span><button className="remove-area-button" onClick={() => onRemoveProject(group)}>remove area</button></div><div className={isResearch ? 'plan-grid research-grid' : 'plan-grid'}>{visibleNodes.map((node) => <PlanNode key={node.id} node={node} nodes={nodes} isResearch={isResearch} onOpen={onOpen} onAddChild={onAddChild} onRemove={onRemoveNode} />)}</div>{groupNodes.length > 8 && <button className="show-more-button" onClick={() => setExpandedGroups((current) => ({ ...current, [group]: !expanded }))}>{expanded ? 'Show fewer' : `Show 8 of ${groupNodes.length} · show more`}</button>}</div>})}</section>
}

function PlanNode({ node, nodes, isResearch, onOpen, onAddChild, onRemove }) {
  const gate = getPrerequisiteStatus(node, nodes)
  const locked = !isResearch && node.status !== 'done' && !gate.satisfied
  const researchLine = node.research ? [node.research.authors?.join(', '), node.research.year, node.research.doi].filter(Boolean).join(' · ') : null
  return <div className={locked ? 'plan-node locked' : node.status === 'done' ? 'plan-node done' : isResearch ? 'plan-node research-node' : 'plan-node'}><button className="plan-node-main" onClick={() => onOpen(node)}><div className="plan-node-top"><span className="node-index">{node.eyebrow.split('·')[1]?.trim() ?? '•'}</span><span className="node-state">{node.status === 'done' ? 'Done' : locked ? 'Locked' : isResearch ? 'Paper' : 'Open'}</span></div><h3>{node.title}</h3><p>{locked ? gate.blockedReasons[0] : researchLine || node.description}</p></button><div className="node-footer"><span>{progressValue(node)}%</span><span className="mini-track"><span style={{ width: `${progressValue(node)}%` }} /></span><span>{node.deadline ? formatDueDate(node.deadline) : resourceDescription(node)}</span>{!isResearch && <button className="add-child-button" onClick={() => onAddChild(node)} title={`Add a child to ${node.title}`}><Icon name="plus" /> child</button>}<button className="remove-node-button" onClick={() => onRemove(node.id)} title={`Remove ${node.title}`} aria-label={`Remove ${node.title}`}>×</button></div></div>
}

function SessionModal({ node, onClose, onOpen, onAction }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="session-modal" role="dialog" aria-modal="true" aria-label={`Start ${node.title}`}><div className="modal-top"><div><span className="focus-label"><span className="pulse-dot" /> Focus session</span><p className="modal-eyebrow">{node.eyebrow}</p></div><button className="modal-close" onClick={onClose} aria-label="Close">×</button></div><div className="modal-content"><div className="modal-intro"><p className="overline">Ready when you are</p><h2>Make a little progress.</h2><p className="modal-note">Open the source and take the next useful step at your own pace.</p><div className="session-note">A focused start is enough for today.</div></div><div className="modal-resource"><div className="resource-header"><span className="pdf-icon">{resourceBadge(node)}</span><div><strong>{resourceLabel(node.resource)}</strong><span>{node.estimatedMinutes ?? 10} minute focus · {node.project}</span></div></div><div className="modal-page"><div className="page-kicker">{node.project}</div><div className="page-title">{node.title}</div><div className="page-line wide" /><div className="page-line" /><div className="page-diagram"><span /><span /><span /></div><div className="page-line" /><div className="page-line short" /></div><button className="open-source" onClick={onOpen}>Open source <Icon name="external" /></button></div></div><div className="modal-actions"><button className="secondary-button" onClick={() => onAction(node.id, 'partial')}>Partly done</button><button className="primary-button" onClick={() => onAction(node.id, 'done')}>Mark complete <Icon name="check" /></button><button className="modal-skip" onClick={() => onAction(node.id, 'skip')}>Skip for now</button></div></section></div>
}

function ImportModal({ focusAreas, nodes, initialDestination, onClose, onChoose }) {
  const firstProject = initialDestination.project || focusAreas[0]?.name || ''
  const [projectChoice, setProjectChoice] = useState(firstProject)
  const [newProjectName, setNewProjectName] = useState('')
  const [parentId, setParentId] = useState(initialDestination.parentId || '')
  const [newProjectMode, setNewProjectMode] = useState('study')
  const effectiveProject = projectChoice === '__new__' ? newProjectName.trim() : projectChoice
  const existingProject = focusAreas.find((focusArea) => focusArea.name === effectiveProject)
  const effectiveMode = projectChoice === '__new__' ? newProjectMode : existingProject?.mode || initialDestination.projectMode || 'study'
  const parentOptions = nodes.filter((node) => node.project === effectiveProject)

  function choose(mode) {
    if (!effectiveProject) return
    onChoose({ project: effectiveProject, parentId: effectiveMode === 'research' ? '' : parentId, projectMode: effectiveMode, mode })
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="small-modal" role="dialog" aria-modal="true" aria-label="Add resources"><div className="modal-top"><div><span className="focus-label"><span className="pulse-dot" /> Add to your plan</span><h2>Where should these go?</h2></div><button className="modal-close" onClick={onClose} aria-label="Close">×</button></div><p className="modal-note">Pick a focus area. Study resources can attach to a parent; research papers stay as a broad, ungated topic shelf.</p><label className="select-label" htmlFor="import-project">Focus area</label><select id="import-project" value={projectChoice} onChange={(event) => { setProjectChoice(event.target.value); setParentId('') }}><option value="" disabled>Select a focus area</option>{focusAreas.map((focusArea) => <option key={focusArea.name} value={focusArea.name}>{focusArea.name}{focusArea.mode === 'research' ? ' · research' : ''}</option>)}<option value="__new__">＋ Create a new focus area</option></select>{projectChoice === '__new__' && <><input className="text-input" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="e.g. Quant Puzzles" autoFocus /><label className="select-label" htmlFor="import-mode">Area type</label><select id="import-mode" value={newProjectMode} onChange={(event) => { setNewProjectMode(event.target.value); setParentId('') }}><option value="study">Study plan · prerequisites allowed</option><option value="research">Research library · no prerequisites</option></select></>}{effectiveProject && effectiveMode !== 'research' && parentOptions.length > 0 && <><label className="select-label" htmlFor="import-parent">Parent topic <span>(optional)</span></label><select id="import-parent" value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">No parent · start a new branch</option>{parentOptions.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select></>}{effectiveMode === 'research' && <div className="research-callout">Research mode: PDFs and citation files are grouped here without directed prerequisite gates.</div>}<div className="import-actions"><button className="primary-button" onClick={() => choose('files')} disabled={!effectiveProject}>Choose files <Icon name="plus" /></button><button className="secondary-button" onClick={() => choose('folder')} disabled={!effectiveProject}>Choose folder</button></div><p className="form-hint">Any extension is accepted. A JSON or Markdown question pack becomes one concise question collection.</p></section></div>
}

function TopicModal({ focusAreas, nodes, activeProject, onClose, onCreate }) {
  const initialProject = activeProject !== 'All focus areas' && focusAreas.some((focusArea) => focusArea.name === activeProject) ? activeProject : focusAreas[0]?.name ?? ''
  const [title, setTitle] = useState('')
  const [projectChoice, setProjectChoice] = useState(initialProject)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectMode, setNewProjectMode] = useState('study')
  const [description, setDescription] = useState('')
  const [question, setQuestion] = useState('')
  const [parentId, setParentId] = useState('')
  const effectiveProject = projectChoice === '__new__' ? newProjectName.trim() : projectChoice
  const existingProject = focusAreas.find((focusArea) => focusArea.name === effectiveProject)
  const effectiveMode = projectChoice === '__new__' ? newProjectMode : existingProject?.mode || 'study'
  const parentOptions = nodes.filter((node) => node.project === effectiveProject)

  function submit(event) {
    event.preventDefault()
    if (!title.trim() || !effectiveProject) return
    onCreate({ title: title.trim(), project: { name: effectiveProject, color: effectiveMode === 'research' ? 'blue' : 'violet' }, mode: effectiveMode, parentId: effectiveMode === 'research' ? '' : parentId, description: description.trim() })
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="small-modal topic-modal" role="dialog" aria-modal="true" aria-label="Create a topic" onSubmit={submit}><div className="modal-top"><div><span className="focus-label"><span className="pulse-dot" /> Shape your path</span><h2>New topic</h2></div><button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button></div><p className="modal-note">Create a topic now, then attach files or questions to it later.</p><label className="select-label" htmlFor="topic-title">Topic name</label><input id="topic-title" className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Probability puzzles" autoFocus /><label className="select-label" htmlFor="topic-project">Focus area</label><select id="topic-project" value={projectChoice} onChange={(event) => { setProjectChoice(event.target.value); setParentId('') }}><option value="" disabled>Select a focus area</option>{focusAreas.map((focusArea) => <option key={focusArea.name} value={focusArea.name}>{focusArea.name}{focusArea.mode === 'research' ? ' · research' : ''}</option>)}<option value="__new__">＋ Create a new focus area</option></select>{projectChoice === '__new__' && <><input className="text-input" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="e.g. Quant Puzzles" /><label className="select-label" htmlFor="topic-mode">Area type</label><select id="topic-mode" value={newProjectMode} onChange={(event) => { setNewProjectMode(event.target.value); setParentId('') }}><option value="study">Study plan · prerequisites allowed</option><option value="research">Research library · no prerequisites</option></select></>}{effectiveProject && effectiveMode !== 'research' && parentOptions.length > 0 && <><label className="select-label" htmlFor="topic-parent">Parent topic <span>(optional)</span></label><select id="topic-parent" value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">No parent · top-level topic</option>{parentOptions.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select></>}{effectiveMode === 'research' && <div className="research-callout">Research topics are broad shelves. Papers in them are never blocked by prerequisites.</div>}<label className="select-label" htmlFor="topic-description">Short note <span>(optional)</span></label><input id="topic-description" className="text-input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What will this branch cover?" /><label className="select-label" htmlFor="topic-question">Start question <span>(optional)</span></label><input id="topic-question" className="text-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What should I understand first?" /><button className="primary-button full-button" type="submit" disabled={!title.trim() || !effectiveProject}>Create topic <Icon name="check" /></button></form></div>
}

function CatchUpModal({ nodes, onClose, onAction }) {
  const unfinished = nodes.filter((node) => node.status !== 'done')
  const [selectedId, setSelectedId] = useState(unfinished[0]?.id ?? '')
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="small-modal" role="dialog" aria-modal="true"><div className="modal-top"><div><span className="focus-label"><span className="pulse-dot" /> Quick update</span><h2>What did you work on?</h2></div><button className="modal-close" onClick={onClose} aria-label="Close">×</button></div><p className="modal-note">Keep your plan honest without needing to do the work inside Just Start.</p><label className="select-label" htmlFor="catch-up-node">Choose a topic</label><select id="catch-up-node" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{unfinished.map((node) => <option key={node.id} value={node.id}>{node.project} · {node.title}</option>)}</select><button className="primary-button full-button" onClick={() => selectedId && onAction(selectedId, 'elsewhere')}>Save 65% progress <Icon name="check" /></button></section></div>
}

export default App
