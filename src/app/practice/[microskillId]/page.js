'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import QuestionRenderer from '@/components/practice/QuestionRenderer';
import QuestionParts from '@/components/practice/QuestionParts';
import styles from './practice.module.css';

const CHALLENGE_STAGES = [
  { stage: 1, tokensNeeded: 5, label: 'Stage 1 of 3' },
  { stage: 2, tokensNeeded: 10, label: 'Stage 2 of 3' },
  { stage: 3, tokensNeeded: 15, label: 'Stage 3 of 3' },
];
const SUBMIT_TIMEOUT_MS = 8000;
const SUBMIT_RETRY_DELAYS_MS = [300, 700];

function parseSolutionParts(solution) {
  if (Array.isArray(solution)) return solution;

  if (solution && typeof solution === 'object') {
    if (solution.type && solution.content !== undefined) return [solution];
    return null;
  }

  if (typeof solution !== 'string') return null;
  const trimmed = solution.trim();
  if (!trimmed || (!trimmed.startsWith('[') && !trimmed.startsWith('{'))) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && parsed.type && parsed.content !== undefined) {
      return [parsed];
    }
  } catch {
    return null;
  }

  return null;
}

function parseMaybeJson(text, fallback = null) {
  if (typeof text !== 'string') return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function getCorrectAnswerDisplay(question) {
  if (!question) return '';

  switch (question.type) {
    case 'mcq':
    case 'imageChoice': {
      if (question.isMultiSelect) {
        const indices = Array.isArray(question.correctAnswerIndices) ? question.correctAnswerIndices : [];
        const labels = indices.map((idx) => {
          const option = question.options?.[idx];
          if (typeof option === 'string' && !option.trim().startsWith('<') && !/^https?:\/\//i.test(option)) {
            return option;
          }
          return `Option ${Number(idx) + 1}`;
        });
        return labels.join(', ');
      }

      const idx = Number(question.correctAnswerIndex);
      if (!Number.isFinite(idx) || idx < 0) return '';
      const option = question.options?.[idx];
      if (typeof option === 'string' && !option.trim().startsWith('<') && !/^https?:\/\//i.test(option)) {
        return option;
      }
      return `Option ${idx + 1}`;
    }

    case 'textInput':
    case 'measure':
    case 'fourPicsOneWord':
      return String(question.correctAnswerText || '');

    case 'fillInTheBlank': {
      const parsed = parseMaybeJson(question.correctAnswerText, {});
      if (!parsed || typeof parsed !== 'object') return String(question.correctAnswerText || '');
      return Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join(', ');
    }

    case 'sorting': {
      const orderedIds = parseMaybeJson(question.correctAnswerText, []);
      if (Array.isArray(orderedIds) && orderedIds.length > 0 && Array.isArray(question.items)) {
        const labelById = new Map(question.items.map((item) => [String(item.id), String(item.content ?? item.id)]));
        return orderedIds.map((id) => labelById.get(String(id)) || String(id)).join(', ');
      }
      return String(question.correctAnswerText || '');
    }

    default:
      return String(question.correctAnswerText || '');
  }
}

function isVisualOption(option) {
  if (typeof option !== 'string') return false;
  const value = option.trim().toLowerCase();
  return (
    value.startsWith('<svg') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('/') ||
    value.startsWith('data:image/')
  );
}

function getOptionLabel(option, index) {
  if (typeof option === 'object' && option !== null) {
    const label = option.label ?? option.text ?? '';
    if (label) return String(label);
  }
  if (typeof option === 'string' && !isVisualOption(option)) return option;
  return `Option ${index + 1}`;
}

function getSelectedAnswerDisplay(question, answer) {
  if (!question) return '';

  if (question.type === 'mcq' || question.type === 'imageChoice') {
    if (question.isMultiSelect) {
      const selected = Array.isArray(answer) ? answer : [];
      if (selected.length === 0) return 'No option selected';
      return selected
        .map((idx) => getOptionLabel(question.options?.[idx], Number(idx)))
        .join(', ');
    }
    const idx = Number(answer);
    if (!Number.isFinite(idx)) return 'No option selected';
    return getOptionLabel(question.options?.[idx], idx);
  }

  if (question.type === 'fillInTheBlank') {
    if (!answer || typeof answer !== 'object') return 'No answer';
    return Object.entries(answer).map(([k, v]) => `${k}: ${v}`).join(', ');
  }

  if (Array.isArray(answer)) {
    return answer.join(', ');
  }

  if (answer && typeof answer === 'object') {
    return JSON.stringify(answer);
  }

  return String(answer ?? '');
}

function getOrCreateStudentId() {
  if (typeof window === 'undefined') return null;

  const key = 'practice_student_id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const created = `student-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);
  return created;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submitWithRetry(url, body) {
  let lastErrorMessage = 'Could not fetch next adaptive question.';

  for (let attempt = 0; attempt <= SUBMIT_RETRY_DELAYS_MS.length; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = await res.json();
      clearTimeout(timeoutId);

      if (!res.ok) {
        lastErrorMessage = payload.error || lastErrorMessage;
        throw new Error(lastErrorMessage);
      }

      return payload;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error?.name === 'AbortError') {
        lastErrorMessage = 'Request timed out. Please try again.';
      } else if (error?.message) {
        lastErrorMessage = error.message;
      }

      if (attempt < SUBMIT_RETRY_DELAYS_MS.length) {
        await delay(SUBMIT_RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw new Error(lastErrorMessage);
    }
  }

  throw new Error(lastErrorMessage);
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
  const [feedbackData, setFeedbackData] = useState(null);

  const [userAnswer, setUserAnswer] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);

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
  const solutionParts = parseSolutionParts(feedbackData?.solution);
  const correctAnswerDisplay = feedbackData?.correctAnswerDisplay || '';
  const selectedAnswerDisplay = getSelectedAnswerDisplay(currentQuestion, userAnswer);
  const isOptionType = currentQuestion?.type === 'mcq' || currentQuestion?.type === 'imageChoice';
  const selectedIndexSet = currentQuestion?.isMultiSelect
    ? new Set(Array.isArray(userAnswer) ? userAnswer.map((value) => Number(value)) : [])
    : new Set(Number.isFinite(Number(userAnswer)) ? [Number(userAnswer)] : []);
  const correctIndexSet = new Set(
    Array.isArray(feedbackData?.correctOptionIndices)
      ? feedbackData.correctOptionIndices.map((value) => Number(value))
      : []
  );

  useEffect(() => {
    let active = true;

    const loadFirstQuestion = async () => {
      setLoadingQuestion(true);
      setSubmitError('');
      setUserAnswer(null);
      setIsAnswered(false);
      setIsCorrect(null);
      setFeedbackData(null);
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

  const applyNextQuestion = (upcoming) => {
    if (upcoming) {
      setCurrentQuestion(upcoming);
      setNextQuestion(null);
      setUserAnswer(null);
      setIsAnswered(false);
      setIsCorrect(null);
      setFeedbackData(null);
      setSubmitError('');
      setTransitionStage('idle');
      return;
    }

    setCurrentQuestion(null);
    setUserAnswer(null);
    setIsAnswered(false);
    setIsCorrect(null);
    setFeedbackData(null);
    setSubmitError('');
    setTransitionStage('idle');
  };

  const handleSubmit = async (answer = userAnswer) => {
    if (!currentQuestion || isAnswered || isSubmitting) return;
    setSubmitError('');
    setFeedbackData(null);
    setUserAnswer(answer);
    setIsAnswered(true); // optimistic: hide question immediately
    setIsCorrect(null); // pending server verdict

    setIsSubmitting(true);
    try {
      const payload = await submitWithRetry(`/api/practice/${microskillId}/submit`, {
        studentId: getOrCreateStudentId(),
        questionId: currentQuestion.id,
        answer,
        seenQuestionIds,
      });

      const correct = Boolean(payload.isCorrect);
      setIsCorrect(correct);
      setFeedbackData(payload.feedback || null);
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

      const upcoming = payload.nextQuestion ?? null;
      setNextQuestion(upcoming);
      if (upcoming?.id) {
        setSeenQuestionIds((prev) =>
          prev.includes(String(upcoming.id)) ? prev : [...prev, String(upcoming.id)]
        );
      }

      // remove extra wait for correct answers; move immediately
      if (correct) {
        applyNextQuestion(upcoming);
      }
    } catch (error) {
      setSubmitError(error?.message || 'Could not fetch next adaptive question.');
      setNextQuestion(null);
      setIsAnswered(false);
      setIsCorrect(null);
      setFeedbackData(null);
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
    applyNextQuestion(nextQuestion);
  };

  if (loadingQuestion) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingScreen}>
          <img
            src="/wexls-logo.svg"
            alt="WEXLS"
            className={styles.loadingBrand}
          />
          <div className={styles.loadingSpinner} aria-label="Loading practice" role="status" />
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
          <Link href="/" className={styles.logo}><span>WEXLS</span></Link>
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
          {/* <div className={styles.headerActions}>
            <button className={styles.exampleButton}><span className={styles.buttonIcon}>💡</span>Learn with an example</button>
            <span className={styles.orText}>or</span>
            <button className={styles.videoButton}><span className={styles.buttonIcon}>▶</span>Watch a video</button>
          </div> */}

          {!isAnswered && (
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
          )}

          {!isAnswered && (
            <div className={styles.workItOutContainer}>
              <button className={styles.workItOutButton}>✏️ Work it out</button>
            </div>
          )}

          {submitError && <p className={styles.solution}>{submitError}</p>}

          {isAnswered && isCorrect === null && (
            <div className={`${styles.feedback} ${styles.correct}`}>
              <div className={styles.feedbackIcon}>…</div>
              <div className={styles.feedbackContent}>
                <h3>Checking your answer...</h3>
                <p className={styles.solution}>Loading next question...</p>
                <div className={styles.nextLoader} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}

          {isAnswered && isCorrect === true && (
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

          {isAnswered && isCorrect === false && (
            <div className={`${styles.feedback} ${styles.incorrect} ${styles.incorrectDetailed}`}>
              <h2 className={styles.incorrectTitle}>Sorry, incorrect...</h2>
              <div className={styles.correctAnswerRow}>
                <span className={styles.correctAnswerLabel}>The correct answer is:</span>
                <span className={styles.correctAnswerValue}>{correctAnswerDisplay || 'See explanation below'}</span>
              </div>

              <h3 className={styles.explanationHeading}>Explanation</h3>
              <div className={styles.reviewCard}>
                <h4 className={styles.reviewTitle}>Question</h4>
                <div className={styles.reviewQuestion}>
                  <QuestionParts parts={currentQuestion?.parts || []} />
                </div>

                {isOptionType && Array.isArray(currentQuestion?.options) && currentQuestion.options.length > 0 ? (
                  <div className={styles.reviewOptions}>
                    {currentQuestion.options.map((option, index) => (
                      <div
                        key={`review-opt-${index}`}
                        className={`${styles.reviewOption} ${selectedIndexSet.has(index) ? styles.reviewSelected : ''} ${correctIndexSet.has(index) ? styles.reviewCorrect : ''}`}
                      >
                        <span className={styles.reviewOptionLabel}>{getOptionLabel(option, index)}</span>
                        {selectedIndexSet.has(index) && <span className={styles.reviewTag}>Your choice</span>}
                        {correctIndexSet.has(index) && <span className={styles.reviewTagCorrect}>Correct</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.reviewAnswerLine}>
                    <strong>You answered:</strong> {selectedAnswerDisplay || 'No answer'}
                  </p>
                )}
              </div>

              {solutionParts ? (
                <div className={styles.solution}>
                  <QuestionParts parts={solutionParts} />
                </div>
              ) : (
                <p className={styles.solution}>{feedbackData?.solution || ''}</p>
              )}

              <button onClick={handleNext} disabled={isSubmitting} className={styles.nextButton}>
                {isSubmitting ? 'Loading...' : 'Got it'}
              </button>
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
