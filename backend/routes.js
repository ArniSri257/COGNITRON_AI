const express = require("express");
const { db, PREREQUISITE_MASTERY_THRESHOLD } = require("./database");

const router = express.Router();

const VALID_LEVELS = new Set(["scratch", "moderate", "revision"]);

function getSubjects(studentId) {
  return db
    .prepare("SELECT subject FROM student_subjects WHERE student_id = ?")
    .all(studentId)
    .map((row) => row.subject);
}

const getPrerequisitesStmt = db.prepare(
  `SELECT t.id, t.subject, t.chapter, t.name,
          COALESCE(m.mastery, 0) AS mastery
   FROM topic_prerequisites p
   JOIN topics t ON t.id = p.prerequisite_id
   LEFT JOIN student_topic_mastery m
     ON m.topic_id = t.id AND m.student_id = ?
   WHERE p.topic_id = ?`
);

router.post("/session/start", (req, res) => {
  const { student_id, topic_id, level, time_budget_minutes } = req.body || {};

  if (!student_id || !topic_id || !level || time_budget_minutes == null) {
    return res.status(400).json({
      error: "student_id, topic_id, level, and time_budget_minutes are required",
    });
  }

  if (!VALID_LEVELS.has(level)) {
    return res.status(400).json({
      error: "level must be scratch, moderate, or revision",
    });
  }

  const minutes = Number(time_budget_minutes);
  if (!Number.isInteger(minutes) || minutes <= 0) {
    return res.status(400).json({
      error: "time_budget_minutes must be a positive integer",
    });
  }

  const student = db.prepare("SELECT id FROM students WHERE id = ?").get(student_id);
  const topic = db.prepare("SELECT id FROM topics WHERE id = ?").get(topic_id);

  if (!student) {
    return res.status(404).json({ error: "Student not found" });
  }
  if (!topic) {
    return res.status(404).json({ error: "Topic not found" });
  }

  const prerequisites = getPrerequisitesStmt.all(student_id, topic_id);
  const missing = prerequisites.filter(
    (prereq) => prereq.mastery < PREREQUISITE_MASTERY_THRESHOLD
  );

  if (missing.length > 0) {
    return res.json({
      ready: false,
      missing_prerequisites: missing.map((prereq) => ({
        id: prereq.id,
        subject: prereq.subject,
        chapter: prereq.chapter,
        name: prereq.name,
        mastery: prereq.mastery,
      })),
    });
  }

  const result = db
    .prepare(
      `INSERT INTO study_sessions (student_id, topic_id, level, time_budget_minutes)
       VALUES (?, ?, ?, ?)`
    )
    .run(student_id, topic_id, level, minutes);

  return res.json({
    ready: true,
    session_id: result.lastInsertRowid,
  });
});

router.get("/student/:id/progress", (req, res) => {
  const studentId = Number(req.params.id);
  const student = db
    .prepare("SELECT id, name, class, goal FROM students WHERE id = ?")
    .get(studentId);

  if (!student) {
    return res.status(404).json({ error: "Student not found" });
  }

  const topics = db
    .prepare(
      `SELECT t.id, t.subject, t.chapter, t.name,
              COALESCE(m.mastery, 0) AS mastery
       FROM topics t
       LEFT JOIN student_topic_mastery m
         ON m.topic_id = t.id AND m.student_id = ?
       ORDER BY t.id`
    )
    .all(studentId);

  const prereqRows = db
    .prepare("SELECT topic_id, prerequisite_id FROM topic_prerequisites")
    .all();

  const prereqsByTopic = {};
  for (const row of prereqRows) {
    if (!prereqsByTopic[row.topic_id]) {
      prereqsByTopic[row.topic_id] = [];
    }
    prereqsByTopic[row.topic_id].push(row.prerequisite_id);
  }

  return res.json({
    student: {
      ...student,
      subjects: getSubjects(studentId),
    },
    topics: topics.map((topic) => ({
      ...topic,
      prerequisites: prereqsByTopic[topic.id] || [],
    })),
  });
});

router.post("/student/:id/mastery", (req, res) => {
  const studentId = Number(req.params.id);
  const { topic_id, mastery } = req.body || {};

  if (topic_id == null || mastery == null) {
    return res.status(400).json({ error: "topic_id and mastery are required" });
  }

  const masteryValue = Number(mastery);
  if (!Number.isInteger(masteryValue) || masteryValue < 0 || masteryValue > 100) {
    return res.status(400).json({ error: "mastery must be an integer from 0 to 100" });
  }

  const student = db.prepare("SELECT id FROM students WHERE id = ?").get(studentId);
  const topic = db.prepare("SELECT id FROM topics WHERE id = ?").get(topic_id);

  if (!student) {
    return res.status(404).json({ error: "Student not found" });
  }
  if (!topic) {
    return res.status(404).json({ error: "Topic not found" });
  }

  db.prepare(
    `INSERT INTO student_topic_mastery (student_id, topic_id, mastery)
     VALUES (?, ?, ?)
     ON CONFLICT(student_id, topic_id) DO UPDATE SET mastery = excluded.mastery`
  ).run(studentId, topic_id, masteryValue);

  return res.json({
    student_id: studentId,
    topic_id,
    mastery: masteryValue,
  });
});

module.exports = router;
