/**
 * Chat Store — Centralized state for conversations, messages, and chat-related data
 * Replaces useState calls in App.jsx for conversations, activeIdx, etc.
 */
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

const initialState = {
  conversations: [],
  activeIdx: 0,
  activeConversationId: null,
  provider: 'local',
  model: '',
  temperature: 1.0,
  webSearch: true,
  tools: true,
  activeTemplate: 'default',
  systemPrompt: '',
  loadingMap: {},
  hasStreamMap: {},
  statusMap: {},
  streamIdMap: {},
  activeToolsMap: {},
  pendingToolResultsMap: {},
  traceMap: {},
  streamTextMap: {},
  queuedMessagesMap: {},
  checkpointMap: {},
  input: '',
  attachedFile: null,
  attachedFilePath: null,
  attachedImage: null,
  promptHistory: [],
  historyIndex: -1,
  draftInput: '',
  projects: [],
  activeProject: null,
  models: {},
  providerModels: [],
  keyInfo: {},
  modelSees: false,
  toolPrefs: [],
  visibleCount: 50,
  autoRoute: true,
  fallback: true,
}

function updateConversationMap(map, clientId, value) {
  const next = Object.assign({}, map)
  if (value === null || value === undefined || value === '') {
    delete next[clientId]
  } else {
    next[clientId] = value
  }
  return next
}

const storeCreator = function(set, get) {
  return {
    ...initialState,

    setConversations: function(conversations) {
      return set({ conversations: conversations, activeIdx: 0, activeConversationId: conversations[0]?.clientId || null })
    },

    setActiveIdx: function(idx) {
      return set(function(state) {
        const conv = state.conversations[idx]
        return {
          activeIdx: idx,
          activeConversationId: conv?.clientId || null,
          provider: conv?.provider || state.provider,
          model: conv?.model !== undefined ? conv.model : state.model,
          temperature: conv?.temperature !== undefined ? conv.temperature : state.temperature,
          webSearch: conv?.webSearch !== undefined ? conv.webSearch : state.webSearch,
          tools: conv?.tools !== undefined ? conv.tools : state.tools,
          activeTemplate: conv?.persona || state.activeTemplate,
          systemPrompt: conv?.systemPrompt || '',
        }
      })
    },

    addConversation: function(conversation) {
      return set(function(state) {
        return {
          conversations: [conversation].concat(state.conversations),
          activeIdx: 0,
          activeConversationId: conversation.clientId,
        }
      })
    },

    updateConversation: function(idx, updates) {
      return set(function(state) {
        return {
          conversations: state.conversations.map(function(c, i) {
            return i === idx ? Object.assign({}, c, updates) : c
          }),
        }
      })
    },

    removeConversation: function(idx) {
      return set(function(state) {
        const next = state.conversations.filter(function(_, i) { return i !== idx })
        const nextIdx = Math.min(idx, next.length - 1)
        const conv = next[nextIdx]
        return {
          conversations: next,
          activeIdx: nextIdx >= 0 ? nextIdx : 0,
          activeConversationId: conv?.clientId || null,
        }
      })
    },

    setActiveConversationId: function(id) {
      return set(function(state) {
        var idx = -1
        state.conversations.forEach(function(c, i) { if (c.clientId === id) idx = i })
        if (idx === -1) return { activeConversationId: id }
        const conv = state.conversations[idx]
        return {
          activeIdx: idx,
          activeConversationId: id,
          provider: conv?.provider || state.provider,
          model: conv?.model !== undefined ? conv.model : state.model,
          temperature: conv?.temperature !== undefined ? conv.temperature : state.temperature,
          webSearch: conv?.webSearch !== undefined ? conv.webSearch : state.webSearch,
          tools: conv?.tools !== undefined ? conv.tools : state.tools,
          activeTemplate: conv?.persona || state.activeTemplate,
          systemPrompt: conv?.systemPrompt || '',
        }
      })
    },

    setProvider: function(provider) { return set({ provider: provider }) },
    setModel: function(model) { return set({ model: model }) },
    setTemperature: function(temperature) { return set({ temperature: temperature }) },
    setWebSearch: function(webSearch) { return set({ webSearch: webSearch }) },
    setTools: function(tools) { return set({ tools: tools }) },
    setActiveTemplate: function(activeTemplate) { return set({ activeTemplate: activeTemplate }) },
    setSystemPrompt: function(systemPrompt) { return set({ systemPrompt: systemPrompt }) },

    setLoadingMap: function(loadingMap) { return set({ loadingMap: loadingMap }) },
    setHasStreamMap: function(hasStreamMap) { return set({ hasStreamMap: hasStreamMap }) },
    setStatusMap: function(statusMap) { return set({ statusMap: statusMap }) },
    setStreamIdMap: function(streamIdMap) { return set({ streamIdMap: streamIdMap }) },
    setActiveToolsMap: function(activeToolsMap) { return set({ activeToolsMap: activeToolsMap }) },
    setPendingToolResultsMap: function(pendingToolResultsMap) { return set({ pendingToolResultsMap: pendingToolResultsMap }) },
    setTraceMap: function(traceMap) { return set({ traceMap: traceMap }) },
    setStreamTextMap: function(streamTextMap) { return set({ streamTextMap: streamTextMap }) },
    setQueuedMessagesMap: function(queuedMessagesMap) { return set({ queuedMessagesMap: queuedMessagesMap }) },
    setCheckpointMap: function(checkpointMap) { return set({ checkpointMap: checkpointMap }) },

    setInput: function(input) { return set({ input: input }) },
    setAttachedFile: function(attachedFile) { return set({ attachedFile: attachedFile }) },
    setAttachedFilePath: function(attachedFilePath) { return set({ attachedFilePath: attachedFilePath }) },
    setAttachedImage: function(attachedImage) { return set({ attachedImage: attachedImage }) },

    setPromptHistory: function(promptHistory) { return set({ promptHistory: promptHistory }) },
    setHistoryIndex: function(historyIndex) { return set({ historyIndex: historyIndex }) },
    setDraftInput: function(draftInput) { return set({ draftInput: draftInput }) },

    setProjects: function(projects) { return set({ projects: projects }) },
    setActiveProject: function(activeProject) { return set({ activeProject: activeProject }) },

    setModels: function(models) { return set({ models: models }) },
    setProviderModels: function(providerModels) { return set({ providerModels: providerModels }) },
    setKeyInfo: function(keyInfo) { return set({ keyInfo: keyInfo }) },
    setModelSees: function(modelSees) { return set({ modelSees: modelSees }) },

    setToolPrefs: function(toolPrefs) { return set({ toolPrefs: toolPrefs }) },

    setVisibleCount: function(visibleCount) { return set({ visibleCount: visibleCount }) },

    setAutoRoute: function(autoRoute) { return set({ autoRoute: autoRoute }) },
    setFallback: function(fallback) { return set({ fallback: fallback }) },

    clearCurrentChat: function() {
      return set(function(state) {
        return {
          conversations: state.conversations.map(function(c, i) {
            return i === state.activeIdx ? Object.assign({}, c, { messages: [] }) : c
          }),
        }
      })
    },

    resetInputState: function() {
      return set({
        input: '',
        attachedFile: null,
        attachedFilePath: null,
        attachedImage: null,
        historyIndex: -1,
        draftInput: '',
      })
    },

    // Helper to update a single key in a map
    updateMap: function(mapName, clientId, value) {
      return set(function(state) {
        var result = {}
        result[mapName] = updateConversationMap(state[mapName], clientId, value)
        return result
      })
    },
  }
}

export const useChatStore = create(subscribeWithSelector(storeCreator))

export const selectActiveConversation = function(state) { return state.conversations[state.activeIdx] }
export const selectActiveClientId = function(state) { return state.conversations[state.activeIdx]?.clientId }
export const selectIsStreaming = function(state) { return state.loadingMap[state.conversations[state.activeIdx]?.clientId] || false }
export const selectStreamText = function(state) { return state.streamTextMap[state.conversations[state.activeIdx]?.clientId] || '' }

export default useChatStore
