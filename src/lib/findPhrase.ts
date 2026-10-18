import type { FindPhrase, Turn } from "@/lib/types";

/**
 * "Find phrases": for each prompt, the shortest run of its own words that appears exactly once in
 * the whole conversation (prompts and Claude's replies). Pasting it into Ctrl+F in the Claude app
 * lands on that prompt, since past messages can't be tagged with a real identifier.
 */

const MIN_WORDS = 4;
const MAX_WORDS = 8;
const MIN_CHARS = 18;
const MAX_CHARS = 56;
/** Only the start of a prompt is searched: it's what's visible first when you land on the message. */
const SCAN_WORDS = 80;

const TAGS = /<\/?[a-z_-]+(\s[^>]*)?>/gi;

/** What a reader sees: markdown symbols and wrapper tags removed, whitespace collapsed, lowercased. */
function normalize(text: string): string {
  return text.replace(TAGS, " ").replace(/[*_`#>|]/g, " ").replace(/\s+/g, " ").toLowerCase();
}

/** Words that render the same everywhere (no paths, code, or markup that the app may display differently). */
const PLAIN_WORD = /^[A-Za-z0-9][A-Za-z0-9'’.,!?:;()-]*$/;
const ENDS_SENTENCE = /[.!?:;]$/;

function occurrences(haystack: string, needle: string, stopAt = 2): number {
  let count = 0;
  for (let i = haystack.indexOf(needle); i !== -1 && count < stopAt; i = haystack.indexOf(needle, i + 1)) count++;
  return count;
}

function ownPhrase(user: string, corpus: string): string | null {
  const words = user.replace(TAGS, " ").split(/\s+/).filter(Boolean).slice(0, SCAN_WORDS);
  for (let n = MIN_WORDS; n <= MAX_WORDS; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const run = words.slice(i, i + n);
      if (!run.every((w) => PLAIN_WORD.test(w))) continue;
      // Stay within one sentence, so line breaks or rendering between sentences can't split the match.
      if (run.slice(0, -1).some((w) => ENDS_SENTENCE.test(w))) continue;
      const phrase = run.join(" ").replace(/[.,!?:;]+$/, "");
      if (phrase.length < MIN_CHARS || phrase.length > MAX_CHARS) continue;
      if (occurrences(corpus, normalize(phrase)) === 1) return phrase;
    }
  }
  return null;
}

export function findPhrases(turns: Turn[]): (FindPhrase | null)[] {
  const corpus = turns.map((t) => `${normalize(t.user)}\n${normalize(t.assistant)}`).join("\n");
  const own = turns.map((t) => ownPhrase(t.user, corpus));
  return own.map((phrase, i) => {
    if (phrase) return { phrase, messagesDown: 0 };
    // Too short or too generic ("Yes"): anchor on the nearest earlier prompt that has a phrase.
    for (let j = i - 1; j >= 0; j--) if (own[j]) return { phrase: own[j]!, messagesDown: i - j };
    return null;
  });
}
