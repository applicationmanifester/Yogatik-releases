/**
 * Does this message ask for nothing but the clock?
 *
 * Substring matching was a disaster here: "today" and "now" appear in half of
 * all questions, so "Today's India news" was answered with the time. The shortcut
 * bypasses the model entirely, which makes a false positive worse than a missed
 * one — so match whole questions, not fragments.
 */
const TIME_QUESTIONS = [
  /^what(?:'s| is| s)?(?: the)?(?: current| local)? time(?: is it)?(?: now| here| there)?$/,
  /^what time is it(?: now| here| there)?$/,
  /^(?:the )?time(?: now| here| please)?$/,
  /^what(?:'s| is| s)?(?: the)?(?: current| today'?s)? date(?: today| now)?$/,
  /^(?:the )?date(?: today| now)?$/,
  /^what day is it(?: today)?$/,
  /^what(?:'s| is| s)?(?: the)? day(?: today| of the week)?$/,
  /^current (?:time|date|time and date|date and time)$/,
  /^time and date$|^date and time$/,
  /^what(?:'s| is| s)?(?: my| the)? time ?zone$/,
  /^which time ?zone(?: am i in)?$/,
  /^what(?:'s| is| s)?(?: the)? time in \w[\w\s]{0,20}$/,
]

export function isDirectTimeQuery(text) {
  const q = String(text || '')
    .trim().toLowerCase()
    .replace(/[?!.,]+$/g, '')
    .replace(/\s+/g, ' ')
  if (!q || q.length > 40) return false
  return TIME_QUESTIONS.some(re => re.test(q))
}
