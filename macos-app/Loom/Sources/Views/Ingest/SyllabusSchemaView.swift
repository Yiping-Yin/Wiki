import SwiftUI

// MARK: - SyllabusSchemaView
//
// Phase 4 — typed renderer for SyllabusSchema (plan §3.3 / §4 Phase 4).
// Composes FieldResultRow primitives into the syllabus shape used by
// Loom's ingest preview pane. Layout order mirrors the plan brief:
//
//   1. Header block:   courseCode · courseName · term · institution
//   2. Teachers:       each role/name/email as a small card
//   3. Assessments:    each row is (name · weight% · due · format)
//   4. Objectives:     bulleted FieldResultRow list
//   5. Week topics:    table-like grid (weekRange | topic)
//   6. Metadata:       office hours · textbook
//
// Empty-section rule (from brief): if every field in a non-header
// section is `.notFound`, hide the whole section — no awkward
// "everything missing" cards. The header block ALWAYS renders so the
// "this syllabus is incomplete" signal is never silent.

struct SyllabusSchemaView: View {
    let schema: SyllabusSchema
    let sourceText: String
    let onQuoteTap: (SourceSpan) -> Void

    init(
        schema: SyllabusSchema,
        sourceText: String,
        onQuoteTap: @escaping (SourceSpan) -> Void
    ) {
        self.schema = schema
        self.sourceText = sourceText
        self.onQuoteTap = onQuoteTap
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            headerBlock
            if hasAnyFound(teachers: schema.teachers) {
                sectionDivider
                teachersSection
            }
            if !schema.assessmentItems.isEmpty, hasAnyFound(assessments: schema.assessmentItems) {
                sectionDivider
                assessmentsSection
            }
            if !schema.learningObjectives.isEmpty, hasAnyFound(list: schema.learningObjectives) {
                sectionDivider
                objectivesSection
            }
            if !schema.weekTopics.isEmpty, hasAnyFound(weeks: schema.weekTopics) {
                sectionDivider
                weeksSection
            }
            if isAnyFound(schema.officeHours) || isAnyFound(schema.textbook) {
                sectionDivider
                metadataSection
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Sections

    /// Header is always shown, even if everything is missing — the
    /// "this syllabus is missing its identity fields" signal is the
    /// single biggest UX win of the refactor (plan §2 key finding #1).
    private var headerBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Course")
            FieldResultRow<String>(
                label: "Code",
                result: schema.courseCode,
                onQuoteTap: onQuoteTap
            )
            FieldResultRow<String>(
                label: "Name",
                result: schema.courseName,
                onQuoteTap: onQuoteTap
            )
            HStack(alignment: .top, spacing: 20) {
                FieldResultRow<String>(
                    label: "Term",
                    result: schema.term,
                    onQuoteTap: onQuoteTap
                )
                FieldResultRow<String>(
                    label: "Institution",
                    result: schema.institution,
                    onQuoteTap: onQuoteTap
                )
            }
        }
    }

    private var teachersSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Teachers")
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(schema.teachers.enumerated()), id: \.offset) { _, teacher in
                    teacherCard(teacher)
                }
            }
        }
    }

    private func teacherCard(_ teacher: TeacherSchema) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            FieldResultRow<String>(
                label: "Role",
                result: teacher.role,
                onQuoteTap: onQuoteTap
            )
            FieldResultRow<String>(
                label: "Name",
                result: teacher.name,
                onQuoteTap: onQuoteTap
            )
            FieldResultRow<String>(
                label: "Email",
                result: teacher.email,
                onQuoteTap: onQuoteTap
            )
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(LoomTokens.hairFaint)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .strokeBorder(LoomTokens.hair, lineWidth: 0.5)
        )
    }

    private var assessmentsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Assessment")
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(schema.assessmentItems.enumerated()), id: \.offset) { _, item in
                    assessmentRow(item)
                }
            }
        }
    }

    private func assessmentRow(_ item: AssessmentSchema) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            FieldResultRow<String>(
                label: "Name",
                result: item.name,
                onQuoteTap: onQuoteTap
            )
            HStack(alignment: .top, spacing: 20) {
                FieldResultRow<Double>(
                    label: "Weight %",
                    result: item.weightPercent,
                    onQuoteTap: onQuoteTap
                )
                FieldResultRow<String>(
                    label: "Due",
                    result: item.dueDate,
                    onQuoteTap: onQuoteTap
                )
            }
            FieldResultRow<String>(
                label: "Format",
                result: item.format,
                onQuoteTap: onQuoteTap
            )
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(LoomTokens.hairFaint)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .strokeBorder(LoomTokens.hair, lineWidth: 0.5)
        )
    }

    private var objectivesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Learning Objectives")
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(schema.learningObjectives.enumerated()), id: \.offset) { idx, obj in
                    HStack(alignment: .top, spacing: 6) {
                        Text("\(idx + 1).")
                            .font(LoomTokens.serif(size: 12))
                            .foregroundStyle(LoomTokens.muted)
                            .frame(width: 18, alignment: .trailing)
                        FieldResultRow<String>(
                            label: "Objective",
                            result: obj,
                            onQuoteTap: onQuoteTap
                        )
                    }
                }
            }
        }
    }

    private var weeksSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Weekly Topics")
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(schema.weekTopics.enumerated()), id: \.offset) { _, week in
                    HStack(alignment: .top, spacing: 14) {
                        FieldResultRow<String>(
                            label: "Week",
                            result: week.weekRange,
                            onQuoteTap: onQuoteTap
                        )
                        .frame(maxWidth: 110, alignment: .leading)
                        FieldResultRow<String>(
                            label: "Topic",
                            result: week.topic,
                            onQuoteTap: onQuoteTap
                        )
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private var metadataSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Metadata")
            HStack(alignment: .top, spacing: 20) {
                FieldResultRow<String>(
                    label: "Office Hours",
                    result: schema.officeHours,
                    onQuoteTap: onQuoteTap
                )
                FieldResultRow<String>(
                    label: "Textbook",
                    result: schema.textbook,
                    onQuoteTap: onQuoteTap
                )
            }
        }
    }

    // MARK: - Section chrome

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 11, design: .serif).smallCaps())
            .fontWeight(.medium)
            .tracking(0.8)
            .foregroundStyle(LoomTokens.thread)
    }

    private var sectionDivider: some View {
        LoomTokens.hair.frame(height: 0.5)
    }

    // MARK: - Empty-section checks

    private func isAnyFound<T>(_ r: FieldResult<T>) -> Bool {
        if case .found = r { return true }
        return false
    }

    private func hasAnyFound(list: [FieldResult<String>]) -> Bool {
        list.contains { isAnyFound($0) }
    }

    private func hasAnyFound(teachers: [TeacherSchema]) -> Bool {
        teachers.contains { t in
            isAnyFound(t.role) || isAnyFound(t.name) || isAnyFound(t.email)
        }
    }

    private func hasAnyFound(assessments: [AssessmentSchema]) -> Bool {
        assessments.contains { a in
            isAnyFound(a.name) || isAnyFound(a.weightPercent)
                || isAnyFound(a.dueDate) || isAnyFound(a.format)
        }
    }

    private func hasAnyFound(weeks: [WeekTopicSchema]) -> Bool {
        weeks.contains { w in
            isAnyFound(w.weekRange) || isAnyFound(w.topic)
        }
    }
}

// MARK: - Previews

#Preview("SyllabusSchemaView · mixed") {
    let span = SourceSpan(
        docId: "preview-doc",
        pageNum: 1,
        charStart: 0,
        charEnd: 10,
        quote: "FINS 3640",
        verified: true,
        verifyReason: nil
    )
    let schema = SyllabusSchema(
        courseCode: .found(value: "FINS 3640", confidence: 0.95, sourceSpans: [span]),
        courseName: .notFound(tried: ["document title", "first 500 chars"]),
        term: .notFound(tried: ["first 500 chars", "due dates"]),
        institution: .found(value: "UNSW", confidence: 0.9, sourceSpans: [span]),
        teachers: [
            TeacherSchema(
                role: .found(value: "Lecturer", confidence: 0.9, sourceSpans: [span]),
                name: .found(value: "Jane Chen", confidence: 0.9, sourceSpans: [span]),
                email: .found(value: "jane@unsw.edu.au", confidence: 0.9, sourceSpans: [span])
            )
        ],
        officeHours: .notFound(tried: []),
        textbook: .found(value: "Hull, Options", confidence: 0.8, sourceSpans: [span]),
        assessmentItems: [
            AssessmentSchema(
                name: .found(value: "Midterm", confidence: 0.9, sourceSpans: [span]),
                weightPercent: .found(value: 30.0, confidence: 0.9, sourceSpans: [span]),
                dueDate: .found(value: "Week 6", confidence: 0.9, sourceSpans: [span]),
                format: .notFound(tried: ["group size clause"])
            )
        ],
        learningObjectives: [
            .found(value: "Understand option pricing", confidence: 0.8, sourceSpans: [span])
        ],
        weekTopics: [
            WeekTopicSchema(
                weekRange: .found(value: "Week 1", confidence: 0.95, sourceSpans: [span]),
                topic: .found(value: "Intro to derivatives", confidence: 0.9, sourceSpans: [span])
            )
        ]
    )
    return ScrollView {
        SyllabusSchemaView(
            schema: schema,
            sourceText: "FINS 3640 lecture notes…",
            onQuoteTap: { _ in }
        )
        .padding()
    }
    .background(LoomTokens.paper)
    .frame(width: 520, height: 600)
}
