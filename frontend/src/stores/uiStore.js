/**
 * UI Store — Centralized state for all modals, panels, and UI state
 * Replaces 25+ useState calls in App.jsx
 */
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

const PANEL_KEYS = [
  'palette', 'auth', 'terms', 'provider', 'personalise', 'skills',
  'persona', 'domainHub', 'demo', 'diagnostics', 'confirm', 'projectName',
  'restore', 'download', 'error', 'arena', 'scheduler', 'subAgents',
  'autoSkills', 'fileEditor', 'whatsNew', 'tour', 'upgrade', 'billing',
  'agents', 'mcp', 'plugins', 'dataDashboard', 'toolPicker',
  'account', 'providers', 'privacy', 'shortcuts', 'overview', 'context',
  'share', 'folder', 'tag', 'settings', 'usage', 'capabilities',
]

const initialPanelState = {}
PANEL_KEYS.forEach(function(key) { initialPanelState[key] = false })

const initialState = {
  openPanels: [],
  ...initialPanelState,
  sidebarOpen: false,
  rootsOpen: false,
  extensionsOpen: false,
  showSlashMenu: false,
  showMentionMenu: false,
  slashMenuIndex: 0,
  mentionQuery: '',
  showAllTools: false,
  activeFolder: null,
  activeTag: null,
  visibleCount: 50,
  theme: 'dark',
  toastMessage: '',
  toastVariant: 'info',
  toastAction: null,
  confirmModal: null,
  errorModalMsg: '',
  userQuestionPrompt: null,
  userQuestionAnswer: '',
  smartRouteSuggestion: null,
  chatDrafts: {},
}

const storeCreator = function(set, get) {
  return {
    ...initialState,

    openPanel: function(key) {
      return set(function(state) {
        if (state.openPanels.includes(key)) return state
        return { openPanels: state.openPanels.concat(key), [key]: true }
      })
    },

    closePanel: function() {
      return set(function(state) {
        if (state.openPanels.length === 0) return state
        const closed = state.openPanels[state.openPanels.length - 1]
        const nextPanels = state.openPanels.slice(0, -1)
        const result = { openPanels: nextPanels }
        result[closed] = false
        return result
      })
    },

    replacePanel: function(key) {
      return set(function(state) {
        if (state.openPanels.length === 0) return { openPanels: [key], [key]: true }
        const closed = state.openPanels[state.openPanels.length - 1]
        const nextPanels = state.openPanels.slice(0, -1).concat(key)
        const result = { openPanels: nextPanels }
        result[closed] = false
        result[key] = true
        return result
      })
    },

    closeAllPanels: function() {
      return set(function(state) {
        const closed = {}
        state.openPanels.forEach(function(k) { closed[k] = false })
        const result = { openPanels: [] }
        Object.assign(result, closed)
        return result
      })
    },

    setSidebarOpen: function(open) { return set({ sidebarOpen: open }) },
    setRootsOpen: function(open) { return set({ rootsOpen: open }) },
    setExtensionsOpen: function(open) { return set({ extensionsOpen: open }) },

    setShowSlashMenu: function(show) { return set({ showSlashMenu: show }) },
    setShowMentionMenu: function(show) { return set({ showMentionMenu: show }) },
    setSlashMenuIndex: function(index) { return set({ slashMenuIndex: index }) },
    setMentionQuery: function(query) { return set({ mentionQuery: query }) },

    setShowAllTools: function(show) { return set({ showAllTools: show }) },
    setActiveFolder: function(folder) { return set({ activeFolder: folder }) },
    setActiveTag: function(tag) { return set({ activeTag: tag }) },
    setVisibleCount: function(count) { return set({ visibleCount: count }) },
    setTheme: function(theme) { return set({ theme: theme }) },

    setConfirmModal: function(modal) { return set({ confirmModal: modal }) },
    setErrorModalMsg: function(msg) { return set({ errorModalMsg: msg }) },

    setUserQuestionPrompt: function(prompt) { return set({ userQuestionPrompt: prompt, userQuestionAnswer: '' }) },
    setUserQuestionAnswer: function(answer) { return set({ userQuestionAnswer: answer }) },

    setSmartRouteSuggestion: function(suggestion) { return set({ smartRouteSuggestion: suggestion }) },

    setChatDraft: function(clientId, draft) {
      return set(function(state) {
        return { chatDrafts: Object.assign({}, state.chatDrafts, { [clientId]: draft }) }
      })
    },

    clearChatDraft: function(clientId) {
      return set(function(state) {
        const next = Object.assign({}, state.chatDrafts)
        delete next[clientId]
        return { chatDrafts: next }
      })
    },
  }
}

export const useUIStore = create(subscribeWithSelector(storeCreator))

export const selectOpenPanels = function(state) { return state.openPanels }
export const selectTopPanel = function(state) { return state.openPanels[state.openPanels.length - 1] || null }
export const selectIsAnyPanelOpen = function(state) { return state.openPanels.length > 0 }
export const selectPanelStack = function(state) { return state.openPanels }

export default useUIStore
