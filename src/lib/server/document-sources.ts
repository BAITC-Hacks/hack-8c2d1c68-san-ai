/** Internal parser boundary, independent of the organization/graph API. */
export type DocumentSide = "before" | "after";

export type SourceLocation =
  | { format: "pdf"; page: number; section?: string }
  | { format: "docx"; paragraph: number; section?: string }
  | { format: "xlsx"; sheet: string; cells: string };

export interface SourceFragment {
  document_id: string;
  document: string;
  side: DocumentSide;
  fragment_id: string;
  text: string;
  location: SourceLocation;
}

export interface SourceClaim {
  document_id: string;
  side: DocumentSide;
  fragment_id: string;
  quote: string;
}

export interface VerifiedSource extends SourceFragment {
  /** Exact substring of parser text, including its original whitespace. */
  quote: string;
  start: number;
  end: number;
}

export type SourceCheck =
  | { ok: true; source: VerifiedSource }
  | {
      ok: false;
      reason: "empty_quote" | "source_not_found" | "ambiguous_source" | "quote_not_found";
    };

/** Preserve case, punctuation and negation; tolerate only whitespace differences. */
function normalize(text: string) {
  let value = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (let offset = 0; offset < text.length; offset++) {
    const char = text[offset];
    if (/\s/u.test(char)) {
      if (value.endsWith(" ")) {
        ends[ends.length - 1] = offset + 1;
        continue;
      }
      value += " ";
    } else {
      value += char;
    }
    starts.push(offset);
    ends.push(offset + 1);
  }
  return { value, starts, ends };
}

/**
 * Validate an extraction's citation against parser-owned fragments.
 * This verifies text provenance, not whether the extraction interprets it correctly.
 */
export function verifySource(
  fragments: readonly SourceFragment[],
  claim: SourceClaim,
): SourceCheck {
  const quote = normalize(claim.quote).value.trim();
  if (!quote) return { ok: false, reason: "empty_quote" };
  const candidates = fragments.filter(
    (fragment) =>
      fragment.document_id === claim.document_id &&
      fragment.side === claim.side &&
      fragment.fragment_id === claim.fragment_id,
  );
  if (!candidates.length) return { ok: false, reason: "source_not_found" };
  if (candidates.length !== 1) return { ok: false, reason: "ambiguous_source" };
  const fragment = candidates[0];
  const normalized = normalize(fragment.text);
  const index = normalized.value.indexOf(quote);
  if (index < 0) return { ok: false, reason: "quote_not_found" };
  const start = normalized.starts[index];
  const end = normalized.ends[index + quote.length - 1];
  return {
    ok: true,
    source: {
      ...fragment,
      location: { ...fragment.location },
      quote: fragment.text.slice(start, end),
      start,
      end,
    },
  };
}
