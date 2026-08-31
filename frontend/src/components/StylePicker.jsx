/**
 * Response style picker — the missing UI half of styles.js.
 *
 * styles.js has shipped for a long time: six built-in styles, custom styles,
 * export/import, and agent.js appends the active one's system prompt to EVERY
 * reply. Nothing ever rendered a selector, so the entire feature was reachable
 * only by writing to IndexedDB by hand. A capability the model has and the user
 * cannot see is the failure this codebase keeps recording.
 *
 * Styles are PER CHAT (chatScope.js), inheriting a global default. The control
 * therefore has three states, not two, and the difference matters:
 *   - following the default  → changing the default changes this chat too
 *   - set for this chat      → this chat keeps its style when the default moves
 *   - set as the default     → applies to every chat that is still following
 * A picker that showed only the resolved value would make "Default" ambiguous:
 * the user could not tell whether they had chosen it or merely inherited it.
 */
import React from 'react'
import { getStyles, getActiveStyleId, setActiveStyle, inheritActiveStyle } from '../styles'
import { hasOwnBinding } from '../chatScope'

export function StylePicker({ conversationId = null, onToast }) {
  const [styles, setStyles] = React.useState([])
  const [activeId, setActiveId] = React.useState('default')
  const [own, setOwn] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const reload = React.useCallback(async () => {
    try {
      const [list, id, bound] = await Promise.all([
        getStyles(),
        getActiveStyleId(conversationId),
        hasOwnBinding('active_style', conversationId),
      ])
      setStyles(list)
      setActiveId(id || 'default')
      setOwn(!!bound)
    } catch { /* leave the last good state on screen */ }
  }, [conversationId])

  React.useEffect(() => { reload() }, [reload])

  const choose = async (id) => {
    setBusy(true)
    try {
      await setActiveStyle(id, conversationId)
      await reload()
    } finally { setBusy(false) }
  }

  const follow = async () => {
    setBusy(true)
    try {
      await inheritActiveStyle(conversationId)
      await reload()
      onToast?.('This chat now follows the default style')
    } finally { setBusy(false) }
  }

  const makeDefault = async () => {
    setBusy(true)
    try {
      // Write the GLOBAL key (no conversationId), then drop this chat's own
      // binding so it follows the thing it just set. Leaving the binding in
      // place would pin this chat to a value it can no longer track.
      await setActiveStyle(activeId, null)
      await inheritActiveStyle(conversationId)
      await reload()
      onToast?.('Set as the default for new chats')
    } finally { setBusy(false) }
  }

  const active = styles.find(s => s.id === activeId) || null

  return (
    <div className="style-picker">
      <div className="style-picker-row">
        <label className="style-picker-label" htmlFor="style-picker-select">Response style</label>
        {own && conversationId && <span className="style-picker-badge">this chat</span>}
      </div>

      <select
        id="style-picker-select"
        className="style-select"
        value={activeId}
        disabled={busy}
        onChange={(e) => choose(e.target.value)}
      >
        {styles.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {active?.description && <p className="style-picker-hint">{active.description}</p>}

      {conversationId && (
        <div className="style-picker-actions">
          {own
            ? <button type="button" className="style-picker-link" onClick={follow} disabled={busy}>
                Follow the default
              </button>
            : <span className="style-picker-note">Following the default</span>}
          <button type="button" className="style-picker-link" onClick={makeDefault} disabled={busy}>
            Set as default
          </button>
        </div>
      )}
    </div>
  )
}

export default StylePicker
