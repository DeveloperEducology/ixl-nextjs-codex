import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { mapDbQuestion } from '@/lib/practice/questionMapper';

const SKILL_COLUMNS = ['micro_skill_id', 'microskill_id'];
const ORDER_COLUMNS = ['sort_order', 'idx', 'created_at', 'id'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

function normalizeDifficulty(value) {
  const str = String(value ?? '').trim().toLowerCase();
  if (DIFFICULTIES.includes(str)) return str;
  return 'medium';
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

  const targetPool = remaining.filter(
    (q) => normalizeDifficulty(q.difficulty) === targetDifficulty
  );

  const fallbackPool = remaining.filter(
    (q) => normalizeDifficulty(q.difficulty) === currentDifficulty
  );

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
      if (!error.message?.includes(skillColumn) && !error.message?.includes(orderColumn)) {
        break;
      }
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

    if (!error) {
      return new Set((data ?? []).map((r) => String(r.question_id)));
    }

    if (!error.message?.includes(skillColumn)) {
      break;
    }
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

    if (!error.message?.includes(skillColumn)) {
      return;
    }
  }
}

export async function POST(req, { params }) {
  const { microskillId } = await params;

  let payload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const {
    studentId = null,
    questionId,
    isCorrect,
    answer = null,
    seenQuestionIds = [],
  } = payload ?? {};

  if (!questionId || typeof isCorrect !== 'boolean') {
    return NextResponse.json(
      { error: 'questionId and isCorrect are required.' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured on server.' },
      { status: 500 }
    );
  }

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
        nextQuestion: mapDbQuestion(nextRow),
      });
    }
  }

  let questions;
  try {
    questions = await fetchQuestionsByMicroskill(supabase, microskillId);
  } catch (err) {
    return NextResponse.json(
      { error: err.message ?? 'Failed to fetch questions.' },
      { status: 500 }
    );
  }

  const attemptedIds = await fetchAttemptedIds(supabase, studentId, microskillId);
  const clientSeenIds = new Set(
    Array.isArray(seenQuestionIds) ? seenQuestionIds.map((id) => String(id)) : []
  );
  const excludedIds = new Set([...attemptedIds, ...clientSeenIds, String(questionId)]);

  const unseen = questions.filter((q) => !excludedIds.has(String(q.id)));

  const nextQuestion = chooseAdaptiveQuestion(
    unseen.length > 0 ? unseen : questions,
    questionId,
    isCorrect
  );

  return NextResponse.json({
    source: 'supabase_adaptive',
    nextQuestion: nextQuestion ? mapDbQuestion(nextQuestion) : null,
  });
}
