'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import QuestionRenderer from '@/components/practice/QuestionRenderer';
import styles from './practice.module.css';

const CHALLENGE_STAGES = [
  { stage: 1, tokensNeeded: 5, label: 'Stage 1 of 3' },
  { stage: 2, tokensNeeded: 10, label: 'Stage 2 of 3' },
  { stage: 3, tokensNeeded: 15, label: 'Stage 3 of 3' },
];

function getOrCreateStudentId() {
  if (typeof window === 'undefined') return null;

  const key = 'practice_student_id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const created = `student-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);
  return created;
}

export default function PracticePage() {
  const params = useParams();
  const { microskillId } = params;

  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [nextQuestion, setNextQuestion] = useState(null);
  const [seenQuestionIds, setSeenQuestionIds] = useState([]);
  const [loadingQuestion, setLoadingQuestion] = useState(true);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transitionStage, setTransitionStage] = useState('idle');
  const [curriculumContext, setCurriculumContext] = useState({
    grade: null,
    subject: null,
    microskill: null,
  });

  const [userAnswer, setUserAnswer] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const [smartScore, setSmartScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [tokensCollected, setTokensCollected] = useState(0);
  const [currentStage, setCurrentStage] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  const currentChallengeStage = CHALLENGE_STAGES[currentStage];
  const withSubmitBehavior = (question) => {
    if (!question) return question;
    if (question.type !== 'mcq') {
      return { ...question, showSubmitButton: true };
    }
    return question;
  };

  const { microskill, subject, grade } = curriculumContext;
  const skillTitle = microskill ? `${microskill.code} ${microskill.name}` : `Skill ${microskillId}`;

  useEffect(() => {
    let active = true;

    const loadFirstQuestion = async () => {
      setLoadingQuestion(true);
      setSubmitError('');
      setUserAnswer(null);
      setIsAnswered(false);
      setIsCorrect(false);
      setNextQuestion(null);
      setSeenQuestionIds([]);

      try {
        const res = await fetch(`/api/practice/${microskillId}`, { cache: 'no-store' });
        const payload = await res.json();
        if (!active) return;

        if (!res.ok) {
          setSubmitError(payload.error || 'Could not load first question.');
          setCurrentQuestion(null);
          return;
        }

        const firstQuestion = payload.question ?? null;
        setCurrentQuestion(firstQuestion);
        setSeenQuestionIds(firstQuestion?.id ? [String(firstQuestion.id)] : []);
      } catch {
        if (!active) return;
        setSubmitError('Could not load first question. Please refresh.');
        setCurrentQuestion(null);
      } finally {
        if (!active) return;
        setLoadingQuestion(false);
      }
    };

    loadFirstQuestion();

    return () => {
      active = false;
    };
  }, [microskillId]);

  useEffect(() => {
    let active = true;

    const loadCurriculumContext = async () => {
      try {
        const res = await fetch(`/api/curriculum/microskill/${microskillId}`, { cache: 'no-store' });
        const payload = await res.json();
        if (!active || !res.ok) return;

        setCurriculumContext({
          grade: payload.grade ?? null,
          subject: payload.subject ?? null,
          microskill: payload.microskill ?? null,
        });
      } catch {
        if (!active) return;
      }
    };

    loadCurriculumContext();
    return () => {
      active = false;
    };
  }, [microskillId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return {
      hrs: String(hrs).padStart(2, '0'),
      mins: String(mins).padStart(2, '0'),
      secs: String(secs).padStart(2, '0'),
    };
  };

  const time = formatTime(elapsedTime);

  const validateAnswer = (question, answer) => {
    if (!question) return false;

    switch (question.type) {
      case 'mcq':
      case 'imageChoice':
        if (question.isMultiSelect) {
          const correctIndices = question.correctAnswerIndices || [];
          return JSON.stringify([...(answer || [])].sort()) === JSON.stringify([...correctIndices].sort());
        }
        return answer === question.correctAnswerIndex;

      case 'textInput':
        return String(answer || '').trim().toLowerCase() === String(question.correctAnswerText || '').trim().toLowerCase();

      case 'fillInTheBlank': {
        const correctAnswers = JSON.parse(question.correctAnswerText || '{}');
        return Object.keys(correctAnswers).every(
          (key) => answer?.[key]?.trim().toLowerCase() === String(correctAnswers[key]).toLowerCase()
        );
      }

      case 'dragAndDrop':
        return (question.dragItems || [])
          .filter((item) =>
            item.targetGroupId !== null &&
            item.targetGroupId !== undefined &&
            String(item.targetGroupId).trim() !== ''
          )
          .every((item) => answer?.[item.id] === item.targetGroupId);

      case 'sorting':
        if (question.correctAnswerText) {
          return JSON.stringify(answer) === question.correctAnswerText;
        }

        if ((question.items || []).some((item) => item.correctPosition !== undefined && item.correctPosition !== null)) {
          const expectedByPosition = [...(question.items || [])]
            .sort((a, b) => (Number(a.correctPosition ?? 0) - Number(b.correctPosition ?? 0)))
            .map((item) => String(item.id));
          return JSON.stringify((answer || []).map(String)) === JSON.stringify(expectedByPosition);
        }

        if (question.adaptiveConfig?.sort_rule) {
          const values = (question.items || []).map((item) => ({
            id: String(item.id),
            content: String(item.content ?? ''),
          }));
          const allNumeric = values.every((v) => !Number.isNaN(Number(v.content)));
          const sorted = [...values].sort((a, b) => {
            if (allNumeric) {
              return Number(a.content) - Number(b.content);
            }
            return a.content.localeCompare(b.content, undefined, { numeric: true, sensitivity: 'base' });
          });
          if (String(question.adaptiveConfig.sort_rule).toLowerCase() === 'descending') {
            sorted.reverse();
          }
          const expected = sorted.map((v) => v.id);
          return JSON.stringify((answer || []).map(String)) === JSON.stringify(expected);
        }

        return false;

      case 'fourPicsOneWord':
        return answer?.join('') === String(question.correctAnswerText || '').toUpperCase();

      default:
        return false;
    }
  };

  const handleSubmit = async (answer = userAnswer) => {
    if (!currentQuestion || isAnswered || isSubmitting) return;

    const correct = validateAnswer(currentQuestion, answer);
    setUserAnswer(answer);
    setIsCorrect(correct);
    setIsAnswered(true);
    setSubmitError('');
    setQuestionsAnswered((prev) => prev + 1);

    if (correct) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      const scoreIncrement = Math.min(10, 5 + newStreak);
      setSmartScore((prev) => Math.min(100, prev + scoreIncrement));

      const newTokens = tokensCollected + 1;
      setTokensCollected(newTokens);
      if (newTokens >= currentChallengeStage.tokensNeeded && currentStage < 2) {
        setCurrentStage(currentStage + 1);
        setTokensCollected(0);
      }
    } else {
      setStreak(0);
      setSmartScore((prev) => Math.max(0, prev - 5));
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/practice/${microskillId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: getOrCreateStudentId(),
          questionId: currentQuestion.id,
          isCorrect: correct,
          answer,
          seenQuestionIds,
        }),
      });
      const payload = await res.json();

      if (!res.ok) {
        setSubmitError(payload.error || 'Could not fetch next adaptive question.');
        setNextQuestion(null);
      } else {
        const upcoming = payload.nextQuestion ?? null;
        setNextQuestion(upcoming);
        if (upcoming?.id) {
          setSeenQuestionIds((prev) =>
            prev.includes(String(upcoming.id)) ? prev : [...prev, String(upcoming.id)]
          );
        }
      }
    } catch {
      setSubmitError('Could not fetch next adaptive question.');
      setNextQuestion(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnswer = (answer) => {
    setUserAnswer(answer);
    const effectiveQuestion = withSubmitBehavior(currentQuestion);
    if (effectiveQuestion && !effectiveQuestion.showSubmitButton) {
      handleSubmit(answer);
    }
  };

  const handleNext = () => {
    if (transitionStage !== 'idle') return;
    setTransitionStage('exit');
    setTimeout(() => {
      setCurrentQuestion(nextQuestion);
      setNextQuestion(null);
      setUserAnswer(null);
      setIsAnswered(false);
      setIsCorrect(false);
      setSubmitError('');
      setTransitionStage('enter');
      setTimeout(() => setTransitionStage('idle'), 260);
    }, 180);
  };

  useEffect(() => {
    if (!isAnswered || !isCorrect || isSubmitting || submitError) return;

    const timer = setTimeout(() => {
      if (nextQuestion) {
        if (transitionStage !== 'idle') return;
        setTransitionStage('exit');
        setTimeout(() => {
          setCurrentQuestion(nextQuestion);
          setNextQuestion(null);
          setUserAnswer(null);
          setIsAnswered(false);
          setIsCorrect(false);
          setSubmitError('');
          setTransitionStage('enter');
          setTimeout(() => setTransitionStage('idle'), 260);
        }, 180);
      } else {
        setCurrentQuestion(null);
        setUserAnswer(null);
        setIsAnswered(false);
        setIsCorrect(false);
        setSubmitError('');
      }
    }, 850);

    return () => clearTimeout(timer);
  }, [isAnswered, isCorrect, isSubmitting, nextQuestion, submitError, transitionStage]);

  if (loadingQuestion) {
    return (
      <div className={styles.container}>
        <div className={styles.completionCard}>
          <h1>Loading practice...</h1>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className={styles.container}>
        <div className={styles.completionCard}>
          <h1>Practice Complete</h1>
          {submitError && <p>{submitError}</p>}
          <p>Final SmartScore: <strong>{smartScore}</strong></p>
          <p>Questions Answered: <strong>{questionsAnswered}</strong></p>
          <Link href="/" className={styles.homeButton}>Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.mobileProgress}>
        <div className={styles.mobileProgressLeft}>
          <div className={styles.mobileProgressItem}>
            <span className={styles.mobileProgressLabel}>Questions</span>
            <span className={styles.mobileProgressValue}>{questionsAnswered}</span>
          </div>
          <div className={styles.mobileProgressItem}>
            <span className={styles.mobileProgressLabel}>Time</span>
            <span className={styles.mobileProgressValue}>{time.mins}:{time.secs}</span>
          </div>
        </div>
        <div className={styles.mobileProgressCenter}>
          <div className={styles.mobileSkillName}>{microskill?.code || 'Skill'}</div>
        </div>
        <div className={styles.mobileProgressRight}>
          <div className={styles.mobileProgressItem}>
            <span className={styles.mobileProgressLabel}>SmartScore</span>
            <span className={styles.mobileProgressValue}>{smartScore}</span>
          </div>
        </div>
      </div>

      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <Link href="/" className={styles.logo}><span>IXL</span></Link>
          <div className={styles.skillTag}>{skillTitle}</div>
        </div>
        <div className={styles.topBarStats}>
          <div className={styles.statPill}><span className={styles.statLabel}>Questions</span><strong>{questionsAnswered}</strong></div>
          <div className={styles.statPill}><span className={styles.statLabel}>Time</span><strong>{time.mins}:{time.secs}</strong></div>
          <div className={styles.statPill}><span className={styles.statLabel}>SmartScore</span><strong>{smartScore}</strong></div>
        </div>
      </header>

      <div className={styles.breadcrumb}>
        <Link href="/">{grade?.name || 'Grade'}</Link>
        <span className={styles.breadcrumbSeparator}>›</span>
        <span>{subject?.name || 'Subject'}</span>
        <span className={styles.breadcrumbSeparator}>›</span>
        <span>{microskill?.code || 'Skill'}</span>
      </div>

      <div className={styles.layout}>
        <main className={styles.mainContent}>
          <div className={styles.headerActions}>
            <button className={styles.exampleButton}><span className={styles.buttonIcon}>💡</span>Learn with an example</button>
            <span className={styles.orText}>or</span>
            <button className={styles.videoButton}><span className={styles.buttonIcon}>▶</span>Watch a video</button>
          </div>

          <div
            className={`${styles.questionStage} ${
              transitionStage === 'exit'
                ? styles.questionExit
                : transitionStage === 'enter'
                  ? styles.questionEnter
                  : ''
            }`}
          >
          <QuestionRenderer
            question={withSubmitBehavior(currentQuestion)}
            userAnswer={userAnswer}
            onAnswer={handleAnswer}
            onSubmit={handleSubmit}
            isAnswered={isAnswered}
            isCorrect={isCorrect}
            />
          </div>

          {!isAnswered && (
            <div className={styles.workItOutContainer}>
              <button className={styles.workItOutButton}>✏️ Work it out</button>
            </div>
          )}

          {submitError && <p className={styles.solution}>{submitError}</p>}

          {isAnswered && isCorrect && (
            <div className={`${styles.feedback} ${styles.correct}`}>
              <div className={styles.feedbackIcon}>✓</div>
              <div className={styles.feedbackContent}>
                <h3>Great job!</h3>
                <p className={styles.solution}>
                  {isSubmitting ? 'Loading next question...' : 'Preparing your next question...'}
                </p>
                {isSubmitting && (
                  <div className={styles.nextLoader} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </div>
            </div>
          )}

          {isAnswered && !isCorrect && (
            <div className={`${styles.feedback} ${styles.incorrect}`}>
              <div className={styles.feedbackIcon}>✗</div>
              <div className={styles.feedbackContent}>
                <h3>Not quite</h3>
                <p className={styles.solution}>{currentQuestion.solution}</p>
                <button onClick={handleNext} disabled={isSubmitting} className={styles.nextButton}>
                  {isSubmitting ? 'Loading...' : nextQuestion ? 'Next Question →' : 'Finish →'}
                </button>
              </div>
            </div>
          )}
        </main>

        <aside className={styles.sidebar}>
          <div className={styles.sidebarCard}>
            <div className={styles.sidebarLabel}>Questions answered</div>
            <div className={styles.sidebarValue}>{questionsAnswered}</div>
          </div>

          <div className={styles.sidebarCard}>
            <div className={styles.sidebarLabel}>Time elapsed</div>
            <div className={styles.timerDisplay}>
              <div className={styles.timeUnit}><div className={styles.timeValue}>{time.hrs}</div><div className={styles.timeLabel}>HR</div></div>
              <div className={styles.timeUnit}><div className={styles.timeValue}>{time.mins}</div><div className={styles.timeLabel}>MIN</div></div>
              <div className={styles.timeUnit}><div className={styles.timeValue}>{time.secs}</div><div className={styles.timeLabel}>SEC</div></div>
            </div>
          </div>

          <div className={styles.sidebarCard}>
            <div className={styles.challengeHeader}>Challenge</div>
            <div className={styles.stageLabel}>{currentChallengeStage.label}</div>
            <div className={styles.tokenInfo}>Collect {currentChallengeStage.tokensNeeded} tokens</div>
            <div className={styles.tokens}>
              {Array.from({ length: currentChallengeStage.tokensNeeded }).map((_, i) => (
                <div key={i} className={`${styles.token} ${i < tokensCollected ? styles.collected : ''}`} />
              ))}
            </div>
          </div>

          <a href="#" className={styles.teacherTools}>🛠️ Teacher tools ›</a>
        </aside>
      </div>

      <div className={styles.pencilIcon} title="Work it out">✏️</div>
    </div>
  );
}
