"""Domain profile definitions and deterministic domain-relevance validation.

Provides a conservative, lightweight relevance check to ensure citizen feedback
datasets are reasonably compatible with the explicitly chosen policy domain.
Does NOT classify domain automatically; validates selected domain compatibility.
"""
import re
from collections import Counter


DOMAIN_PROFILES = {
    "transport": {
        "id": "transport",
        "name": "Transport",
        "terms": [
            "bus", "buses", "route", "routes", "transit", "commute", "commuting",
            "traffic", "congestion", "fare", "fares", "frequency", "metro",
            "train", "trains", "station", "stations", "driver", "drivers",
            "conductor", "conductors", "parking", "road travel", "highway",
            "passenger", "passengers", "bus stop", "bus stops", "public transport",
            "schedule", "timings", "overcrowded", "subway", "railway", "vehicle",
            "vehicles", "depot"
        ]
    },
    "education": {
        "id": "education",
        "name": "Education",
        "terms": [
            "school", "schools", "student", "students", "teacher", "teachers",
            "classroom", "classrooms", "exam", "exams", "examination", "curriculum",
            "scholarship", "scholarships", "learning", "college", "colleges",
            "university", "tuition", "syllabus", "education", "academic",
            "attendance", "laboratory", "laboratories", "grading", "homework",
            "principal", "pedagogy", "textbook", "textbooks", "literacy"
        ]
    },
    "healthcare": {
        "id": "healthcare",
        "name": "Healthcare",
        "terms": [
            "hospital", "hospitals", "doctor", "doctors", "patient", "patients",
            "clinic", "clinics", "medicine", "medicines", "treatment", "healthcare",
            "nurse", "nurses", "ambulance", "medical", "ward", "wards",
            "pharmacy", "physician", "health", "appointment", "emergency care",
            "diagnosis", "prescription", "surgery"
        ]
    },
    "water": {
        "id": "water",
        "name": "Water Supply",
        "terms": [
            "water", "pipeline", "pipelines", "pipe", "pipes", "tap", "taps",
            "drinking water", "leak", "leaks", "leakage", "sewage", "drain",
            "drainage", "water supply", "reservoir", "borewell", "water pressure",
            "water quality", "chlorination", "muddy water"
        ]
    },
    "waste": {
        "id": "waste",
        "name": "Waste Management",
        "terms": [
            "waste", "garbage", "trash", "rubbish", "bin", "bins", "recycling",
            "litter", "littering", "collection", "dump", "dumping", "landfill",
            "cleanliness", "sanitation", "compost", "composting", "sweeper",
            "solid waste", "refuse"
        ]
    },
    "roads": {
        "id": "roads",
        "name": "Roads & Highway Infrastructure",
        "terms": [
            "road", "roads", "pothole", "potholes", "highway", "highways",
            "asphalt", "pavement", "paving", "footpath", "footpaths", "sidewalk",
            "sidewalks", "bridge", "bridges", "street", "streets", "lane",
            "lanes", "junction", "junctions", "flyover", "zebra crossing",
            "speed breaker"
        ]
    },
    "stadium": {
        "id": "stadium",
        "name": "Stadium / Sports Infrastructure",
        "terms": [
            "stadium", "stadiums", "sports", "arena", "pitch", "ground",
            "match", "matches", "athlete", "athletes", "athletic", "seating",
            "spectator", "spectators", "stand", "stands", "pavilion", "court",
            "courts", "tournament", "gymnasium"
        ]
    },
    "safety": {
        "id": "safety",
        "name": "Public Safety",
        "terms": [
            "police", "safety", "crime", "crimes", "security", "patrol",
            "patrolling", "cctv", "theft", "street lighting", "emergency",
            "law enforcement", "harassment", "safe", "danger", "burglar",
            "robbery", "policing"
        ]
    },
    "urban": {
        "id": "urban",
        "name": "Urban Infrastructure",
        "terms": [
            "park", "parks", "housing", "zoning", "civic", "urban", "public space",
            "streetlight", "streetlights", "bench", "benches", "beautification",
            "planning", "encroachment", "sidewalk"
        ]
    },
    "food": {
        "id": "food",
        "name": "Food & Public Distribution",
        "terms": [
            "food", "ration", "rations", "distribution", "grain", "grains",
            "wheat", "rice", "nutrition", "ration shop", "fair price",
            "grocery", "subsidized", "hunger", "food grain", "provisions"
        ]
    },
    "other": {
        "id": "other",
        "name": "Other Public Domain",
        "terms": []
    }
}


def normalize_domain_key(domain_name):
    """Map domain labels or partial strings to standard profile key."""
    if not domain_name:
        return "other"
    cleaned = domain_name.lower().strip()
    for key, prof in DOMAIN_PROFILES.items():
        if key in cleaned or prof["name"].lower() in cleaned or cleaned in prof["name"].lower():
            return key
    return "other"


def _extract_words(text):
    return re.findall(r"\b[a-z]{2,}\b", text.lower())


def evaluate_domain_relevance(texts, selected_domain):
    """Evaluate whether an array of feedback texts is reasonably compatible with selected_domain.

    Returns dict with:
      - is_clearly_unrelated: bool (True only if overwhelmingly inconsistent)
      - status: 'relevant' | 'ambiguous' | 'mixed' | 'unrelated'
      - selected_domain: canonical name
      - domain_counts: dict of domain -> match count
      - suggested_domain: suggested domain name if clearly unrelated, else None
      - message: human-readable explanation
    """
    domain_key = normalize_domain_key(selected_domain)

    # 'other' or empty is open to any feedback
    if domain_key == "other":
        return {
            "is_clearly_unrelated": False,
            "status": "relevant",
            "selected_domain": selected_domain or "Other",
            "domain_counts": {},
            "suggested_domain": None,
            "message": "Domain is open to general public consultation feedback."
        }

    if not texts:
        return {
            "is_clearly_unrelated": False,
            "status": "ambiguous",
            "selected_domain": DOMAIN_PROFILES[domain_key]["name"],
            "domain_counts": {},
            "suggested_domain": None,
            "message": "No feedback text available to validate."
        }

    # Combine text and count domain-specific vocabulary occurrences
    full_text = " ".join(texts).lower()
    words = _extract_words(full_text)
    word_counts = Counter(words)

    domain_hits = {}
    for key, prof in DOMAIN_PROFILES.items():
        if key == "other" or not prof["terms"]:
            continue
        hits = 0
        for term in prof["terms"]:
            if " " in term:
                hits += full_text.count(term)
            else:
                hits += word_counts.get(term, 0)
        domain_hits[key] = hits

    selected_hits = domain_hits.get(domain_key, 0)
    total_domain_hits = sum(domain_hits.values())

    # Find highest competing domain
    other_domains = {k: v for k, v in domain_hits.items() if k != domain_key}
    top_competing_key, top_competing_hits = (
        max(other_domains.items(), key=lambda x: x[1]) if other_domains else (None, 0)
    )

    # 1. Ambiguous/Generic Feedback Case:
    # If there are very few domain-specific hits overall (< 3), feedback is generic
    # (e.g. "service was good, staff was polite, waiting times long").
    # MUST NOT be blocked.
    if total_domain_hits < 3:
        return {
            "is_clearly_unrelated": False,
            "status": "ambiguous",
            "selected_domain": DOMAIN_PROFILES[domain_key]["name"],
            "domain_counts": domain_hits,
            "suggested_domain": None,
            "message": f"Feedback contains general public service commentary; no strong domain conflict with {DOMAIN_PROFILES[domain_key]['name']} detected."
        }

    # 2. Clearly Unrelated Case:
    # Selected domain has near-zero presence (< 10% of domain hits and <= 1 hit),
    # AND a competing domain has a strong presence (>= 75% of hits and >= 3 hits).
    if (selected_hits <= 1 or (selected_hits / total_domain_hits) < 0.12) and top_competing_hits >= 3 and (top_competing_hits / total_domain_hits) >= 0.70:
        competing_name = DOMAIN_PROFILES[top_competing_key]["name"]
        return {
            "is_clearly_unrelated": True,
            "status": "unrelated",
            "selected_domain": DOMAIN_PROFILES[domain_key]["name"],
            "domain_counts": domain_hits,
            "suggested_domain": competing_name,
            "message": f"These responses do not appear to match the selected {DOMAIN_PROFILES[domain_key]['name']} consultation domain. Detected feedback appears predominantly related to {competing_name}."
        }

    # 3. Mixed Domain Case:
    # Selected domain is present (or plurality), but a competing domain has notable presence (>= 25%)
    if selected_hits > 0 and top_competing_hits >= 2 and (top_competing_hits / total_domain_hits) >= 0.25:
        competing_name = DOMAIN_PROFILES[top_competing_key]["name"]
        return {
            "is_clearly_unrelated": False,
            "status": "mixed",
            "selected_domain": DOMAIN_PROFILES[domain_key]["name"],
            "domain_counts": domain_hits,
            "suggested_domain": None,
            "message": f"Most feedback appears relevant to {DOMAIN_PROFILES[domain_key]['name']}, but some responses appear related to {competing_name}."
        }

    # 4. Relevant Case:
    return {
        "is_clearly_unrelated": False,
        "status": "relevant",
        "selected_domain": DOMAIN_PROFILES[domain_key]["name"],
        "domain_counts": domain_hits,
        "suggested_domain": None,
        "message": f"Feedback is consistent with the {DOMAIN_PROFILES[domain_key]['name']} consultation domain."
    }
