const { onRequest } = require("firebase-functions/https");
const admin = require("firebase-admin");
const express = require("express");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

admin.initializeApp();
const db = getFirestore();

const app = express();
app.use(express.json());

// ======================
// LOG REQUEST (DEBUG)
// ======================
app.use((req, res, next) => {
  console.log("➡️ Incoming:", req.method, req.originalUrl);
  next();
});

// ======================
// AUTH MIDDLEWARE
// ======================
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded; // uid, email
    next();
  } catch (err) {
    console.error("AUTH ERROR:", err);
    return res.status(401).json({ message: "Invalid token" });
  }
}

// ======================
// PUBLIC
// ======================
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ======================
// AUTH CHECK
// ======================
app.get("/me", verifyToken, (req, res) => {
  res.json({
    uid: req.user.uid,
    email: req.user.email || null,
  });
});

// ==================================================
// STUDENT READY
// Enforces:
// - subscription active
// - max 6 students per session
// ==================================================
app.post("/sessions/ready", verifyToken, async (req, res) => {
  try {
    const studentId = req.user.uid;
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ message: "session_id is required" });
    }

    // Check student subscription
    const studentRef = db.collection("students").doc(studentId);
    const studentSnap = await studentRef.get();

    if (!studentSnap.exists || studentSnap.data().subscription_active !== true) {
      return res.status(403).json({
        message: "Active subscription required",
      });
    }

    // Get session
    const sessionRef = db.collection("sessions").doc(session_id);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return res.status(404).json({ message: "Session not found" });
    }

    const session = sessionSnap.data();

    if (session.status !== "scheduled") {
      return res.status(400).json({
        message: "Session is not open for students",
      });
    }

    const readyStudents = session.ready_students || [];

    if (readyStudents.length >= 6) {
      return res.status(400).json({
        message: "Session is full (max 6 students)",
      });
    }

    if (readyStudents.includes(studentId)) {
      return res.status(400).json({
        message: "Student already marked as ready",
      });
    }

    await sessionRef.update({
      ready_students: FieldValue.arrayUnion(studentId),
    });

    return res.json({
      message: "Student marked as ready",
      total_ready_students: readyStudents.length + 1,
    });
  } catch (err) {
    console.error("STUDENT READY ERROR:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ==================================================
// START SESSION (Tutor)
// ==================================================
app.post("/sessions/start", verifyToken, async (req, res) => {
  try {
    const tutorId = req.user.uid;
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ message: "session_id is required" });
    }

    const sessionRef = db.collection("sessions").doc(session_id);
    const snap = await sessionRef.get();

    if (!snap.exists) {
      return res.status(404).json({ message: "Session not found" });
    }

    const session = snap.data();

    if (session.tutor_id !== tutorId) {
      return res.status(403).json({ message: "Not your session" });
    }

    if (session.status !== "scheduled") {
      return res.status(400).json({ message: "Session cannot be started" });
    }

    if (!session.ready_students || session.ready_students.length === 0) {
      return res.status(400).json({ message: "No students ready" });
    }

    if (!session.scheduled_start?.toMillis) {
      return res.status(400).json({
        message: "scheduled_start must be Firestore Timestamp",
      });
    }

    const now = Date.now();
    const scheduledStart = session.scheduled_start.toMillis();
    const earliestStart = scheduledStart - 15 * 60 * 1000;

    if (now < earliestStart) {
      return res.status(400).json({
        message: "Session can only be started 15 minutes before schedule",
      });
    }

    await sessionRef.update({
      session_start: FieldValue.serverTimestamp(),
      status: "ongoing",
    });

    return res.json({ message: "Session started successfully" });
  } catch (err) {
    console.error("START SESSION ERROR:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ==================================================
// END SESSION
// Tutor paid ONLY if duration >= 45 minutes
// ==================================================
app.post("/sessions/end", verifyToken, async (req, res) => {
  try {
    const tutorId = req.user.uid;
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ message: "session_id is required" });
    }

    const sessionRef = db.collection("sessions").doc(session_id);
    const snap = await sessionRef.get();

    if (!snap.exists) {
      return res.status(404).json({ message: "Session not found" });
    }

    const session = snap.data();

    if (session.tutor_id !== tutorId) {
      return res.status(403).json({ message: "Not your session" });
    }

    if (session.status !== "ongoing") {
      return res.status(400).json({ message: "Session is not ongoing" });
    }

    if (!session.session_start?.toMillis) {
      return res.status(400).json({ message: "Session has not started" });
    }

    const REQUIRED_DURATION = 45;
    const PAYMENT_AMOUNT = 50000;

    const endTime = Date.now();
    const startTime = session.session_start.toMillis();
    const durationMinutes = Math.floor((endTime - startTime) / 60000);

    // Update session always
    await sessionRef.update({
      session_end: FieldValue.serverTimestamp(),
      session_duration: durationMinutes,
      status: "completed",
    });

    // No payment if < 45 minutes
    if (durationMinutes < REQUIRED_DURATION) {
      return res.json({
        message:
          "Session ended, but duration is less than 45 minutes. No payment issued.",
        duration_minutes: durationMinutes,
        paid: false,
      });
    }

    // Wallet
    const walletRef = db.collection("wallets").doc(tutorId);
    const walletSnap = await walletRef.get();

    if (!walletSnap.exists) {
      await walletRef.set({
        tutor_id: tutorId,
        balance: PAYMENT_AMOUNT,
        created_at: FieldValue.serverTimestamp(),
      });
    } else {
      await walletRef.update({
        balance: FieldValue.increment(PAYMENT_AMOUNT),
      });
    }

    // Transaction
    const transactionRef = await db.collection("transactions").add({
      tutor_id: tutorId,
      session_id,
      amount: PAYMENT_AMOUNT,
      status: "success",
      created_at: FieldValue.serverTimestamp(),
    });

    // Payment log
    await db.collection("payment_logs").add({
      transaction_id: transactionRef.id,
      amount: PAYMENT_AMOUNT,
      paid_at: FieldValue.serverTimestamp(),
    });

    return res.json({
      message: "Session completed and payment issued",
      duration_minutes: durationMinutes,
      paid: true,
      amount: PAYMENT_AMOUNT,
    });
  } catch (err) {
    console.error("END SESSION ERROR:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ======================
// EXPORT FUNCTION
// ======================
exports.api = onRequest(app);
