"""Exact-phrase NLP and deterministic statistics; no semantic or policy claims."""
from collections import defaultdict
import re

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

from config import (MAX_DISCOVERED_TERMS, MAX_KEYWORDS, MAX_TOPICS, MAX_ISSUES,
                    MAX_REPRESENTATIVES, MIN_ISSUE_MENTIONS, MIN_ISSUE_NEGATIVE_RATIO,
                    PRIORITY_FREQUENCY_WEIGHT, PRIORITY_NEGATIVE_WEIGHT,
                    PRIORITY_HIGH_THRESHOLD, PRIORITY_MEDIUM_THRESHOLD)

STOPWORDS = ENGLISH_STOP_WORDS - {"not", "no", "never"}
# Words and separators are both retained: phrases cannot bridge punctuation,
# a stopword, a number, or a line break and claim to be a source phrase.
WORD = re.compile(r"(?<!\w)[a-z]+(?:'[a-z]+)?(?!\w)", re.IGNORECASE)


def extract_terms(text):
    text = text.lower()
    tokens = list(WORD.finditer(text))
    terms = set()
    for i, match in enumerate(tokens):
        if len(match[0]) < 2 or match[0] in STOPWORDS:
            continue
        phrase = [match[0]]
        terms.add(match[0])
        for j in range(i + 1, min(i + 3, len(tokens))):
            word = tokens[j][0]
            separator = text[tokens[j - 1].end():tokens[j].start()]
            if (not separator or not all(c in " \t" for c in separator)
                    or len(word) < 2 or word in STOPWORDS):
                break
            phrase.append(word)
            terms.add(" ".join(phrase))
    return terms


def distribution(rows, classes):
    counts = dict.fromkeys(classes, 0)
    for row in rows:
        counts[row["sentiment"]] += 1
    total = len(rows)
    return {"counts": counts,
            "percentages": {key: round(value / total * 100, 4) if total else 0.0 for key, value in counts.items()},
            "average_confidence": round(sum(row["confidence"] for row in rows) / total, 6) if total else None}


def priority_score(mentions, negative_mentions, total):
    coverage = mentions / total
    negative_ratio = negative_mentions / mentions
    score = 100 * (PRIORITY_FREQUENCY_WEIGHT * coverage + PRIORITY_NEGATIVE_WEIGHT * negative_ratio)
    priority = "HIGH" if score >= PRIORITY_HIGH_THRESHOLD else "MEDIUM" if score >= PRIORITY_MEDIUM_THRESHOLD else "LOW"
    return {"score": round(score, 4), "level": priority,
            "signals": {"coverage": round(coverage, 6), "negative_ratio": round(negative_ratio, 6),
                        "frequency_weight": PRIORITY_FREQUENCY_WEIGHT, "negative_weight": PRIORITY_NEGATIVE_WEIGHT,
                        "frequency_contribution": round(100 * PRIORITY_FREQUENCY_WEIGHT * coverage, 4),
                        "negative_contribution": round(100 * PRIORITY_NEGATIVE_WEIGHT * negative_ratio, 4)}}


def select_terms(candidates, memberships, limit):
    """Suppress near-duplicate overlapping labels, without merging their counts."""
    selected = []
    for term in candidates:
        redundant = False
        for previous in selected:
            shared_words = set(term.split()) & set(previous.split())
            left, right = memberships[term], memberships[previous]
            if shared_words and len(left & right) / len(left | right) >= .8:
                redundant = True
                break
        if not redundant:
            selected.append(term)
        if len(selected) == limit:
            break
    return selected


def build_insights(rows, classes):
    by_index = {row["row_index"]: row for row in rows}
    membership = {}
    truncated = False
    for row in rows:
        for term in sorted(extract_terms(row["text"])):
            if term not in membership:
                if len(membership) >= MAX_DISCOVERED_TERMS:
                    truncated = True
                    continue
                membership[term] = set()
            membership[term].add(row["row_index"])
    # Prefer repeated, more specific exact phrases. Lexical order breaks ties.
    ranked = sorted(membership, key=lambda term: (
        -len(membership[term]) * (1 + .5 * (len(term.split()) - 1)), term))
    keywords = [{"keyword": term, "count": len(membership[term])}
                for term in select_terms(ranked, membership, MAX_KEYWORDS)]

    def examples(term):
        candidates = [by_index[index] for index in membership[term]]
        candidates.sort(key=lambda row: (row["sentiment"] != "negative", -row["confidence"], len(row["text"]), row["row_index"]))
        return [{key: row[key] for key in ("row_index", "id", "text", "sentiment", "confidence")}
                for row in candidates[:MAX_REPRESENTATIVES]]

    def topic(term):
        relevant = [by_index[index] for index in sorted(membership[term])]
        return {"topic": term, "count": len(relevant),
                "sentiment": distribution(relevant, classes)["counts"],
                "response_indices": sorted(membership[term])}

    topics = [topic(term) for term in select_terms(ranked, membership, MAX_TOPICS)]
    negative_counts = {term: sum(by_index[index]["sentiment"] == "negative" for index in indices)
                       for term, indices in membership.items()}
    issue_candidates = [term for term in ranked
                        if len(membership[term]) >= MIN_ISSUE_MENTIONS
                        and negative_counts[term] >= MIN_ISSUE_MENTIONS
                        and negative_counts[term] / len(membership[term]) >= MIN_ISSUE_NEGATIVE_RATIO]
    issue_candidates.sort(key=lambda term: (-priority_score(len(membership[term]), negative_counts[term], len(rows))["score"],
                                           -len(term.split()), term))
    issue_terms = select_terms(issue_candidates, membership, MAX_ISSUES)
    issues = []
    for term in issue_terms:
        count = len(membership[term])
        issues.append({"issue": term, "mentions": count, "negative_mentions": negative_counts[term],
                       "negative_ratio": round(negative_counts[term] / count, 6),
                       "sentiment": topic(term)["sentiment"],
                       "priority": priority_score(count, negative_counts[term], len(rows)),
                       "response_indices": sorted(membership[term]), "representative_feedback": examples(term)})

    days, category_groups = defaultdict(list), defaultdict(list)
    for row in rows:
        if row["date"]:
            days[row["date"]].append(row)
        if row["category"]:
            category_groups[row["category"]].append(row)
    trend_points = []
    for day, group in sorted(days.items()):
        indices = {row["row_index"] for row in group}
        trend_points.append({"date": day, "total_responses": len(group), "sentiment": distribution(group, classes),
                             "issue_mentions": {term: len(membership[term] & indices) for term in issue_terms}})
    dated_count = sum(len(group) for group in days.values())
    trends = {"available": bool(days), "reason": None if days else "No valid dates in analyzed responses.",
              "dated_responses": dated_count, "undated_responses": len(rows) - dated_count, "points": trend_points}
    category_points = []
    for name, group in sorted(category_groups.items()):
        indices = {row["row_index"] for row in group}
        local_issues = []
        for term in issue_terms:
            members = membership[term] & indices
            negatives = sum(by_index[index]["sentiment"] == "negative" for index in members)
            if negatives >= MIN_ISSUE_MENTIONS and negatives / len(members) >= MIN_ISSUE_NEGATIVE_RATIO:
                local_issues.append({"issue": term, "mentions": len(members), "negative_mentions": negatives,
                                     "priority": priority_score(len(members), negatives, len(group))})
        local_issues.sort(key=lambda item: (-item["priority"]["score"], item["issue"]))
        category_points.append({"category": name, "total_responses": len(group), "sentiment": distribution(group, classes),
                                "issues": local_issues})
    categorized_count = sum(len(group) for group in category_groups.values())
    categories = {"available": bool(category_groups), "reason": None if category_groups else "No categories in analyzed responses.",
                  "categorized_responses": categorized_count, "uncategorized_responses": len(rows) - categorized_count,
                  "groups": category_points}
    overall = distribution(rows, classes)
    maximum = max(overall["counts"].values())
    leaders = [label for label, count in overall["counts"].items() if count == maximum]
    summary = f"Analyzed {len(rows)} valid responses. "
    if len(leaders) == 1:
        summary += f"The most frequent model sentiment is {leaders[0]} ({maximum} responses, {overall['percentages'][leaders[0]]:.2f}%). "
    else:
        summary += f"Model sentiment is tied between {', '.join(leaders)} ({maximum} responses each). "
    if topics:
        summary += "Leading exact-phrase topics: " + "; ".join(f"{item['topic']} ({item['count']})" for item in topics[:3]) + ". "
    if issues:
        summary += "Recurring negative-associated candidate issues: " + "; ".join(
            f"{item['issue']} ({item['mentions']} mentions, {item['priority']['level']} priority)" for item in issues[:3]) + "."
    else:
        summary += "No recurring patterns met the candidate-issue thresholds."
    return {"sentiment": overall, "keywords": keywords, "topics": topics, "issues": issues,
            "trends": trends, "categories": categories, "summary": summary,
            "analysis_notes": {"summary_method": "Deterministic template from measured counts; not source testimony.",
                               "topic_method": "Exact one-to-three-word phrase discovery; overlapping labels, not semantic clusters.",
                               "issue_method": "Repeated phrases associated with model-negative responses, not verified policy concerns.",
                               "term_limit_reached": truncated, "unique_terms_considered": len(membership),
                               "issue_thresholds": {"minimum_mentions": MIN_ISSUE_MENTIONS,
                                                    "minimum_negative_mentions": MIN_ISSUE_MENTIONS,
                                                    "minimum_negative_ratio": MIN_ISSUE_NEGATIVE_RATIO},
                               "priority_thresholds": {"high": PRIORITY_HIGH_THRESHOLD, "medium": PRIORITY_MEDIUM_THRESHOLD},
                               "confidence": "Uncalibrated Naive Bayes probabilities.",
                               "priority_formula": f"100 * ({PRIORITY_FREQUENCY_WEIGHT} * mentions / valid_responses + {PRIORITY_NEGATIVE_WEIGHT} * negative_mentions / mentions)"}}
