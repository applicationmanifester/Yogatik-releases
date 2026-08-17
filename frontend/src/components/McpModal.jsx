import React from 'react'
import { Modal } from './Modal'
import { Plug } from 'lucide-react'
import { McpServers } from './McpServers'

export function McpModal({ isOpen, onClose, onShowToast }) {
  if (!isOpen) return null

  return (
    <Modal
      title="MCP Connectors (Model Context Protocol)"
      icon={<Plug size={18} color="#38bdf8" />}
      onClose={onClose}
      labelledBy="mcp-modal-title"
    >
      <div style={{ padding: '4px 0 12px' }}>
        <McpServers onShowToast={onShowToast} />
      </div>
    </Modal>
  )
}
