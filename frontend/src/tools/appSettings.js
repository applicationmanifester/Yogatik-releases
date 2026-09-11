/**
 * appSettings.js — Yogatik AI Settings & Workspace Resource Management Tool.
 * 
 * Empowers Yogatik AI agents and models to:
 * 1. Read, inspect, and update user preferences & settings (theme, provider, model,
 *    temperature, search engine, webSearch, autoRoute, voice, audio, etc.).
 * 2. Access and query Yogatik app resources (conversations, documents, projects,
 *    memories, media, agent traces, and available tools).
 * 3. Create and manage workspace resources (create projects, switch active project,
 *    save documents to IndexedDB, manage project instructions).
 * 4. Programmatically open Yogatik UI modals (settings, file_editor, domain_hub,
 *    diagnostics, torrent_manager, mcp, shortcuts, etc.) for the user.
 */

import {
  db,
  getSetting,
  setSetting,
  getAllSettings,
  getDocuments,
  addDocument,
  deleteDocument,
  getProjects,
  createProject,
  getAgentTraces,
} from '../db'
import { resolveFeatures, FEATURE_DEFAULTS } from '../features'

/**
 * List of known public/safe settings keys that the AI can inspect and configure.
 */
export const CONFIGURABLE_SETTINGS = [
  'theme',
  'active_provider',
  'active_model',
  'active_project',
  'temperature',
  'webSearch',
  'autoRoute',
  'fallback',
  'toolsEnabled',
  'search_engine',
  'voice_elevenlabs_id',
  'live_voice_engine',
  'chat_prefs',
  'system_instructions',
  'default_voice',
  'sound_cues',
  'stream_response',
  'auto_compact',
  'code_theme',
  'font_size',
]

/**
 * Supported UI modals in Yogatik
 */
export const SUPPORTED_MODALS = [
  'settings',
  'file_editor',
  'domain_hub',
  'diagnostics',
  'torrent_manager',
  'mcp',
  'app_overview',
  'shortcuts',
  'vision',
  'auto_skills',
]

/**
 * Safely mask sensitive API keys or credentials
 */
export function maskSensitive(key, value) {
  if (typeof key === 'string' && (key.startsWith('apikey_') || key.includes('secret') || key.includes('token'))) {
    if (!value || typeof value !== 'string') return null
    if (value.length <= 8) return '********'
    return `${value.slice(0, 4)}...${value.slice(-4)}`
  }
  return value
}

/**
 * Filter and mask settings dictionary for safe AI consumption
 */
export function sanitizeSettings(settingsObj = {}) {
  const sanitized = {}
  for (const [k, v] of Object.entries(settingsObj)) {
    // Mask sensitive keys
    if (k.startsWith('apikey_') || k.includes('secret') || k.includes('token')) {
      sanitized[k] = v ? { configured: true, preview: maskSensitive(k, v) } : { configured: false }
    } else {
      sanitized[k] = v
    }
  }
  return sanitized
}

/**
 * Query resource counts and recent summaries from Dexie
 */
export async function getAppResourcesSummary() {
  try {
    const [convCount, docList, projList, mediaCount, traceCount] = await Promise.all([
      db.conversations ? db.conversations.count().catch(() => 0) : 0,
      getDocuments().catch(() => []),
      getProjects().catch(() => []),
      db.media ? db.media.count().catch(() => 0) : 0,
      db.traces ? db.traces.count().catch(() => 0) : 0,
    ])

    const activeProject = await getSetting('active_project', null)
    const activeProjectObj = projList.find(p => p.id === activeProject) || null

    return {
      conversations_count: convCount,
      documents_count: docList.length,
      documents: docList.slice(0, 10).map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        size_chars: d.chars || 0,
        created: d.createdAt ? new Date(d.createdAt).toISOString() : null,
      })),
      projects_count: projList.length,
      projects: projList.map(p => ({
        id: p.id,
        name: p.name,
        is_active: p.id === activeProject,
      })),
      active_project: activeProjectObj ? { id: activeProjectObj.id, name: activeProjectObj.name } : null,
      rendered_media_count: mediaCount,
      agent_traces_count: traceCount,
    }
  } catch (err) {
    return { error: err.message }
  }
}

/**
 * Executes settings & resource operations
 */
export async function executeAppSettings(args = {}) {
  const action = args.action || 'get'

  switch (action) {
    case 'get': {
      if (args.key) {
        const val = await getSetting(args.key)
        const masked = maskSensitive(args.key, val)
        return {
          success: true,
          action: 'get',
          key: args.key,
          value: masked,
          is_masked: masked !== val,
        }
      }
      const all = await getAllSettings()
      return {
        success: true,
        action: 'get_all',
        settings: sanitizeSettings(all),
      }
    }

    case 'set': {
      const key = args.key
      if (!key) {
        return { success: false, error: 'Setting key is required to update a setting (e.g. { action: "set", key: "theme", value: "dark" })' }
      }
      const value = args.value
      await setSetting(key, value)

      // If theme is changed, apply immediately to document attribute
      if (key === 'theme' && typeof document !== 'undefined') {
        const themeVal = value === 'light' ? 'light' : 'dark'
        document.documentElement.setAttribute('data-theme', themeVal)
      }

      // Broadcast live event so App.jsx and open components react immediately
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
          window.dispatchEvent(new CustomEvent('yogatik:settings-changed', {
            detail: { key, value },
          }))
        } catch { /* safe fallback */ }
      }

      return {
        success: true,
        action: 'set',
        key,
        value,
        message: `Setting "${key}" updated successfully.`,
      }
    }

    case 'list_settings': {
      const all = await getAllSettings()
      return {
        success: true,
        action: 'list_settings',
        configurable_keys: CONFIGURABLE_SETTINGS,
        current_values: sanitizeSettings(all),
      }
    }

    case 'list_resources': {
      const summary = await getAppResourcesSummary()
      return {
        success: true,
        action: 'list_resources',
        resources: summary,
      }
    }

    case 'manage_resource': {
      const resAction = args.resource_action
      const data = args.resource_data || {}

      if (resAction === 'create_project') {
        const name = data.name || data.title
        if (!name) return { success: false, error: 'Project name is required' }
        const created = await createProject({ name, persona: data.persona || null })
        return {
          success: true,
          action: 'create_project',
          project: created,
          message: `Created project "${name}".`,
        }
      }

      if (resAction === 'switch_project') {
        const projectId = data.projectId ?? data.id
        await setSetting('active_project', projectId)
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('yogatik:project-switched', { detail: { projectId } }))
        }
        return {
          success: true,
          action: 'switch_project',
          active_project: projectId,
          message: `Switched active project to ${projectId || 'default'}.`,
        }
      }

      if (resAction === 'save_document') {
        const name = data.name || data.filename || data.title || 'document.md'
        const content = data.content || data.text || ''
        const type = data.type || (name.endsWith('.md') ? 'text/markdown' : 'text/plain')
        const activeProj = await getSetting('active_project', null)
        
        const doc = await addDocument({
          name,
          type,
          content,
          projectId: data.projectId || activeProj,
        })
        return {
          success: true,
          action: 'save_document',
          document: { id: doc.id, name: doc.name, size_chars: content.length },
          message: `Document "${name}" saved to Yogatik workspace documents.`,
        }
      }

      if (resAction === 'delete_document') {
        const docId = data.id || data.docId
        if (!docId) return { success: false, error: 'Document id is required to delete' }
        await deleteDocument(docId)
        return {
          success: true,
          action: 'delete_document',
          docId,
          message: `Deleted document ${docId}.`,
        }
      }

      return {
        success: false,
        error: `Unknown resource_action: "${resAction}". Supported: "create_project", "switch_project", "save_document", "delete_document".`,
      }
    }

    case 'open_modal': {
      const modal = args.modal_name || 'settings'
      const props = args.modal_props || {}

      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
          window.dispatchEvent(new CustomEvent('yogatik:open-modal', {
            detail: { modal, props },
          }))
        } catch { /* safe */ }
      }

      return {
        success: true,
        action: 'open_modal',
        modal,
        props,
        message: `Requested UI to open modal "${modal}".`,
      }
    }

    default:
      return {
        success: false,
        error: `Unknown action: "${action}". Supported: "get", "set", "list_settings", "list_resources", "manage_resource", "open_modal".`,
      }
  }
}

export const appSettingsTool = {
  schema: {
    type: 'function',
    function: {
      name: 'app_settings',
      description: 'Inspect, change, and manage Yogatik app settings, preferences, workspace resources (documents, projects, conversations), or trigger interactive UI modals (settings, file editor, domain hub, diagnostics) for the user.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['get', 'set', 'list_settings', 'list_resources', 'manage_resource', 'open_modal'],
            description: 'Action to perform: "get" (read a setting), "set" (modify/edit a setting), "list_settings" (view all settings), "list_resources" (view documents/projects/conversations), "manage_resource" (create/delete/save documents or projects), "open_modal" (open a UI modal for the user).',
          },
          key: {
            type: 'string',
            description: 'Setting key to read or update (e.g. "theme", "temperature", "webSearch", "autoRoute", "active_provider", "active_model", "search_engine", "chat_prefs").',
          },
          value: {
            description: 'New value to store when action is "set" (string, number, boolean, or object).',
          },
          resource_action: {
            type: 'string',
            enum: ['create_project', 'switch_project', 'save_document', 'delete_document'],
            description: 'Resource management action when action is "manage_resource".',
          },
          resource_data: {
            type: 'object',
            description: 'Payload for resource management (e.g. { name: "Project Alpha" } or { name: "spec.md", content: "..." }).',
          },
          modal_name: {
            type: 'string',
            enum: SUPPORTED_MODALS,
            description: 'Name of the UI modal to open when action is "open_modal" (e.g. "settings", "file_editor", "domain_hub", "diagnostics", "torrent_manager", "shortcuts").',
          },
          modal_props: {
            type: 'object',
            description: 'Optional properties for modal (e.g. { tab: "appearance" } for settings, or { filePath: "index.js", content: "..." } for file_editor).',
          },
        },
        required: ['action'],
      },
    },
  },
  execute: executeAppSettings,
}
