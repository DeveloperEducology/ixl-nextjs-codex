import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { mapDbQuestion } from '@/lib/practice/questionMapper';

const SKILL_COLUMNS = ['micro_skill_id', 'microskill_id'];
const ORDER_COLUMNS = ['sort_order', 'idx', 'created_at', 'id'];

export async function GET(_req, { params }) {
  const { microskillId } = await params;
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

  const firstQuestion = Array.isArray(data) && data.length > 0 ? mapDbQuestion(data[0]) : null;

  return NextResponse.json({
    source: 'supabase',
    question: firstQuestion,
  });
}
