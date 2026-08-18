import { test, expect } from '@playwright/test'

// The app must boot with NO API key configured — that is every new user's first
// experience, and a crash there is invisible to the jsdom suite.
//
// Deliberately narrow: these assert the shell renders and is usable offline.
// Anything needing a real provider belongs in unit tests with a mocked LLM.

/** Console errors that are expected in a keyless, offline-ish CI browser. */
const IGNORABLE = [
  /favicon/i,
  /manifest/i,
  /service ?worker/i,
  /Failed to load resource/i,
  /net::ERR_/i,
  /WebGPU|GPUAdapter/i,
  /Firebase|firestore/i,
]

/** The message box, unambiguously — getByLabel('Message') also matches the
 *  model-routing toggle and the send button. */
const composerOf = (page) => page.getByRole('textbox', { name: 'Message', exact: true })

function collectErrors(page) {
  const errors = []
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const text = m.text()
    if (IGNORABLE.some((re) => re.test(text))) return
    errors.push(text)
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

test('boots and renders the composer with no API key', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')

  const composer = composerOf(page)
  await expect(composer).toBeVisible()

  // An uncaught exception during first paint is the failure this test exists for.
  expect(errors, `unexpected console errors:\n${errors.join('\n')}`).toEqual([])
})

test('accepts typed input', async ({ page }) => {
  await page.goto('/')
  const composer = composerOf(page)
  await composer.fill('hello from the smoke test')
  await expect(composer).toHaveValue('hello from the smoke test')
})

test('serves the PWA manifest and an app title', async ({ page }) => {
  const res = await page.goto('/')
  expect(res?.status()).toBeLessThan(400)
  await expect(page).toHaveTitle(/yogatik/i)

  const manifest = await page.request.get('/manifest.json')
  expect(manifest.status()).toBe(200)
  expect((await manifest.json()).name).toBeTruthy()
})

test('reloads without losing the shell', async ({ page }) => {
  await page.goto('/')
  await expect(composerOf(page)).toBeVisible()
  await page.reload()
  await expect(composerOf(page)).toBeVisible()
})
