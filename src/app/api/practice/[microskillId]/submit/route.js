import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { mapDbQuestion } from '@/lib/practice/questionMapper';
import { resolveMicroskillIdByKey } from '@/lib/curriculum/server';

const SKILL_COLUMNS = ['micro_skill_id', 'microskill_id'];
const ORDER_COLUMNS = ['sort_order', 'idx', 'created_at', 'id'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

function toPublicQuestion(question) {
  if (!question) return null;

  return {
    id: question.id,
    microSkillId: question.microSkillId ?? null,
    type: question.type,
    parts: question.parts ?? [],
    options: question.options ?? [],
    items: question.items ?? [],
    dragItems: question.dragItems ?? [],
    dropGroups: question.dropGroups ?? [],
    adaptiveConfig: question.adaptiveConfig ?? null,
    isMultiSelect: Boolean(question.isMultiSelect),
    isVertical: Boolean(question.isVertical),
    showSubmitButton: Boolean(question.showSubmitButton),
  };
}

function parseMaybeJson(value, fallback = null) {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const str = String(value ?? '').trim();
  if (!str) return null;
  const match = str.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDifficulty(value) {
  const str = String(value ?? '').trim().toLowerCase();
  if (DIFFICULTIES.includes(str)) return str;
  return 'medium';
}

function getOptionLabel(option, index) {
  if (typeof option === 'object' && option !== null) {
    const label = option.label ?? option.text ?? '';
    if (label) return String(label);
  }
  if (typeof option === 'string') {
    const trimmed = option.trim();
    if (
      !trimmed.startsWith('<') &&
      !/^https?:\/\//i.test(trimmed) &&
      !trimmed.startsWith('data:image/')
    ) {
      return option;
    }
  }
  return `Option ${index + 1}`;
}

function validateAnswer(question, answer) {
  if (!question) return false;

  switch (question.type) {
    case 'mcq':
    case 'imageChoice':
      if (question.isMultiSelect) {
        const selected = Array.isArray(answer) ? [...answer].map(Number).sort() : [];
        const correct = Array.isArray(question.correctAnswerIndices)
          ? [...question.correctAnswerIndices].map(Number).sort()
          : [];
        return JSON.stringify(selected) === JSON.stringify(correct);
      }
      return Number(answer) === Number(question.correctAnswerIndex);

    case 'textInput':
      return String(answer ?? '').trim().toLowerCase() === String(question.correctAnswerText ?? '').trim().toLowerCase();

    case 'fillInTheBlank': {
      const correctAnswers = parseMaybeJson(question.correctAnswerText, {});
      if (!correctAnswers || typeof correctAnswers !== 'object') return false;
      return Object.keys(correctAnswers).every((key) => {
        return String(answer?.[key] ?? '').trim().toLowerCase() === String(correctAnswers[key]).trim().toLowerCase();
      });
    }

    case 'dragAndDrop':
      return (question.dragItems || [])
        .filter((item) => item.targetGroupId != null && String(item.targetGroupId).trim() !== '')
        .every((item) => String(answer?.[item.id] ?? '') === String(item.targetGroupId));

    case 'sorting': {
      const expectedOrder = parseMaybeJson(question.correctAnswerText, null);
      if (Array.isArray(expectedOrder) && expectedOrder.length > 0) {
        return JSON.stringify((answer || []).map(String)) === JSON.stringify(expectedOrder.map(String));
      }

      if ((question.items || []).some((item) => item.correctPosition != null)) {
        const expectedByPosition = [...(question.items || [])]
          .sort((a, b) => Number(a.correctPosition ?? 0) - Number(b.correctPosition ?? 0))
          .map((item) => String(item.id));
        return JSON.stringify((answer || []).map(String)) === JSON.stringify(expectedByPosition);
      }
      return false;
    }

    case 'fourPicsOneWord':
      return (Array.isArray(answer) ? answer.join('') : String(answer ?? '')).toUpperCase() === String(question.correctAnswerText ?? '').toUpperCase();

    case 'measure': {
      const expected = parseNumber(question.correctAnswerText);
      const actual = parseNumber(answer);
      if (expected == null || actual == null) return false;
      return Math.abs(actual - expected) < 0.0001;
    }

    default:
      return false;
  }
}

function buildFeedback(question) {
  const feedback = {
    solution: question?.solution ?? '',
    correctAnswerDisplay: '',
    correctOptionIndices: [],
  };
  if (!question) return feedback;

  switch (question.type) {
    case 'mcq':
    case 'imageChoice':
      if (question.isMultiSelect) {
        const indices = Array.isArray(question.correctAnswerIndices) ? question.correctAnswerIndices : [];
        feedback.correctOptionIndices = indices.map((i) => Number(i)).filter(Number.isFinite);
        feedback.correctAnswerDisplay = feedback.correctOptionIndices
          .map((idx) => getOptionLabel(question.options?.[idx], idx))
          .join(', ');
        return feedback;
      }
      feedback.correctOptionIndices = [Number(question.correctAnswerIndex)].filter(Number.isFinite);
      feedback.correctAnswerDisplay = feedback.correctOptionIndices.length > 0
        ? getOptionLabel(question.options?.[feedback.correctOptionIndices[0]], feedback.correctOptionIndices[0])
        : '';
      return feedback;

    case 'fillInTheBlank': {
      const parsed = parseMaybeJson(question.correctAnswerText, {});
      feedback.correctAnswerDisplay = parsed && typeof parsed === 'object'
        ? Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join(', ')
        : String(question.correctAnswerText ?? '');
      return feedback;
    }

    case 'sorting': {
      const orderedIds = parseMaybeJson(question.correctAnswerText, []);
      if (Array.isArray(orderedIds) && orderedIds.length > 0) {
        const labelById = new Map((question.items || []).map((item) => [String(item.id), String(item.content ?? item.id)]));
        feedback.correctAnswerDisplay = orderedIds.map((id) => labelById.get(String(id)) || String(id)).join(', ');
      } else {
        feedback.correctAnswerDisplay = String(question.correctAnswerText ?? '');
      }
      return feedback;
    }

    default:
      feedback.correctAnswerDisplay = String(question.correctAnswerText ?? '');
      return feedback;
  }
}

function chooseAdaptiveQuestion(candidates, currentQuestionId, isCorrect) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const current = candidates.find((q) => String(q.id) === String(currentQuestionId));
  const remaining = candidates.filter((q) => String(q.id) !== String(currentQuestionId));
  if (remaining.length === 0) return null;

  const currentDifficulty = normalizeDifficulty(current?.difficulty);
  const currentIdx = DIFFICULTIES.indexOf(currentDifficulty);
  const targetIdx = Math.min(
    DIFFICULTIES.length - 1,
    Math.max(0, currentIdx + (isCorrect ? 1 : -1))
  );
  const targetDifficulty = DIFFICULTIES[targetIdx];

  const targetPool = remaining.filter((q) => normalizeDifficulty(q.difficulty) === targetDifficulty);
  const fallbackPool = remaining.filter((q) => normalizeDifficulty(q.difficulty) === currentDifficulty);
  const pool = targetPool.length > 0 ? targetPool : (fallbackPool.length > 0 ? fallbackPool : remaining);

  const currentComplexity = Number(current?.complexity ?? current?.idx ?? current?.sort_order ?? 0);
  return [...pool].sort((a, b) => {
    const aComplexity = Number(a?.complexity ?? a?.idx ?? a?.sort_order ?? 0);
    const bComplexity = Number(b?.complexity ?? b?.idx ?? b?.sort_order ?? 0);
    return Math.abs(aComplexity - currentComplexity) - Math.abs(bComplexity - currentComplexity);
  })[0];
}

async function fetchQuestionsByMicroskill(supabase, microskillId) {
  let data = null;
  let error = null;

  for (const skillColumn of SKILL_COLUMNS) {
    for (const orderColumn of ORDER_COLUMNS) {
      ({ data, error } = await supabase
        .from('questions')
        .select('*')
        .eq(skillColumn, microskillId)
        .order(orderColumn, { ascending: true }));

      if (!error) return data ?? [];
      if (!error.message?.includes(skillColumn) && !error.message?.includes(orderColumn)) break;
    }
  }

  throw new Error(error?.message ?? 'Failed to fetch questions for microskill.');
}

async function fetchAttemptedIds(supabase, studentId, microskillId) {
  if (!studentId) return new Set();

  for (const skillColumn of SKILL_COLUMNS) {
    const { data, error } = await supabase
      .from('student_question_log')
      .select('question_id')
      .eq('student_id', studentId)
      .eq(skillColumn, microskillId);

    if (!error) return new Set((data ?? []).map((r) => String(r.question_id)));
    if (!error.message?.includes(skillColumn)) break;
  }

  return new Set();
}

async function insertLog(supabase, payload) {
  for (const skillColumn of SKILL_COLUMNS) {
    const logPayload = {
      student_id: payload.studentId,
      question_id: payload.questionId,
      is_correct: payload.isCorrect,
      answer_payload: payload.answer,
      [skillColumn]: payload.microskillId,
    };

    const { error } = await supabase.from('student_question_log').insert(logPayload);
    if (!error) return;
    if (!error.message?.includes(skillColumn)) return;
  }
}

export async function POST(req, { params }) {
  const { microskillId: microskillKey } = await params;
  const microskillId = await resolveMicroskillIdByKey(microskillKey);
  if (!microskillId) {
    return NextResponse.json({ error: 'Microskill not found.' }, { status: 404 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const {
    studentId = null,
    questionId,
    answer = null,
    seenQuestionIds = [],
  } = payload ?? {};

  if (!questionId) {
    return NextResponse.json({ error: 'questionId is required.' }, { status: 400 });
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured on server.' }, { status: 500 });
  }

  let rawQuestions;
  try {
    rawQuestions = await fetchQuestionsByMicroskill(supabase, microskillId);
  } catch (err) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch questions.' }, { status: 500 });
  }

  const mappedQuestions = rawQuestions.map(mapDbQuestion);
  const currentQuestion = mappedQuestions.find((q) => String(q.id) === String(questionId));
  if (!currentQuestion) {
    return NextResponse.json({ error: 'Question not found for this microskill.' }, { status: 404 });
  }

  const isCorrect = validateAnswer(currentQuestion, answer);
  const feedback = buildFeedback(currentQuestion);

  await insertLog(supabase, { studentId, microskillId, questionId, isCorrect, answer });

  const { data: rpcData, error: rpcError } = await supabase.rpc('submit_and_get_next', {
    p_student_id: studentId,
    p_microskill_id: microskillId,
    p_question_id: questionId,
    p_is_correct: isCorrect,
    p_answer_payload: answer,
  });

  if (!rpcError && rpcData) {
    const nextRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (nextRow) {
      return NextResponse.json({
        source: 'supabase_rpc',
        isCorrect,
        feedback,
        nextQuestion: toPublicQuestion(mapDbQuestion(nextRow)),
      });
    }
  }

  const attemptedIds = await fetchAttemptedIds(supabase, studentId, microskillId);
  const clientSeenIds = new Set(Array.isArray(seenQuestionIds) ? seenQuestionIds.map((id) => String(id)) : []);
  const excludedIds = new Set([...attemptedIds, ...clientSeenIds, String(questionId)]);
  const unseen = mappedQuestions.filter((q) => !excludedIds.has(String(q.id)));

  const nextQuestion = chooseAdaptiveQuestion(unseen.length > 0 ? unseen : mappedQuestions, questionId, isCorrect);

  return NextResponse.json({
    source: 'supabase_adaptive',
    isCorrect,
    feedback,
    nextQuestion: toPublicQuestion(nextQuestion),
  });
}
