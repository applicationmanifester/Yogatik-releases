/**
 * file_dialog — open a native OS file/folder picker (or save dialog) and get
 * real filesystem paths, then optionally read a picked file. Desktop app only:
 * browser <input type=file> yields opaque blobs with no path.
 *
 * This lets the user hand the AI a file OUTSIDE the granted folder for a one-shot
 * read (capped at 2MB) without widening the persistent grant.
 */

function bridge() {
  return (typeof window !== 'undefined' && window.__YOGATIK_DIALOG__) || null
}

const DESKTOP_ONLY = {
  success: false,
  error: 'Native file dialogs are available only in the Yogatik desktop app.',
}

export const fileDialogTool = {
  schema: {
    description:
      'Open a native file/folder picker or save dialog and return real OS paths. ' +
      'With action "read", the user picks a file and its text content is returned (one-shot, up to 2MB) — useful for a file outside the granted folder. ' +
      'With action "save", writes content to a user-chosen location. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['open', 'read', 'save', 'pick_folder'], description: 'open = return chosen path(s); read = return picked file content; save = write content to a chosen path; pick_folder = choose a directory.' },
        title: { type: 'string', description: 'Dialog title.' },
        content: { type: 'string', description: 'Text content to write (action "save").' },
        default_name: { type: 'string', description: 'Suggested filename (action "save").' },
        multiple: { type: 'boolean', description: 'Allow selecting multiple files (action "open").' },
      },
      required: ['action'],
    },
  },
  async execute({ action = 'open', title, content, default_name, multiple = false } = {}) {
    const d = bridge()
    if (!d) return DESKTOP_ONLY
    try {
      if (action === 'pick_folder') return { tool: 'file_dialog', ...(await d.pickFolder({ title })) }
      if (action === 'save') return { tool: 'file_dialog', ...(await d.saveFile({ title, content, defaultName: default_name })) }
      if (action === 'read') {
        const picked = await d.openFile({ title })
        if (!picked?.success) return { tool: 'file_dialog', ...picked }
        return { tool: 'file_dialog', ...(await d.readPicked(picked.path)) }
      }
      // open
      if (multiple) return { tool: 'file_dialog', ...(await d.openFiles({ title })) }
      return { tool: 'file_dialog', ...(await d.openFile({ title })) }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  },
}
