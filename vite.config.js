import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs/promises'
import path from 'node:path'

const projectRoot = process.cwd()

async function walkFiles(directory, relativeDirectory = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name)
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walkFiles(absolutePath, relativePath))
    else if (entry.isFile()) files.push({ absolutePath, relativePath })
  }
  return files
}

function sampleResourcesPlugin() {
  const contentTypes = {
    '.pdf': 'application/pdf',
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json',
    '.csv': 'text/csv; charset=utf-8',
  }

  function safeResourcePath(requestUrl) {
    let decoded
    try {
      decoded = decodeURIComponent(requestUrl.split('?', 1)[0]).replace(/^\/+/, '')
    } catch {
      return null
    }
    if (!decoded.startsWith('SampleSlides/') && !decoded.startsWith('SampleQuestions/')) return null
    const candidate = path.resolve(projectRoot, decoded)
    const relative = path.relative(projectRoot, candidate)
    return relative.startsWith('..') || path.isAbsolute(relative) ? null : candidate
  }

  return {
    name: 'just-start-sample-resources',
    configureServer(server) {
      server.middlewares.use('/resources', async (request, response, next) => {
        const filePath = safeResourcePath(request.url ?? '')
        if (!filePath) return next()
        try {
          const stat = await fs.stat(filePath)
          if (!stat.isFile()) return next()
          response.statusCode = 200
          response.setHeader('Content-Type', contentTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream')
          response.setHeader('Content-Length', stat.size)
          response.end(await fs.readFile(filePath))
        } catch {
          next()
        }
      })
    },
    async generateBundle() {
      const resourceDirectories = ['SampleSlides', 'SampleQuestions']
      for (const directory of resourceDirectories) {
        const root = path.join(projectRoot, directory)
        let files = []
        try {
          files = await walkFiles(root, directory)
        } catch {
          continue
        }
        for (const file of files) {
          this.emitFile({
            type: 'asset',
            fileName: path.posix.join('resources', file.relativePath.split(path.sep).join('/')),
            source: await fs.readFile(file.absolutePath),
          })
        }
      }
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), sampleResourcesPlugin()],
})
