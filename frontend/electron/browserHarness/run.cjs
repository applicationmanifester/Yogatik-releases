// Integration harness for browserControl.cjs, whose Electron glue no unit test
// can reach (vitest runs under jsdom; WebContentsView needs a real Electron app).
//
// Run it with:  npm run test:browser
//
// It drives real tabs against a local fixture and asserts the behaviour that
// matters: a click by ref must actually fire the page's handler, typed text must
// land in the real input, and a stale ref must be REFUSED rather than silently
// clicking whatever now sits at that index. It has already caught two crashes
// (a window destroyed while its views were alive, and a capturePage paint race).
// Boots a real Electron app, drives real WebContentsView tabs, asserts, exits.
const { app } = require('electron')
const path = require('path')
const bc = require('../browserControl.cjs')

const FIXTURE = 'file:///' + path.resolve(__dirname, 'fixture.html').split(String.fromCharCode(92)).join('/')
const results = []
const check = (name, cond, extra) => {
  results.push({ name, ok: !!cond, extra: cond ? '' : (extra || '') })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (cond ? '' : '   >>> ' + (extra || '')))
}

app.whenReady().then(async () => {
  try {
    const s = bc.ensureSession('conv-test', 'window')
    check('session created in window mode', s.mode === 'window', 'mode=' + s.mode)

    const tabId = bc.createTab(s, null)
    check('tab created', !!tabId && s.tabs.size === 1, 'tabs=' + s.tabs.size)

    const nav = await bc.navigate(s, tabId, FIXTURE)
    check('navigate resolved ok', nav.success === true, JSON.stringify(nav))
    check('navigate reports title', nav.title === 'Fixture', 'title=' + nav.title)

    const read = await bc.readPage(s, tabId)
    check('read succeeded', read.success === true, JSON.stringify(read).slice(0, 200))
    check('tree has refs', /\[ref_\d+_\d+\]/.test(read.tree || ''), (read.tree || '').slice(0, 300))
    check('tree found the heading', /heading "Login"/.test(read.tree || ''), (read.tree || '').slice(0, 300))
    check('tree found the button', /button "Sign in"|button "Sign in"/.test(read.tree || ''), (read.tree || '').slice(0, 300))
    check('hidden element excluded', !/Hidden button/.test(read.tree || ''), 'hidden leaked')
    check('interactive count sane', read.interactive_count >= 3, 'count=' + read.interactive_count)

    // Find the button's ref from the tree text.
    const btnLine = (read.tree || '').split('\n').find(l => l.includes('Sign in'))
    const btnRef = btnLine && (btnLine.match(/\[(ref_\d+_\d+)\]/) || [])[1]
    check('resolved a ref for the button', !!btnRef, btnLine || 'no line')

    const clicked = await bc.click(s, { tabId, ref: btnRef })
    check('click by ref succeeded', clicked.success === true, JSON.stringify(clicked))
    await new Promise(r => setTimeout(r, 300))
    const title = s.tabs.get(tabId).view.webContents.getTitle()
    check('click actually fired the handler', title === 'CLICKED', 'title=' + title)

    // Type into the email field by ref.
    const emailLine = (read.tree || '').split('\n').find(l => l.includes('Email address'))
    const emailRef = emailLine && (emailLine.match(/\[(ref_\d+_\d+)\]/) || [])[1]
    const typed = await bc.typeText(s, { tabId, ref: emailRef, text: 'a@b.co' })
    check('type succeeded', typed.success === true, JSON.stringify(typed))
    await new Promise(r => setTimeout(r, 300))
    const val = await s.tabs.get(tabId).view.webContents.executeJavaScript('document.getElementById("email").value')
    check('text landed in the real input', val === 'a@b.co', 'value=' + JSON.stringify(val))

    // Stale ref: navigate again, then reuse the old ref.
    await bc.navigate(s, tabId, FIXTURE)
    const stale = await bc.click(s, { tabId, ref: btnRef })
    check('stale ref refused', stale.success === false && stale.stale === true, JSON.stringify(stale))
    check('stale ref did NOT fall back to a coordinate', !stale.clicked, JSON.stringify(stale))

    // Screenshot.
    const shot = await bc.screenshot(s, tabId)
    check('screenshot returned a data url', shot.success && /^data:image\/png;base64,/.test(shot.image || ''), (shot.image || shot.error || '').slice(0, 60))

    // Second tab + listing.
    const t2 = bc.createTab(s, null)
    await bc.navigate(s, t2, FIXTURE)
    check('two tabs tracked', bc.listTabs(s).length === 2, JSON.stringify(bc.listTabs(s).map(t => t.tabId)))
    check('active tab is the new one', s.activeTabId === t2, 'active=' + s.activeTabId)

    // Mode switch must preserve tabs (re-parent, not rebuild).
    const before = bc.listTabs(s).map(t => t.url)
    bc.setMode(s, 'panel')
    const after = bc.listTabs(s).map(t => t.url)
    check('mode switched to panel', s.mode === 'panel', 'mode=' + s.mode)
    check('tabs survived the mode switch', JSON.stringify(before) === JSON.stringify(after) && s.tabs.size === 2, before + ' vs ' + after)

    // Close one tab.
    bc.closeTab(s, t2)
    check('tab closed', s.tabs.size === 1, 'tabs=' + s.tabs.size)

    // Bad key refused.
    const badKey = await bc.pressKey(s, { tabId, keys: 'frobnicate' })
    check('unknown key refused', badKey.success === false, JSON.stringify(badKey))
    const goodKey = await bc.pressKey(s, { tabId, keys: 'ctrl+a' })
    check('known combo accepted', goodKey.success === true, JSON.stringify(goodKey))

    // Navigation failure surfaces honestly.
    const bad = await bc.navigate(s, tabId, 'http://this-host-does-not-exist.invalid/')
    check('failed navigation reports an error', bad.success === false && !!bad.error, JSON.stringify(bad))
    check('tab survived the failed navigation', s.tabs.size === 1, 'tabs=' + s.tabs.size)

    // Teardown.
    bc.destroySession('conv-test')
    check('session destroyed', bc.getSession('conv-test') === null, 'still present')
  } catch (e) {
    check('harness ran without throwing', false, e && (e.stack || e.message))
  }

  const failed = results.filter(r => !r.ok)
  console.log('\nRESULT ' + (results.length - failed.length) + '/' + results.length + ' passed')
  app.exit(failed.length ? 1 : 0)
})
