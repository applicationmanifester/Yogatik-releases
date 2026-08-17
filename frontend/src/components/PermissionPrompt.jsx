import React from 'react'
import { ShieldAlert, Terminal, FileWarning, Trash2 } from 'lucide-react'

/**
 * Approval card for a gated tool call. Rendered when permissions.js asks.
 *
 * Deliberately shows the EXACT command or path — an approval prompt that hides
 * what it is approving is worse than none. Destructive calls get a distinct
 * treatment and no "always allow", because a blanket yes to `terminal_run` or a
 * recursive delete is the one rule a user should have to grant per-call or
 * per-chat, never once and forever by accident.
 */
export default function PermissionPrompt({ request, onResolve }) {
  if (!request) return null
  const { tool, args, risk, description, diff } = request
  const destructive = risk === 'destructive'

  const Icon = tool === 'terminal_run' ? Terminal : (tool === 'fs_delete' ? Trash2 : FileWarning)

  const answer = (outcome, remember) => onResolve({ outcome, remember })

  return (
    <div className={`perm-card ${destructive ? 'perm-destructive' : ''}`} role="alertdialog" aria-label="Permission required">
      <div className="perm-head">
        <ShieldAlert size={16} />
        <span>{destructive ? 'Confirm a destructive action' : 'Permission needed'}</span>
      </div>

      <div className="perm-body">
        <Icon size={14} />
        <code className="perm-desc">{description}</code>
      </div>

      {diff?.text && (
        <div className="perm-diff-wrap">
          <div className="perm-diff-head">
            <span className="perm-diff-add">+{diff.added ?? 0}</span>
            <span className="perm-diff-del">−{diff.removed ?? 0}</span>
          </div>
          <pre className="perm-diff">
            {diff.text.split('\n').map((line, i) => (
              <div
                key={i}
                className={line.startsWith('+') ? 'dl-add' : line.startsWith('-') ? 'dl-del' : 'dl-ctx'}
              >{line}</div>
            ))}
          </pre>
        </div>
      )}

      {tool === 'terminal_run' && (
        <div className="perm-note">This runs on your computer with your account’s permissions.</div>
      )}
      {tool === 'fs_delete' && args?.recursive && (
        <div className="perm-note">This removes the directory and everything inside it.</div>
      )}

      <div className="perm-actions">
        <button className="small-btn perm-allow" onClick={() => answer('allow', 'once')}>Allow once</button>
        <button className="small-btn" onClick={() => answer('allow', 'chat')}>Allow for this chat</button>
        {!destructive && (
          <button className="small-btn" onClick={() => answer('allow', 'global')}>Always allow {tool}</button>
        )}
        <button className="small-btn perm-deny" onClick={() => answer('deny')}>Deny</button>
      </div>
    </div>
  )
}
