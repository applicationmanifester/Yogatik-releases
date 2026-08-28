/**
 * Workspace Archive module for Yogatik Studio.
 * Exports and imports full workspace archives (.yogatik) encompassing
 * conversations, messages, projects, documents, 4-store memories, traces, and custom settings.
 */

import { db } from './db'

export async function exportFullWorkspaceArchive() {
  const [conversations, messages, settings, documents, projects, memories, traces] = await Promise.all([
    db.conversations.toArray(),
    db.messages.toArray(),
    db.settings.toArray(),
    db.documents.toArray(),
    db.projects.toArray(),
    db.memories.toArray(),
    db.traces.toArray(),
  ])

  const bundle = {
    yogatik_version: '3.20.0',
    exported_at: new Date().toISOString(),
    conversations,
    messages,
    settings: settings.filter(s => !s.key?.startsWith('apikey_')), // exclude sensitive local OS keys by default
    documents,
    projects,
    memories,
    traces,
  }

  const jsonStr = JSON.stringify(bundle, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `yogatik-workspace-backup-${new Date().toISOString().slice(0, 10)}.yogatik`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return { success: true, count: conversations.length }
}

export async function importFullWorkspaceArchive(fileOrJson) {
  let data
  if (typeof fileOrJson === 'string') {
    data = JSON.parse(fileOrJson)
  } else if (fileOrJson instanceof Blob || fileOrJson instanceof File) {
    const text = await fileOrJson.text()
    data = JSON.parse(text)
  } else {
    data = fileOrJson
  }

  if (!data || typeof data !== 'object') throw new Error('Invalid workspace archive format')

  await db.transaction('rw', [db.conversations, db.messages, db.settings, db.documents, db.projects, db.memories, db.traces], async () => {
    if (Array.isArray(data.conversations) && data.conversations.length) {
      await db.conversations.bulkPut(data.conversations)
    }
    if (Array.isArray(data.messages) && data.messages.length) {
      await db.messages.bulkPut(data.messages)
    }
    if (Array.isArray(data.settings) && data.settings.length) {
      await db.settings.bulkPut(data.settings)
    }
    if (Array.isArray(data.documents) && data.documents.length) {
      await db.documents.bulkPut(data.documents)
    }
    if (Array.isArray(data.projects) && data.projects.length) {
      await db.projects.bulkPut(data.projects)
    }
    if (Array.isArray(data.memories) && data.memories.length) {
      await db.memories.bulkPut(data.memories)
    }
    if (Array.isArray(data.traces) && data.traces.length) {
      await db.traces.bulkPut(data.traces)
    }
  })

  return {
    success: true,
    conversationsCount: data.conversations?.length || 0,
    messagesCount: data.messages?.length || 0,
    memoriesCount: data.memories?.length || 0,
  }
}
