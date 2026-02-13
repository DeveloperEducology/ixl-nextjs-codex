import 'server-only';

import { createServerClient } from '@/lib/supabase/server';
import {
  grades as fallbackGrades,
  subjects as fallbackSubjects,
  units as fallbackUnits,
  microskills as fallbackMicroskills,
} from '@/data/curriculum';

const ORDER_COLUMNS = ['sort_order', 'idx', 'created_at', 'id'];
const TABLES = {
  grades: ['grades'],
  subjects: ['subjects'],
  units: ['units'],
  microskills: ['micro_skills', 'microskills'],
};

async function fetchRows(
  supabase,
  tableCandidates,
  {
    select = '*',
    filters = [],
    orderColumns = ORDER_COLUMNS,
  } = {}
) {
  if (!supabase) return null;

  for (const table of tableCandidates) {
    for (const orderColumn of orderColumns) {
      let query = supabase.from(table).select(select);
      for (const filter of filters) {
        query = query.eq(filter.column, filter.value);
      }

      const { data, error } = await query.order(orderColumn, { ascending: true });
      if (!error) return data ?? [];
    }

    let fallbackQuery = supabase.from(table).select(select);
    for (const filter of filters) {
      fallbackQuery = fallbackQuery.eq(filter.column, filter.value);
    }

    const { data: unorderedData, error: unorderedError } = await fallbackQuery;
    if (!unorderedError) return unorderedData ?? [];
  }

  return null;
}

function sortByOrder(list) {
  return [...(list || [])].sort((a, b) => {
    const aOrder = Number(a?.sort_order ?? a?.idx ?? 0);
    const bOrder = Number(b?.sort_order ?? b?.idx ?? 0);
    return aOrder - bOrder;
  });
}

async function getAllCurriculumRows() {
  const supabase = createServerClient();

  const [gradesRows, subjectsRows, unitsRows, microskillsRows] = await Promise.all([
    fetchRows(supabase, TABLES.grades),
    fetchRows(supabase, TABLES.subjects),
    fetchRows(supabase, TABLES.units),
    fetchRows(supabase, TABLES.microskills),
  ]);

  return {
    grades: gradesRows ?? fallbackGrades,
    subjects: subjectsRows ?? fallbackSubjects,
    units: unitsRows ?? fallbackUnits,
    microskills: microskillsRows ?? fallbackMicroskills,
  };
}

export async function getHomeGradesData() {
  const { grades, subjects, units, microskills } = await getAllCurriculumRows();

  const skillsPerUnit = microskills.reduce((acc, skill) => {
    const unitId = skill.unit_id;
    acc[unitId] = (acc[unitId] || 0) + 1;
    return acc;
  }, {});

  const unitsBySubject = units.reduce((acc, unit) => {
    const subjectId = unit.subject_id;
    if (!acc[subjectId]) acc[subjectId] = [];
    acc[subjectId].push(unit);
    return acc;
  }, {});

  const subjectsByGrade = subjects.reduce((acc, subject) => {
    const gradeId = subject.grade_id;
    const subjectUnits = unitsBySubject[subject.id] || [];
    const skillCount = subjectUnits.reduce((sum, unit) => sum + (skillsPerUnit[unit.id] || 0), 0);

    if (!acc[gradeId]) acc[gradeId] = [];
    acc[gradeId].push({
      ...subject,
      skillCount,
    });
    return acc;
  }, {});

  return sortByOrder(grades).map((grade) => ({
    ...grade,
    subjects: sortByOrder(subjectsByGrade[grade.id] || []),
  }));
}

export async function getSkillsPageData(gradeId, subjectSlug) {
  const { grades, subjects, units, microskills } = await getAllCurriculumRows();

  const grade = grades.find((g) => String(g.id) === String(gradeId)) || null;
  const gradeSubjects = sortByOrder(subjects.filter((s) => String(s.grade_id) === String(gradeId)));
  const currentSubject = gradeSubjects.find((s) => s.slug === subjectSlug) || null;

  if (!grade || !currentSubject) {
    return { grade: null, subjects: [], currentSubject: null, units: [] };
  }

  const currentUnits = sortByOrder(
    units.filter((u) => String(u.subject_id) === String(currentSubject.id))
  );

  const microskillsByUnitId = microskills.reduce((acc, skill) => {
    const unitId = String(skill.unit_id);
    if (!acc[unitId]) acc[unitId] = [];
    acc[unitId].push(skill);
    return acc;
  }, {});

  const unitsWithMicroskills = currentUnits.map((unit) => ({
    ...unit,
    microskills: sortByOrder(microskillsByUnitId[String(unit.id)] || []),
  }));

  return {
    grade,
    subjects: gradeSubjects,
    currentSubject,
    units: unitsWithMicroskills,
  };
}

export async function getMicroskillContextById(microskillId) {
  const { grades, subjects, units, microskills } = await getAllCurriculumRows();

  const microskill = microskills.find((m) => String(m.id) === String(microskillId)) || null;
  if (!microskill) {
    return { grade: null, subject: null, unit: null, microskill: null };
  }

  const unit = units.find((u) => String(u.id) === String(microskill.unit_id)) || null;
  const subject = unit
    ? subjects.find((s) => String(s.id) === String(unit.subject_id)) || null
    : null;
  const grade = subject
    ? grades.find((g) => String(g.id) === String(subject.grade_id)) || null
    : null;

  return { grade, subject, unit, microskill };
}
