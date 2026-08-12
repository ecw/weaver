import type { SchedulingInput } from '../types/solver.js';
import type { Course, Period, Section, Student, StudentRequest, Teacher, Term } from '../types/domain.js';
import type { RuleDefinition } from '../types/rules.js';
import type { CourseId, StudentId, TeacherId } from '../types/ids.js';
import type { MockPreset } from './presets.js';
import { mulberry32, shuffle, type Rng } from './rng.js';

const YEAR_TERMS: Term[] = [
  { id: 'YEAR', name: 'Full Year', type: 'year', parentId: null, startUnit: 1, endUnit: 12 },
  { id: 'S1', name: 'Semester 1', type: 'semester', parentId: 'YEAR', startUnit: 1, endUnit: 6 },
  { id: 'S2', name: 'Semester 2', type: 'semester', parentId: 'YEAR', startUnit: 7, endUnit: 12 },
  { id: 'Q1', name: 'Quarter 1', type: 'quarter', parentId: 'S1', startUnit: 1, endUnit: 3 },
  { id: 'Q2', name: 'Quarter 2', type: 'quarter', parentId: 'S1', startUnit: 4, endUnit: 6 },
  { id: 'Q3', name: 'Quarter 3', type: 'quarter', parentId: 'S2', startUnit: 7, endUnit: 9 },
  { id: 'Q4', name: 'Quarter 4', type: 'quarter', parentId: 'S2', startUnit: 10, endUnit: 12 },
];

function buildPeriods(count: number): Period[] {
  return Array.from({ length: count }, (_, i) => ({ id: `PER${i + 1}`, name: `Period ${i + 1}`, sortOrder: i + 1 }));
}

function makeTeacherPool(count: number): Teacher[] {
  return Array.from({ length: count }, (_, i) => ({ id: `T${i + 1}`, name: `Teacher ${i + 1}` }));
}

function rotatingPicker(teachers: Teacher[]): () => TeacherId {
  let i = 0;
  return () => teachers[i++ % teachers.length]!.id;
}

interface Accumulator {
  courses: Course[];
  sections: Section[];
  students: Student[];
  requests: StudentRequest[];
  rules: RuleDefinition[];
}

function emptyAccumulator(): Accumulator {
  return { courses: [], sections: [], students: [], requests: [], rules: [] };
}

function mergeInto(target: Accumulator, source: Accumulator): void {
  target.courses.push(...source.courses);
  target.sections.push(...source.sections);
  target.students.push(...source.students);
  target.requests.push(...source.requests);
  target.rules.push(...source.rules);
}

function addRequest(
  acc: Accumulator,
  studentId: StudentId,
  courseId: CourseId,
  priority: StudentRequest['priority'],
  extra: Partial<StudentRequest> = {},
): void {
  acc.requests.push({ id: `${studentId}-${courseId}`, studentId, courseId, priority, ...extra });
}

// ---------------------------------------------------------------------------
// Elementary (K-5): self-contained classrooms, one required request each.
// ---------------------------------------------------------------------------
function buildElementary(studentsPerGrade: number, teacherPicker: () => TeacherId): Accumulator {
  const acc = emptyAccumulator();
  const gradeNames = ['K', '1', '2', '3', '4', '5'];

  gradeNames.forEach((gname, idx) => {
    const grade = idx; // K = 0
    const courseId = `ELEM-${gname}`;
    acc.courses.push({ id: courseId, name: `Grade ${gname} Core`, minGrade: grade, maxGrade: grade });
    acc.sections.push({
      id: `${courseId}-A`,
      courseId,
      teacherId: teacherPicker(),
      termId: 'YEAR',
      periodId: 'PER1',
      capacity: Math.ceil(studentsPerGrade * 1.15),
    });

    for (let i = 1; i <= studentsPerGrade; i++) {
      const studentId = `E-${gname}-${String(i).padStart(2, '0')}`;
      acc.students.push({ id: studentId, name: `Elementary ${gname}-${i}`, gradeLevel: grade });
      addRequest(acc, studentId, courseId, 'required');
    }
  });

  return acc;
}

// ---------------------------------------------------------------------------
// Middle (6-8): core subjects, plus a team-taught cohort in grade-6 Science.
// ---------------------------------------------------------------------------
function buildMiddle(studentsPerGrade: number, teacherPicker: () => TeacherId): Accumulator {
  const acc = emptyAccumulator();
  const grades = [6, 7, 8];
  const subjects = ['MATH', 'ELA', 'SCIENCE', 'SOCIAL'] as const;
  const periodBySubject: Record<(typeof subjects)[number], string> = {
    MATH: 'PER1',
    ELA: 'PER2',
    SCIENCE: 'PER3',
    SOCIAL: 'PER4',
  };

  const cohortStudentIds: StudentId[] = [];

  for (const grade of grades) {
    for (const subject of subjects) {
      const courseId = `${subject}${grade}`;
      acc.courses.push({ id: courseId, name: `${subject} ${grade}`, minGrade: grade, maxGrade: grade });

      if (subject === 'SCIENCE' && grade === 6) {
        // Team-taught cohort: one shared section sized for the whole grade, not split A/B.
        acc.sections.push({
          id: `${courseId}-TEAM`,
          courseId,
          teacherId: teacherPicker(),
          termId: 'YEAR',
          periodId: periodBySubject.SCIENCE,
          capacity: studentsPerGrade + 2,
        });
        continue;
      }

      for (const suffix of ['A', 'B']) {
        acc.sections.push({
          id: `${courseId}-${suffix}`,
          courseId,
          teacherId: teacherPicker(),
          termId: 'YEAR',
          periodId: periodBySubject[subject],
          capacity: Math.ceil(studentsPerGrade * 0.65),
        });
      }
    }

    for (let i = 1; i <= studentsPerGrade; i++) {
      const studentId = `M-${grade}-${String(i).padStart(2, '0')}`;
      const isTeamBlue = grade === 6;
      acc.students.push({
        id: studentId,
        name: `Middle ${grade}-${i}`,
        gradeLevel: grade,
        cohortIds: isTeamBlue ? ['team-blue'] : undefined,
      });
      if (isTeamBlue) cohortStudentIds.push(studentId);

      for (const subject of subjects) {
        addRequest(acc, studentId, `${subject}${grade}`, 'required');
      }
    }
  }

  acc.rules.push({ type: 'cohort', id: 'team-blue-science', studentIds: cohortStudentIds, courseId: 'SCIENCE6' });

  return acc;
}

// ---------------------------------------------------------------------------
// High (9-12): core requirements plus one demonstration of every rule type.
// ---------------------------------------------------------------------------
function buildHigh(rng: Rng, studentsPerGrade: number, teacherPicker: () => TeacherId): Accumulator {
  const acc = emptyAccumulator();
  const grades = [9, 10, 11, 12];

  // Core requirements, one course per grade per subject.
  for (const grade of grades) {
    acc.courses.push({ id: `ENGLISH${grade}`, name: `English ${grade}`, minGrade: grade, maxGrade: grade });
    acc.courses.push({ id: `MATH${grade}`, name: `Math ${grade}`, minGrade: grade, maxGrade: grade });
    acc.courses.push({ id: `SOCIAL${grade}`, name: `Social Studies ${grade}`, minGrade: grade, maxGrade: grade });
    for (const [subject, periodId] of [
      ['ENGLISH', 'PER1'],
      ['MATH', 'PER2'],
      ['SOCIAL', 'PER4'],
    ] as const) {
      for (const suffix of ['A', 'B']) {
        acc.sections.push({
          id: `${subject}${grade}-${suffix}`,
          courseId: `${subject}${grade}`,
          teacherId: teacherPicker(),
          termId: 'YEAR',
          periodId,
          capacity: Math.ceil((studentsPerGrade * 0.65)),
        });
      }
    }
  }

  // Generic science requirement for grades 9-10 (the linked Bio Lab/Lecture pair below is the alternate path).
  for (const grade of [9, 10]) {
    const courseId = `SCIENCE${grade}`;
    acc.courses.push({ id: courseId, name: `Science ${grade}`, minGrade: grade, maxGrade: grade });
    for (const suffix of ['A', 'B']) {
      acc.sections.push({
        id: `${courseId}-${suffix}`,
        courseId,
        teacherId: teacherPicker(),
        termId: 'YEAR',
        periodId: 'PER3',
        capacity: Math.ceil(studentsPerGrade * 0.65),
      });
    }
  }

  // --- Linked sections: Biology Lab + Lecture, taken together. ---
  acc.courses.push({ id: 'BIOLAB', name: 'Biology Lab', minGrade: 9, maxGrade: 10 });
  acc.courses.push({ id: 'BIOLEC', name: 'Biology Lecture', minGrade: 9, maxGrade: 10 });
  acc.sections.push({ id: 'BIOLAB-A', courseId: 'BIOLAB', teacherId: teacherPicker(), termId: 'YEAR', periodId: 'PER3', capacity: 24 });
  acc.sections.push({ id: 'BIOLEC-A', courseId: 'BIOLEC', teacherId: teacherPicker(), termId: 'YEAR', periodId: 'PER5', capacity: 24 });
  acc.rules.push({
    type: 'linkedSections',
    id: 'bio-lab-lecture',
    sectionPairs: [['BIOLAB-A', 'BIOLEC-A']],
  });

  // --- Sequencing: Intro Programming (S1) before AP Programming (S2). ---
  acc.courses.push({ id: 'INTRO_CS', name: 'Intro to Programming' });
  acc.courses.push({ id: 'AP_CS', name: 'AP Programming', minGrade: 11 });
  acc.sections.push({ id: 'INTRO_CS-A', courseId: 'INTRO_CS', teacherId: teacherPicker(), termId: 'S1', periodId: 'PER8', capacity: 20 });
  acc.sections.push({ id: 'AP_CS-A', courseId: 'AP_CS', teacherId: teacherPicker(), termId: 'S2', periodId: 'PER8', capacity: 20 });
  acc.rules.push({ type: 'sequencing', id: 'intro-before-ap-cs', earlierCourseId: 'INTRO_CS', laterCourseId: 'AP_CS' });

  // --- Same teacher: Band and Jazz Band. ---
  const bandTeacher = teacherPicker();
  acc.courses.push({ id: 'BAND', name: 'Band' });
  acc.courses.push({ id: 'JAZZ_BAND', name: 'Jazz Band' });
  acc.sections.push({ id: 'BAND-A', courseId: 'BAND', teacherId: bandTeacher, termId: 'YEAR', periodId: 'PER6', capacity: 40 });
  acc.sections.push({ id: 'JAZZ_BAND-A', courseId: 'JAZZ_BAND', teacherId: bandTeacher, termId: 'YEAR', periodId: 'PER7', capacity: 20 });
  acc.rules.push({ type: 'sameTeacher', id: 'band-jazz-same-teacher', courseIdA: 'BAND', courseIdB: 'JAZZ_BAND' });

  // --- Mutual exclusion: Spanish I vs French I. Different periods on purpose, so any
  // student who ends up unable to take both is blocked by the mutualExclusion rule itself,
  // not incidentally by a period clash (which noDoubleBooking would also catch).
  acc.courses.push({ id: 'SPANISH1', name: 'Spanish I', minGrade: 9 });
  acc.courses.push({ id: 'FRENCH1', name: 'French I', minGrade: 9 });
  acc.sections.push({ id: 'SPANISH1-A', courseId: 'SPANISH1', teacherId: teacherPicker(), termId: 'YEAR', periodId: 'PER6', capacity: 28 });
  acc.sections.push({ id: 'FRENCH1-A', courseId: 'FRENCH1', teacherId: teacherPicker(), termId: 'YEAR', periodId: 'PER9', capacity: 28 });
  acc.rules.push({ type: 'mutualExclusion', id: 'spanish-french-exclusive', courseIdA: 'SPANISH1', courseIdB: 'FRENCH1' });

  // --- Reserved seats: Robotics carves out 5 seats for an IEP subgroup. ---
  acc.courses.push({ id: 'ROBOTICS', name: 'Robotics' });
  acc.sections.push({
    id: 'ROBOTICS-A',
    courseId: 'ROBOTICS',
    teacherId: teacherPicker(),
    termId: 'YEAR',
    periodId: 'PER8',
    capacity: 22,
    reservedSeats: [{ subgroupId: 'iep', seats: 5 }],
  });

  // --- Students ---
  const allStudentIds: StudentId[] = [];
  const studentsByGrade = new Map<number, StudentId[]>();
  for (const grade of grades) {
    const ids: StudentId[] = [];
    for (let i = 1; i <= studentsPerGrade; i++) {
      const studentId = `H-${grade}-${String(i).padStart(2, '0')}`;
      ids.push(studentId);
      allStudentIds.push(studentId);
    }
    studentsByGrade.set(grade, ids);
  }

  // Demo groups drawn as disjoint subsets so no single student is double-committed into
  // conflicting elective periods by accident. Desired sizes are scaled down (with a floor of
  // 1, pool permitting) relative to the 'full' preset's baseline of 25 students/grade, so a
  // smaller preset like 'small' still gets at least a token instance of every rule instead of
  // silently running out of students partway through (fixed counts previously overflowed the
  // pool at small scale and produced empty groups for whichever demo came last).
  const scale = Math.min(1, studentsPerGrade / 25);
  const desired = (base: number) => Math.max(1, Math.round(base * scale));

  const grade9And10 = [...(studentsByGrade.get(9) ?? []), ...(studentsByGrade.get(10) ?? [])];
  const shuffled9and10 = shuffle(rng, grade9And10);
  const bioLabGroup = new Set(shuffled9and10.slice(0, Math.min(desired(10), shuffled9and10.length)));

  const grade11And12 = [...(studentsByGrade.get(11) ?? []), ...(studentsByGrade.get(12) ?? [])];
  const shuffled11and12 = shuffle(rng, grade11And12);

  let offset = 0;
  const takeGroup = (desiredSize: number): Set<StudentId> => {
    const remaining = shuffled11and12.length - offset;
    const size = remaining <= 0 ? 0 : Math.min(desiredSize, remaining);
    const group = new Set(shuffled11and12.slice(offset, offset + size));
    offset += size;
    return group;
  };

  const csSequenceGroup = takeGroup(desired(8));
  const bandGroup = takeGroup(desired(10));
  const jazzSubgroup = new Set([...bandGroup].slice(0, Math.min(5, bandGroup.size)));
  const spanishOnlyGroup = takeGroup(desired(8));
  const frenchOnlyGroup = takeGroup(desired(8));
  const bothLanguagesGroup = takeGroup(desired(3));
  const roboticsGeneralGroup = takeGroup(desired(15));
  const roboticsIepGroup = takeGroup(desired(5));

  for (const grade of grades) {
    for (const studentId of studentsByGrade.get(grade) ?? []) {
      const subgroupIds = roboticsIepGroup.has(studentId) ? ['iep'] : undefined;
      acc.students.push({ id: studentId, name: studentId, gradeLevel: grade, subgroupIds });

      addRequest(acc, studentId, `ENGLISH${grade}`, 'required');
      addRequest(acc, studentId, `MATH${grade}`, 'required');
      addRequest(acc, studentId, `SOCIAL${grade}`, 'required');

      if ((grade === 9 || grade === 10) && bioLabGroup.has(studentId)) {
        addRequest(acc, studentId, 'BIOLAB', 'required');
        addRequest(acc, studentId, 'BIOLEC', 'required');
      } else if (grade === 9 || grade === 10) {
        addRequest(acc, studentId, `SCIENCE${grade}`, 'required');
      }

      if (csSequenceGroup.has(studentId)) {
        addRequest(acc, studentId, 'INTRO_CS', 'elective');
        addRequest(acc, studentId, 'AP_CS', 'elective');
      }
      if (bandGroup.has(studentId)) {
        addRequest(acc, studentId, 'BAND', 'elective');
        if (jazzSubgroup.has(studentId)) addRequest(acc, studentId, 'JAZZ_BAND', 'elective');
      }
      if (spanishOnlyGroup.has(studentId)) addRequest(acc, studentId, 'SPANISH1', 'elective');
      if (frenchOnlyGroup.has(studentId)) addRequest(acc, studentId, 'FRENCH1', 'elective');
      if (bothLanguagesGroup.has(studentId)) {
        addRequest(acc, studentId, 'SPANISH1', 'elective');
        addRequest(acc, studentId, 'FRENCH1', 'alternate');
      }
      if (roboticsGeneralGroup.has(studentId) || roboticsIepGroup.has(studentId)) {
        addRequest(acc, studentId, 'ROBOTICS', 'elective');
      }
    }
  }

  return acc;
}

function buildFull(seed: number): SchedulingInput {
  const rng = mulberry32(seed);
  const teachers = makeTeacherPool(40);
  const teacherPicker = rotatingPicker(teachers);

  const acc = emptyAccumulator();
  mergeInto(acc, buildElementary(15, teacherPicker));
  mergeInto(acc, buildMiddle(20, teacherPicker));
  mergeInto(acc, buildHigh(rng, 30, teacherPicker));

  return {
    students: acc.students,
    requests: acc.requests,
    sections: acc.sections,
    courses: acc.courses,
    teachers,
    terms: YEAR_TERMS,
    periods: buildPeriods(9),
    rules: acc.rules,
  };
}

function buildOversubscribed(seed: number): SchedulingInput {
  const input = buildFull(seed);
  const rng = mulberry32(seed + 1);

  // A single-section popular elective with far more demand than seats.
  input.courses.push({ id: 'FILM_STUDIES', name: 'Film Studies' });
  input.sections.push({
    id: 'FILM_STUDIES-A',
    courseId: 'FILM_STUDIES',
    teacherId: input.teachers[0]!.id,
    termId: 'YEAR',
    periodId: 'PER6',
    capacity: 15,
  });
  const highSchoolers = input.students.filter((s) => s.gradeLevel >= 9);
  const filmRequesters = shuffle(rng, highSchoolers).slice(0, 40);
  for (const student of filmRequesters) {
    input.requests.push({
      id: `${student.id}-FILM_STUDIES`,
      studentId: student.id,
      courseId: 'FILM_STUDIES',
      priority: 'required',
    });
  }

  // A cluster of students forced into a mathematically unresolvable period conflict: a
  // single-section required course sharing English's period, with no alternate section.
  input.courses.push({ id: 'CONFLICT_COURSE', name: 'Scheduling Conflict Demo Course', minGrade: 9, maxGrade: 12 });
  input.sections.push({
    id: 'CONFLICT_COURSE-A',
    courseId: 'CONFLICT_COURSE',
    teacherId: input.teachers[1]!.id,
    termId: 'YEAR',
    periodId: 'PER1', // same period as every grade's required English course
    capacity: 30,
  });
  const conflictStudents = shuffle(rng, highSchoolers.filter((s) => !filmRequesters.includes(s))).slice(0, 15);
  for (const student of conflictStudents) {
    input.requests.push({
      id: `${student.id}-CONFLICT_COURSE`,
      studentId: student.id,
      courseId: 'CONFLICT_COURSE',
      priority: 'required',
    });
  }

  return input;
}

function buildSmall(seed: number): SchedulingInput {
  const rng = mulberry32(seed);
  const teachers = makeTeacherPool(8);
  const teacherPicker = rotatingPicker(teachers);
  const acc = emptyAccumulator();
  mergeInto(acc, buildHigh(rng, 10, teacherPicker));

  return {
    students: acc.students,
    requests: acc.requests,
    sections: acc.sections,
    courses: acc.courses,
    teachers,
    terms: YEAR_TERMS,
    periods: buildPeriods(9),
    rules: acc.rules,
  };
}

export function generateMockSchedule(preset: MockPreset, seed = 42): SchedulingInput {
  switch (preset) {
    case 'small':
      return buildSmall(seed);
    case 'full':
      return buildFull(seed);
    case 'oversubscribed':
      return buildOversubscribed(seed);
  }
}
