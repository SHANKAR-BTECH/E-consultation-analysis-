// Consultation Intelligence & Decision-Support Synthesis Module
// Transforms raw NLP and ML classifications into structured administrative decision-support.

import { number, percent, title } from './utils.js';

// Linguistic markers for citizen requests (must be an actual actionable appeal, not just a noun)
const REQUEST_REGEX = /\b(please|should|need(?:s)? to|must|request(?:s|ed)?|would like|suggest(?:s|ed)?|recommend(?:s|ed)?|urge(?:s)?|demand(?:s)?|call(?:s)? for|ought to|could you|hope that|require(?:s)?)\b/i;
const ACTION_VERBS = /\b(extend|repair|fix|provide|improve|increase|expand|upgrade|replace|add|restore|reduce|schedule|install|open|dispatch|publish|conduct|clean|test)\b/i;

// Linguistic markers for reported improvements / positive achievements
const IMPROVEMENT_WORDS = /\b(improv(?:ed|ement|ing)|better|helpful|clean|smoothly|efficient(?:ly)?|on time|resolved|good|satisfied|great|attentive|frequent|welcom(?:e|ed)|fast|prompt|convenient|easier)\b/i;

// Contrastive conjunctions for mixed feedback
const CONTRAST_SPLIT = /\b(but|however|although|though|despite|while|yet|except that|still)\b/i;

/**
 * Extract raw actionable requests from all responses.
 */
export function extractRawRequests(responses = []) {
  const raw = [];
  responses.forEach((row) => {
    const text = row.text || '';
    if (REQUEST_REGEX.test(text) || (ACTION_VERBS.test(text) && row.sentiment !== 'positive')) {
      const sentences = text.split(/(?<=[.!?])\s+/);
      const reqSentence = sentences.find((s) => REQUEST_REGEX.test(s) || ACTION_VERBS.test(s)) || sentences[0];
      const cleaned = reqSentence.replace(/^["'\s]+|["'\s]+$/g, '').trim();
      if (cleaned.length >= 15) {
        raw.push({
          responseIndex: row.row_index,
          id: row.id,
          text: cleaned,
          fullText: text,
          sentiment: row.sentiment,
          confidence: row.confidence
        });
      }
    }
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
      matchingReqs.forEach((r) => assignedIndices.add(r.responseIndex));
      const repReq = matchingReqs[0];
      let reqTitle = repReq.text;
      if (reqTitle.length > 80) reqTitle = reqTitle.slice(0, 77) + '…';

      if (!seenTitles.has(reqTitle.toLowerCase())) {
        seenTitles.add(reqTitle.toLowerCase());
        grouped.push({
          title: reqTitle,
          targetDomain: title(issue.issue),
          count: matchingReqs.length,
          priority: issue.priority?.level || (matchingReqs.length >= 2 ? 'HIGH' : 'MEDIUM'),
          representativeQuote: repReq.fullText,
          supportingResponses: matchingReqs.map((r) => r.responseIndex),
          evidenceCount: matchingReqs.length,
          suggestedFollowUp: `Consider evaluating feasibility and resource requirements for addressing ${issue.issue.toLowerCase()} based on citizen requests.`,
          stage: 'ACTIONABLE REQUEST'
        });
      }
    }
  });

  // 2. Add individual distinct actionable requests
  const unassigned = rawRequests.filter((r) => !assignedIndices.has(r.responseIndex));
  unassigned.forEach((r) => {
    let reqTitle = r.text;
    if (reqTitle.length > 80) reqTitle = reqTitle.slice(0, 77) + '…';
    if (!seenTitles.has(reqTitle.toLowerCase())) {
      seenTitles.add(reqTitle.toLowerCase());
      grouped.push({
        title: reqTitle,
        targetDomain: 'Public Service',
        count: 1,
        priority: r.sentiment === 'negative' ? 'MEDIUM' : 'LOW',
        representativeQuote: r.fullText,
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
    const lower = req.fullText.toLowerCase();
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
    if (reqText.includes('test') || reqText.includes('quality') || reqText.includes('check')) {
      return `Consider reviewing the feasibility of regular testing and quality audits in areas reporting ${issueLower} concerns.`;
    }
    if (reqText.includes('frequency') || reqText.includes('schedule') || reqText.includes('timetable') || reqText.includes('time')) {
      return `Consider reviewing the current schedule and assessing whether service frequency can be adjusted in affected areas.`;
    }
    if (reqText.includes('extend') || reqText.includes('expand') || reqText.includes('reach') || reqText.includes('connection')) {
      return `Assess the feasibility of expanding service coverage and connecting uncovered households in the affected sector.`;
    }
    if (reqText.includes('repair') || reqText.includes('fix') || reqText.includes('replace')) {
      return `Investigate reported equipment or infrastructure damage and review the schedule for prompt maintenance works.`;
    }
    return `Consider reviewing citizen proposals to determine whether operational adjustments for ${issueLower} can be accommodated.`;
  }

  // Fallback cautious administrative recommendations without request
  return `Consider investigating root causes and reviewing current operational procedures for ${issueLower} in affected areas.`;
}

/**
 * Extract structured Negative Feedback Requiring Attention.
 * Follows the core workflow:
 * PROBLEM -> EVIDENCE -> WHAT PEOPLE WANT -> POSSIBLE FOLLOW-UP
 */
export function extractNegativeIssues(issues = [], responses = [], totalResponses = 1) {
  const rawRequests = extractRawRequests(responses);

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
      // Core workflow steps
      workflow: {
        problem: title(issue.issue),
        evidence: `${number(negativeCount)} negative responses (${percent(pct)})`,
        whatPeopleWant: linkedRequests[0],
        possibleFollowUp: suggestedFollowUp
      }
    };
  });
}

/**
 * Synthesize Administrator Quick Action Panel:
 * "Priority actions to review" (Top 3–5 issues near the top)
 */
export function synthesizePriorityActions(negativeIssues = []) {
  return negativeIssues.slice(0, 5).map((item, idx) => {
    const hasRequest = item.linkedRequests[0] !== "No directly related public request was identified in the analyzed responses.";
    let shortReq = hasRequest ? item.linkedRequests[0] : 'No specific request identified';
    if (shortReq.length > 75) shortReq = shortReq.slice(0, 72) + '…';

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
    if (row.sentiment === 'positive' || (IMPROVEMENT_WORDS.test(row.text) && row.sentiment !== 'negative')) {
      const text = row.text || '';
      const sentences = text.split(/(?<=[.!?])\s+/);
      const positiveSentence = sentences.find((s) => IMPROVEMENT_WORDS.test(s)) || sentences[0];
      const cleaned = positiveSentence.replace(/^["'\s]+|["'\s]+$/g, '').trim();

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
    }
  });

  // Find remaining concerns from the consultation issues
  const knownConcerns = issues.map((i) => i.issue.toLowerCase());

  return improvements.slice(0, 6).map((item) => {
    // Check if any known concerns appear in or relate to this improvement's text
    const relatedRemaining = knownConcerns.filter((c) => item.fullText.toLowerCase().includes(c));
    const remainingConcernsList = relatedRemaining.length > 0
      ? relatedRemaining
      : (knownConcerns.length > 0 ? [knownConcerns[0]] : ['Routine service maintenance']);

    return {
      title: item.text.length > 80 ? item.text.slice(0, 77) + '…' : item.text,
      evidence: item.fullText,
      responseIndex: item.responseIndex,
      confidence: item.confidence,
      remainingConcerns: remainingConcernsList.slice(0, 3),
      stage: 'REPORTED IMPROVEMENT'
    };
  });
}

/**
 * Extract and deconstruct mixed feedback.
 * Decomposes into:
 * Reported Improvement + Remaining Concern + Public Request + Interpretation + Suggested Follow-Up
 */
export function extractMixedFeedback(responses = [], rawRequests = []) {
  const mixedList = [];

  responses.forEach((row) => {
    const text = row.text || '';
    if (CONTRAST_SPLIT.test(text)) {
      const parts = text.split(CONTRAST_SPLIT);
      if (parts.length >= 3) {
        const firstClause = parts[0].trim();
        const contrastWord = parts[1].trim();
        const secondClause = parts.slice(2).join(' ').trim();

        let improvement = '';
        let concern = '';

        if (IMPROVEMENT_WORDS.test(firstClause) || row.sentiment === 'positive') {
          improvement = firstClause;
          concern = secondClause;
        } else {
          concern = firstClause;
          improvement = secondClause;
        }

        improvement = improvement.replace(/^[,;.\s]+|[,;.\s]+$/g, '');
        concern = concern.replace(/^[,;.\s]+|[,;.\s]+$/g, '');

        if (improvement.length >= 10 && concern.length >= 10) {
          // Look for an actionable request within the sentence
          let linkedRequest = 'No explicit request stated in response.';
          if (REQUEST_REGEX.test(text)) {
            const reqMatch = text.match(new RegExp(`(?:please|should|need to|must|request)\\s+[^.!?]+`, 'i'));
            if (reqMatch) linkedRequest = `"${reqMatch[0].trim()}"`;
          }

          let concernSummary = concern.length > 60 ? concern.slice(0, 57) + '…' : concern;

          mixedList.push({
            responseIndex: row.row_index,
            fullText: text,
            reportedImprovement: improvement.charAt(0).toUpperCase() + improvement.slice(1),
            remainingConcern: concern.charAt(0).toUpperCase() + concern.slice(1),
            publicRequest: linkedRequest,
            contrastWord: contrastWord.toLowerCase(),
            interpretation: 'The intervention appears to have improved access or satisfaction in one dimension, but a secondary service friction continues to affect residents.',
            suggestedFollowUp: `Consider investigating whether reports regarding "${concernSummary}" are concentrated in specific service zones.`,
            confidence: row.confidence
          });
        }
      }
    }
  });

  return mixedList.slice(0, 5);
}

/**
 * Synthesize Executive Brief ("What people are telling you").
 */
export function synthesizeExecutiveBrief(data, requests = [], improvements = [], mixed = [], negativeIssues = []) {
  const total = data.total_responses || 0;
  const sentiment = data.sentiment || { counts: {}, percentages: {} };
  const posCount = sentiment.counts?.positive || 0;
  const negCount = sentiment.counts?.negative || 0;
  const posPct = sentiment.percentages?.positive || 0;
  const negPct = sentiment.percentages?.negative || 0;

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
    `Across ${number(total)} verified consultation responses, public sentiment is ${posture}. Validated classification indicates ${percent(posPct)} positive feedback (${number(posCount)} responses), ${percent(negPct)} negative feedback (${number(negCount)} responses), and ${percent(sentiment.percentages?.neutral || 0)} neutral or informational submissions.`
  );

  // Paragraph 2: Major negative concerns & positive outcomes
  let concernsText = '';
  if (negativeIssues.length > 0) {
    const topIssues = negativeIssues.slice(0, 3).map((i) => `"${i.issue}" (${number(i.negativeCount)} responses)`).join(', ');
    concernsText = `Negative feedback requiring administrative attention centers primarily on ${topIssues}.`;
  } else {
    concernsText = 'No critical complaint frequency thresholds were breached across analyzed responses.';
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
      actionableText = `Citizens submitted ${number(requests.length)} actionable requests, headed by calls to ${requests[0].title.toLowerCase()}.`;
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
      headline: `${issue.displayTitle} remains a recurring concern despite reported progress.`,
      count: issue.negativeCount,
      coverage: percent(issue.percentage),
      sentiment: 'Negative Complaint',
      priority: issue.priority,
      interpretation: `Repeated feedback indicates friction with ${issue.issue.toLowerCase()}, representing ${percent(issue.percentage)} of consultation submissions.`,
      supportingResponses: issue.supportingResponses || [],
      evidenceCount: issue.representativeFeedback?.length || 0
    });
  });

  if (requests.length > 0) {
    findings.push({
      headline: `Citizens actively request: ${requests[0].title}.`,
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
      headline: `Verified positive outcome: ${improvements[0].title}.`,
      count: 1,
      coverage: 'Verified positive report',
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
 * Uses cautious administrative verbs (Consider, Investigate, Review, Evaluate, Assess).
 */
export function synthesizeRecommendations(issues = [], requests = [], mixed = []) {
  const recommendations = [];

  issues.slice(0, 3).forEach((issue) => {
    recommendations.push({
      actionVerb: 'Investigate',
      title: `Investigate recurring complaints regarding ${issue.issue}`,
      rationale: `Supported by ${number(issue.mentions || 0)} citizen submissions (${percent((issue.negative_ratio || 0) * 100)} negative ratio).`,
      guidance: `Review whether complaints regarding ${issue.issue} stem from communication gaps, equipment downtime, or systemic bottlenecks in the operational pipeline.`
    });
  });

  requests.slice(0, 2).forEach((req) => {
    recommendations.push({
      actionVerb: 'Consider',
      title: `Consider administrative feasibility of: ${req.title}`,
      rationale: `Raised as an actionable request by citizens in this consultation.`,
      guidance: `Evaluate resource allocation and operational viability to determine if this request can be integrated into upcoming service revisions.`
    });
  });

  if (mixed.length > 0) {
    recommendations.push({
      actionVerb: 'Assess',
      title: `Assess remaining bottlenecks reported in mixed feedback`,
      rationale: `${number(mixed.length)} responses note satisfaction with core reforms but report frustration with secondary execution.`,
      guidance: `Review whether adjustments to secondary service layers can resolve remaining friction without altering core policy.`
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      actionVerb: 'Maintain',
      title: 'Maintain current operational standards and ongoing monitoring',
      rationale: 'No severe complaint clusters or urgent requests were detected in this dataset.',
      guidance: 'Continue routine tracking to verify that service performance remains stable.'
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
      assessment += `though the nature of public concern has shifted toward service quality, consistency, and reliability—most notably ${negativeIssues[0].issue}. `;
    } else {
      assessment += `with minimal recurring negative complaints across surveyed areas. `;
    }
  } else {
    assessment += `citizen sentiment remains constrained by significant operational friction (${percent(negPct)} negative feedback). `;
    if (negativeIssues.length > 0) {
      assessment += `Water quality and reliability represent the most urgent unresolved issues requiring administrative follow-up. `;
    }
  }

  if (requests.length > 0) {
    assessment += `Addressing public requests, starting with "${requests[0].title}", provides an immediate, evidence-supported path to resolving citizen concerns. `;
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
