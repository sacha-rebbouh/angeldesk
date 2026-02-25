// ============================================================================
// Speaker Detector — Fuzzy matching for participant identification
// ============================================================================

import type { Participant, SpeakerRole, DealContext } from "@/lib/live/types";

// ---------------------------------------------------------------------------
// String normalization
// ---------------------------------------------------------------------------

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .trim();
}

function tokenize(name: string): string[] {
  return normalize(name)
    .split(/[\s\-_.']+/)
    .filter((t) => t.length > 1); // skip single-char tokens
}

// ---------------------------------------------------------------------------
// detectBAFromParticipants — fuzzy match BA user name among participants
// ---------------------------------------------------------------------------

/**
 * Fuzzy match: compare each participant name to the BA's user name.
 * Case-insensitive. Handles partial matches (first name match, last name match).
 * Returns the matching participant name or null.
 */
export function detectBAFromParticipants(
  participantNames: string[],
  baUserName: string
): string | null {
  if (!baUserName || participantNames.length === 0) return null;

  const baTokens = tokenize(baUserName);
  if (baTokens.length === 0) return null;

  // Exact normalized match first
  const baNorm = normalize(baUserName);
  for (const name of participantNames) {
    if (normalize(name) === baNorm) return name;
  }

  // Score-based fuzzy matching
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const name of participantNames) {
    const participantTokens = tokenize(name);
    if (participantTokens.length === 0) continue;

    // Count matching tokens in both directions
    let matchingTokens = 0;
    for (const baToken of baTokens) {
      for (const pToken of participantTokens) {
        if (baToken === pToken) {
          matchingTokens++;
          break;
        }
        // Substring match for partial names (e.g., "Sach" matching "Sacha")
        if (
          (baToken.length >= 3 && pToken.startsWith(baToken)) ||
          (pToken.length >= 3 && baToken.startsWith(pToken))
        ) {
          matchingTokens += 0.7;
          break;
        }
      }
    }

    // Require at least one token match
    if (matchingTokens < 1) continue;

    // Score: proportion of BA tokens matched, weighted by total tokens
    const score =
      matchingTokens / Math.max(baTokens.length, participantTokens.length);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = name;
    }
  }

  // Minimum threshold: at least 50% token overlap
  return bestScore >= 0.5 ? bestMatch : null;
}

// ---------------------------------------------------------------------------
// mapSpeakerToRole — find participant by name and return their role
// ---------------------------------------------------------------------------

export function mapSpeakerToRole(
  speakerName: string,
  participants: Participant[]
): SpeakerRole {
  if (!speakerName || participants.length === 0) return "other";

  const speakerNorm = normalize(speakerName);

  // Exact match first
  for (const p of participants) {
    if (normalize(p.name) === speakerNorm) return p.role;
  }

  // Fuzzy match: check if any participant name tokens overlap
  const speakerTokens = tokenize(speakerName);

  let bestRole: SpeakerRole = "other";
  let bestOverlap = 0;

  for (const p of participants) {
    const pTokens = tokenize(p.name);

    let overlap = 0;
    for (const st of speakerTokens) {
      for (const pt of pTokens) {
        if (st === pt || (st.length >= 3 && pt.startsWith(st)) || (pt.length >= 3 && st.startsWith(pt))) {
          overlap++;
          break;
        }
      }
    }

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestRole = p.role;
    }
  }

  // Require at least 1 token match
  return bestOverlap >= 1 ? bestRole : "other";
}

// ---------------------------------------------------------------------------
// suggestRoles — auto-suggest participant roles from deal context
// ---------------------------------------------------------------------------

/**
 * Given participant names and optional deal context, suggest roles.
 * - BA detection is handled externally (caller sets the BA).
 * - If dealContext has founder names, try to match them to participants.
 * - All returned Participants have empty speakerId (caller fills it).
 */
export function suggestRoles(
  participantNames: string[],
  dealContext: DealContext | null
): Participant[] {
  const suggestions: Participant[] = [];
  const matchedNames = new Set<string>();

  // Try to match founders from deal context
  if (dealContext) {
    const founderNames = dealContext.teamSummary.founders.map((f) => {
      // Founders are stored as "Name (Role)" — extract just the name
      const parenIdx = f.indexOf("(");
      return parenIdx > 0 ? f.substring(0, parenIdx).trim() : f.trim();
    });

    for (const participantName of participantNames) {
      const pNorm = normalize(participantName);
      const pTokens = tokenize(participantName);

      for (const founderName of founderNames) {
        const fNorm = normalize(founderName);
        const fTokens = tokenize(founderName);

        // Exact match
        if (pNorm === fNorm) {
          suggestions.push({
            name: participantName,
            role: "founder",
            speakerId: "",
          });
          matchedNames.add(participantName);
          break;
        }

        // Token overlap (at least one token match)
        let tokenMatch = false;
        for (const pt of pTokens) {
          for (const ft of fTokens) {
            if (
              pt === ft ||
              (pt.length >= 3 && ft.startsWith(pt)) ||
              (ft.length >= 3 && pt.startsWith(ft))
            ) {
              tokenMatch = true;
              break;
            }
          }
          if (tokenMatch) break;
        }

        if (tokenMatch) {
          suggestions.push({
            name: participantName,
            role: "founder",
            speakerId: "",
          });
          matchedNames.add(participantName);
          break;
        }
      }
    }
  }

  // Remaining participants get role "other"
  for (const name of participantNames) {
    if (!matchedNames.has(name)) {
      suggestions.push({
        name,
        role: "other",
        speakerId: "",
      });
    }
  }

  return suggestions;
}
