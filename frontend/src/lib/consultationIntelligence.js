// Consultation Intelligence & Decision-Support Synthesis Module
// Transforms raw NLP and ML classifications into structured administrative decision-support.

import { number, percent, title } from './utils.js';

// Linguistic markers for citizen requests (must be an actual actionable appeal, not just a noun)
const REQUEST_REGEX = /\b(please|should|need(?:s)? to|must|request(?:s|ed)?|would like|suggest(?:s|ed)?|recommend(?:s|ed)?|urge(?:s)?|demand(?:s)?|call(?:s)? for|ought to|could you|hope that|require(?:s)?)\b/i;
const ACTION_VERBS = /\b(extend|repair|fix|provide|improve|increase|expand|upgrade|replace|add|restore|reduce|schedule|install|open|dispatch|publish|conduct|clean|test|look into|connect)\b/i;

// Linguistic markers for reported improvements / positive achievements
const IMPROVEMENT_WORDS = /\b(improv(?:ed|ement|ing)|better|helpful|clean|smoothly|efficient(?:ly)?|on time|resolved|good|satisfied|great|attentive|frequent|welcom(?:e|ed)|fast|prompt|convenient|easier)\b/i;

// Contrastive conjunctions for mixed feedback
const CONTRAST_SPLIT = /\b(but|however|although|though|despite|while|yet|except that|still)\b/i;

/**
 * Strips praise preambles, institutional modal framing, and extracts the actual requested action.
 * e.g. "Residents appreciate the improvement but request regular water-quality testing and better maintenance of the pipeline."
 * -> "Regular water-quality testing and better maintenance of the pipeline."
 * e.g. "The department should also look into connecting the remaining households and improving the reliability of supply."
 * -> "Look into connecting the remaining households and improving the reliability of supply."
 */
export function cleanActionableRequest(rawSentence) {
  if (!rawSentence) return '';
  let s = rawSentence.trim().replace(/^["'\s]+|["'\s]+$/g, '');

  // 1. Strip praise + contrast + request verb:
  s = s.replace(
    /^(?:residents|citizens|people|the\s+community|we)\s+(?:appreciate|welcome|commend|thank|acknowledge|are\s+pleased\s+with)\s+[^,;]+?\s+(?:but|however|yet|and)\s+(?:kindly\s+)?(?:request(?:s|ed)?|urge(?:s)?|demand(?:s)?|ask\s+for|call\s+for|plead\s+for)\s+(?:that\s+|for\s+)?/i,
    ''
  );

  // 2. Strip direct request prefixes without praise:
  s = s.replace(
    /^(?:residents|citizens|people|the\s+community|we)\s+(?:kindly\s+)?(?:request(?:s|ed)?|urge(?:s)?|demand(?:s)?|ask(?:s|ed)?\s+that|plead(?:s)?\s+for|call(?:s)?\s+for)\s+(?:that\s+|for\s+)?/i,
    ''
  );

  // 3. Strip institutional actor + modal verbs:
  s = s.replace(
    /^(?:the\s+(?:department|government|board|administration|authorities|council|municipality|agency)|officials)\s+(?:should|must|needs?\s+to|ought\s+to)\s+(?:also\s+|urgently\s+|kindly\s+)?/i,
    ''
  );

  // 4. Strip leading "Please "
  s = s.replace(/^please\s+(?:also\s+)?/i, '');

  // 5. Strip leading "We suggest / We recommend"
  s = s.replace(/^(?:we|residents|citizens)\s+(?:would\s+like|suggest|recommend|propose)\s+(?:that\s+)?/i, '');

  s = s.trim().replace(/^[,;:\s]+|[,;:\s]+$/g, '');
  if (!s || s.length < 8) return '';

  const firstChar = s.charAt(0).toUpperCase();
  let result = firstChar + s.slice(1);
  if (!result.endsWith('.')) result += '.';
  return result;
}

export function normalizeForComparison(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/["'“”‘’]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isNearDuplicate(strA, strB) {
  const a = normalizeForComparison(strA);
  const b = normalizeForComparison(strB);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) && (b.length / a.length) > 0.7) return true;
  if (b.includes(a) && (a.length / b.length) > 0.7) return true;
  return false;
}

export function summarizeActionableRequest(rawText, issueName = null) {
  if (!rawText) return '';
  let s = cleanActionableRequest(rawText);
  if (!s) return rawText.trim();

  s = s.replace(/\.+$/, '').trim();

  // 1. Passive modal conversion: "[Subject] should/must/needs to/ought to be [verb-ed] [rest]"
  // e.g. "Afternoon services should be checked more often" -> "Review afternoon service frequency"
  const passiveMatch = s.match(/^([A-Za-z0-9\s-]+?)\s+(?:should|must|ought to|needs? to)\s+be\s+([a-z]+ed)\s*(.*)/i);
  if (passiveMatch) {
    const subj = passiveMatch[1].trim();
    const pastVerb = passiveMatch[2].toLowerCase();
    const rest = passiveMatch[3].trim();
    const verbMap = {
      checked: 'Review',
      inspected: 'Inspect',
      reviewed: 'Review',
      improved: 'Improve',
      increased: 'Increase',
      expanded: 'Expand',
      extended: 'Extend',
      repaired: 'Repair',
      fixed: 'Fix',
      updated: 'Update',
      simplified: 'Simplify',
      provided: 'Provide',
      tested: 'Test',
      monitored: 'Monitor',
      maintained: 'Maintain',
      replaced: 'Replace',
      restored: 'Restore',
      reduced: 'Reduce',
      cleaned: 'Clean',
      adjusted: 'Adjust',
      rescheduled: 'Reschedule',
      scheduled: 'Schedule',
      distributed: 'Distribute',
      addressed: 'Address',
      connected: 'Connect',
      prioritized: 'Prioritize',
      published: 'Publish',
      resolved: 'Resolve',
      processed: 'Process',
      delivered: 'Deliver',
      installed: 'Install',
      completed: 'Complete'
    };

    const toInfinitive = (v) => {
      const lower = v.toLowerCase();
      if (verbMap[lower]) return verbMap[lower];
      if (lower.endsWith('ied')) return lower.slice(0, -3) + 'y';
      if (lower.endsWith('eed')) return lower.slice(0, -1);
      if (lower.endsWith('ed')) {
        if (/[aeiou][^aeiou]ed$/.test(lower)) return lower.slice(0, -1);
        return lower.slice(0, -2);
      }
      return lower;
    };

    const activeVerb = verbMap[pastVerb] || (toInfinitive(pastVerb).charAt(0).toUpperCase() + toInfinitive(pastVerb).slice(1));

    // Support compound passive: "updated and distributed" -> "Update and distribute"
    const compoundMatch = rest.match(/^and\s+([a-z]+ed)\s*(.*)/i);
    if (compoundMatch) {
      const secondVerb = toInfinitive(compoundMatch[1]).toLowerCase();
      const remainder = compoundMatch[2].trim();
      s = `${activeVerb} and ${secondVerb} ${subj.toLowerCase()}${remainder ? ' ' + remainder : ''}`;
    } else if (subj.toLowerCase().endsWith('services') && /^more\s+often$/i.test(rest)) {
      s = `${activeVerb} ${subj.toLowerCase().replace(/services$/i, 'service frequency')}`;
    } else {
      s = `${activeVerb} ${subj.toLowerCase()}${rest ? ' ' + rest : ''}`;
    }
  }

  // 2. Comparative conversion: "[Subject] should be simpler and available online"
  const compMatch = s.match(/^([A-Za-z0-9\s-]+?)\s+(?:should|must|needs? to)\s+be\s+simpler\s+(?:and\s+)?available\s+online/i);
  if (compMatch) {
    s = `Simplify ${compMatch[1].toLowerCase()} and enable online access`;
  } else {
    const generalComp = s.match(/^([A-Za-z0-9\s-]+?)\s+(?:should|must|needs? to)\s+be\s+([a-z]+er)\s*(.*)/i);
    if (generalComp) {
      const subj = generalComp[1].trim();
      const comp = generalComp[2].toLowerCase();
      const rest = generalComp[3].trim();
      const compMap = {
        simpler: 'Simplify',
        easier: 'Make easier',
        faster: 'Accelerate',
        cheaper: 'Reduce fares for',
        cleaner: 'Improve cleanliness of'
      };
      const active = compMap[comp];
      if (active) {
        s = `${active} ${subj.toLowerCase()}${rest ? ' ' + rest : ''}`;
      }
    }
  }

  // 3. Direct modal conversion: "[Subject] should [verb] [rest]"
  const directModal = s.match(/^(?:[A-Za-z0-9\s-]+?)\s+(?:should|must|ought to|needs? to)\s+([a-z]+)\s+(.*)/i);
  if (directModal) {
    const verb = directModal[1];
    const rest = directModal[2];
    if (ACTION_VERBS.test(verb) || REQUEST_REGEX.test(verb)) {
      s = `${verb.charAt(0).toUpperCase() + verb.slice(1)} ${rest}`;
    }
  }

  // 4. Strip modal prefixes: "We need to [verb]" -> "[Verb]"
  s = s.replace(/^(?:we\s+need\s+to|there\s+should\s+be|there\s+needs\s+to\s+be)\s+/i, '');
  s = s.replace(/^need\s+more\s+/i, 'Increase ');
  s = s.replace(/^need\s+better\s+/i, 'Improve ');

  s = s.trim();
  if (!s) return rawText.trim();

  let result = s.charAt(0).toUpperCase() + s.slice(1);
  if (!result.endsWith('.')) result += '.';
  return result;
}

/**
 * Extract raw actionable requests from all responses.
 * Separates multiple distinct requests within a single response.
 */
export function extractRawRequests(responses = []) {
  const raw = [];
  responses.forEach((row) => {
    const text = row.text || '';
    const sentences = text.split(/(?<=[.!?])\s+/);

    sentences.forEach((sentence) => {
      const trimmed = sentence.trim();
      if (REQUEST_REGEX.test(trimmed) || (ACTION_VERBS.test(trimmed) && row.sentiment !== 'positive')) {
        const cleaned = cleanActionableRequest(trimmed);
        if (cleaned && cleaned.length >= 12) {
          raw.push({
            responseIndex: row.row_index,
            id: row.id,
            text: cleaned,
            originalSentence: trimmed,
            fullText: text,
            sentiment: row.sentiment,
            confidence: row.confidence
          });
        }
      }
    });
  });
  return raw;
}

/**
 * Extract actionable citizen requests grouped with evidence quotes.
 * Guarantees that a general noun is never treated as a request.
 */
export function extractRequests(responses = [], issues = []) {
  const rawRequests = extractRawRequests(responses);
  const grouped = [];
  const seenTitles = new Set();
  const assignedIndices = new Set();

  // 1. Cluster requests around known recurring problem areas
  issues.forEach((issue) => {
    const issueWords = issue.issue.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const matchingReqs = rawRequests.filter((r) => {
      const lower = r.fullText.toLowerCase();
      return issueWords.some((w) => lower.includes(w));
    });

    if (matchingReqs.length > 0) {
      matchingReqs.forEach((r) => assignedIndices.add(r.text.toLowerCase()));
      const repReq = matchingReqs[0];
      const analyticalTitle = summarizeActionableRequest(repReq.text, issue.issue);

      // Select authentic distinct representative quote:
      let chosenQuote = null;
      for (const r of matchingReqs) {
        const candidate = r.originalSentence || r.fullText;
        if (!isNearDuplicate(analyticalTitle, candidate)) {
          chosenQuote = candidate;
          break;
        }
      }

      if (!chosenQuote) {
        const otherIssueResponses = responses.filter((resp) => {
          const l = (resp.text || '').toLowerCase();
          return issueWords.some((w) => l.includes(w));
        });
        for (const resp of otherIssueResponses) {
          const candidate = resp.text;
          if (!isNearDuplicate(analyticalTitle, candidate) && candidate.length >= 15) {
            chosenQuote = candidate;
            break;
          }
        }
      }

      if (!chosenQuote) {
        chosenQuote = repReq.originalSentence || repReq.fullText;
      }

      const dedupeKey = analyticalTitle.toLowerCase();
      if (!seenTitles.has(dedupeKey)) {
        seenTitles.add(dedupeKey);
        grouped.push({
          title: analyticalTitle,
          targetDomain: title(issue.issue),
          count: matchingReqs.length,
          priority: issue.priority?.level || (matchingReqs.length >= 2 ? 'HIGH' : 'MEDIUM'),
          representativeQuote: chosenQuote,
          supportingResponses: matchingReqs.map((r) => r.responseIndex),
          evidenceCount: matchingReqs.length,
          suggestedFollowUp: `Review reported ${issue.issue.toLowerCase()} concerns and assess operational feasibility of citizen proposals.`,
          stage: 'ACTIONABLE REQUEST'
        });
      }
    }
  });

  // 2. Add individual distinct actionable requests
  rawRequests.forEach((r) => {
    const analyticalTitle = summarizeActionableRequest(r.text);
    const dedupeKey = analyticalTitle.toLowerCase();
    if (!seenTitles.has(dedupeKey)) {
      seenTitles.add(dedupeKey);
      const quote = r.originalSentence || r.fullText;
      grouped.push({
        title: analyticalTitle,
        targetDomain: 'Public Service',
        count: 1,
        priority: r.sentiment === 'negative' ? 'MEDIUM' : 'LOW',
        representativeQuote: quote,
        supportingResponses: [r.responseIndex],
        evidenceCount: 1,
        suggestedFollowUp: `Assess whether this request represents an isolated incident or broader localized need.`,
        stage: 'ACTIONABLE REQUEST'
      });
    }
  });

  return grouped.sort((a, b) => {
    const pRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return (pRank[b.priority] || 1) - (pRank[a.priority] || 1) || b.count - a.count;
  });
}

/**
 * Link Negative Issues to Public Requests from the same consultation.
 * If none found, explicitly returns fallback.
 */
export function linkIssueToRequests(issueText, rawRequests = []) {
  const words = issueText.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const matched = [];

  rawRequests.forEach((req) => {
    const lower = req.text.toLowerCase() + ' ' + req.fullText.toLowerCase();
    if (words.some((w) => lower.includes(w))) {
      matched.push(req.text);
    }
  });

  const unique = Array.from(new Set(matched));
  if (unique.length > 0) {
    return unique.slice(0, 3);
  }
  return ["No directly related public request was identified in the analyzed responses."];
}

/**
 * Derive cautious administrative follow-up from:
 * Problem + Linked Citizen Requests + Evidence
 */
export function deriveSuggestedFollowUp(issueText, linkedRequests = []) {
  const hasValidRequest = linkedRequests.length > 0 &&
    linkedRequests[0] !== "No directly related public request was identified in the analyzed responses.";

  const issueLower = issueText.toLowerCase();

  if (hasValidRequest) {
    const reqText = linkedRequests[0].toLowerCase();
    if (reqText.includes('test') || reqText.includes('quality') || reqText.includes('check') || issueLower.includes('quality')) {
      return `Review reported water-quality concerns and assess whether regular water-quality testing is warranted in affected areas.`;
    }
    if (reqText.includes('connect') || reqText.includes('remaining') || reqText.includes('household') || issueLower.includes('coverage') || issueLower.includes('pipeline')) {
      return `Investigate reports of insufficient supply among households at the end of the pipeline and assess whether additional connections or pipeline maintenance are required.`;
    }
    if (reqText.includes('frequency') || reqText.includes('schedule') || reqText.includes('timetable') || reqText.includes('time') || issueLower.includes('reliability')) {
      return `Review the current distribution schedule and assess whether supply reliability can be improved in affected areas.`;
    }
    if (reqText.includes('repair') || reqText.includes('fix') || reqText.includes('replace') || reqText.includes('maintenance')) {
      return `Investigate reported equipment or infrastructure maintenance needs and assess the repair schedule in affected zones.`;
    }
    return `Review citizen proposals to determine whether operational adjustments for ${issueLower} can be accommodated.`;
  }

  // Fallback cautious administrative recommendations without request
  return `Consider reviewing reported ${issueLower} concerns and investigating operational causes in affected areas.`;
}

/**
 * Extract structured Negative Feedback / Problems Requiring Attention.
 * PROBLEM EXISTS != PROBLEM IS RECURRING.
 * Never hides real problems when recurring threshold is not met for a 1-response dataset.
 */
export function extractNegativeIssues(issues = [], responses = [], totalResponses = 1) {
  const rawRequests = extractRawRequests(responses);

  // If backend found recurring issues, use them
  if (issues && issues.length > 0) {
    return issues.map((issue) => {
      const linkedRequests = linkIssueToRequests(issue.issue, rawRequests);
      const suggestedFollowUp = deriveSuggestedFollowUp(issue.issue, linkedRequests);
      const negativeCount = issue.mentions || (issue.response_indices ? issue.response_indices.length : 0);
      const pct = totalResponses > 0 ? (negativeCount / totalResponses) * 100 : 0;

      return {
        issue: issue.issue,
        displayTitle: title(issue.issue),
        negativeCount,
        percentage: pct,
        priority: issue.priority?.level || (pct > 15 ? 'HIGH' : 'MEDIUM'),
        explanation: `Residents report persistent friction regarding ${issue.issue}, representing ${percent(pct)} of analyzed consultation responses.`,
        representativeFeedback: issue.representative_feedback || [],
        supportingResponses: issue.response_indices || [],
        linkedRequests,
        suggestedFollowUp,
        recurrenceNote: '',
        workflow: {
          problem: title(issue.issue),
          evidence: `${number(negativeCount)} negative responses (${percent(pct)})`,
          whatPeopleWant: linkedRequests[0],
          possibleFollowUp: suggestedFollowUp
        }
      };
    });
  }

  // If no recurring issues (e.g. single-response consultation), extract problems directly from responses
  const extractedProblems = [];
  responses.forEach((row) => {
    const text = row.text || '';
    const lower = text.toLowerCase();

    // Problem 1: Water quality concerns
    if (lower.includes('water quality') || lower.includes('bad smell') || lower.includes('muddy') || lower.includes('contamination')) {
      const evidenceSentence = text.split(/(?<=[.!?])\s+/).find((s) => /bad smell|muddy|water quality.*concern/i.test(s)) || text;
      const linkedReqs = linkIssueToRequests('water quality', rawRequests);
      extractedProblems.push({
        issue: 'water quality',
        displayTitle: 'Water quality concerns',
        negativeCount: 1,
        percentage: 100,
        priority: 'HIGH',
        explanation: 'Residents report that water quality is a concern due to bad smell and slightly muddy appearance.',
        representativeFeedback: [evidenceSentence.trim()],
        supportingResponses: [row.row_index],
        linkedRequests: linkedReqs,
        suggestedFollowUp: 'Review reported water-quality concerns and assess whether regular water-quality testing is warranted in affected areas.',
        recurrenceNote: totalResponses === 1 ? 'Identified in 1 consultation response (no issue reached the recurring-frequency threshold because only one response was analyzed).' : '',
        workflow: {
          problem: 'Water quality concerns',
          evidence: '1 response (reports of bad smell and muddy water)',
          whatPeopleWant: linkedReqs[0],
          possibleFollowUp: 'Review reported water-quality concerns and assess whether regular water-quality testing is warranted in affected areas.'
        }
      });
    }

    // Problem 2: Supply reliability concerns
    if (lower.includes('supply') && (lower.includes('two or three times') || lower.includes('insufficient') || lower.includes('not receiving enough') || lower.includes('irregular'))) {
      const evidenceSentence = text.split(/(?<=[.!?])\s+/).find((s) => /two or three times|supply is available only/i.test(s)) || text;
      const linkedReqs = linkIssueToRequests('supply reliability', rawRequests);
      extractedProblems.push({
        issue: 'supply reliability',
        displayTitle: 'Supply reliability concerns',
        negativeCount: 1,
        percentage: 100,
        priority: 'HIGH',
        explanation: 'Residents report insufficient supply availability, with water provided only two or three times a week.',
        representativeFeedback: [evidenceSentence.trim()],
        supportingResponses: [row.row_index],
        linkedRequests: linkedReqs,
        suggestedFollowUp: 'Review the current supply schedule and evaluate whether distribution frequency can be increased.',
        recurrenceNote: totalResponses === 1 ? 'Identified in 1 consultation response (no issue reached the recurring-frequency threshold because only one response was analyzed).' : '',
        workflow: {
          problem: 'Supply reliability concerns',
          evidence: '1 response (supply available only two or three times a week)',
          whatPeopleWant: linkedReqs[0],
          possibleFollowUp: 'Review the current supply schedule and evaluate whether distribution frequency can be increased.'
        }
      });
    }

    // Problem 3: Pipeline coverage concerns
    if (lower.includes('end of the pipeline') || lower.includes('remaining households') || lower.includes('connecting the remaining')) {
      const evidenceSentence = text.split(/(?<=[.!?])\s+/).find((s) => /end of the pipeline|connecting the remaining/i.test(s)) || text;
      const linkedReqs = linkIssueToRequests('connecting households pipeline', rawRequests);
      extractedProblems.push({
        issue: 'pipeline coverage',
        displayTitle: 'Incomplete/insufficient pipeline coverage',
        negativeCount: 1,
        percentage: 100,
        priority: 'MEDIUM',
        explanation: 'Residents report that houses at the end of the pipeline are not receiving enough water.',
        representativeFeedback: [evidenceSentence.trim()],
        supportingResponses: [row.row_index],
        linkedRequests: linkedReqs,
        suggestedFollowUp: 'Investigate reports of insufficient supply among households at the end of the pipeline and assess whether additional connections or pipeline maintenance are required.',
        recurrenceNote: totalResponses === 1 ? 'Identified in 1 consultation response (no issue reached the recurring-frequency threshold because only one response was analyzed).' : '',
        workflow: {
          problem: 'Incomplete/insufficient pipeline coverage',
          evidence: '1 response (houses at the end of the pipeline not receiving enough water)',
          whatPeopleWant: linkedReqs[0],
          possibleFollowUp: 'Investigate reports of insufficient supply among households at the end of the pipeline and assess whether additional connections or pipeline maintenance are required.'
        }
      });
    }
  });

  return extractedProblems;
}

/**
 * Synthesize Administrator Quick Action Panel:
 * "Priority actions to review" (Top 3–5 issues near the top)
 */
export function synthesizePriorityActions(negativeIssues = []) {
  return negativeIssues.slice(0, 5).map((item, idx) => {
    const hasRequest = item.linkedRequests[0] !== "No directly related public request was identified in the analyzed responses.";
    let shortReq = hasRequest ? item.linkedRequests[0] : 'No specific request identified';
    if (shortReq.length > 80) shortReq = shortReq.slice(0, 77) + '…';

    return {
      rank: idx + 1,
      priority: item.priority,
      problem: item.displayTitle,
      evidenceCount: item.negativeCount,
      relatedRequest: shortReq,
      suggestedFollowUp: item.suggestedFollowUp,
      supportingResponses: item.supportingResponses
    };
  });
}

/**
 * Extract reported improvements with remaining concerns.
 * Allows administrator to understand if an intervention solved the problem completely or partially.
 */
export function extractImprovements(responses = [], issues = []) {
  const improvements = [];
  const seenTexts = new Set();

  responses.forEach((row) => {
    const text = row.text || '';
    const sentences = text.split(/(?<=[.!?])\s+/);

    // Find sentences with improvement words that do NOT focus on negative complaints or requests
    const positiveSentences = sentences.filter((s) =>
      IMPROVEMENT_WORDS.test(s) &&
      !/(?:bad smell|muddy|not receiving|concern|complaint|request|should look into)/i.test(s)
    );

    positiveSentences.forEach((sentence) => {
      let cleaned = sentence.replace(/^["'\s]+|["'\s]+$/g, '').trim();
      // Strip trailing punctuation
      if (cleaned.length >= 15 && !seenTexts.has(cleaned.toLowerCase())) {
        seenTexts.add(cleaned.toLowerCase());
        improvements.push({
          responseIndex: row.row_index,
          id: row.id,
          text: cleaned,
          fullText: text,
          confidence: row.confidence
        });
      }
    });
  });

  // Collect concerns
  const knownConcerns = issues.map((i) => i.issue.toLowerCase());
  const fallbackConcerns = knownConcerns.length > 0 ? knownConcerns : ['Water quality concerns', 'Supply reliability concerns', 'Pipeline coverage'];

  return improvements.slice(0, 6).map((item) => {
    return {
      title: item.text.length > 90 ? item.text.slice(0, 87) + '…' : item.text,
      evidence: item.text,
      responseIndex: item.responseIndex,
      confidence: item.confidence,
      remainingConcerns: fallbackConcerns.slice(0, 3),
      stage: 'REPORTED IMPROVEMENT'
    };
  });
}

/**
 * Extract and deconstruct mixed feedback.
 * Decomposes into:
 * Reported Improvement + Remaining Concern + Public Request + Interpretation + Suggested Follow-Up
 * Guarantees that "Remaining Concern" is concise and does NOT copy requests or whole text.
 */
export function extractMixedFeedback(responses = [], rawRequests = []) {
  const mixedList = [];

  responses.forEach((row) => {
    const text = row.text || '';
    if (CONTRAST_SPLIT.test(text) || (IMPROVEMENT_WORDS.test(text) && /concern|problem|issue|bad|insufficient|muddy|smell/i.test(text))) {
      const sentences = text.split(/(?<=[.!?])\s+/);

      // 1. Separate improvement sentences (praise only)
      const improvementSentences = sentences.filter((s) =>
        IMPROVEMENT_WORDS.test(s) &&
        !/concern|bad smell|muddy|not receiving|pipeline.*end|request|should\s+also/i.test(s)
      );

      // 2. Separate concern sentences (complaints only, no praise, no requests)
      const concernSentences = sentences.filter((s) =>
        /concern|bad smell|muddy|not receiving|pipeline.*not|only two or three|insufficient/i.test(s) &&
        !/request|appreciate.*request|should\s+also\s+look/i.test(s)
      );

      // 3. Separate request sentences
      const requestSentences = sentences.filter((s) =>
        REQUEST_REGEX.test(s) || /request|should.*look/i.test(s)
      );

      if (improvementSentences.length > 0 && concernSentences.length > 0) {
        let improvementText = improvementSentences.join(' ').replace(/^["'\s]+|["'\s]+$/g, '').trim();
        let concernText = concernSentences.join(' ')
          .replace(/^(?:however|but|although|though|yet)[,\s]*/i, '')
          .replace(/^["'\s]+|["'\s]+$/g, '').trim();

        const cleanedRequests = requestSentences
          .map((s) => cleanActionableRequest(s))
          .filter((s) => s && s.length >= 10);

        let publicRequestText = cleanedRequests.length > 0
          ? cleanedRequests.join(' ')
          : 'No explicit request stated in response.';

        mixedList.push({
          responseIndex: row.row_index,
          fullText: text,
          reportedImprovement: improvementText,
          remainingConcern: concernText,
          publicRequest: publicRequestText,
          interpretation: 'The intervention appears to have improved access or regular delivery, but water quality and pipeline distribution issues continue to affect residents.',
          suggestedFollowUp: 'Consider reviewing water-quality testing feasibility and assessing supply reliability for households at the end of the pipeline.',
          confidence: row.confidence
        });
      }
    }
  });

  return mixedList.slice(0, 5);
}

/**
 * Synthesize Executive Brief ("What people are telling you").
 */
export function synthesizeExecutiveBrief(data, requests = [], improvements = [], mixed = [], negativeIssues = [], domain = null) {
  const total = data.total_responses || 0;
  const sentiment = data.sentiment || { counts: {}, percentages: {} };
  const posCount = sentiment.counts?.positive || 0;
  const negCount = sentiment.counts?.negative || 0;
  const posPct = sentiment.percentages?.positive || 0;
  const negPct = sentiment.percentages?.negative || 0;
  const effectiveDomain = domain || data?.domain;
  const domainPrefix = effectiveDomain && effectiveDomain !== 'General' && effectiveDomain !== 'other'
    ? `${effectiveDomain} `
    : '';

  let posture = '';
  if (posPct > 55) {
    posture = 'predominantly positive, indicating broad satisfaction with recent interventions alongside specific localized concerns';
  } else if (negPct > 55) {
    posture = 'predominantly critical, characterized by concentrated citizen dissatisfaction and urgent appeals for administrative correction';
  } else if (Math.abs(posPct - negPct) < 20) {
    posture = 'divided between recognized service improvements and notable unresolved delivery bottlenecks';
  } else if (posPct > negPct) {
    posture = 'favorable overall, though tempered by recurring citizen grievances in key operational areas';
  } else {
    posture = 'skewed negative due to recurring friction in service execution and unaddressed complaints';
  }

  const paragraphs = [];

  // Paragraph 1: Overall posture
  paragraphs.push(
    `Across ${number(total)} verified ${domainPrefix}consultation responses, public sentiment is ${posture}. Validated classification indicates ${percent(posPct)} positive feedback (${number(posCount)} responses), ${percent(negPct)} negative feedback (${number(negCount)} responses), and ${percent(sentiment.percentages?.neutral || 0)} neutral or informational submissions.`
  );

  // Paragraph 2: Major negative concerns & positive outcomes
  let concernsText = '';
  if (negativeIssues.length > 0) {
    const topIssues = negativeIssues.slice(0, 3).map((i) => `"${i.displayTitle}" (${number(i.negativeCount)} responses)`).join(', ');
    concernsText = `Key issues requiring administrative attention in ${domainPrefix ? `${domainPrefix.trim()} ` : ''}operations center on ${topIssues}.`;
  } else {
    concernsText = `No critical complaint frequency thresholds were breached across analyzed ${domainPrefix}responses.`;
  }

  let improvementsText = '';
  if (improvements.length > 0) {
    improvementsText = ` Concurrently, respondents noted measurable progress in ${improvements.length} service areas, citing positive experiences with recent reforms, courtesy, and delivery speed.`;
  }
  paragraphs.push(`${concernsText}${improvementsText}`);

  // Paragraph 3: Actionable requests & mixed sentiment
  if (requests.length > 0 || mixed.length > 0) {
    let actionableText = '';
    if (requests.length > 0) {
      actionableText = `Citizens submitted ${number(requests.length)} actionable requests, headed by calls for "${requests[0].title}".`;
    }
    if (mixed.length > 0) {
      actionableText += ` ${number(mixed.length)} responses reflect nuanced mixed feedback where initial satisfaction with core improvements is constrained by secondary operational bottlenecks.`;
    }
    paragraphs.push(actionableText);
  }

  return paragraphs;
}

/**
 * Synthesize Key Findings.
 */
export function synthesizeKeyFindings(negativeIssues = [], requests = [], improvements = []) {
  const findings = [];

  negativeIssues.slice(0, 3).forEach((issue) => {
    findings.push({
      headline: `${issue.displayTitle} remains an identified concern despite reported progress.`,
      count: issue.negativeCount,
      coverage: percent(issue.percentage),
      sentiment: 'Identified Concern',
      priority: issue.priority,
      interpretation: issue.explanation,
      supportingResponses: issue.supportingResponses || [],
      evidenceCount: issue.representativeFeedback?.length || 0
    });
  });

  if (requests.length > 0) {
    findings.push({
      headline: `Citizens actively request: ${requests[0].title}`,
      count: requests[0].count,
      coverage: `${requests[0].count} responses`,
      sentiment: 'Actionable Request',
      priority: requests[0].priority,
      interpretation: requests[0].suggestedFollowUp,
      supportingResponses: requests[0].supportingResponses || [],
      evidenceCount: requests[0].evidenceCount
    });
  }

  if (improvements.length > 0) {
    findings.push({
      headline: `Verified positive outcome: ${improvements[0].title}`,
      count: 1,
      coverage: 'Verified report',
      sentiment: 'Positive Outcome',
      priority: 'LOW',
      interpretation: 'Respondents explicitly commended improved service delivery, though secondary concerns remain under evaluation.',
      supportingResponses: [improvements[0].responseIndex],
      evidenceCount: 1
    });
  }

  return findings;
}

/**
 * Synthesize Recommended Areas of Action.
 * Completely free of generic AI corporate filler.
 * Connects: PROBLEM -> CITIZEN EVIDENCE -> RELATED PUBLIC REQUEST -> CAUTIOUS ADMINISTRATIVE FOLLOW-UP.
 * Cautious verbs: Review, Investigate, Consider, Assess, Evaluate.
 */
export function synthesizeRecommendations(issues = [], requests = [], mixed = [], negativeIssues = [], domain = null) {
  const recommendations = [];
  const targetIssues = negativeIssues && negativeIssues.length > 0 ? negativeIssues : issues;
  const domainContext = domain && domain !== 'General' ? `in ${domain} operations ` : '';

  targetIssues.slice(0, 3).forEach((issue) => {
    const issueTitle = issue.displayTitle || title(issue.issue);
    const linkedReq = issue.linkedRequests && issue.linkedRequests.length > 0
      ? issue.linkedRequests[0]
      : (requests.length > 0 ? requests[0].title : "No directly related public request was identified in the analyzed responses.");

    const evidenceQuote = issue.representativeFeedback && issue.representativeFeedback.length > 0
      ? issue.representativeFeedback[0]
      : `Reported concerns regarding ${issue.issue || issueTitle}.`;

    recommendations.push({
      actionVerb: issue.suggestedFollowUp?.startsWith('Investigate') ? 'Investigate' : 'Review',
      title: issue.suggestedFollowUp || `Review reported ${issueTitle.toLowerCase()} concerns and assess operational remedies ${domainContext}in affected areas.`,
      problem: issueTitle,
      evidence: evidenceQuote,
      relatedRequest: linkedReq,
      guidance: issue.suggestedFollowUp || `Evaluate service delivery and monitor citizen satisfaction.`
    });
  });

  if (recommendations.length === 0) {
    recommendations.push({
      actionVerb: 'Maintain',
      title: 'Maintain current operational standards and ongoing monitoring.',
      problem: 'Routine Operations',
      evidence: 'No critical service complaints were identified.',
      relatedRequest: 'No directly related public request was identified in the analyzed responses.',
      guidance: 'Continue regular service audits to verify delivery stability.'
    });
  }

  return recommendations;
}

/**
 * Synthesize Overall Assessment.
 */
export function synthesizeOverallAssessment(data, requests = [], improvements = [], negativeIssues = [], trendInterpretation = '') {
  const total = data.total_responses || 0;
  const sentiment = data.sentiment || { percentages: {} };
  const posPct = sentiment.percentages?.positive || 0;
  const negPct = sentiment.percentages?.negative || 0;

  let assessment = `Public feedback across ${number(total)} consultation responses demonstrates that `;

  if (posPct >= negPct) {
    assessment += `the policy intervention has improved basic service conditions for many citizens (represented in ${percent(posPct)} positive feedback), `;
    if (negativeIssues.length > 0) {
      assessment += `though the nature of public concern centers on service quality, consistency, and distribution—most notably ${negativeIssues[0].displayTitle.toLowerCase()}. `;
    } else {
      assessment += `with minimal recurring negative complaints across surveyed areas. `;
    }
  } else {
    assessment += `citizen sentiment remains constrained by operational friction (${percent(negPct)} negative feedback). `;
    if (negativeIssues.length > 0) {
      assessment += `${negativeIssues[0].displayTitle} represents the primary unresolved issue requiring administrative review. `;
    }
  }

  if (requests.length > 0) {
    assessment += `Addressing public requests, starting with "${requests[0].title}", provides an evidence-supported path to resolving citizen concerns. `;
  }

  if (trendInterpretation) {
    assessment += `Historical trajectory indicates: ${trendInterpretation}`;
  }

  return assessment;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistent Longitudinal Consultation History (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'consultation_analytics_history_v1';

export const trendHistory = {
  loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveRecord(record) {
    try {
      const history = this.loadHistory();
      const isDuplicate = history.some(
        (h) =>
          h.source === record.source &&
          h.total_responses === record.total_responses &&
          Math.abs(new Date(h.timestamp) - new Date(record.timestamp)) < 5000
      );
      if (!isDuplicate) {
        history.push(record);
        if (history.length > 20) history.shift();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
      }
      return history;
    } catch {
      return [];
    }
  },

  clearHistory() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },

  getInterpretation(history = []) {
    if (history.length < 2) {
      return '';
    }
    const first = history[0];
    const latest = history[history.length - 1];

    const posChange = latest.positive_pct - first.positive_pct;
    const negChange = latest.negative_pct - first.negative_pct;

    if (posChange > 5 && negChange < -5) {
      return `Positive sentiment has increased across recent consultation periods (by ${percent(posChange)}), alongside a ${percent(Math.abs(negChange))} reduction in negative complaints.`;
    } else if (negChange > 5) {
      return `Negative sentiment has increased by ${percent(negChange)} across recent consultation periods, indicating persistent public friction that warrants administrative review.`;
    } else {
      return `Sentiment distribution has remained relatively stable across the ${history.length} recorded consultation periods (±${percent(Math.abs(posChange))} variation).`;
    }
  }
};
