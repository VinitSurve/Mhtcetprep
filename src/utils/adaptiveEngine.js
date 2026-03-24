// ────────────────────────────────────────────────────────────────
// Adaptive Engine + Analytics Compute Layer
// All functions are pure — no side effects, no DB calls.
// ────────────────────────────────────────────────────────────────

// ── Core attempt analysis ────────────────────────────────────────

export function analyzeAttempts(attempts) {
  const topicMap   = {};
  const subjectMap = {};

  for (const a of attempts) {
    if (!topicMap[a.topic]) {
      topicMap[a.topic] = { correct: 0, total: 0, totalTime: 0, subject: a.subject };
    }
    topicMap[a.topic].total     += 1;
    topicMap[a.topic].totalTime += (a.time_taken_sec || 0);
    if (a.is_correct) topicMap[a.topic].correct += 1;

    if (!subjectMap[a.subject]) {
      subjectMap[a.subject] = { correct: 0, total: 0, totalTime: 0 };
    }
    subjectMap[a.subject].total     += 1;
    subjectMap[a.subject].totalTime += (a.time_taken_sec || 0);
    if (a.is_correct) subjectMap[a.subject].correct += 1;
  }

  const topicStats = Object.entries(topicMap).map(([topic, d]) => ({
    topic,
    subject:  d.subject,
    accuracy: d.total > 0 ? (d.correct / d.total) * 100 : 0,
    avgTime:  d.total > 0 ? d.totalTime / d.total : 0,
    total:    d.total,
    correct:  d.correct,
  }));

  const subjectStats = Object.entries(subjectMap).map(([subject, d]) => ({
    subject,
    accuracy: d.total > 0 ? (d.correct / d.total) * 100 : 0,
    avgTime:  d.total > 0 ? d.totalTime / d.total : 0,
    total:    d.total,
    correct:  d.correct,
  }));

  return { topicStats, subjectStats };
}

// ── Adaptive engine ──────────────────────────────────────────────

export function getTopicWeight(accuracy) {
  if (accuracy < 60) return 3;
  if (accuracy < 80) return 2;
  return 1;
}

export function buildWeightedTopics(topicStats) {
  const weighted = [];
  for (const ts of topicStats) {
    const w = getTopicWeight(ts.accuracy);
    for (let i = 0; i < w; i++) weighted.push({ topic: ts.topic, subject: ts.subject });
  }
  return weighted;
}

export function pickWeightedTopic(weightedTopics) {
  if (!weightedTopics.length) return null;
  return weightedTopics[Math.floor(Math.random() * weightedTopics.length)];
}

export function getAdaptiveFilter(attempts) {
  if (!attempts || attempts.length < 3) return {};
  const { topicStats } = analyzeAttempts(attempts);
  const picked = pickWeightedTopic(buildWeightedTopics(topicStats));
  return picked ? { topic: picked.topic, subject: picked.subject } : {};
}

// ── Overall metrics ──────────────────────────────────────────────

export function computeOverallMetrics(attempts) {
  if (!attempts.length) return {
    totalAttempts: 0, correct: 0, accuracy: 0, avgTime: 0,
    avgSpeedRatio: 0, guessRate: 0, avgConfidence: 0,
  };
  const correct     = attempts.filter(a => a.is_correct).length;
  const totalTime   = attempts.reduce((s, a) => s + (a.time_taken_sec || 0), 0);
  const speedRatios = attempts.filter(a => a.speed_ratio != null).map(a => a.speed_ratio);
  const guesses     = attempts.filter(a => a.was_guess).length;
  const confs       = attempts.filter(a => a.confidence_level).map(a => a.confidence_level);
  return {
    totalAttempts:  attempts.length,
    correct,
    accuracy:       parseFloat(((correct / attempts.length) * 100).toFixed(1)),
    avgTime:        parseFloat((totalTime / attempts.length).toFixed(1)),
    avgSpeedRatio:  speedRatios.length ? parseFloat((speedRatios.reduce((s,x)=>s+x,0)/speedRatios.length).toFixed(2)) : 0,
    guessRate:      parseFloat(((guesses / attempts.length) * 100).toFixed(1)),
    avgConfidence:  confs.length ? parseFloat((confs.reduce((s,x)=>s+x,0)/confs.length).toFixed(1)) : 0,
  };
}

export function findStrongestTopic(topicStats) {
  const with3 = topicStats.filter(t => t.total >= 3);
  if (!with3.length) return topicStats.length ? topicStats.reduce((b,t)=>t.accuracy>b.accuracy?t:b, topicStats[0]) : null;
  return with3.reduce((b,t) => t.accuracy > b.accuracy ? t : b, with3[0]);
}

export function findWeakestTopic(topicStats) {
  const with3 = topicStats.filter(t => t.total >= 3);
  if (!with3.length) return topicStats.length ? topicStats.reduce((w,t)=>t.accuracy<w.accuracy?t:w, topicStats[0]) : null;
  return with3.reduce((w,t) => t.accuracy < w.accuracy ? t : w, with3[0]);
}

export function findSlowestTopic(topicStats) {
  if (!topicStats.length) return null;
  return topicStats.reduce((s,t) => t.avgTime > s.avgTime ? t : s, topicStats[0]);
}

// ── Trend / time-series ──────────────────────────────────────────

export function buildSessionTrend(attempts, limit = 20) {
  const byDay = {};
  for (const a of attempts) {
    const day = a.created_at?.slice(0, 10) || 'Unknown';
    if (!byDay[day]) byDay[day] = { correct: 0, total: 0 };
    byDay[day].total += 1;
    if (a.is_correct) byDay[day].correct += 1;
  }
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-limit)
    .map(([date, d]) => ({
      date:     date.slice(5),
      accuracy: parseFloat(((d.correct / d.total) * 100).toFixed(1)),
      attempts: d.total,
    }));
}

// ── Error / confidence breakdowns ────────────────────────────────

export function buildErrorDistribution(attempts) {
  const counts = {};
  for (const a of attempts.filter(x => !x.is_correct && x.error_type)) {
    counts[a.error_type] = (counts[a.error_type] || 0) + 1;
  }
  return Object.entries(counts).map(([type, count]) => ({ type, count }));
}

export function buildConfidenceMatrix(attempts) {
  const matrix = {};
  for (const a of attempts.filter(x => x.confidence_level)) {
    const k = a.confidence_level;
    if (!matrix[k]) matrix[k] = { correct: 0, wrong: 0 };
    if (a.is_correct) matrix[k].correct += 1;
    else matrix[k].wrong += 1;
  }
  return [1,2,3,4,5].map(level => ({
    level,
    correct: matrix[level]?.correct || 0,
    wrong:   matrix[level]?.wrong   || 0,
    total:   (matrix[level]?.correct || 0) + (matrix[level]?.wrong || 0),
  }));
}

export function buildDifficultyStats(attempts) {
  const map = {};
  for (const a of attempts) {
    const d = a.difficulty || 'Unknown';
    if (!map[d]) map[d] = { correct: 0, total: 0 };
    map[d].total += 1;
    if (a.is_correct) map[d].correct += 1;
  }
  return Object.entries(map).map(([difficulty, d]) => ({
    difficulty,
    accuracy: parseFloat(((d.correct / d.total) * 100).toFixed(1)),
    total:    d.total,
  }));
}

// ── NEW: Speed vs Accuracy scatter data ──────────────────────────
// Returns one data point per topic: { topic, accuracy, avgSpeedRatio, total }
// Used to identify topics that are fast-but-wrong or slow-but-right.

export function buildSpeedAccuracyMatrix(attempts) {
  const map = {};
  for (const a of attempts) {
    if (a.speed_ratio == null) continue;
    if (!map[a.topic]) map[a.topic] = { correct: 0, total: 0, speedSum: 0, subject: a.subject };
    map[a.topic].total    += 1;
    map[a.topic].speedSum += a.speed_ratio;
    if (a.is_correct) map[a.topic].correct += 1;
  }
  return Object.entries(map)
    .filter(([, d]) => d.total >= 2)
    .map(([topic, d]) => ({
      topic,
      subject:       d.subject,
      accuracy:      parseFloat(((d.correct / d.total) * 100).toFixed(1)),
      avgSpeedRatio: parseFloat((d.speedSum / d.total).toFixed(2)),
      total:         d.total,
    }));
}

// ── NEW: Current streak (consecutive correct answers) ────────────

export function buildStreakData(attempts) {
  // Sort oldest-first for streak calculation
  const sorted = [...attempts].sort((a, b) =>
    (a.created_at || '').localeCompare(b.created_at || ''));

  let currentStreak = 0;
  let bestStreak    = 0;
  let runTemp       = 0;

  for (const a of sorted) {
    if (a.is_correct) {
      runTemp++;
      if (runTemp > bestStreak) bestStreak = runTemp;
    } else {
      runTemp = 0;
    }
  }
  // current streak = run from the end
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].is_correct) currentStreak++;
    else break;
  }
  return { currentStreak, bestStreak, totalAttempts: sorted.length };
}

// ── NEW: Hourly activity heatmap ─────────────────────────────────
// Returns 24 buckets (0-23) with attempt counts and accuracy per hour.

export function buildHourlyHeatmap(attempts) {
  const buckets = Array.from({ length: 24 }, (_, h) => ({
    hour: h, attempts: 0, correct: 0, accuracy: 0,
  }));
  for (const a of attempts) {
    if (!a.created_at) continue;
    const h = new Date(a.created_at).getHours();
    buckets[h].attempts += 1;
    if (a.is_correct) buckets[h].correct += 1;
  }
  for (const b of buckets) {
    b.accuracy = b.attempts > 0
      ? parseFloat(((b.correct / b.attempts) * 100).toFixed(1)) : 0;
  }
  return buckets;
}

// ── NEW: Topic coverage progress ─────────────────────────────────
// How many unique topics has the user attempted vs total known topics?

const ALL_KNOWN_TOPICS = [
  // Mathematics
  'Set Theory','Permutations & Combinations','Probability','Sequences & Series',
  'Logarithms','Matrices & Determinants','Quadratic Equations','Functions',
  'Geometry','Number Theory','Coordinate Geometry','Algebra','Progressions',
  'Number System','Ratio & Proportion','Basic Operations','Profit & Loss',
  'Simple & Compound Interest','Percentage','Time & Work','Time, Speed & Distance',
  // Computer Concepts
  'HTML Basics','Types of Computers','Data Structures','Algorithms','OOP',
  'Networking','Database Management','Operating System','Computer Hardware',
  'Computer Architecture','SQL','Sorting','Searching','Bitwise Operations',
  'Normalization','Programming Concepts',
  // Logical Reasoning
  'Number Series','Coding-Decoding','Syllogism','Blood Relations','Analogy',
  'Odd One Out','Alphabet Series','Direction Sense','Seating Arrangement',
  'Venn Diagrams','Input-Output','Puzzle','Series','Syllogisms',
  // English
  'Vocabulary','Grammar','Reading Comprehension','Idioms & Phrases',
  'Sentence Correction','Fill in the Blanks','Synonyms','Antonyms',
  // General Aptitude
  'Abacus','General Awareness',
];

export function buildTopicCoverage(attempts) {
  const attempted = new Set(attempts.map(a => a.topic).filter(Boolean));
  const total     = ALL_KNOWN_TOPICS.length;
  const done      = ALL_KNOWN_TOPICS.filter(t => attempted.has(t)).length;
  const pct       = total > 0 ? parseFloat(((done / total) * 100).toFixed(1)) : 0;

  // Per-subject coverage
  const subjectTopics = {
    'Mathematics':       ALL_KNOWN_TOPICS.slice(0, 21),
    'Computer Concepts': ALL_KNOWN_TOPICS.slice(21, 37),
    'Logical Reasoning': ALL_KNOWN_TOPICS.slice(37, 52),
    'English':           ALL_KNOWN_TOPICS.slice(52, 60),
    'General Aptitude':  ALL_KNOWN_TOPICS.slice(60),
  };
  const bySubject = Object.entries(subjectTopics).map(([subject, topics]) => {
    const subDone = topics.filter(t => attempted.has(t)).length;
    return {
      subject,
      done:    subDone,
      total:   topics.length,
      pct:     parseFloat(((subDone / topics.length) * 100).toFixed(1)),
    };
  });

  return { done, total, pct, bySubject };
}

// ── NEW: Predicted CET score ──────────────────────────────────────
// Rough prediction based on recent accuracy, speed, and difficulty mix.
// CET: 200 marks total (100 Qs × 2 marks each, no negative marking).

export function predictScore(attempts) {
  if (attempts.length < 10) return null;

  // Use last 50 attempts for recency bias
  const recent = [...attempts]
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 50);

  const correct   = recent.filter(a => a.is_correct).length;
  const baseAcc   = correct / recent.length;

  // Speed penalty: if avg speed ratio > 1.3, penalise accuracy slightly
  const ratios    = recent.filter(a => a.speed_ratio != null).map(a => a.speed_ratio);
  const avgRatio  = ratios.length ? ratios.reduce((s,x)=>s+x,0)/ratios.length : 1;
  const speedPen  = avgRatio > 1.3 ? (avgRatio - 1.3) * 0.08 : 0;

  // Difficulty bonus: more Hard questions attempted → better prepared
  const hardCount = recent.filter(a => a.difficulty === 'Hard').length;
  const hardBonus = Math.min(hardCount / recent.length, 0.15) * 0.05;

  const adjAcc    = Math.min(1, Math.max(0, baseAcc - speedPen + hardBonus));
  const predicted = Math.round(adjAcc * 100) * 2; // 100 questions × 2 marks

  // Confidence interval ±10
  return {
    predicted,
    low:        Math.max(0,   predicted - 10),
    high:       Math.min(200, predicted + 10),
    baseAccPct: parseFloat((baseAcc * 100).toFixed(1)),
    label:      predicted >= 160 ? 'Excellent' :
                predicted >= 130 ? 'Good' :
                predicted >= 100 ? 'Average' : 'Needs Work',
  };
}

// ── NEW: Weekly attempt volume ────────────────────────────────────
// Returns the last 7 days with daily attempt count + accuracy.

export function buildWeeklyVolume(attempts) {
  const days  = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days.map(date => {
    const dayAttempts = attempts.filter(a => a.created_at?.slice(0, 10) === date);
    const correct     = dayAttempts.filter(a => a.is_correct).length;
    return {
      date:     date.slice(5),
      attempts: dayAttempts.length,
      accuracy: dayAttempts.length > 0
        ? parseFloat(((correct / dayAttempts.length) * 100).toFixed(1)) : 0,
    };
  });
}

// ── Formula → Application mode helpers ─────────────────────────

export function groupQuestionsByFormula(questions) {
  const map = new Map();
  for (const q of questions || []) {
    if (!q.formula) continue;
    const key = `${q.formula}::${q.topic}`;
    const curr = map.get(key) || {
      formula: q.formula,
      concept: q.concept || 'Concept',
      topic: q.topic,
      subject: q.subject,
      questions: [],
    };
    curr.questions.push(q);
    map.set(key, curr);
  }
  return Array.from(map.values());
}

export function getWeakFormulas(progressRows, limit = 8) {
  return [...(progressRows || [])]
    .map((p) => ({
      formula: p.formula,
      topic: p.topic,
      attempts: p.attempts || 0,
      accuracy: p.attempts > 0 ? ((p.correct || 0) / p.attempts) * 100 : 0,
      avgTime: p.avg_time || 0,
      last_practiced: p.last_practiced,
    }))
    .sort((a, b) => {
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      return b.avgTime - a.avgTime;
    })
    .slice(0, limit);
}

export function buildFormulaPerformance(attemptRows) {
  const map = {};
  for (const row of attemptRows || []) {
    const rel = row.questions;
    const formula = rel?.formula;
    if (!formula) continue;
    if (!map[formula]) {
      map[formula] = {
        formula,
        concept: rel.concept || 'Concept',
        topic: rel.topic,
        subject: rel.subject,
        correct: 0,
        total: 0,
        totalTime: 0,
      };
    }
    map[formula].total += 1;
    map[formula].totalTime += row.time_taken_sec || 0;
    if (row.is_correct) map[formula].correct += 1;
  }
  return Object.values(map).map((f) => ({
    ...f,
    accuracy: f.total ? parseFloat(((f.correct / f.total) * 100).toFixed(1)) : 0,
    avgTime: f.total ? Math.round(f.totalTime / f.total) : 0,
  }));
}

// ── Subject Mastery helpers ────────────────────────────────────

export function buildSubjectMasteryPool(questions, attempts, subject) {
  const all = (questions || []).filter((q) => q.subject === subject);
  if (!all.length) return [];

  const byTopic = {};
  for (const a of attempts || []) {
    if (a.subject !== subject) continue;
    if (!byTopic[a.topic]) byTopic[a.topic] = { total: 0, correct: 0 };
    byTopic[a.topic].total += 1;
    if (a.is_correct) byTopic[a.topic].correct += 1;
  }

  const weighted = [];
  for (const q of all) {
    const t = byTopic[q.topic] || { total: 0, correct: 0 };
    const accuracy = t.total ? (t.correct / t.total) * 100 : 0;
    const weight = accuracy < 50 ? 4 : accuracy < 70 ? 3 : accuracy < 85 ? 2 : 1;
    for (let i = 0; i < weight; i++) weighted.push(q);
  }
  return weighted;
}

export function buildSubjectMasteryScore(attempts) {
  const { subjectStats } = analyzeAttempts(attempts || []);
  return subjectStats
    .map((s) => ({
      subject: s.subject,
      readiness: Math.round(Math.max(0, Math.min(100, s.accuracy))),
      avgTime: Math.round(s.avgTime || 0),
      total: s.total,
    }))
    .sort((a, b) => b.readiness - a.readiness);
}

// ── Smart Revision helpers ─────────────────────────────────────

export function generateRevisionSet({ wrongRows = [], slowRows = [], lowConfRows = [] }, minSize = 10, maxSize = 20) {
  const reasonPriority = {
    wrong: 3,
    slow: 2,
    low_confidence: 1,
  };

  const map = new Map();

  const mergeWithReason = (rows, reason) => {
    for (const row of rows || []) {
      const qid = row.question_id;
      if (!qid) continue;
      const existing = map.get(qid) || {
        question_id: qid,
        reasons: [],
        priority: 0,
        topic: row.topic,
        subject: row.subject,
        created_at: row.created_at,
      };
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      existing.priority = Math.max(existing.priority, reasonPriority[reason]);
      if (!existing.created_at || (row.created_at && row.created_at > existing.created_at)) {
        existing.created_at = row.created_at;
      }
      map.set(qid, existing);
    }
  };

  mergeWithReason(wrongRows, 'wrong');
  mergeWithReason(slowRows, 'slow');
  mergeWithReason(lowConfRows, 'low_confidence');

  const merged = Array.from(map.values()).sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });

  const adaptiveSize = Math.max(
    minSize,
    Math.min(maxSize, Math.ceil(merged.length * 0.5))
  );

  return merged.slice(0, adaptiveSize);
}
