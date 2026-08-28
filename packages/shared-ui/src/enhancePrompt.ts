// Prompt enhancement transformations for AI chat modal
// Provides grammar fix, summarization, and professional tone transformation

export function enhancePrompt(
  prompt: string,
  type: 'grammar' | 'summarize' | 'professional' = 'grammar'
): string {
  const trimmed = prompt?.trim() || '';
  if (!trimmed) return trimmed;

  switch (type) {
    case 'grammar': {
      // Capitalize first character of the sentence and ensure clean spacing
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    }

    case 'summarize': {
      const match = trimmed.match(/^[^.!?\n]+[.!?]?/);
      const firstSentence = (match ? match[0] : trimmed).trim();
      if (firstSentence.length <= 100) return firstSentence;
      return firstSentence.substring(0, 97).trim() + '...';
    }

    case 'professional': {
      // Professional title-case word capitalization in a single pass
      return trimmed.replace(/\b([a-z])/gi, (_, letter) => letter.toUpperCase());
    }

    default:
      return trimmed;
  }
}

export type { enhancePrompt };