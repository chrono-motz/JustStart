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
import { mergeWorkspaces } from './domain/sync.js'
import { buildGraphModel } from './domain/graph.js'
import { normalizeAIIntakeManifest, AIIntakeValidationError } from './domain/aiIntake.js'
import { readZipFile } from './domain/zipIntake.js'
import { buildAIContext } from './domain/aiContext.js'
import {
  createSupabaseApi,
  createSupabaseBrowserClient,
  getSupabaseConfigStatus,
  getSupabaseSession,
  signInWithMagicLink,
  signOut,
} from './domain/supabase.js'
import { formatDueDate } from './data/sampleData.js'
import aiAgentInstructions from '../AI_IMPORT_INSTRUCTIONS.md?raw'

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
  if (node?.resource?.type === 'pdf') return 'PDF resource'
  return `${resourceBadge(node)} resource`
}

function comparableTopicTitle(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ')
}

function isImportedTopicPlaceholder(node) {
  return Boolean(node?.kind?.includes('topic') && (node.aiTopicId || node.id?.startsWith('ai-topic-') || node.resource?.source === 'ai-intake'))
}

function importedResourceKey(resource) {
  if (!resource) return ''
  if (resource.url) return `url:${String(resource.url).trim()}`
  if (resource.sourcePath) return `file:${String(resource.sourcePath).replaceAll('\\', '/')}`
  return ''
}

function getBrowserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const THEME_STORAGE_KEY = 'just-start.theme'
const USER_NAME_STORAGE_KEY = 'just-start.user-name'

function readStoredTheme() {
  try {
    return getBrowserStorage()?.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function readStoredUserName() {
  try {
    return getBrowserStorage()?.getItem(USER_NAME_STORAGE_KEY)?.trim() || ''
  } catch {
    return ''
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
    nodes: [],
    projects: [],
    activeProject: 'All focus areas',
    autoStart: true,
  }
  const workspace = loadWorkspace(getBrowserStorage(), fallback)
  const storedNodes = Array.isArray(workspace.nodes) ? workspace.nodes : fallback.nodes
  const storedProjects = Array.isArray(workspace.projects) ? workspace.projects : fallback.projects
  return {
    nodes: storedNodes.filter((node) => !isImportedTopicPlaceholder(node)).map((node) => {
      if (!node?.resource?.temporary || !/^blob:/i.test(node.resource.path ?? '')) return node
      const { path: _temporaryPath, ...resource } = node.resource
      return { ...node, resource: { ...resource, unavailable: true } }
    }),
    projects: storedProjects,
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
  const [userName, setUserName] = useState(readStoredUserName)
  const [nameModalOpen, setNameModalOpen] = useState(() => !readStoredUserName())
  const supabaseStatus = useMemo(() => getSupabaseConfigStatus(), [])
  const supabaseClient = useMemo(
    () => supabaseStatus.configured ? createSupabaseBrowserClient() : null,
    [supabaseStatus.configured],
  )
  const supabaseApi = useMemo(
    () => supabaseClient ? createSupabaseApi({ client: supabaseClient }) : null,
    [supabaseClient],
  )
  const [supabaseSession, setSupabaseSession] = useState(null)
  const [supabaseBusy, setSupabaseBusy] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [aiImportOpen, setAiImportOpen] = useState(false)
  const [aiImportManifest, setAiImportManifest] = useState(null)
  const [aiImportFiles, setAiImportFiles] = useState([])
  const [aiImportError, setAiImportError] = useState('')
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
  const supabaseSyncInFlight = useRef(false)
  const supabaseSyncReady = useRef(false)
  const workspaceRef = useRef({ nodes, focusAreas, activeProject, autoStart })

  useEffect(() => {
    workspaceRef.current = { nodes, focusAreas, activeProject, autoStart }
  }, [activeProject, autoStart, focusAreas, nodes])

  useEffect(() => {
    try {
      const storage = getBrowserStorage()
      if (userName) storage?.setItem(USER_NAME_STORAGE_KEY, userName)
    } catch {
      // The name is a convenience; the app remains usable without storage.
    }
  }, [userName])

  useEffect(() => {
    saveWorkspace(getBrowserStorage(), { nodes, projects: focusAreas, activeProject, autoStart })
  }, [activeProject, autoStart, focusAreas, nodes])

  useEffect(() => {
    if (!supabaseClient) return undefined
    let active = true
    getSupabaseSession({ client: supabaseClient }).then((session) => {
      if (active) setSupabaseSession(session)
    }).catch(() => {
      if (active) showNotice('Unable to check cloud sign-in status.')
    })
    const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (active) setSupabaseSession(session)
    })
    return () => {
      active = false
      data?.subscription?.unsubscribe()
    }
  }, [supabaseClient])

  useEffect(() => {
    if (!supabaseApi || !supabaseSession?.user?.id) {
      supabaseSyncReady.current = false
      return undefined
    }
    let active = true
    supabaseSyncReady.current = false
    setSupabaseBusy(true)
    async function loadRemoteWorkspace(showLoadedNotice = false) {
      if (supabaseSyncInFlight.current) return
      supabaseSyncInFlight.current = true
      try {
        const remoteRow = await supabaseApi.readWorkspace()
        if (!active) return
        const remoteWorkspace = remoteRow?.data
        if (remoteWorkspace) {
          const current = workspaceRef.current
          const mergedWorkspace = mergeWorkspaces(
            syncWorkspaceValue(current.nodes, current.focusAreas, current.activeProject, current.autoStart),
            remoteWorkspace,
          )
          workspaceRef.current = {
            nodes: mergedWorkspace.nodes,
            focusAreas: mergedWorkspace.projects,
            activeProject: mergedWorkspace.activeProject || current.activeProject,
            autoStart: typeof mergedWorkspace.autoStart === 'boolean' ? mergedWorkspace.autoStart : current.autoStart,
          }
          setNodes(mergedWorkspace.nodes)
          setFocusAreas(mergedWorkspace.projects)
          setActiveProject(mergedWorkspace.activeProject || current.activeProject)
          setAutoStart(typeof mergedWorkspace.autoStart === 'boolean' ? mergedWorkspace.autoStart : current.autoStart)
          if (showLoadedNotice) showNotice('Cloud workspace loaded.')
        }
        supabaseSyncReady.current = true
      } catch {
        if (active && showLoadedNotice) showNotice('Cloud workspace could not be loaded. Local work is safe.')
      } finally {
        supabaseSyncInFlight.current = false
        if (active) setSupabaseBusy(false)
      }
    }
    loadRemoteWorkspace(true)
    const poll = window.setInterval(() => loadRemoteWorkspace(false), 30_000)
    return () => {
      active = false
      window.clearInterval(poll)
    }
  }, [supabaseApi, supabaseSession?.user?.id])

  useEffect(() => {
    if (!supabaseApi || !supabaseSession?.user?.id || !supabaseSyncReady.current || supabaseBusy) return undefined
    const timer = window.setTimeout(async () => {
      if (supabaseSyncInFlight.current) return
      supabaseSyncInFlight.current = true
      try {
        await supabaseApi.upsertWorkspace(syncWorkspaceValue(nodes, focusAreas, activeProject, autoStart))
      } catch {
        showNotice('Cloud sync paused. Your local changes are still safe.')
      } finally {
        supabaseSyncInFlight.current = false
      }
    }, 900)
    return () => window.clearTimeout(timer)
  }, [activeProject, autoStart, focusAreas, nodes, supabaseApi, supabaseBusy, supabaseSession?.user?.id])

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

  function saveUserName(value) {
    const nextName = String(value ?? '').trim()
    if (!nextName) return
    setUserName(nextName)
    setNameModalOpen(false)
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

  async function openSource(node) {
    const sourcePath = node?.resource?.path
    const browserUrl = browserResourceUrl(node?.resource)
    const storagePath = node?.resource?.storagePath
    if (storagePath && supabaseApi && supabaseSession?.user?.id) {
      try {
        const signedUrl = await supabaseApi.createSignedStorageUrl(storagePath)
        const opened = window.open(signedUrl, '_blank', 'noopener,noreferrer')
        if (!opened) showNotice('The browser blocked the resource window. Allow pop-ups for Just Start.')
      } catch {
        showNotice('Unable to open this cloud resource right now.')
      }
      return
    }
    if (!browserUrl && !sourcePath) {
      showNotice(storagePath ? 'Sign in to open this cloud resource.' : 'This resource needs to be added again before it can open.')
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

  async function requestSupabaseSignIn(email) {
    if (!supabaseApi || !supabaseStatus.configured) {
      showNotice(`Cloud sync needs ${supabaseStatus.missing.join(' and ')}.`)
      return
    }
    setSupabaseBusy(true)
    try {
      await signInWithMagicLink(email, { client: supabaseClient, redirectTo: window.location.origin })
      setAuthEmail(email)
      setAuthMessage('Check your email for the secure sign-in link. This window can stay open.')
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Unable to send the sign-in link.')
    } finally {
      setSupabaseBusy(false)
    }
  }

  async function disconnectSupabase() {
    if (!supabaseApi) return
    setSupabaseBusy(true)
    try {
      await signOut({ client: supabaseClient })
      supabaseSyncReady.current = false
      setSupabaseSession(null)
      showNotice('Cloud sync disconnected. Local work remains available.')
    } catch {
      showNotice('Unable to disconnect cloud sync right now.')
    } finally {
      setSupabaseBusy(false)
    }
  }

  async function clearWorkspaceResources() {
    if (!nodes.length && !focusAreas.length) {
      showNotice('Your workspace is already empty.')
      return
    }
    if (!window.confirm(`Remove all ${nodes.length} resources and ${focusAreas.length} focus areas from this workspace?`)) return
    const storagePaths = nodes.map((node) => node?.resource?.storagePath).filter(Boolean)
    setNodes([])
    setFocusAreas([])
    setActiveProject('All focus areas')
    setScreen('start')
    if (storagePaths.length && supabaseApi && supabaseSession?.user?.id) {
      try {
        await supabaseApi.removeStorageFile(storagePaths)
      } catch {
        showNotice('Workspace cleared locally. Some cloud files could not be removed.')
        return
      }
    }
    showNotice('All workspace resources were removed. You can start a fresh intake.')
  }

  async function addFiles(fileList, destination) {
    const files = Array.from(fileList ?? [])
    if (!files.length) return
    const uploading = Boolean(supabaseApi && supabaseSession?.user?.id)
    if (uploading) setSupabaseBusy(true)
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
        if (supabaseApi && supabaseSession?.user?.id) {
          try {
            const storagePath = `${node.id}/${file.name || 'resource'}`
            await supabaseApi.uploadStorageFile(storagePath, file, {
              cacheControl: '3600',
              upsert: true,
              contentType: file.type || 'application/octet-stream',
            })
            node.resource = {
              ...node.resource,
              storagePath,
              source: 'supabase',
            }
          } catch {
            showNotice(`${file.name} stayed local because cloud upload failed.`)
          }
        }
        imported.push(node)
      }
    } finally {
      if (uploading) setSupabaseBusy(false)
    }
    if (projectName !== 'Imported resources' && !focusAreas.some((project) => project.name === projectName)) {
      setFocusAreas((current) => [...current, { name: projectName, color: projectMode === 'research' ? 'blue' : 'violet', mode: projectMode }])
    }
    setNodes((current) => [...current, ...imported])
    setActiveProject(projectName)
    setScreen('plan')
    showNotice(`${imported.length} ${imported.length === 1 ? 'resource' : 'resources'} added to ${projectName}.`)
  }

  function openAIImport() {
    setAiImportError('')
    setAiImportOpen(true)
  }

  function downloadAIInstructions() {
    const blob = new Blob([aiAgentInstructions], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'AGENTS.md'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function downloadAIContext() {
    const context = buildAIContext({ nodes, projects: focusAreas, generatedAt: new Date() })
    const blob = new Blob([`${JSON.stringify(context, null, 2)}\n`], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'JUSTSTART_CONTEXT.json'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function addAIImportFiles(nextFiles) {
    const incoming = Array.from(nextFiles ?? [])
    if (!incoming.length) return
    setAiImportFiles((current) => {
      const merged = new Map(current.map((file) => [String(file.webkitRelativePath || file.name), file]))
      incoming.forEach((file) => merged.set(String(file.webkitRelativePath || file.name), file))
      return [...merged.values()]
    })
    setAiImportError('')
  }

  async function handleAIArchive(file) {
    if (!file) return
    try {
      const unpacked = await readZipFile(file)
      addAIImportFiles(unpacked.files)
      const manifestFile = unpacked.files.find((entry) => /(?:^|\/)(?:manifest|just-start-manifest)\.json$/i.test(String(entry.webkitRelativePath || entry.name)))
      if (manifestFile) await handleAIManifest(manifestFile)
      showNotice(`Unpacked ${unpacked.files.length} source files from ${file.name}.`)
    } catch (error) {
      setAiImportError(error instanceof Error ? error.message : 'Unable to unpack this ZIP file.')
    }
  }

  function handleAISourceFiles(fileList) {
    addAIImportFiles(fileList)
  }

  async function handleAIManifest(file) {
    if (!file) return
    try {
      const raw = JSON.parse(await file.text())
      const result = normalizeAIIntakeManifest(raw)
      setAiImportManifest(result)
      setAiImportError('')
    } catch (error) {
      setAiImportManifest(null)
      setAiImportError(error instanceof AIIntakeValidationError ? error.message : 'The manifest is not valid JSON. Ask your AI agent to return the required JSON format.')
    }
  }

  async function importAIManifest({ project, mode } = {}) {
    if (!aiImportManifest) return
    const manifestItems = aiImportManifest.manifest.items
    const activeFocusArea = activeProject !== 'All focus areas'
      ? focusAreas.find((focusArea) => focusArea.name === activeProject)
      : null
    const inferredMode = mode || project?.mode || activeFocusArea?.mode || (manifestItems.length > 0 && manifestItems.every((item) => item.research) ? 'research' : 'study')
    const sourceFiles = new Map()
    for (const file of aiImportFiles) {
      const relative = String(file.webkitRelativePath || file.name || '').replaceAll('\\', '/')
      sourceFiles.set(relative, file)
      sourceFiles.set(relative.split('/').pop(), file)
    }
    const existingResources = new Set()
    const existingResourceNodes = new Map()
    const existingAIItems = new Map()
    for (const node of nodes) {
      const key = importedResourceKey(node.resource)
      if (key) {
        existingResources.add(key)
        existingResourceNodes.set(key, node)
      }
      if (node.aiItemId) existingAIItems.set(node.aiItemId, node)
    }

    const newItems = []
    let skippedItems = 0
    for (const item of aiImportManifest.manifest.items) {
      const sourceKey = item.resource.type === 'url'
        ? `url:${item.resource.url}`
        : `file:${item.resource.path}`
      if (existingAIItems.has(item.id) || existingResources.has(sourceKey)) {
        skippedItems += 1
        continue
      }
      newItems.push(item)
    }

    const topicsById = new Map()
    const existingItemUpdates = new Map()
    const topicsNeeded = new Set(aiImportManifest.manifest.items.map((item) => item.topicId))
    for (const topic of aiImportManifest.manifest.topics) {
      if (!topicsNeeded.has(topic.id)) continue
      const topicItems = aiImportManifest.manifest.items.filter((item) => item.topicId === topic.id)
      const matchingFocusArea = focusAreas.find((focusArea) => comparableTopicTitle(focusArea.name) === comparableTopicTitle(topic.title))
      const topicMode = matchingFocusArea?.mode || (topicItems.length > 0 && topicItems.every((item) => item.research) ? 'research' : inferredMode)
      const projectName = matchingFocusArea?.name || topic.title
      const focusArea = matchingFocusArea || { name: projectName, color: topicMode === 'research' ? 'blue' : 'violet', mode: topicMode }
      topicsById.set(topic.id, { title: topic.title, projectName, mode: topicMode, focusArea })
    }

    const itemIds = new Map()
    for (const item of aiImportManifest.manifest.items) {
      const existing = existingAIItems.get(item.id)
      const sourceKey = item.resource.type === 'url' ? `url:${item.resource.url}` : `file:${item.resource.path}`
      const existingByResource = existingResourceNodes.get(sourceKey)
      if (existing || existingByResource) itemIds.set(item.id, (existing || existingByResource).id)
      else itemIds.set(item.id, `ai-item-${item.id}`)
    }

    const itemNodes = []
    for (const [index, item] of newItems.entries()) {
      const itemId = itemIds.get(item.id)
      const topicRecord = topicsById.get(item.topicId)
      if (!topicRecord) continue
      let resource
      let sourceFile
      if (item.resource.type === 'file') {
        sourceFile = sourceFiles.get(item.resource.path) || sourceFiles.get(item.resource.path.split('/').pop())
        if (!sourceFile) continue
        const imported = createImportedNode(sourceFile, topicRecord.projectName, nodes.length + index)
        resource = { ...imported.resource, label: item.resource.label || sourceFile.name, sourcePath: item.resource.path, source: 'ai-intake' }
      } else {
        resource = { type: 'other', label: item.resource.label || item.resource.url, url: item.resource.url, source: 'ai-intake' }
      }
      const node = {
        id: itemId,
        aiItemId: item.id,
        project: topicRecord.projectName,
        topic: item.topicId,
        title: item.title,
        eyebrow: `${topicRecord.projectName} · AI item`,
        description: item.description || `AI-imported resource under ${topicRecord.title}.`,
        topicTitle: topicRecord.title,
        resource,
        progress: 0,
        status: 'todo',
        estimatedMinutes: item.estimatedMinutes || 15,
        difficulty: item.difficulty,
        question: 'What is the main idea I should take away from this resource?',
      }
      if (item.parents?.length && topicRecord.mode !== 'research') {
        node.parents = item.parents.map((parent) => {
          const parentId = typeof parent === 'object' ? parent.id : parent
          if (typeof parent === 'object') return { ...parent, id: itemIds.get(parentId) || `ai-item-${parentId}` }
          return itemIds.get(parentId) || `ai-item-${parentId}`
        })
        node.parentRule = item.parentRule || 'ALL'
        node.progressThreshold = item.progressThreshold ?? 0.65
      }
      if (item.research) node.research = item.research
      if (sourceFile && supabaseApi && supabaseSession?.user?.id) {
        try {
          const storagePath = `ai-intake/${itemId}/${sourceFile.name}`
          await supabaseApi.uploadStorageFile(storagePath, sourceFile, { cacheControl: '3600', upsert: true, contentType: sourceFile.type || item.resource.mimeType || 'application/octet-stream' })
          node.resource = { ...node.resource, storagePath, source: 'supabase' }
        } catch {
          showNotice(`${sourceFile.name} stayed local because cloud upload failed.`)
        }
      }
      itemNodes.push(node)
    }
    for (const item of aiImportManifest.manifest.items) {
      const existing = existingAIItems.get(item.id) || existingResourceNodes.get(item.resource.type === 'url' ? `url:${item.resource.url}` : `file:${item.resource.path}`)
      const topicRecord = topicsById.get(item.topicId)
      if (existing && topicRecord) {
        existingItemUpdates.set(existing.id, { ...existing, aiItemId: item.id, project: topicRecord.projectName, topic: item.topicId, topicTitle: topicRecord.title, eyebrow: `${topicRecord.projectName} · AI item` })
      }
    }
    const importedTopicNodeIds = new Set(nodes.filter(isImportedTopicPlaceholder).map((node) => node.id))
    const manifestProjectNames = new Set([...topicsById.values()].map(({ projectName }) => comparableTopicTitle(projectName)))
    setFocusAreas((current) => {
      const next = new Map(current.map((focusArea) => [comparableTopicTitle(focusArea.name), focusArea]))
      for (const { focusArea } of topicsById.values()) next.set(comparableTopicTitle(focusArea.name), focusArea)
      const legacyImportedNodes = nodes.filter((node) => node.aiItemId || node.aiTopicId || node.resource?.source === 'ai-intake')
      const legacyProjects = new Set(legacyImportedNodes.map((node) => node.project))
      for (const legacyProject of legacyProjects) {
        const projectNodes = nodes.filter((node) => node.project === legacyProject)
        const migrated = projectNodes.length > 0 && projectNodes.every((node) => importedTopicNodeIds.has(node.id) || existingItemUpdates.has(node.id))
        if (migrated && !manifestProjectNames.has(comparableTopicTitle(legacyProject))) next.delete(comparableTopicTitle(legacyProject))
      }
      return [...next.values()]
    })
    setNodes((current) => [...current.filter((node) => !importedTopicNodeIds.has(node.id)).map((node) => existingItemUpdates.get(node.id) || node), ...itemNodes])
    setActiveProject('All focus areas')
    setScreen('plan')
    setAiImportOpen(false)
    setAiImportManifest(null)
    setAiImportFiles([])
    showNotice(`Imported ${topicsById.size} topics and ${itemNodes.length} new resources${skippedItems ? `; routed ${skippedItems} existing item${skippedItems === 1 ? '' : 's'}` : ''}.`)
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
    if (screen === 'graph') {
      setScreen('graph')
      return
    }
    setScreen(selectedArea?.mode === 'research' ? 'plan' : 'start')
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <div className="brand">
          <div>
            <div className="brand-name">Just Start</div>
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
          <button className={screen === 'graph' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('graph')}>
            <Icon name="graph" /> <span>Graph</span>
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
          <button className="nav-item settings-item" onClick={clearWorkspaceResources}>
            <Icon name="settings" /> <span>Clear resources</span>
          </button>
          <button className="nav-item theme-toggle" onClick={toggleTheme} aria-pressed={theme === 'dark'} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} /> <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button className="nav-item drive-toggle" onClick={supabaseSession ? disconnectSupabase : () => { setAuthMessage(''); setAuthModalOpen(true) }} disabled={supabaseBusy} aria-label={supabaseSession ? 'Disconnect cloud sync' : 'Sign in to cloud sync'}>
            <Icon name="cloud" /> <span>{supabaseBusy ? 'Syncing…' : supabaseSession ? 'Cloud synced' : supabaseStatus.configured ? 'Sign in to sync' : 'Configure cloud sync'}</span>
          </button>
          <div className="profile-row"><div className="avatar">{(userName || 'U').charAt(0).toUpperCase()}</div><div><strong>{userName || 'Your workspace'}</strong><span>{supabaseSession?.user?.email || 'Local workspace'}</span></div><span className="more">•••</span></div>
        </div>
      </aside>

      <main className="main-content">
        <input ref={fileInputRef} className="hidden-file-input" type="file" multiple accept="*/*" onChange={handleFileInput} />
        <input ref={folderInputRef} className="hidden-file-input" type="file" multiple accept="*/*" webkitdirectory="" directory="" onChange={handleFileInput} />
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-separator">/</span><strong>{activeProject}</strong></div>
          <div className="topbar-actions"><span className="saved-indicator"><span className="saved-dot" /> Saved locally</span><button className="icon-button" aria-label="Clear workspace resources" onClick={clearWorkspaceResources}><Icon name="settings" /></button></div>
        </header>

        {screen === 'start' ? (
          <>
            <section className="welcome-row">
              <div><p className="overline">{todayLabel}</p><h1>Good morning{userName ? `, ${userName}` : ''}<span className="wave">✦</span></h1><p className="welcome-copy">You do not need to plan the whole day. Just begin with the next useful thing.</p></div>
              <div className="welcome-actions"><button className="ghost-button" onClick={() => openImportModal()}><Icon name="plus" /> Add resources</button><button className="ghost-button" onClick={openAIImport}><Icon name="layers" /> Smart import</button><button className="ghost-button" onClick={downloadAIContext}><Icon name="layers" /> Download AI context</button><button className="ghost-button secondary-ghost" onClick={() => setCatchUpOpen(true)}>Log work elsewhere</button></div>
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
                <div
                  className="resource-summary-card"
                  onClick={() => setPreviewNode(recommendation)}
                  role="button"
                  tabIndex="0"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setPreviewNode(recommendation)
                    }
                  }}
                >
                  <div className="resource-summary-topline"><span className="resource-summary-type"><span className="resource-summary-badge">{resourceBadge(recommendation)}</span>{resourceDescription(recommendation)}</span><span className="resource-summary-ready">Ready to open</span></div>
                  <div className="resource-summary-heading"><div><p className="resource-summary-label">Resource title</p><h3>{recommendation.title}</h3></div></div>
                  <p className="resource-summary-file"><span>Label</span>{resourceLabel(recommendation.resource)}</p>
                  <dl className="resource-summary-meta"><div><dt>Time</dt><dd>{recommendation.estimatedMinutes ?? 10} min</dd></div><div><dt>Project</dt><dd>{recommendation.project}</dd></div></dl>
                  <button className="resource-summary-action" onClick={(event) => { event.stopPropagation(); setPreviewNode(recommendation) }}>Open resource <Icon name="external" /></button>
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
        ) : screen === 'plan' ? (
          <PlanScreen nodes={projectNodes} area={activeArea} onOpen={(node) => setPreviewNode(node)} onBack={() => setScreen('start')} onAddFiles={() => openImportModal()} onAddFolder={() => openImportModal({ mode: 'folder' })} onAddTopic={() => setTopicModalOpen(true)} onAddChild={(node) => openImportModal({ project: node.project, parentId: node.id })} onBulkImport={openAIImport} onRemoveNode={removeNode} onRemoveProject={removeFocusArea} />
        ) : (
          <GraphScreen nodes={projectNodes} allProjects={allProjects} activeProject={activeProject} onProjectChange={(project) => { setActiveProject(project); setScreen('graph') }} onOpen={(node) => setPreviewNode(node)} onBack={() => setScreen('start')} />
        )}
      </main>

      {notice && <div className="toast" role="status"><span className="toast-check">✓</span>{notice}</div>}
      {previewNode && <SessionModal node={previewNode} onClose={() => setPreviewNode(null)} onOpen={() => openSource(previewNode)} onAction={updateNode} />}
      {catchUpOpen && <CatchUpModal nodes={nodes} onClose={() => setCatchUpOpen(false)} onAction={updateNode} />}
      {importModalOpen && <ImportModal focusAreas={focusAreas} nodes={nodes} initialDestination={importDestination} onClose={() => setImportModalOpen(false)} onChoose={chooseImportDestination} />}
      {topicModalOpen && <TopicModal focusAreas={focusAreas} nodes={nodes} activeProject={activeProject} onClose={() => setTopicModalOpen(false)} onCreate={createTopic} />}
      {authModalOpen && <SupabaseAuthModal email={authEmail} message={authMessage} busy={supabaseBusy} configured={supabaseStatus.configured} missing={supabaseStatus.missing} onClose={() => setAuthModalOpen(false)} onSubmit={requestSupabaseSignIn} />}
      {aiImportOpen && <AIImportModal focusAreas={focusAreas} activeProject={activeProject} manifestResult={aiImportManifest} files={aiImportFiles} error={aiImportError} onClose={() => setAiImportOpen(false)} onDownloadInstructions={downloadAIInstructions} onDownloadContext={downloadAIContext} onManifestFile={handleAIManifest} onArchive={handleAIArchive} onFiles={handleAISourceFiles} onImport={importAIManifest} />}
      {nameModalOpen && <NameModal initialName={userName} onSave={saveUserName} />}
    </div>
  )
}

function GraphScreen({ nodes, allProjects, activeProject, onProjectChange, onOpen, onBack }) {
  const model = useMemo(() => buildGraphModel(nodes), [nodes])
  const [selectedId, setSelectedId] = useState('')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 20, y: 20 })
  const dragRef = useRef(null)
  const selectedNode = selectedId ? model.nodeById.get(selectedId) : null
  const selectedGate = selectedNode ? getPrerequisiteStatus(selectedNode, nodes) : null
  const connectedCount = model.edges.length
  const averageProgress = model.nodes.length ? Math.round(model.nodes.reduce((sum, node) => sum + node.progress, 0) / model.nodes.length * 100) : 0

  useEffect(() => {
    setSelectedId('')
    setZoom(1)
    setPan({ x: 20, y: 20 })
  }, [activeProject])

  function startDrag(event) {
    if (event.target.closest?.('.graph-node-card')) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, pan }
  }

  function moveDrag(event) {
    if (!dragRef.current) return
    const start = dragRef.current
    setPan({ x: start.pan.x + event.clientX - start.x, y: start.pan.y + event.clientY - start.y })
  }

  function stopDrag() {
    dragRef.current = null
  }

  function changeZoom(amount) {
    setZoom((current) => Math.max(0.55, Math.min(1.65, Number((current + amount).toFixed(2)))))
  }

  function resetView() {
    setZoom(1)
    setPan({ x: 20, y: 20 })
  }

  function edgePath(parent, child) {
    const startX = parent.position.x + model.nodeWidth
    const startY = parent.position.y + model.nodeHeight / 2
    const endX = child.position.x
    const endY = child.position.y + model.nodeHeight / 2
    const bend = Math.max(35, (endX - startX) / 2)
    return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`
  }

  return <section className="graph-screen">
    <div className="graph-header">
      <div><p className="overline">Visual map</p><h1>See how everything connects.</h1><p className="welcome-copy">A calm overview of your path. Click a topic for details, then drag the canvas when the map gets bigger.</p></div>
      <div className="graph-header-actions"><button className="ghost-button" onClick={onBack}>Back to start <Icon name="arrow" /></button></div>
    </div>

    <div className="graph-toolbar panel-card">
      <label className="graph-scope"><span className="graph-toolbar-label">Map</span><select value={activeProject} onChange={(event) => onProjectChange(event.target.value)} aria-label="Choose a focus area for the graph">{allProjects.map((project) => <option key={project.name} value={project.name}>{project.name}</option>)}</select></label>
      <div className="graph-stats"><span><strong>{model.nodes.length}</strong> topics</span><span><strong>{connectedCount}</strong> connections</span><span><strong>{averageProgress}%</strong> mapped progress</span></div>
      <div className="graph-controls"><span className="graph-help">Drag to explore</span><button className="graph-control" onClick={() => changeZoom(-0.1)} aria-label="Zoom out">−</button><span className="zoom-label">{Math.round(zoom * 100)}%</span><button className="graph-control" onClick={() => changeZoom(0.1)} aria-label="Zoom in">+</button><button className="graph-reset" onClick={resetView}>Reset view</button></div>
    </div>

    <div className="graph-layout">
      <aside className="graph-topic-panel panel-card">
        <div className="graph-panel-heading"><div><p className="overline">Topics</p><h2>Choose a point</h2></div><span className="graph-topic-count">{model.nodes.length}</span></div>
        {model.nodes.length ? <div className="graph-topic-list">{model.nodes.map((node) => <button key={node.id} className={selectedId === String(node.id) ? 'graph-topic active' : 'graph-topic'} onClick={() => setSelectedId(String(node.id))}><span className={`graph-topic-dot ${node.status === 'done' ? 'done' : node.progress > 0 ? 'current' : 'todo'}`} /><span className="graph-topic-name"><strong>{node.label}</strong><small>{Math.round(node.progress * 100)}% complete</small></span><span className="graph-topic-arrow">›</span></button>)}</div> : <div className="graph-empty-list"><span>○</span><p>No topics here yet.</p><small>Add a topic or resource to grow this map.</small></div>}
      </aside>

      <div className="graph-stage panel-card">
        <div className="graph-stage-head"><span><span className="legend-dot done" /> complete <span className="legend-dot current" /> in motion <span className="legend-dot" /> not started</span><span>{model.nodes.length > 8 ? 'The map continues beyond the window.' : 'Dependencies flow left to right.'}</span></div>
        <div className="graph-viewport" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} onPointerLeave={stopDrag} onWheel={(event) => { event.preventDefault(); changeZoom(event.deltaY > 0 ? -0.08 : 0.08) }}>
          {model.nodes.length ? <svg className="graph-svg" width={model.width} height={model.height} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} role="img" aria-label="Topic dependency graph">
            <defs><marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="currentColor" /></marker></defs>
            <g className="graph-edges">{model.edges.map((edge) => { const parent = model.nodeById.get(edge.from); const child = model.nodeById.get(edge.to); return <path key={`${edge.from}-${edge.to}`} d={edgePath(parent, child)} className={parent.progress >= 1 ? 'graph-edge complete' : 'graph-edge'} markerEnd="url(#graph-arrow)" /> })}</g>
            <g className="graph-nodes">{model.nodes.map((node) => <foreignObject key={node.id} x={node.position.x} y={node.position.y} width={model.nodeWidth} height={model.nodeHeight}><button className={`graph-node-card ${selectedId === String(node.id) ? 'selected' : ''} ${node.status === 'done' ? 'done' : node.progress > 0 ? 'current' : ''}`} onClick={() => setSelectedId(String(node.id))} onKeyDown={(event) => event.key === 'Enter' && setSelectedId(String(node.id))}>
              <span className="graph-node-fill" style={{ width: `${node.progress * 100}%` }} /><span className="graph-node-top"><span className="graph-node-index">{node.eyebrow?.split('·')[1]?.trim() ?? '•'}</span><span>{node.status === 'done' ? 'done' : node.progress > 0 ? 'in motion' : 'next'}</span></span><strong>{node.label}</strong><span className="graph-node-progress"><span><span style={{ width: `${node.progress * 100}%` }} /></span><em>{Math.round(node.progress * 100)}%</em></span>
            </button></foreignObject>)}</g>
          </svg> : <div className="graph-stage-empty"><div className="empty-icon">+</div><h2>Your map starts with one topic.</h2><p>Choose another focus area or add a topic from My plan.</p></div>}
        </div>
      </div>

      <aside className="graph-details panel-card">{selectedNode ? <><div className="graph-detail-top"><span className="focus-label"><span className="pulse-dot" /> Topic details</span><button className="modal-close" onClick={() => setSelectedId('')} aria-label="Close topic details">×</button></div><p className="modal-eyebrow">{selectedNode.eyebrow}</p><h2>{selectedNode.label}</h2><p className="graph-detail-description">{selectedNode.description || 'No description yet. Add a little context from My plan.'}</p><div className="graph-detail-progress"><div><strong>{Math.round(selectedNode.progress * 100)}%</strong><span>{selectedNode.status === 'done' ? 'complete' : selectedNode.progress ? 'in motion' : 'not started'}</span></div><div className="progress-track"><span style={{ width: `${selectedNode.progress * 100}%` }} /></div></div><div className="graph-detail-list"><div><span>Resource</span><strong>{resourceDescription(selectedNode)}</strong></div><div><span>Time</span><strong>{selectedNode.estimatedMinutes ?? 10} min</strong></div><div><span>Dependencies</span><strong>{selectedGate?.parents.length ? `${selectedGate.parents.length} prerequisite${selectedGate.parents.length === 1 ? '' : 's'}` : 'Independent topic'}</strong></div></div>{selectedGate?.blockedReasons?.length > 0 && <div className="graph-blocked-note"><Icon name="lock" /><span>{selectedGate.blockedReasons[0]}</span></div>}<button className="primary-button full-button" onClick={() => onOpen(selectedNode)}>Open focused view <Icon name="arrow" /></button></> : <div className="graph-detail-empty"><div className="graph-detail-orbit">✦</div><p className="overline">One click away</p><h2>Pick a topic to see its shape.</h2><p>Details stay quiet until you ask for them. Select a node from the map or list.</p></div>}</aside>
    </div>
  </section>
}

function PathRow({ node, nodes, onClick }) {
  const gate = getPrerequisiteStatus(node, nodes)
  const isBlocked = node.status !== 'done' && !gate.satisfied
  return <button className="path-row" onClick={onClick}><span className={node.status === 'done' ? 'row-status done' : isBlocked ? 'row-status blocked' : node.status === 'in_progress' ? 'row-status current' : 'row-status'}>{node.status === 'done' ? <Icon name="check" /> : isBlocked ? <Icon name="lock" /> : ''}</span><span className="row-title"><strong>{node.title}</strong><small>{isBlocked ? gate.blockedReasons[0] : statusLabel(node)}</small></span><span className="row-progress"><span style={{ width: `${progressValue(node)}%` }} /></span><span className="row-arrow">›</span></button>
}

function PlanScreenContent({ nodes, area, onOpen, onBack, onAddFiles, onAddFolder, onAddTopic, onAddChild, onBulkImport, onRemoveNode, onRemoveProject }) {
  const [expandedGroups, setExpandedGroups] = useState({})
  const isResearch = area?.mode === 'research'
  const groups = [...new Set(nodes.map((node) => node.project))]
  const topicLabels = new Map(nodes.filter((node) => node.topic).map((node) => [node.topic, node.topicTitle || node.title]))
  return <section className="plan-screen"><div className="plan-header"><div><p className="overline">{isResearch ? 'Research library' : 'Your plan'}</p><h1>{isResearch ? 'Read broadly. Connect later.' : 'Everything has a place.'}</h1><p className="welcome-copy">{isResearch ? 'Papers are grouped by topic, not locked behind a prerequisite chain.' : 'The graph stays in the background. Your next action stays in front.'}</p></div><div className="plan-actions"><button className="ghost-button" onClick={onAddTopic}><Icon name="plus" /> New topic</button><button className="ghost-button" onClick={onAddFiles}><Icon name="plus" /> Add files</button><button className="ghost-button" onClick={onAddFolder}><Icon name="layers" /> Add folder</button><button className="ghost-button" onClick={onBulkImport}><Icon name="layers" /> Smart import</button><button className="ghost-button" onClick={onBack}>Back to start <Icon name="arrow" /></button></div></div><div className="plan-toolbar"><span>{nodes.length} {isResearch ? 'papers and research resources' : 'nodes'} · kept concise</span><span className="legend"><span className="legend-dot done" /> done <span className="legend-dot current" /> in progress {isResearch ? <><span className="legend-dot locked" /> topic shelf</> : <><span className="legend-dot locked" /> locked</>}</span></div>{groups.map((group) => { const groupNodes = nodes.filter((node) => node.project === group); const expanded = expandedGroups[group]; const visibleNodes = expanded ? groupNodes : groupNodes.slice(0, 24); const topicKeys = [...new Set(visibleNodes.map((node) => node.topic || '__general'))]; return <div className="plan-group" key={group}><div className="group-title"><span className={`project-dot ${isResearch ? 'blue' : 'violet'}`} />{group}<span>{groupNodes.filter((node) => node.status === 'done').length}/{groupNodes.length}</span><button className="remove-area-button" onClick={() => onRemoveProject(group)}>remove area</button></div>{topicKeys.map((topicKey) => { const topicNodes = visibleNodes.filter((node) => (node.topic || '__general') === topicKey); const topicTitle = topicKey === '__general' ? 'General resources' : topicLabels.get(topicKey) || 'Imported topic'; return <div className="plan-topic-group" key={`${group}-${topicKey}`}><div className="plan-topic-heading"><span>{topicTitle}</span><small>{topicNodes.length} item{topicNodes.length === 1 ? '' : 's'}</small></div><div className={isResearch ? 'plan-grid research-grid' : 'plan-grid'}>{topicNodes.map((node) => <PlanNode key={node.id} node={node} nodes={nodes} isResearch={isResearch} onOpen={onOpen} onAddChild={onAddChild} onRemove={onRemoveNode} />)}</div></div>})}{groupNodes.length > 24 && <button className="text-button show-more-button" onClick={() => setExpandedGroups((current) => ({ ...current, [group]: !expanded }))}>{expanded ? 'Show less' : `Show ${groupNodes.length - 24} more`} <Icon name="arrow" /></button>}</div>})}</section>
}

function PlanScreen({ nodes, area, onOpen, onBack, onAddFiles, onAddFolder, onAddTopic, onAddChild, onBulkImport, onRemoveNode, onRemoveProject }) {
  const [expandedGroups, setExpandedGroups] = useState({})
  const groups = [...new Set(nodes.map((node) => node.project))]
  const isResearch = area?.mode === 'research'
  if (nodes.length > 0) return <PlanScreenContent nodes={nodes} area={area} onOpen={onOpen} onBack={onBack} onAddFiles={onAddFiles} onAddFolder={onAddFolder} onAddTopic={onAddTopic} onAddChild={onAddChild} onBulkImport={onBulkImport} onRemoveNode={onRemoveNode} onRemoveProject={onRemoveProject} />
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

function SupabaseAuthModal({ email, message, busy, configured, missing, onClose, onSubmit }) {
  const [value, setValue] = useState(email)

  function submit(event) {
    event.preventDefault()
    if (value.trim()) onSubmit(value.trim())
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="small-modal auth-modal" role="dialog" aria-modal="true" aria-label="Sign in to cloud sync" onSubmit={submit}><div className="modal-top"><div><span className="focus-label"><span className="pulse-dot" /> Private cloud sync</span><h2>Keep your workspace with you.</h2></div><button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button></div>{configured ? <><p className="modal-note">Sign in with a secure magic link. Your topics, progress, graph, and uploaded resources can then follow you across devices.</p><label className="select-label" htmlFor="supabase-email">Email address</label><input id="supabase-email" className="text-input" type="email" value={value} onChange={(event) => setValue(event.target.value)} placeholder="you@example.com" autoFocus required /><button className="primary-button full-button" type="submit" disabled={busy}>{busy ? 'Sending link…' : 'Email me a sign-in link'} <Icon name="arrow" /></button>{message && <p className="auth-message" role="status">{message}</p>}<p className="auth-footnote">Supabase provides the database, authentication, and private file storage. Your local workspace stays available if you sign out.</p></> : <><p className="modal-note">Cloud sync is not configured for this build yet.</p><div className="auth-config-note"><strong>Add these public settings:</strong><code>{missing.map((name) => `${name}=`).join('\n')}</code><span>Use your own Supabase project settings. Never add a service-role key to the browser.</span></div></>}</form></div>
}

function NameModal({ initialName, onSave }) {
  const [value, setValue] = useState(initialName)

  function submit(event) {
    event.preventDefault()
    if (value.trim()) onSave(value)
  }

  return <div className="modal-backdrop name-modal-backdrop" role="presentation"><form className="small-modal name-modal" role="dialog" aria-modal="true" aria-label="Choose your name" onSubmit={submit}><div className="name-modal-mark">✦</div><p className="overline">Make it yours</p><h2>What should we call you?</h2><p className="modal-note">Your name appears on the Start screen and stays on this device. You can change it later by clearing the name in your browser settings.</p><label className="select-label" htmlFor="user-name">Your name</label><input id="user-name" className="text-input" value={value} onChange={(event) => setValue(event.target.value)} placeholder="e.g. Maya" autoFocus required /><button className="primary-button full-button" type="submit">Start with my name <Icon name="arrow" /></button></form></div>
}

function SmartImportModal({ focusAreas, projectChoice, setProjectChoice, newProjectName, setNewProjectName, mode, setMode, effectiveProject, effectiveMode, manifestResult, files, missingFiles, canImport, error, onClose, onDownloadInstructions, onDownloadContext, onManifestFile, onArchive, onFiles, onImport }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="small-modal smart-import-modal" role="dialog" aria-modal="true" aria-label="Smart import"><div className="modal-top"><div><span className="focus-label"><span className="pulse-dot" /> Smart import</span><h2>Bring in a whole collection.</h2></div><button className="modal-close" onClick={onClose} aria-label="Close">×</button></div><p className="modal-note">Use your own AI to organize a folder or ZIP. This guided flow gives it the instructions and the existing workspace context, then checks the result before importing.</p><div className="smart-import-steps"><div className="smart-import-step"><span>1</span><div><strong>Give your AI the guide</strong><p>Download <b>AGENTS.md</b> and attach it with your files.</p><button type="button" className="smart-download-button" onClick={onDownloadInstructions}>Download AGENTS.md <Icon name="arrow" /></button></div></div><div className="smart-import-step"><span>2</span><div><strong>Tell it what already exists</strong><p>Attach this catalog so it can return only new topics and resources.</p><button type="button" className="smart-download-button" onClick={onDownloadContext}>Download JUSTSTART_CONTEXT.json <Icon name="arrow" /></button></div></div><div className="smart-import-step"><span>3</span><div><strong>Bring back the AI result</strong><p>Upload the downloadable <b>manifest.json</b> and the matching source ZIP or folder.</p></div></div></div><label className="select-label" htmlFor="ai-manifest-file">Manifest from your AI</label><input id="ai-manifest-file" className="text-input" type="file" accept="application/json,.json" onChange={(event) => { onManifestFile(event.target.files?.[0]); event.target.value = '' }} /><label className="select-label" htmlFor="ai-source-archive">Source ZIP <span>(recommended)</span></label><input id="ai-source-archive" className="text-input" type="file" accept=".zip,application/zip" onChange={(event) => { onArchive(event.target.files?.[0]); event.target.value = '' }} /><label className="select-label" htmlFor="ai-source-folder">Or select a source folder</label><input id="ai-source-folder" className="text-input" type="file" multiple webkitdirectory="" directory="" onChange={(event) => { onFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} /><label className="select-label" htmlFor="ai-import-project">Import into</label><select id="ai-import-project" value={projectChoice} onChange={(event) => setProjectChoice(event.target.value)}><option value="" disabled>Select a focus area</option>{focusAreas.map((area) => <option key={area.name} value={area.name}>{area.name}{area.mode === 'research' ? ' · research' : ''}</option>)}<option value="__new__">＋ Create a new focus area</option></select>{projectChoice === '__new__' && <><input className="text-input" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="e.g. Quant practice" /><select value={mode} onChange={(event) => setMode(event.target.value)}><option value="study">Study plan · prerequisites allowed</option><option value="research">Research library · no prerequisites</option></select></>}{error && <div className="ai-import-error" role="alert">{error}</div>}{manifestResult && <div className="ai-import-summary"><strong>Ready to review</strong><span>{manifestResult.summary.topicCount} topics · {manifestResult.summary.itemCount} resources · {manifestResult.summary.fileResourceCount} files · {manifestResult.summary.urlResourceCount} links</span><small>{files.length} source file{files.length === 1 ? '' : 's'} loaded.</small>{manifestResult.summary.warningCount > 0 && <small>{manifestResult.summary.warningCount} warnings preserved for review.</small>}{missingFiles.length > 0 && <small className="ai-import-missing">{missingFiles.length} source file{missingFiles.length === 1 ? '' : 's'} still need to be selected.</small>}</div>}{!manifestResult && <div className="ai-import-hint">Nothing is imported until the manifest is valid and every referenced file is present.</div>}<div className="ai-import-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!canImport} onClick={() => onImport({ project: { name: effectiveProject, color: effectiveMode === 'research' ? 'blue' : 'violet' }, mode: effectiveMode })}>Review and import <Icon name="check" /></button></div></section></div>
}

function ManifestImportModal({ manifestResult, files, missingFiles, canImport, error, onClose, onDownloadInstructions, onDownloadContext, onManifestFile, onArchive, onFiles, onImport }) {
  const topicCount = manifestResult?.manifest.topics.length ?? 0
  const itemCount = manifestResult?.manifest.items.length ?? 0
  const fileCount = manifestResult?.summary.fileResourceCount ?? 0
  const linkCount = manifestResult?.summary.urlResourceCount ?? 0
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="small-modal smart-import-modal" role="dialog" aria-modal="true" aria-label="Smart import"><div className="modal-top"><div><span className="focus-label"><span className="pulse-dot" /> Smart import</span><h2>Bring in a whole collection.</h2></div><button className="modal-close" onClick={onClose} aria-label="Close">×</button></div><p className="modal-note">Use your own AI to organise a folder or ZIP. Just Start will place every resource under the topic assigned by the manifest.</p><div className="smart-import-steps"><div className="smart-import-step"><span>1</span><div><strong>Give your AI the guide</strong><p>Download <b>AGENTS.md</b> and attach it with your files.</p><button type="button" className="smart-download-button" onClick={onDownloadInstructions}>Download AGENTS.md <Icon name="arrow" /></button></div></div><div className="smart-import-step"><span>2</span><div><strong>Tell it what already exists</strong><p>Attach this catalog so it can return only new topics and resources.</p><button type="button" className="smart-download-button" onClick={onDownloadContext}>Download JUSTSTART_CONTEXT.json <Icon name="arrow" /></button></div></div><div className="smart-import-step"><span>3</span><div><strong>Bring back the AI result</strong><p>Upload the downloadable <b>manifest.json</b> and the matching source ZIP or folder.</p></div></div></div><label className="select-label" htmlFor="ai-manifest-file">Manifest from your AI</label><input id="ai-manifest-file" className="text-input" type="file" accept="application/json,.json" onChange={(event) => { onManifestFile(event.target.files?.[0]); event.target.value = '' }} /><label className="select-label" htmlFor="ai-source-archive">Source ZIP <span>(recommended)</span></label><input id="ai-source-archive" className="text-input" type="file" accept=".zip,application/zip" onChange={(event) => { onArchive(event.target.files?.[0]); event.target.value = '' }} /><label className="select-label" htmlFor="ai-source-folder">Or select a source folder</label><input id="ai-source-folder" className="text-input" type="file" multiple webkitdirectory="" directory="" onChange={(event) => { onFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} /><label className="select-label" htmlFor="ai-source-files">Or select individual source files</label><input id="ai-source-files" className="text-input" type="file" multiple onChange={(event) => { onFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} />{manifestResult && <div className="ai-import-summary"><strong>Automatic topic routing</strong><p>{topicCount} topics · {itemCount} resources · {fileCount} files · {linkCount} links</p><span>Each item will be placed using its manifest topic. No single “Import into” destination is needed.</span></div>}{error && <p className="ai-import-error" role="alert">{error}</p>}{missingFiles.length > 0 && <p className="ai-import-error" role="alert">{missingFiles.length} manifest file{missingFiles.length === 1 ? '' : 's'} still need to be selected.</p>}<div className="ai-import-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!canImport} onClick={onImport}>{canImport ? 'Import collection' : 'Review files first'} <Icon name="arrow" /></button></div></section></div>
}

function AIImportModal({ focusAreas, activeProject, manifestResult, files, error, onClose, onDownloadInstructions, onDownloadContext, onManifestFile, onArchive, onFiles, onImport }) {
  const sourceFiles = new Map()
  for (const file of files) {
    const relative = String(file.webkitRelativePath || file.name || '').replaceAll('\\', '/')
    sourceFiles.set(relative, file)
    sourceFiles.set(relative.split('/').pop(), file)
  }
  const missingFiles = manifestResult?.manifest.items.filter((item) => item.resource.type === 'file' && !sourceFiles.has(item.resource.path) && !sourceFiles.has(item.resource.path.split('/').pop())) ?? []
  const canImport = Boolean(manifestResult && missingFiles.length === 0)
  return <ManifestImportModal manifestResult={manifestResult} files={files} missingFiles={missingFiles} canImport={canImport} error={error} onClose={onClose} onDownloadInstructions={onDownloadInstructions} onDownloadContext={onDownloadContext} onManifestFile={onManifestFile} onArchive={onArchive} onFiles={onFiles} onImport={onImport} />

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="small-modal ai-import-modal" role="dialog" aria-modal="true" aria-label="AI bulk intake"><div className="modal-top"><div><span className="focus-label"><span className="pulse-dot" /> AI bulk intake</span><h2>Bring a whole collection.</h2></div><button className="modal-close" onClick={onClose} aria-label="Close">×</button></div><p className="modal-note">Give the downloaded <strong>AGENTS.md</strong> to ChatGPT together with your files, ZIP, folder structure, or links. It returns the manifest that Just Start validates here.</p><button type="button" className="text-button ai-download-button" onClick={onDownloadInstructions}>Download AGENTS.md <Icon name="arrow" /></button><label className="select-label" htmlFor="ai-manifest-file">1. AI manifest JSON</label><input id="ai-manifest-file" className="text-input" type="file" accept="application/json,.json" onChange={(event) => { onManifestFile(event.target.files?.[0]); event.target.value = '' }} /><label className="select-label" htmlFor="ai-source-archive">2. Source ZIP <span>(recommended for folders)</span></label><input id="ai-source-archive" className="text-input" type="file" accept=".zip,application/zip" onChange={(event) => { onArchive(event.target.files?.[0]); event.target.value = '' }} /><label className="select-label" htmlFor="ai-source-folder">Or add a source folder</label><input id="ai-source-folder" className="text-input" type="file" multiple webkitdirectory="" directory="" onChange={(event) => { onFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} /><label className="select-label" htmlFor="ai-source-files">Or add individual source files</label><input id="ai-source-files" className="text-input" type="file" multiple onChange={(event) => { onFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} /><label className="select-label" htmlFor="ai-import-project">3. Put this collection in</label><select id="ai-import-project" value={projectChoice} onChange={(event) => setProjectChoice(event.target.value)}><option value="" disabled>Select a focus area</option>{focusAreas.map((area) => <option key={area.name} value={area.name}>{area.name}{area.mode === 'research' ? ' · research' : ''}</option>)}<option value="__new__">＋ Create a new focus area</option></select>{projectChoice === '__new__' && <><input className="text-input" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="e.g. Quant practice" /><select value={mode} onChange={(event) => setMode(event.target.value)}><option value="study">Study plan · prerequisites allowed</option><option value="research">Research library · no prerequisites</option></select></>}{error && <div className="ai-import-error" role="alert">{error}</div>}{manifestResult && <div className="ai-import-summary"><strong>Ready to review</strong><span>{manifestResult.summary.topicCount} topics · {manifestResult.summary.itemCount} resources · {manifestResult.summary.fileResourceCount} files · {manifestResult.summary.urlResourceCount} links</span><small>{files.length} source file{files.length === 1 ? '' : 's'} loaded.</small>{manifestResult.summary.warningCount > 0 && <small>{manifestResult.summary.warningCount} warnings are preserved for review.</small>}{missingFiles.length > 0 && <small className="ai-import-missing">{missingFiles.length} source file{missingFiles.length === 1 ? '' : 's'} still need to be selected.</small>}</div>}{!manifestResult && <div className="ai-import-hint">Select the manifest first. ZIP files are unpacked in your browser and never sent to a third-party service by this step.</div>}<div className="ai-import-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!canImport} onClick={() => onImport({ project: { name: effectiveProject, color: effectiveMode === 'research' ? 'blue' : 'violet' }, mode: effectiveMode })}>Import collection <Icon name="check" /></button></div></section></div>
}

function CatchUpModal({ nodes, onClose, onAction }) {
  const unfinished = nodes.filter((node) => node.status !== 'done')
  const [selectedId, setSelectedId] = useState(unfinished[0]?.id ?? '')
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="small-modal" role="dialog" aria-modal="true"><div className="modal-top"><div><span className="focus-label"><span className="pulse-dot" /> Quick update</span><h2>What did you work on?</h2></div><button className="modal-close" onClick={onClose} aria-label="Close">×</button></div><p className="modal-note">Keep your plan honest without needing to do the work inside Just Start.</p><label className="select-label" htmlFor="catch-up-node">Choose a topic</label><select id="catch-up-node" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{unfinished.map((node) => <option key={node.id} value={node.id}>{node.project} · {node.title}</option>)}</select><button className="primary-button full-button" onClick={() => selectedId && onAction(selectedId, 'elsewhere')}>Save 65% progress <Icon name="check" /></button></section></div>
}

export default App
