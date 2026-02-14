# AI Copy Checking System (MVP)

This repo contains an MVP for checking student answer sheets against a model answer key:

- Teacher uploads model answers + student sheet (PDF/image).
- Backend extracts text (OCR or PDF text).
- Backend grades using OpenAI with a strict rubric.
- Frontend shows total marks, per-question marks, feedback, and weak areas.
- Optional: store results in Firebase + generate a PDF report.

## Structure

- `apps/api`: Node/Express API (OCR + grading + PDF)
- `apps/web`: React frontend (upload + results)

## Requirements

- Node.js 20+ recommended

## Setup

1. Install deps:
```powershell
npm install
```

2. Configure env:

- Copy `apps/api/.env.example` to `apps/api/.env`
- Copy `apps/web/.env.example` to `apps/web/.env`
  - Note: editing `.env.example` does nothing at runtime; the server reads `.env`.

3. Run dev:
```powershell
npm run dev
```

## Notes

- For handwritten OCR, set `OCR_PROVIDER=google_vision` and provide Google credentials.
- If no OCR provider is configured, you can paste text directly in the UI (fastest for MVP testing).
- If OpenAI billing isn’t enabled, set `GRADER_PROVIDER=heuristic` for free local grading (lower accuracy).

## API

- `POST /api/evaluate` (multipart/form-data)
  - Files: `modelFile`, `studentFile` (PDF/image)
  - Text overrides: `modelText`, `studentText`
  - Params: `maxMarksPerQuestion`, `strictness`, `subject`
- `GET /api/evaluation/:id` (requires Firebase persistence)
- `GET /api/evaluation/:id/pdf` (requires Firebase persistence)
- `POST /api/extract-score` (multipart/form-data)
  - File: `pageImage` (image)
  - Params: `expectedOutOf`, `labelHint`
- `POST /api/generate-paper` (JSON)
  - Body: class/subject/board/chapters/topics/marks/difficulty + sections config
  - Returns: `paperPdfBase64` and `solutionPdfBase64`
- `GET /api/paper/:id` (requires Firebase persistence)
- `GET /api/paper/:id/pdf?type=paper|solution` (requires Firebase persistence)

# Future Planning
1. AI Copy Checking & Paper Evaluation System
2. AI Question Paper Generator
3. AI Lesson Planning Assistant
4. AI Personalized Homework Generator
5. AI Student Performance Analytics Dashboard
6. AI Attendance + Behavior Prediction
7. AI Parent Communication Bot
8. so on.. related Hardware.
All Feature for specific teacher/management/parent:






👩‍🏫 TEACHER DASHBOARD

Question Paper Generator ✔️
Answer Key Generator ✔️
Marking Scheme Generator
AI Copy Checking ✔️
Manual Mark Override 
Step-Based Evaluation
Homework Generator ✔️
Personalized Worksheet Creator
Remedial Worksheet Generator
Lesson Plan Generator ✔️
PPT Generator
Teaching Notes Assistant
Class Performance Dashboard
Weak Topic Heatmap ✔️
Student Progress Tracker
Parent Communication Panel
Attendance Marking
Exam Result Finalization ✔️
Feedback Comment Generator
Assignment Creator
Online Test Creator





🏫 PRINCIPAL / MANAGEMENT DASHBOARD

School Performance Analytics ✔️
Class-Wise Performance Report ✔️
Subject-Wise Performance Trends
Weak Student Identification ✔️
Teacher Productivity Report ✔️
Result Publishing System
Report Card Generator ✔️
Attendance Analytics
School Comparison Report
Term Comparison Dashboard ✔️
User Role Management
Academic Calendar Management ✔️
Approval Workflow System
Data Export (PDF/Excel)
Audit Logs
Performance Prediction System





👨‍👩‍👧 PARENT DASHBOARD

Child Performance Overview ✔️
Subject-Wise Marks Report ✔️
Weak Area Report ✔️
Improvement Trend Graph
Attendance Overview ✔️
Homework Tracker ✔️
Assignment Status 
Teacher Feedback Viewer ✔️
PTM Notifications ✔️
School Announcements ✔️
Fee Reminder Notifications ✔️
AI Improvement Suggestions
Report Card Download ✔️





🎓 STUDENT DASHBOARD

Personal Performance Dashboard
Subject Progress Graph
AI Mistake Analyzer
Personalized Practice Generator
Topic-Based Quiz System
Homework Submission Portal
Doubt Assistance Chat
Goal Setting Tracker
Achievement Badges
Study Planner
Exam Countdown Timer
Practice Test Generator




🔐 SYSTEM-WIDE FEATURES


Role-Based Access Control
Secure Cloud Storage
Data Encryption
Multi-School Support
Multi-Language Support
Mobile & Web Access
Notification System
Real-Time Updates
Offline Data Sync (Optional)
Backup & Recovery System
Subscription Management
Usage Analytics
API Integration Support