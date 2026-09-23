const path = require("path");
const Database = require("better-sqlite3");

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "cognitron.db");
const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

const PREREQUISITE_MASTERY_THRESHOLD = 60;

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      class TEXT NOT NULL,
      goal TEXT NOT NULL CHECK (
        goal IN ('class_test', 'midsem', 'board', 'competitive')
      )
    );

    CREATE TABLE IF NOT EXISTS student_subjects (
      student_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      PRIMARY KEY (student_id, subject),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      chapter TEXT NOT NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS topic_prerequisites (
      topic_id INTEGER NOT NULL,
      prerequisite_id INTEGER NOT NULL,
      PRIMARY KEY (topic_id, prerequisite_id),
      FOREIGN KEY (topic_id) REFERENCES topics(id),
      FOREIGN KEY (prerequisite_id) REFERENCES topics(id)
    );

    CREATE TABLE IF NOT EXISTS student_topic_mastery (
      student_id INTEGER NOT NULL,
      topic_id INTEGER NOT NULL,
      mastery INTEGER NOT NULL DEFAULT 0 CHECK (mastery BETWEEN 0 AND 100),
      PRIMARY KEY (student_id, topic_id),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (topic_id) REFERENCES topics(id)
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      topic_id INTEGER NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('scratch', 'moderate', 'revision')),
      time_budget_minutes INTEGER NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (topic_id) REFERENCES topics(id)
    );
  `);
}

function seedIfEmpty() {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM students").get();
  if (count > 0) {
    return;
  }

  const insertStudent = db.prepare(
    "INSERT INTO students (name, class, goal) VALUES (?, ?, ?)"
  );
  const insertSubject = db.prepare(
    "INSERT INTO student_subjects (student_id, subject) VALUES (?, ?)"
  );
  const insertTopic = db.prepare(
    "INSERT INTO topics (subject, chapter, name) VALUES (?, ?, ?)"
  );
  const insertPrereq = db.prepare(
    "INSERT INTO topic_prerequisites (topic_id, prerequisite_id) VALUES (?, ?)"
  );
  const insertMastery = db.prepare(
    "INSERT INTO student_topic_mastery (student_id, topic_id, mastery) VALUES (?, ?, ?)"
  );

  const seed = db.transaction(() => {
    const aishaId = insertStudent.run("Aisha Khan", "12", "board").lastInsertRowid;
    const rohanId = insertStudent.run("Rohan Mehta", "11", "competitive").lastInsertRowid;
    const priyaId = insertStudent.run("Priya Sharma", "12", "midsem").lastInsertRowid;

    for (const subject of ["Physics", "Chemistry"]) {
      insertSubject.run(aishaId, subject);
      insertSubject.run(rohanId, subject);
    }
    insertSubject.run(priyaId, "Physics");

    // Physics chain: 1 -> 2 -> 3, and 2 -> 4 -> 5
    const t1 = insertTopic.run("Physics", "Units and Measurements", "Units and Measurements").lastInsertRowid;
    const t2 = insertTopic.run("Physics", "Kinematics", "Motion in a Straight Line").lastInsertRowid;
    const t3 = insertTopic.run("Physics", "Kinematics", "Motion in a Plane").lastInsertRowid;
    const t4 = insertTopic.run("Physics", "Laws of Motion", "Newton's Laws of Motion").lastInsertRowid;
    const t5 = insertTopic.run("Physics", "Work, Energy and Power", "Work, Energy and Power").lastInsertRowid;

    // Chemistry chain: 6 -> 7 -> 8, and 7+8 -> 9, 6 -> 10
    const t6 = insertTopic.run("Chemistry", "Some Basic Concepts of Chemistry", "Some Basic Concepts of Chemistry").lastInsertRowid;
    const t7 = insertTopic.run("Chemistry", "Structure of Atom", "Structure of Atom").lastInsertRowid;
    const t8 = insertTopic.run("Chemistry", "Classification of Elements", "Periodic Classification").lastInsertRowid;
    const t9 = insertTopic.run("Chemistry", "Chemical Bonding", "Chemical Bonding and Molecular Structure").lastInsertRowid;
    const t10 = insertTopic.run("Chemistry", "Thermodynamics", "Thermodynamics").lastInsertRowid;

    insertPrereq.run(t2, t1);
    insertPrereq.run(t3, t2);
    insertPrereq.run(t4, t2);
    insertPrereq.run(t5, t4);
    insertPrereq.run(t7, t6);
    insertPrereq.run(t8, t7);
    insertPrereq.run(t9, t7);
    insertPrereq.run(t9, t8);
    insertPrereq.run(t10, t6);

    const topicIds = [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10];

    // Per-student mastery so some later topics fail the prerequisite check.
    const aishaScores = [85, 78, 42, 72, 28, 80, 65, 48, 18, 12];
    const rohanScores = [90, 82, 70, 60, 55, 40, 22, 10, 5, 8];
    const priyaScores = [55, 30, 15, 10, 5, 0, 0, 0, 0, 0];

    topicIds.forEach((topicId, index) => {
      insertMastery.run(aishaId, topicId, aishaScores[index]);
      insertMastery.run(rohanId, topicId, rohanScores[index]);
      insertMastery.run(priyaId, topicId, priyaScores[index]);
    });
  });

  seed();
  console.log("SQLite database seeded with mock students and topics");
}

createTables();
seedIfEmpty();

module.exports = {
  db,
  PREREQUISITE_MASTERY_THRESHOLD,
};
