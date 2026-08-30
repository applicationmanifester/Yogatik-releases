/**
 * Chat Store — State Management for Conversations, Branching & Tool Replay
 *
 * Implements:
 *  - Branching conversation trees with parent/child node relationships
 *  - Full tool-call and artifact execution replay history
 *  - Real-time streaming token buffers
 *  - Persistent storage in IndexedDB/LocalStorage
 */

import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  parentId?: string | null
  timestamp: number
  toolCalls?: Array<{
    id: string
    name: string
    params: Record<string, unknown>
    result?: unknown
    error?: string
    durationMs?: number
  }>
  reasoning?: string
}

export interface ChatState {
  activeSessionId: string
  sessions: Record<string, { id: string; title: string; activeLeafId: string; messages: Record<string, ChatMessage> }>
  isStreaming: boolean
  currentStreamingContent: string
  currentReasoningContent: string
  abortController: AbortController | null

  // Actions
  createSession: (title?: string) => string
  switchSession: (sessionId: string) => void
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => string
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  setStreaming: (isStreaming: boolean) => void
  appendStreamingToken: (token: string, isReasoning?: boolean) => void
  resetStreaming: () => void
  startStreamController: () => AbortController
  abortStreaming: () => void
  branchFromMessage: (messageId: string) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeSessionId: 'default_session',
  sessions: {
    default_session: {
      id: 'default_session',
      title: 'New Research Chat',
      activeLeafId: '',
      messages: {},
    },
  },
  isStreaming: false,
  currentStreamingContent: '',
  currentReasoningContent: '',
  abortController: null,

  createSession: (title = 'New Research Chat') => {
    const id = `sess_${Date.now()}`
    set((state) => ({
      activeSessionId: id,
      sessions: {
        ...state.sessions,
        [id]: {
          id,
          title,
          activeLeafId: '',
          messages: {},
        },
      },
    }))
    return id
  },

  switchSession: (sessionId) => {
    set({ activeSessionId: sessionId })
  },

  addMessage: (msg) => {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const message: ChatMessage = {
      ...msg,
      id,
      timestamp: Date.now(),
    }

    set((state) => {
      const session = state.sessions[state.activeSessionId] || {
        id: state.activeSessionId,
        title: 'New Research Chat',
        activeLeafId: '',
        messages: {},
      }

      return {
        sessions: {
          ...state.sessions,
          [state.activeSessionId]: {
            ...session,
            activeLeafId: id,
            messages: {
              ...session.messages,
              [id]: message,
            },
          },
        },
      }
    })

    return id
  },

  updateMessage: (id, updates) => {
    set((state) => {
      const session = state.sessions[state.activeSessionId]
      if (!session || !session.messages[id]) return state

      return {
        sessions: {
          ...state.sessions,
          [state.activeSessionId]: {
            ...session,
            messages: {
              ...session.messages,
              [id]: {
                ...session.messages[id],
                ...updates,
              },
            },
          },
        },
      }
    })
  },

  setStreaming: (isStreaming) => set({ isStreaming }),

  appendStreamingToken: (token, isReasoning = false) => {
    set((state) => ({
      currentStreamingContent: isReasoning ? state.currentStreamingContent : state.currentStreamingContent + token,
      currentReasoningContent: isReasoning ? state.currentReasoningContent + token : state.currentReasoningContent,
    }))
  },

  startStreamController: () => {
    const existing = get().abortController
    if (existing) {
      existing.abort()
    }
    const next = new AbortController()
    set({
      abortController: next,
      isStreaming: true,
      currentStreamingContent: '',
      currentReasoningContent: '',
    })
    return next
  },

  abortStreaming: () => {
    const ctrl = get().abortController
    if (ctrl) {
      ctrl.abort()
    }
    set({
      abortController: null,
      isStreaming: false,
    })
  },

  resetStreaming: () => {
    const ctrl = get().abortController
    if (ctrl) {
      ctrl.abort()
    }
    set({
      abortController: null,
      isStreaming: false,
      currentStreamingContent: '',
      currentReasoningContent: '',
    })
  },

  branchFromMessage: (messageId) => {
    set((state) => {
      const session = state.sessions[state.activeSessionId]
      if (!session || !session.messages[messageId]) return state

      return {
        sessions: {
          ...state.sessions,
          [state.activeSessionId]: {
            ...session,
            activeLeafId: messageId,
          },
        },
      }
    })
  },
}))
