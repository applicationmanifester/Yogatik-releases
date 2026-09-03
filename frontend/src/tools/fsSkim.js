/**
 * fs_skim — read a file's SHAPE, not its full bytes.
 *
 * fs_outline (fsSmartRead.js) gives a bare symbol LIST with no bodies at
 * all; fs_smart_read gives a targeted read once you already know which
 * symbol or range matters; fs_read gives everything. Nothing sat between
 * "just the names" and "the whole file" — this does: the file itself,
 * lightly compacted (codeSkeleton.js collapses long function/control bodies
 * and large literal blobs to a line-count note, keeping every signature,
 * class/interface shape and top-level statement visible), for the case
 * where the agent wants to see a file's actual FLOW before deciding what,
 * if anything, is worth a full fs_read.
 *
 * Composes the existing fs_read tool rather than talking to the bridge
 * directly — one real read path, not a second one that could drift from
 * fs_read's own truncation/binary/caching behavior.
 */
import { fail, fsReadTool } from './localFs'
import { buildSkeleton, isSkeletonSupported } from '../codeSkeleton'

export const fsSkimTool = {
  schema: {
    description: 'See a source file’s SHAPE without paying for its full content: every function/class signature, top-level statement and class/interface member stays visible, while long function bodies and large literal blobs (config objects, lookup tables) collapse to a one-line "N lines collapsed" note. Use this BEFORE fs_read when you do not yet know which part of a file matters; use fs_outline for just a bare symbol list; use fs_read (optionally with a line range) once you know you need the real content of something. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the source file.' },
        collapse_threshold: { type: 'number', description: 'Collapse a block body only once it exceeds this many interior lines (default 6).' },
      },
      required: ['path'],
    },
  },
  async execute(args = {}, opts = {}) {
    const path = args.path || args.file || args.filepath || args.target
    if (!path) return fail('path is required')

    const ext = String(path).split('.').pop() || ''
    if (!isSkeletonSupported(ext)) {
      // An indentation-based or non-brace language (Python, YAML, Markdown…)
      // would either mis-collapse or never collapse at all under brace
      // counting. Fall through to a real, honest full read rather than
      // silently returning something wrong for the file type.
      const res = await fsReadTool.execute({ path }, opts)
      return {
        ...res, tool: 'fs_skim', skeleton: false,
        note: `Skeleton view isn't supported for .${ext || 'this'} files yet — returning the full content instead. Use fs_read directly next time for this file type.`,
      }
    }

    const read = await fsReadTool.execute({ path }, opts)
    if (!read?.success) return read
    if (read.binary) {
      return { ...read, tool: 'fs_skim', skeleton: false, note: 'Binary file — nothing to skeletonize.' }
    }
    if (read.truncated) {
      // A truncated read already cut the file short before we ever saw it —
      // skeletonizing a partial file risks hiding a body that is actually
      // whole in the real file, or mis-collapsing at the cut point.
      return {
        ...read, tool: 'fs_skim', skeleton: false,
        note: 'This file was truncated by fs_read before it could be skeletonized. Read it in ranges with fs_read/fs_smart_read instead.',
      }
    }

    const collapseThreshold = Number(args.collapse_threshold) > 0 ? Number(args.collapse_threshold) : 6
    const skel = buildSkeleton(read.content, { collapseThreshold })

    return {
      success: true,
      tool: 'fs_skim',
      path,
      skeleton: true,
      original_lines: skel.originalLines,
      output_lines: skel.outputLines,
      collapsed_regions: skel.collapsedRegions,
      collapsed_lines: skel.collapsedLines,
      reduction_pct: skel.reductionPct,
      content: skel.text,
      note: skel.collapsedRegions
        ? `${skel.collapsedRegions} block(s) collapsed (${skel.collapsedLines} lines total, ~${skel.reductionPct}% shorter). Call fs_read on "${path}" (optionally with start_line/end_line) for the real content of any collapsed block.`
        : 'Nothing in this file was long enough to collapse — this is effectively the full file already.',
    }
  },
}
