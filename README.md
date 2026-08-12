# weaver

A TypeScript library that automatically schedules K-12 students into class sections. It's a
constraint-satisfaction / assignment problem that's NP-hard in general, so weaver ships three
different solving strategies you can pick between (or compare):

- **Greedy** — a fast constructive heuristic: place the most-constrained requests first,
  falling back to bounded backtracking when a placement conflicts with a student's own earlier
  assignment.
- **MIP** — an exact solve via [HiGHS](https://highs.dev) (the open-source solver SciPy uses as
  its default MILP backend), running as WebAssembly through the [`highs`](https://github.com/lovasoa/highs-js)
  npm package. Formulates scheduling as an integer program and maximizes weighted request
  fulfillment subject to every rule and capacity constraint.
- **Hybrid** — runs Greedy first, then repairs whatever's left unresolved with two escalating
  strategies: a scoped MIP re-solve over just the "hard" students, and a deterministic
  augmenting-path swap search that chases multi-hop reassignment chains.

Every strategy is built on the same shared rule system and produces the same result shape, so
you can swap between them freely. The goal across all three is fulfilling 90%+ of student
course requests; each result also reports exactly which requests couldn't be scheduled, and why.

## Getting started

This project assumes you have [Node.js](https://nodejs.org) 20 or later installed (`node --version`
to check). If you're new to the Node ecosystem, here's the short version of what each command
below does — everything runs through `npm`, the package manager that ships with Node.

```bash
npm install       # downloads dependencies into node_modules/
npm test          # runs the test suite (vitest)
npm run typecheck # runs the TypeScript compiler in check-only mode (no output files)
npm run build     # compiles src/ to dist/ for publishing/consuming as a library
npm run demo      # runs examples/runDemo.ts directly against a generated mock schedule
```

`npm run demo` is the fastest way to see the library actually do something: it builds a
synthetic "complex" school schedule (see [Mock data](#mock-data) below), runs all three solvers
against it, and prints a fulfillment/utilization report for each.

## Domain model

The scheduling problem has four kinds of input, all defined in [`src/types/domain.ts`](src/types/domain.ts):

- **Master schedule**: `Course`, `Section` (a specific offering of a course — teacher, term,
  period, capacity), `Teacher`, `Room`.
- **Calendar**: `Term` (terms nest — a school year contains semesters, which contain quarters —
  see [`src/terms/termCalendar.ts`](src/terms/termCalendar.ts)) and `Period`.
- **Students**: `Student` and `StudentRequest` (a request for a course, with a priority of
  `required` / `elective` / `alternate`, and optional teacher/term preferences).
- **Rules**: declarative `RuleDefinition`s layered on top of the always-on hard constraints
  (capacity, no double-booking, grade eligibility).

### Rule types

Beyond the built-in hard constraints, weaver supports six kinds of scheduling rules
(see [`src/rules/`](src/rules)):

| Rule | What it does | Real-world example |
| --- | --- | --- |
| `linkedSections` | Two specific sections must always be co-assigned | A biology lab + its lecture |
| `sequencing` | Course A must land in an earlier term than Course B | Intro Programming (S1) before AP Programming (S2) |
| `sameTeacher` | Two courses must share a teacher, if a student takes both | Band + Jazz Band |
| `sameTerm` / `differentTerm` | Two courses must(not) overlap in term | — |
| `mutualExclusion` | A student may take at most one of two courses | Spanish I vs. French I |
| `cohort` | A fixed group of students must land in the same section | A middle-school team-taught class |

Every rule is defined once and consumed two ways: `checkFeasible()` for the greedy solver's
placement loop, and `addToMipModel()` to emit linear constraints for the MIP solver. Built-in
hard constraints (capacity — including reserved-seat carve-outs for subgroups — and no
double-booking) work the same way; see [`src/rules/builtins.ts`](src/rules/builtins.ts).

## Usage

```ts
import {
  createHybridSolver,
  generateMockSchedule,
} from 'weaver';

const input = generateMockSchedule('full'); // or build your own SchedulingInput
const result = await createHybridSolver().solve(input);

console.log(result.fulfillmentRate); // e.g. 0.996
console.log(result.assignments.get('some-student-id')); // -> SectionId[]
console.log(result.unresolvedRequests); // [{ requestId, studentId, courseId, reasons }]
```

`SchedulingInput` (see [`src/types/solver.ts`](src/types/solver.ts)) is the full set of
students, requests, sections, courses, teachers, terms, periods, and rules for one solve.
`ScheduleResult` (see [`src/types/result.ts`](src/types/result.ts)) is a per-student list of
assigned section IDs, plus fulfillment stats, section utilization, and a list of unresolved
requests with human-readable reasons — the "what's hard to schedule and why" report.

## Mock data

[`src/mockData/generateMockSchedule.ts`](src/mockData/generateMockSchedule.ts) builds a
synthetic school district with three presets:

- `'small'` — a compact high-school-only scenario, useful for quick smoke tests.
- `'full'` — a full K-12 district (elementary, middle, high school) with a representative
  instance of every rule type: linked Biology Lab/Lecture, Intro→AP Programming sequencing,
  Band/Jazz Band same-teacher, Spanish/French mutual exclusion, a team-taught middle-school
  cohort, and a Robotics reserved-seat carve-out for an IEP subgroup.
- `'oversubscribed'` — the `'full'` schedule plus a deliberately over-requested elective and a
  mathematically unresolvable period-conflict cluster, to exercise the unresolved-request
  reporting path under real scarcity.

## Testing

Tests live in [`test/`](test), mirroring `src/`'s structure, and run via
[Vitest](https://vitest.dev). Unit tests cover every rule (both the `checkFeasible` and
`addToMipModel` paths), the term-interval math, candidate generation, both greedy sub-modules
(ordering, bounded backtracking), the full MIP pipeline (LP serialization through a real HiGHS
solve), and the hybrid repair strategies (hard-case detection, scoped MIP repair, and
augmenting-path swap chains — including a crafted 2-hop chain). Integration tests in
[`test/integration/`](test/integration) run all three solvers against the `'full'` mock
schedule and assert ≥90% fulfillment with zero hard-constraint violations, plus a scarcity
scenario that exercises the unresolved-reporting path.

```bash
npm test              # run once
npm run test:watch    # re-run on file changes
npm run coverage       # run with a coverage report
```
