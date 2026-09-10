export const POLICY_DOMAINS = [
  {
    id: 'transport',
    label: 'Transport',
    icon: '🚍',
    terms: [
      'bus', 'buses', 'route', 'routes', 'transit', 'commute', 'commuting',
      'traffic', 'congestion', 'fare', 'fares', 'frequency', 'metro',
      'train', 'trains', 'station', 'stations', 'driver', 'drivers',
      'conductor', 'conductors', 'parking', 'road travel', 'highway',
      'passenger', 'passengers', 'bus stop', 'bus stops', 'public transport',
      'schedule', 'timings', 'overcrowded', 'subway', 'railway', 'vehicle',
      'vehicles', 'depot'
    ]
  },
  {
    id: 'education',
    label: 'Education',
    icon: '🎓',
    terms: [
      'school', 'schools', 'student', 'students', 'teacher', 'teachers',
      'classroom', 'classrooms', 'exam', 'exams', 'examination', 'curriculum',
      'scholarship', 'scholarships', 'learning', 'college', 'colleges',
      'university', 'tuition', 'syllabus', 'education', 'academic',
      'attendance', 'laboratory', 'laboratories', 'grading', 'homework',
      'principal', 'pedagogy', 'textbook', 'textbooks', 'literacy'
    ]
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    icon: '🏥',
    terms: [
      'hospital', 'hospitals', 'doctor', 'doctors', 'patient', 'patients',
      'clinic', 'clinics', 'medicine', 'medicines', 'treatment', 'healthcare',
      'nurse', 'nurses', 'ambulance', 'medical', 'ward', 'wards',
      'pharmacy', 'physician', 'health', 'appointment', 'emergency care',
      'diagnosis', 'prescription', 'surgery'
    ]
  },
  {
    id: 'water',
    label: 'Water Supply',
    icon: '🚰',
    terms: [
      'water', 'pipeline', 'pipelines', 'pipe', 'pipes', 'tap', 'taps',
      'drinking water', 'leak', 'leaks', 'leakage', 'sewage', 'drain',
      'drainage', 'water supply', 'reservoir', 'borewell', 'water pressure',
      'water quality', 'chlorination', 'muddy water'
    ]
  },
  {
    id: 'waste',
    label: 'Waste Management',
    icon: '♻',
    terms: [
      'waste', 'garbage', 'trash', 'rubbish', 'bin', 'bins', 'recycling',
      'litter', 'littering', 'collection', 'dump', 'dumping', 'landfill',
      'cleanliness', 'sanitation', 'compost', 'composting', 'sweeper',
      'solid waste', 'refuse'
    ]
  },
  {
    id: 'roads',
    label: 'Roads & Highway Infrastructure',
    icon: '🛣',
    terms: [
      'road', 'roads', 'pothole', 'potholes', 'highway', 'highways',
      'asphalt', 'pavement', 'paving', 'footpath', 'footpaths', 'sidewalk',
      'sidewalks', 'bridge', 'bridges', 'street', 'streets', 'lane',
      'lanes', 'junction', 'junctions', 'flyover', 'zebra crossing',
      'speed breaker'
    ]
  },
  {
    id: 'stadium',
    label: 'Stadium / Sports Infrastructure',
    icon: '🏟',
    terms: [
      'stadium', 'stadiums', 'sports', 'arena', 'pitch', 'ground',
      'match', 'matches', 'athlete', 'athletes', 'athletic', 'seating',
      'spectator', 'spectators', 'stand', 'stands', 'pavilion', 'court',
      'courts', 'tournament', 'gymnasium'
    ]
  },
  {
    id: 'safety',
    label: 'Public Safety',
    icon: '🛡',
    terms: [
      'police', 'safety', 'crime', 'crimes', 'security', 'patrol',
      'patrolling', 'cctv', 'theft', 'street lighting', 'emergency',
      'law enforcement', 'harassment', 'safe', 'danger', 'burglar',
      'robbery', 'policing'
    ]
  },
  {
    id: 'urban',
    label: 'Urban Infrastructure',
    icon: '🏙',
    terms: [
      'park', 'parks', 'housing', 'zoning', 'civic', 'urban', 'public space',
      'streetlight', 'streetlights', 'bench', 'benches', 'beautification',
      'planning', 'encroachment', 'sidewalk'
    ]
  },
  {
    id: 'food',
    label: 'Food & Public Distribution',
    icon: '🍲',
    terms: [
      'food', 'ration', 'rations', 'distribution', 'grain', 'grains',
      'wheat', 'rice', 'nutrition', 'ration shop', 'fair price',
      'grocery', 'subsidized', 'hunger', 'food grain', 'provisions'
    ]
  },
  {
    id: 'other',
    label: 'Other Public Domain',
    icon: '📋',
    terms: []
  }
];

export function getDomainInfo(domainName) {
  if (!domainName) return POLICY_DOMAINS[0];
  const cleaned = domainName.toLowerCase().trim();
  const match = POLICY_DOMAINS.find(
    (d) =>
      d.label.toLowerCase() === cleaned ||
      d.id === cleaned ||
      cleaned.includes(d.id) ||
      d.label.toLowerCase().includes(cleaned)
  );
  return match || { id: 'other', label: domainName, icon: '📋', terms: [] };
}

/**
 * Deterministically evaluate whether a list of response strings or objects
 * is reasonably compatible with the explicitly chosen policy domain.
 */
export function evaluateDomainRelevance(responsesOrTexts = [], selectedDomain = 'Transport') {
  const currentDomain = getDomainInfo(selectedDomain);

  if (currentDomain.id === 'other' || !currentDomain.terms || currentDomain.terms.length === 0) {
    return {
      isClearlyUnrelated: false,
      status: 'relevant',
      selectedDomain: currentDomain.label,
      suggestedDomain: null,
      message: 'Domain is open to general public consultation feedback.'
    };
  }

  const texts = responsesOrTexts.map((r) => (typeof r === 'string' ? r : r?.text || ''));
  if (texts.length === 0) {
    return {
      isClearlyUnrelated: false,
      status: 'ambiguous',
      selectedDomain: currentDomain.label,
      suggestedDomain: null,
      message: 'No feedback text available to evaluate.'
    };
  }

  const fullText = texts.join(' ').toLowerCase();
  const words = fullText.match(/\b[a-z]{2,}\b/g) || [];
  const wordCounts = {};
  for (const w of words) {
    wordCounts[w] = (wordCounts[w] || 0) + 1;
  }

  const domainHits = {};
  for (const dom of POLICY_DOMAINS) {
    if (dom.id === 'other' || !dom.terms.length) continue;
    let hits = 0;
    for (const term of dom.terms) {
      if (term.includes(' ')) {
        const matches = fullText.split(term).length - 1;
        hits += matches;
      } else {
        hits += wordCounts[term] || 0;
      }
    }
    domainHits[dom.id] = hits;
  }

  const selectedHits = domainHits[currentDomain.id] || 0;
  const totalDomainHits = Object.values(domainHits).reduce((a, b) => a + b, 0);

  // Identify competing domain
  let topCompetingId = null;
  let topCompetingHits = 0;
  for (const [id, hits] of Object.entries(domainHits)) {
    if (id !== currentDomain.id && hits > topCompetingHits) {
      topCompetingId = id;
      topCompetingHits = hits;
    }
  }

  // 1. Ambiguous case: fewer than 3 domain-specific term hits across the whole dataset
  if (totalDomainHits < 3) {
    return {
      isClearlyUnrelated: false,
      status: 'ambiguous',
      selectedDomain: currentDomain.label,
      suggestedDomain: null,
      message: `Feedback contains general public service commentary; no strong domain conflict with ${currentDomain.label} detected.`
    };
  }

  // 2. Clearly Unrelated case:
  // selected domain has near zero presence (< 12% and <= 1 hit),
  // and another domain has >= 70% of domain hits with at least 3 occurrences.
  if (
    (selectedHits <= 1 || selectedHits / totalDomainHits < 0.12) &&
    topCompetingHits >= 3 &&
    topCompetingHits / totalDomainHits >= 0.70
  ) {
    const competingDomain = POLICY_DOMAINS.find((d) => d.id === topCompetingId);
    return {
      isClearlyUnrelated: true,
      status: 'unrelated',
      selectedDomain: currentDomain.label,
      suggestedDomain: competingDomain ? competingDomain.label : null,
      message: `These responses do not appear to match the selected ${currentDomain.label} consultation domain. Detected feedback appears predominantly related to ${competingDomain ? competingDomain.label : 'another domain'}.`
    };
  }

  // 3. Mixed case:
  if (selectedHits > 0 && topCompetingHits >= 2 && topCompetingHits / totalDomainHits >= 0.25) {
    const competingDomain = POLICY_DOMAINS.find((d) => d.id === topCompetingId);
    return {
      isClearlyUnrelated: false,
      status: 'mixed',
      selectedDomain: currentDomain.label,
      suggestedDomain: null,
      message: `Most feedback appears relevant to ${currentDomain.label}, but some responses appear related to ${competingDomain ? competingDomain.label : 'other areas'}.`
    };
  }

  // 4. Relevant case:
  return {
    isClearlyUnrelated: false,
    status: 'relevant',
    selectedDomain: currentDomain.label,
    suggestedDomain: null,
    message: `Feedback is consistent with the ${currentDomain.label} consultation domain.`
  };
}
