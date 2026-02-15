import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { mapDbQuestion } from '@/lib/practice/questionMapper';
import { resolveMicroskillIdByKey } from '@/lib/curriculum/server';

const SKILL_COLUMNS = ['micro_skill_id', 'microskill_id'];
const ORDER_COLUMNS = ['sort_order', 'idx', 'created_at', 'id'];

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

export async function GET(_req, { params }) {
  const { microskillId: microskillKey } = await params;
  const microskillId = await resolveMicroskillIdByKey(microskillKey);

  if (!microskillId) {
    return NextResponse.json(
      { error: 'Microskill not found.' },
      { status: 404 }
    );
  }

  const supabase = createServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured on server.' },
      { status: 500 }
    );
  }

  let data = null;
  let error = null;

  for (const skillColumn of SKILL_COLUMNS) {
    for (const orderColumn of ORDER_COLUMNS) {
      ({ data, error } = await supabase
        .from('questions')
        .select('*')
        .eq(skillColumn, microskillId)
        .order(orderColumn, { ascending: true }));

      if (!error) break;
      if (!error.message?.includes(skillColumn) && !error.message?.includes(orderColumn)) {
        break;
      }
    }
    if (!error) break;
  }

  if (error) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to fetch questions from Supabase.' },
      { status: 500 }
    );
  }

  const firstQuestion = Array.isArray(data) && data.length > 0 ? toPublicQuestion(mapDbQuestion(data[0])) : null;

  return NextResponse.json({
    source: 'supabase',
    question: firstQuestion,
  });
}
