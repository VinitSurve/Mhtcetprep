import { useMemo } from 'react';

export default function useMockAnalytics(answers) {
  return useMemo(() => {
    if (!answers || !answers.length) return null;

    const total = answers.length;
    const correct = answers.filter(a => a.is_correct).length;
    const wrong = answers.filter(a => a.selected_answer != null && !a.is_correct).length;
    const skipped = answers.filter(a => a.selected_answer == null).length;
    const totalTime = answers.reduce((sum, a) => sum + (a.time_taken_sec || 0), 0);
    const avgTime = total ? totalTime / total : 0;
    const accuracy = total ? (correct / total) * 100 : 0;

    // Subject breakdown
    const subjectMap = {};
    answers.forEach(a => {
      const key = a.subject || 'Unknown';
      if (!subjectMap[key]) subjectMap[key] = { correct: 0, total: 0, time: 0 };
      subjectMap[key].total++;
      subjectMap[key].time += a.time_taken_sec || 0;
      if (a.is_correct) subjectMap[key].correct++;
    });
    const subjectStats = Object.entries(subjectMap).map(([subject, d]) => ({
      subject,
      correct: d.correct,
      total: d.total,
      accuracy: d.total ? (d.correct / d.total) * 100 : 0,
      avgTime: d.total ? d.time / d.total : 0,
    }));

    // Topic breakdown
    const topicMap = {};
    answers.forEach(a => {
      const key = a.topic || 'Unknown';
      if (!topicMap[key]) topicMap[key] = { correct: 0, total: 0, time: 0, subject: a.subject };
      topicMap[key].total++;
      topicMap[key].time += a.time_taken_sec || 0;
      if (a.is_correct) topicMap[key].correct++;
    });
    const topicStats = Object.entries(topicMap).map(([topic, d]) => ({
      topic,
      subject: d.subject,
      correct: d.correct,
      total: d.total,
      accuracy: d.total ? (d.correct / d.total) * 100 : 0,
      avgTime: d.total ? d.time / d.total : 0,
    }));

    const slowQuestions = answers.filter(a => (a.time_taken_sec || 0) > (a.expected_time_sec || 60));
    const weakTopics = topicStats
      .filter(t => t.total >= 2 && t.accuracy < 60)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);

    return {
      total,
      correct,
      wrong,
      skipped,
      accuracy,
      totalTime,
      avgTime,
      subjectStats,
      topicStats,
      slowQuestions,
      weakTopics,
      markedQuestions: answers.filter(a => a.marked_for_review),
      wrongQuestions: answers.filter(a => !a.is_correct && a.selected_answer != null),
    };
  }, [answers]);
}
