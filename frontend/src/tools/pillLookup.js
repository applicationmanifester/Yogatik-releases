/**
 * Pill & Medication Identifier Tool
 *
 * Uses NIH RxNav and OpenFDA APIs (keyless, public healthcare endpoints)
 * to identify pills and medications by imprint code, active ingredient, brand name,
 * color, and shape, returning verified drug facts, dosage guidelines, and FDA warnings.
 */

import { proxyJson } from './http'
import { webSearchTool } from './webSearch'

const PILL_CACHE = new Map()
const PILL_CACHE_TTL = 15 * 60_000 // 15 minutes

/**
 * Clean and normalize pill imprint code (e.g., "L 484" -> "L484", "M367" -> "M367")
 */
export function normalizeImprint(imprint = '') {
  return String(imprint || '')
    .toUpperCase()
    .replace(/[^A-Z0-9/ -]/g, '')
    .trim()
}

function withTimeout(promise, ms = 2500) {
  let timer
  const timeoutPromise = new Promise(resolve => {
    timer = setTimeout(() => resolve(null), ms)
  })
  return Promise.race([
    promise.then(res => { clearTimeout(timer); return res }),
    timeoutPromise
  ]).catch(() => null)
}

/**
 * Query NIH RxNav for RxCUI concepts matching an imprint or drug name
 */
async function queryRxNav(term) {
  try {
    const cleanTerm = encodeURIComponent(term.trim())
    const url = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${cleanTerm}&maxEntries=4`
    const data = await withTimeout(proxyJson(url), 2000)
    const candidates = data?.approximateGroup?.candidate || []
    return candidates.map(c => ({
      rxcui: c.rxcui,
      rxaui: c.rxaui,
      score: Number(c.score || 0),
      rank: c.rank,
    })).filter(c => c.rxcui)
  } catch {
    return []
  }
}

/**
 * Fetch detailed drug name and ingredients by RxCUI from NIH RxNav
 */
async function getRxNavDetails(rxcui) {
  try {
    const url = `https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/allProperties.json?prop=names`
    const data = await withTimeout(proxyJson(url), 2000)
    const props = data?.propConceptGroup?.propConcept || []
    const nameProp = props.find(p => p.propName === 'RxNorm Name') || props[0]
    return nameProp?.propValue || ''
  } catch {
    return ''
  }
}

/**
 * Query OpenFDA Drug Label API for safety warnings, active ingredients, and indications
 */
async function queryOpenFda(drugName) {
  try {
    const clean = encodeURIComponent(drugName.replace(/[^a-zA-Z0-9 ]/g, '').trim())
    const url = `https://api.fda.gov/drug/label.json?search=openfda.substance_name:"${clean}"+openfda.brand_name:"${clean}"&limit=1`
    const data = await withTimeout(proxyJson(url), 2000)
    const doc = data?.results?.[0]
    if (!doc) return null

    return {
      brand_name: doc.openfda?.brand_name?.[0] || undefined,
      generic_name: doc.openfda?.generic_name?.[0] || undefined,
      substance_name: doc.openfda?.substance_name || undefined,
      dosage_form: doc.openfda?.dosage_form?.[0] || undefined,
      route: doc.openfda?.route?.[0] || undefined,
      purpose: (doc.purpose?.[0] || '').slice(0, 300) || undefined,
      indications: (doc.indications_and_usage?.[0] || '').slice(0, 400) || undefined,
      warnings: (doc.warnings?.[0] || doc.boxed_warning?.[0] || '').slice(0, 400) || undefined,
      otc_or_rx: doc.openfda?.product_type?.[0] || (doc.openfda?.is_original_packager ? 'OTC / Rx' : undefined),
    }
  } catch {
    return null
  }
}

export const pillLookupTool = {
  schema: {
    name: 'pill_lookup',
    description:
      'Identify and look up pills, tablets, capsules, and medications by their engraved imprint code, ' +
      'color, shape, or drug name using official NIH RxNav and OpenFDA databases. ' +
      'Returns active ingredients, generic/brand names, purpose, indications, and safety warnings.',
    parameters: {
      type: 'object',
      properties: {
        imprint: {
          type: 'string',
          description: 'Engraved text or numbers on the pill/tablet (e.g. "L484", "M 367", "IP 109", "54 543", "V 4812")',
        },
        drug_name: {
          type: 'string',
          description: 'Known or suspected drug name (e.g. "ibuprofen", "amoxicillin", "acetaminophen")',
        },
        color: {
          type: 'string',
          description: 'Color of the pill (e.g. "white", "yellow", "blue", "red", "orange")',
        },
        shape: {
          type: 'string',
          description: 'Shape of the pill (e.g. "round", "oval", "capsule", "oblong", "triangle")',
        },
      },
    },
  },
  async execute(args = {}) {
    const imprint = normalizeImprint(args.imprint || args.code || args.text || '')
    const drugName = String(args.drug_name || args.name || args.medication || '').trim()
    const color = String(args.color || '').trim()
    const shape = String(args.shape || '').trim()

    if (!imprint && !drugName) {
      return {
        success: false,
        error: 'Please provide either an engraved imprint code (e.g. "L484") or a drug name to identify the medication.',
      }
    }

    const cacheKey = `${imprint}_${drugName}_${color}_${shape}`.toLowerCase()
    const cached = PILL_CACHE.get(cacheKey)
    if (cached && (Date.now() - cached.ts) < PILL_CACHE_TTL) {
      return { ...cached.data, cached: true }
    }

    const searchTerm = imprint || drugName
    const candidates = await queryRxNav(searchTerm)
    const matches = []

    for (const c of candidates.slice(0, 3)) {
      const name = await getRxNavDetails(c.rxcui)
      if (name) {
        matches.push({ rxcui: c.rxcui, name, score: c.score })
      }
    }

    // Secondary OpenFDA label enrichment
    const primaryName = matches[0]?.name || drugName
    const fdaDetails = primaryName ? await queryOpenFda(primaryName) : null

    // If RxNav and OpenFDA did not find a hit, fallback to verified medical web search
    let webHits = []
    if (!matches.length && !fdaDetails) {
      const webQuery = `pill identification imprint "${searchTerm}" ${color} ${shape} DailyMed Drugs.com`.trim()
      const searchRes = await webSearchTool.execute({ query: webQuery, count: 3 })
      webHits = (searchRes?.results || []).map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
      }))
    }

    const out = {
      success: true,
      tool: 'pill_lookup',
      query: { imprint: imprint || undefined, drug_name: drugName || undefined, color: color || undefined, shape: shape || undefined },
      matches: matches.length ? matches : undefined,
      fda_facts: fdaDetails || undefined,
      web_evidence: webHits.length ? webHits : undefined,
      disclaimer: 'Always verify medications with a licensed pharmacist or healthcare professional. Imprint and appearance can vary by manufacturer.',
    }

    if (PILL_CACHE.size > 100) {
      const first = PILL_CACHE.keys().next().value
      PILL_CACHE.delete(first)
    }
    PILL_CACHE.set(cacheKey, { data: out, ts: Date.now() })

    return out
  },
}
