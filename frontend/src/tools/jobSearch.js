/**
 * Job & Career Portal Search Tool
 * Searches job openings, career postings, requirements, and salaries
 * across Naukri, Indeed, LinkedIn Jobs, Glassdoor, and Wellfound.
 */

import { webSearchTool } from './webSearch'

const PORTAL_SITES = {
  naukri: 'naukri.com',
  indeed: 'indeed.com',
  linkedin: 'linkedin.com/jobs',
  glassdoor: 'glassdoor.com/Job',
  wellfound: 'wellfound.com/jobs',
}

const PORTAL_NAMES = {
  naukri: 'Naukri.com',
  indeed: 'Indeed',
  linkedin: 'LinkedIn Jobs',
  glassdoor: 'Glassdoor',
  wellfound: 'Wellfound (AngelList)',
}

function detectPortal(url = '') {
  const u = String(url).toLowerCase()
  if (u.includes('naukri.com')) return 'naukri'
  if (u.includes('indeed.com')) return 'indeed'
  if (u.includes('linkedin.com')) return 'linkedin'
  if (u.includes('glassdoor.com')) return 'glassdoor'
  if (u.includes('wellfound.com') || u.includes('angel.co')) return 'wellfound'
  return 'job'
}

function parseJobMetadata(title = '', snippet = '') {
  let company = ''
  let location = ''
  let experience = ''

  // Look for patterns like "Software Engineer at Google - Bangalore" or "Google hiring Software Engineer"
  const atMatch = title.match(/(?:at|@|hiring)\s+([A-Za-z0-9\s&,.-]+?)(?:\s*[-–|in]|$)/i)
  if (atMatch) company = atMatch[1].trim()

  const locMatch = (title + ' ' + snippet).match(/(?:in|location:?)\s+([A-Za-z\s]+?(?:Bengaluru|Bangalore|Hyderabad|Pune|Mumbai|Delhi|Noida|Gurgaon|Chennai|Remote|San Francisco|New York|London|California))/i)
  if (locMatch) location = locMatch[1].trim()

  const expMatch = snippet.match(/(\d+[\s-–+to]*\d*\s*(?:yrs|years|yr)\s*(?:exp|experience)?)/i)
  if (expMatch) experience = expMatch[1].trim()

  return { company, location, experience }
}

// A metasearch that includes Wikipedia does not understand site: operators, so
// the query alone cannot keep results on-portal — it matched the literal words
// and returned encyclopedia articles as "jobs". Filtering by host afterwards is
// the part that actually works.
const JOB_HOSTS = /(naukri|indeed|linkedin|glassdoor|wellfound|angel\\.co|monster|ziprecruiter|dice|lever\\.co|greenhouse\\.io|workday)/i

// Portal SEARCH pages are not listings. "197 Remote Python jobs available" is a
// result count, and presenting it as a job is how a document ends up reporting
// index pages as findings.
const INDEX_PAGE = [
  /\/q-[^/]*jobs?/i, /[?&]q=/i, /\/jobs\/?$/i, /\/jobs\?/i,
  /\/search/i, /\/browse/i, /-jobs\.html?$/i,
]

function isRealListing(url) {
  const u = String(url || '')
  if (!JOB_HOSTS.test(u)) return false
  return !INDEX_PAGE.some((re) => re.test(u))
}

export const jobSearchTool = {
  schema: {
    description:
      'Search job openings, career opportunities, and hiring posts across Naukri, Indeed, LinkedIn Jobs, and Glassdoor. ' +
      'Supports filtering by job title, location, experience, and portal. ' +
      'Examples: "find Senior React Developer jobs in Bangalore on Naukri", "search Data Scientist roles in Remote on LinkedIn Jobs", "look up Python backend jobs on Indeed".',
    parameters: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          description: 'Job title or skills to search for (e.g. "Full Stack Developer", "Product Manager", "Data Analyst")',
        },
        location: {
          type: 'string',
          description: 'Target location (e.g. "Bangalore", "Hyderabad", "Pune", "Remote", "Delhi NCR", "United States")',
        },
        portal: {
          type: 'string',
          enum: ['all', 'naukri', 'indeed', 'linkedin', 'glassdoor', 'wellfound'],
          description: 'Specific career portal to search, or "all" to aggregate (default "all")',
        },
        experience: {
          type: 'string',
          description: 'Experience level (e.g. "0-2 years", "entry-level", "senior", "5+ years")',
        },
        max_results: {
          type: 'number',
          description: 'Number of jobs to return (default 8, max 15)',
        },
      },
      required: ['role'],
    },
  },

  async execute(args = {}) {
    const rawRole = args?.role || args?.query || args?.title || ''
    if (!rawRole.trim()) {
      return { success: false, error: 'Please provide a job title or role to search for.' }
    }

    const location = (args?.location || '').trim()
    const portal = (args?.portal || 'all').toLowerCase()
    const experience = (args?.experience || '').trim()
    const maxResults = Math.min(15, Math.max(1, args?.max_results || 8))

    let siteQuery = ''
    if (portal !== 'all' && PORTAL_SITES[portal]) {
      siteQuery = `site:${PORTAL_SITES[portal]}`
    } else {
      siteQuery = '(site:naukri.com OR site:indeed.com OR site:linkedin.com/jobs OR site:glassdoor.com/Job)'
    }

    const queryParts = [rawRole]
    if (location) queryParts.push(location)
    if (experience) queryParts.push(experience)
    queryParts.push(siteQuery)

    const searchQuery = queryParts.join(' ')

    try {
      const searchRes = await webSearchTool.execute({
        query: searchQuery,
        recency: 'month',
        max_results: maxResults,
      })

      const items = (searchRes?.results || [])
        .filter((r) => isRealListing(r && r.url))
        .map(r => {
        const detected = detectPortal(r.url)
        const meta = parseJobMetadata(r.title, r.snippet)
        return {
          title: r.title.replace(/\s*[-–|]\s*(?:Naukri|Indeed|LinkedIn|Glassdoor).*$/i, '').trim(),
          // Unknown stays unknown: 'Featured Employer' and 'Multiple Locations'
          // were invented, and invented facts get quoted in documents as findings.
          company: meta.company || undefined,
          location: meta.location || location || undefined,
          experience: meta.experience || experience || undefined,
          portal: detected,
          portalName: PORTAL_NAMES[detected] || 'Job Portal',
          url: r.url,
          snippet: r.snippet,
        }
      })

      if (!items.length) {
        // Reporting success with nothing usable is what produced a document
        // whose own tables read "0 results" and "Wikipedia pages".
        return {
          success: false,
          tool: 'job_search',
          role: rawRole,
          count: 0,
          jobs: [],
          error: 'No individual job listings were reachable. These portals block automated search and mostly return index pages.',
          note: 'Say so plainly rather than presenting search or index pages as findings. Offer a direct portal link, or ask for a narrower role and location.',
        }
      }

      return {
        success: true,
        tool: 'job_search',
        role: rawRole,
        location: location || 'Any',
        portal: portal,
        portalName: PORTAL_NAMES[portal] || 'All Portals',
        count: items.length,
        jobs: items,
      }
    } catch (err) {
      return { success: false, error: err.message || 'Job search failed.' }
    }
  },
}
