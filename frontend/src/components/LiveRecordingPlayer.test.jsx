/**
 * [live-recording] tests for the recording playback component.
 *
 * The player makes NO network calls by construction (frames are data URLs, the
 * rail reads the recording object it was handed), so these tests pin the
 * interaction contract instead: the scrubber steps with clicks and keys, tool
 * events jump the playhead, transcript rows stay in sync, and the stage renders
 * the frame at the playhead.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { LiveRecordingPlayer } from './LiveRecordingPlayer'

const REC = {
  startedAt: 0,
  durationSec: 12,
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  turns: [
    { at: 1_000, speaker: 'user', text: 'Find me a paper on attention.' },
    { at: 5_000, speaker: 'assistant', text: 'Here is the Vaswani paper.' },
  ],
  toolEvents: [
    { at: 3_000, name: 'web_search', kind: 'call' },
    { at: 4_500, name: 'web_search', kind: 'result' },
  ],
  frames: [
    { at: 2_000, thumb: 'data:image/jpeg;base64,AAAA', w: 320, h: 240 },
    { at: 9_000, thumb: 'data:image/jpeg;base64,BBBB', w: 320, h: 240 },
  ],
}

beforeEach(() => { cleanup() })
afterEach(() => { cleanup() })

it('renders the stage frame, the transcript rail and the timeline markers — no network', async () => {
  render(<LiveRecordingPlayer recording={REC} onClose={vi.fn()} />)
  const imgs = screen.getAllByRole('img')
  expect(imgs).toHaveLength(1)
  expect(imgs[0].getAttribute('src')).toMatch(/^data:image\/jpeg/)   // data URLs only, no fetches
  expect(screen.getByText('Find me a paper on attention.')).toBeTruthy()
  expect(screen.getByRole('slider', { name: 'Recording timeline' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Tool call web_search at 0:03' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Tool result web_search at 0:04' })).toBeTruthy()
  expect(screen.getByText(/Recording 0:00 \/ 0:12/)).toBeTruthy()
})

it('clicks seek: a tool marker moves the playhead to the event time', async () => {
  render(<LiveRecordingPlayer recording={REC} onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Tool result web_search at 0:04' }))
  await waitFor(() => expect(screen.getByText(/Recording 0:04 \/ 0:12/)).toBeTruthy())
  // the frame at 4s is the FIRST frame (captured at 2s)
  expect(screen.getByRole('img').getAttribute('src')).toMatch(/AAAA/)
})

it('clicks seek: clicking a transcript row highlights it and plays from there', async () => {
  render(<LiveRecordingPlayer recording={REC} onClose={vi.fn()} />)
  const rows = screen.getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(rows[1].className.includes('is-active')).toBe(false)

  fireEvent.click(rows[0])   // "You at 0:01"
  await waitFor(() => expect(rows[0].className.includes('is-active')).toBe(true))
  expect(rows[1].className.includes('is-active')).toBe(false)
})

it('keyboard steps the playhead (ArrowLeft/ArrowRight) and Home/End bounds it', async () => {
  render(<LiveRecordingPlayer recording={REC} onClose={vi.fn()} />)
  const track = screen.getByRole('slider', { name: 'Recording timeline' })
  expect(track.getAttribute('aria-valuenow')).toBe('0')

  fireEvent.keyDown(track, { key: 'ArrowRight' })
  expect(track.getAttribute('aria-valuenow')).toBe('5')        // +5s step
  fireEvent.keyDown(track, { key: 'ArrowLeft' })
  expect(track.getAttribute('aria-valuenow')).toBe('0')
  fireEvent.keyDown(track, { key: 'End' })
  expect(track.getAttribute('aria-valuenow')).toBe('12')
  fireEvent.keyDown(track, { key: 'Home' })
  expect(track.getAttribute('aria-valuenow')).toBe('0')
})

it('the stage frame advances with the playhead from keys, and the last frame wins at End', async () => {
  render(<LiveRecordingPlayer recording={REC} onClose={vi.fn()} />)
  const track = screen.getByRole('slider', { name: 'Recording timeline' })
  fireEvent.keyDown(track, { key: 'ArrowRight' })   // t = 5s → still frame AAAA (2s)
  expect(screen.getByRole('img').getAttribute('src')).toMatch(/AAAA/)
  fireEvent.keyDown(track, { key: 'ArrowRight' })   // t = 10s → frame BBBB (9s)
  expect(screen.getByRole('img').getAttribute('src')).toMatch(/BBBB/)
})

it('closes via the close button', async () => {
  const onClose = vi.fn()
  render(<LiveRecordingPlayer recording={REC} onClose={onClose} />)
  fireEvent.click(screen.getByRole('button', { name: 'Close playback' }))
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('a transcript-only recording (no frames) still plays — with a note, not a crash', async () => {
  render(<LiveRecordingPlayer recording={{ ...REC, frames: [] }} onClose={vi.fn()} />)
  expect(screen.getByLabelText('No frame captured')).toBeTruthy()
  expect(screen.getByText(/No frames were captured for this call/)).toBeTruthy()
  const track = screen.getByRole('slider', { name: 'Recording timeline' })
  fireEvent.keyDown(track, { key: 'ArrowRight' })
  expect(track.getAttribute('aria-valuenow')).toBe('5')
})
