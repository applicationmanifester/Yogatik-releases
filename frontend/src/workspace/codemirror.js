// The ONE place CodeMirror is imported. Everything is behind a dynamic import
// so none of it is in the entry graph: the editor is a panel most sessions
// never open, and paying ~350KB on first paint for it would undo the work that
// took first load from 4604KB to 1813KB.
//
// Vite emits a `modulepreload` for every MANUAL chunk the entry graph touches,
// which is how vendor-prism kept arriving during first paint despite a
// deliberate React.lazy. So this module is NOT named in manualChunks — it is
// left in the async chunk Rollup makes for the import() itself, which is the
// only arrangement that actually defers it.

let cached = null

/** Language support, chosen by extension. Loaded with the core, in one chunk. */
function languageFor(mods, ext) {
  const { javascript, json, css, html, markdown, python } = mods
  switch (ext) {
    case 'js': case 'mjs': case 'cjs': return javascript()
    case 'jsx': return javascript({ jsx: true })
    case 'ts': case 'mts': case 'cts': return javascript({ typescript: true })
    case 'tsx': return javascript({ jsx: true, typescript: true })
    case 'json': case 'jsonc': case 'webmanifest': return json()
    case 'css': case 'scss': case 'less': return css()
    case 'html': case 'htm': case 'vue': case 'svelte': return html()
    case 'md': case 'mdx': case 'markdown': return markdown()
    case 'py': case 'pyi': return python()
    default: return null
  }
}

/**
 * Resolve the whole editor toolkit once. Returns null — never throws — if the
 * chunk cannot be fetched: a deploy that swapped the hashed filename, or an
 * offline first-open, must degrade to the plain textarea rather than leaving
 * the pane blank with an error nobody can act on.
 */
export async function loadCodeMirror() {
  if (cached) return cached
  try {
    const [
      state, view, commands, language, search, autocomplete,
      js, jsonLang, cssLang, htmlLang, mdLang, pyLang, oneDark,
    ] = await Promise.all([
      import('@codemirror/state'),
      import('@codemirror/view'),
      import('@codemirror/commands'),
      import('@codemirror/language'),
      import('@codemirror/search'),
      import('@codemirror/autocomplete'),
      import('@codemirror/lang-javascript'),
      import('@codemirror/lang-json'),
      import('@codemirror/lang-css'),
      import('@codemirror/lang-html'),
      import('@codemirror/lang-markdown'),
      import('@codemirror/lang-python'),
      import('@codemirror/theme-one-dark'),
    ])
    cached = {
      state, view, commands, language, search, autocomplete,
      langs: {
        javascript: js.javascript,
        json: jsonLang.json,
        css: cssLang.css,
        html: htmlLang.html,
        markdown: mdLang.markdown,
        python: pyLang.python,
      },
      oneDark: oneDark.oneDark,
      languageFor,
    }
    return cached
  } catch {
    return null
  }
}

/**
 * Build the extension list for one document. Split out from the component so
 * the editor's configuration is one readable list rather than being scattered
 * through effects.
 */
export function buildExtensions(cm, { ext, dark, readOnly, onChange, onSave }) {
  const { state, view, commands, language, search, autocomplete } = cm
  const ext_ = [
    view.lineNumbers(),
    view.highlightActiveLineGutter(),
    view.highlightActiveLine(),
    view.drawSelection(),
    view.rectangularSelection(),
    view.crosshairCursor(),
    view.EditorView.lineWrapping,
    language.foldGutter(),
    language.bracketMatching(),
    language.indentOnInput(),
    language.syntaxHighlighting(language.defaultHighlightStyle, { fallback: true }),
    autocomplete.closeBrackets(),
    autocomplete.autocompletion(),
    search.highlightSelectionMatches(),
    state.EditorState.allowMultipleSelections.of(true),
    commands.history(),
    view.keymap.of([
      // Save FIRST: a later keymap entry cannot shadow it, and losing an edit
      // to a swallowed Ctrl+S is the one failure an editor may not have.
      { key: 'Mod-s', preventDefault: true, run: () => { onSave?.(); return true } },
      ...autocomplete.closeBracketsKeymap,
      ...commands.defaultKeymap,
      ...search.searchKeymap,
      ...commands.historyKeymap,
      ...language.foldKeymap,
      ...autocomplete.completionKeymap,
      commands.indentWithTab,
    ]),
    view.EditorView.updateListener.of((u) => { if (u.docChanged) onChange?.(u.state.doc.toString()) }),
  ]

  const lang = cm.languageFor(cm.langs, ext)
  if (lang) ext_.push(lang)
  if (dark) ext_.push(cm.oneDark)
  if (readOnly) ext_.push(state.EditorState.readOnly.of(true), view.EditorView.editable.of(false))
  return ext_
}
