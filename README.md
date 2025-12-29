# 📘 Tutoring Backend System

A backend system for managing tutoring sessions, student participation, and tutor payments using Firebase.

This project focuses on enforcing business rules, secure payment processing, and role-based access control using **Firebase Auth**, **Firestore**, **Cloud Functions**, and **Express.js**.

---

## 🚀 Tech Stack

- Firebase Authentication  
- Firebase Firestore  
- Firebase Cloud Functions  
- Express.js  
- Firebase Emulator Suite  

---

## 📐 Business Rules

1. Each session is conducted by **1 tutor** and can have **up to 6 students**.
2. Students must have an **active monthly subscription** to attend sessions.
3. Each tutoring session lasts **45 minutes**.
4. Tutors receive **50,000** only if the session duration is **at least 45 minutes**.
5. Tutors who are absent or end the session early do **not receive payment**.
6. Each tutor has a **wallet** to store their balance.
7. Every wallet balance update must be recorded as a **transaction**.
8. All payments are **simulated** and stored in Firestore.
9. All backend logic is handled using Firebase services.

---

## 🗂️ Database Structure (Firestore)

### Authentication
- Firebase Auth is used as the primary identity provider.
- The Auth UID is used directly as the Firestore document ID.

---

### tutors/{tutor_uid}

```json
{
  "created_at": "Timestamp"
}
```

---

### students/{student_uid}

```json
{
  "subscription_active": true
}
```

---

### sessions/{session_id}

```json
{
  "tutor_id": "tutor_uid",
  "status": "scheduled | ongoing | completed",
  "scheduled_start": "Timestamp",
  "session_start": "Timestamp",
  "session_end": "Timestamp",
  "session_duration": 45,
  "ready_students": [
    "student_uid_1",
    "student_uid_2"
  ]
}
```

---

### wallets/{tutor_uid}

```json
{
  "balance": 50000,
  "created_at": "Timestamp"
}
```

---

### transactions/{transaction_id}

```json
{
  "tutor_id": "tutor_uid",
  "session_id": "session_id",
  "amount": 50000,
  "status": "success",
  "created_at": "Timestamp"
}
```

---

### payment_logs/{payment_id}

```json
{
  "transaction_id": "transaction_id",
  "amount": 50000,
  "paid_at": "Timestamp"
}
```

---

## 🔐 Security Design

- All protected APIs require a valid Firebase ID Token.
- Tutor and student roles are separated at the data layer.
- Wallet updates and transaction creation are executed **only in Cloud Functions**.
- Clients cannot directly modify wallet balances.
- Firestore Security Rules restrict write access to sensitive collections.

---

## 🧪 Local Development Setup

### Install dependencies

```bash
npm install
```

---

### Start Firebase Emulator (with data persistence)

```bash
firebase emulators:start --import=./emulator-data --export-on-exit
```

---

### Create test users

Using the Emulator UI (`http://localhost:4000`), create:
- 1 Tutor user
- 1–6 Student users

---

### Prepare Firestore data

**Tutor**
```
tutors/{tutor_uid}
```

**Student**
```json
{
  "subscription_active": true
}
```

---

## 🔄 API Usage Flow

### Student Ready

```http
POST /api/sessions/ready
Authorization: Bearer <STUDENT_TOKEN>
```

```json
{
  "session_id": "session_id"
}
```

Rules:
- Student must have an active subscription  
- Maximum 6 students per session  

---

### Tutor Start Session

```http
POST /api/sessions/start
Authorization: Bearer <TUTOR_TOKEN>
```

```json
{
  "session_id": "session_id"
}
```

Rules:
- Tutor must own the session  
- At least one student must be ready  
- Session can only start within 15 minutes before schedule  

---

### Tutor End Session

```http
POST /api/sessions/end
Authorization: Bearer <TUTOR_TOKEN>
```

```json
{
  "session_id": "session_id"
}
```

Payment rules:
- Duration < 45 minutes → No payment  
- Duration ≥ 45 minutes → Wallet balance +50,000  

---

## ✅ Testing Coverage

Testing is performed using Firebase Emulator and includes:
- Valid cases (normal flow)
- Invalid cases (rule violations)
- Error handling cases (system failures)

All business rules are enforced and validated at the backend level.

---

## 📌 Assumptions & Limitations

- Session creation is assumed to be handled by an admin or scheduling system.
- Student subscription management is simplified using a boolean flag.
- No real payment gateway is implemented.

---

## 🏁 Conclusion

This project demonstrates a secure backend architecture for tutoring session management.  
All critical operations, including session lifecycle and tutor payment processing, are handled exclusively in the backend to ensure data integrity and prevent unauthorized access.
