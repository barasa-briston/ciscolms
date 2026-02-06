import { GoogleLogin } from "@react-oauth/google";
import axios from "axios";
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000/api";

function authHeaders() {
  const token = localStorage.getItem("access");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function App() {
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);

  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);

  const [gradesData, setGradesData] = useState(null);

  const [assignments, setAssignments] = useState([]);
  const [fileUrlByAssignment, setFileUrlByAssignment] = useState({});

  const [lecturerMode, setLecturerMode] = useState(false);
  const [lecturerSubmissions, setLecturerSubmissions] = useState([]);
  const [scoreBySubmission, setScoreBySubmission] = useState({});
  const [feedbackBySubmission, setFeedbackBySubmission] = useState({});

  const [loading, setLoading] = useState(false);

  const handleLogin = async (credentialResponse) => {
    try {
      setMessage("");
      const res = await axios.post(`${API_BASE}/auth/google/`, {
        id_token: credentialResponse.credential,
      });

      localStorage.setItem("access", res.data.tokens.access);
      localStorage.setItem("refresh", res.data.tokens.refresh);

      setUser(res.data.user);
      setMessage("Login successful ✅");
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        JSON.stringify(err?.response?.data) ||
        err.message;
      setMessage(detail);
    }
  };

  const logout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    setUser(null);
    setCourses([]);
    setSelectedCourse(null);
    setGradesData(null);
    setAssignments([]);
    setFileUrlByAssignment({});
    setLecturerMode(false);
    setLecturerSubmissions([]);
    setScoreBySubmission({});
    setFeedbackBySubmission({});
    setMessage("Logged out ✅");
  };

  const loadCourses = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/me/courses/`, {
        headers: authHeaders(),
      });
      setCourses(res.data.courses || []);
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Failed to load courses ❌");
    } finally {
      setLoading(false);
    }
  };

  const loadAssignments = async (courseId) => {
    try {
      const res = await axios.get(
        `${API_BASE}/me/assignments/?course_id=${courseId}`,
        {
          headers: authHeaders(),
        }
      );
      setAssignments(res.data.assignments || []);
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Failed to load assignments ❌");
    }
  };

  const viewGradesAndAssignments = async (course) => {
    setSelectedCourse(course);
    setLecturerSubmissions([]);
    setLecturerMode(false);
    setGradesData(null);
    setAssignments([]);
    setFileUrlByAssignment({});
    setLoading(true);
    setMessage("");

    try {
      const gradesRes = await axios.get(
        `${API_BASE}/me/grades/?course_id=${course.course_id}`,
        {
          headers: authHeaders(),
        }
      );
      setGradesData(gradesRes.data);

      await loadAssignments(course.course_id);
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Failed to load data ❌");
    } finally {
      setLoading(false);
    }
  };

  const submitFileUrl = async (assignmentId) => {
    const file_url = (fileUrlByAssignment[assignmentId] || "").trim();
    if (!file_url) {
      setMessage("Please paste your File URL first.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const res = await axios.post(
        `${API_BASE}/assignments/${assignmentId}/submit/`,
        { file_url },
        { headers: authHeaders() }
      );

      setMessage(res.data.detail || "Submitted ✅");

      if (selectedCourse) {
        await loadAssignments(selectedCourse.course_id);

        const gradesRes = await axios.get(
          `${API_BASE}/me/grades/?course_id=${selectedCourse.course_id}`,
          { headers: authHeaders() }
        );
        setGradesData(gradesRes.data);
      }
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Submission failed ❌");
    } finally {
      setLoading(false);
    }
  };

  // Lecturer
  const loadLecturerSubmissions = async () => {
    if (!selectedCourse) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await axios.get(
        `${API_BASE}/lecturer/submissions/?course_id=${selectedCourse.course_id}`,
        { headers: authHeaders() }
      );
      setLecturerSubmissions(res.data.submissions || []);

      // preload inputs
      const scores = {};
      const feedbacks = {};
      (res.data.submissions || []).forEach((s) => {
        scores[s.submission_id] = s.grade?.score ?? "";
        feedbacks[s.submission_id] = s.grade?.feedback ?? "";
      });
      setScoreBySubmission(scores);
      setFeedbackBySubmission(feedbacks);
    } catch (err) {
      setMessage(
        err?.response?.data?.detail || "Failed to load lecturer submissions ❌"
      );
    } finally {
      setLoading(false);
    }
  };

  const gradeOne = async (submissionId) => {
    const score = scoreBySubmission[submissionId];
    const feedback = feedbackBySubmission[submissionId] || "";

    if (score === "" || score === null || score === undefined) {
      setMessage("Enter a score first.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const res = await axios.post(
        `${API_BASE}/lecturer/submissions/${submissionId}/grade/`,
        { score, feedback },
        { headers: authHeaders() }
      );
      setMessage(res.data.detail || "Graded ✅");
      await loadLecturerSubmissions();

      // Also refresh student grades panel if currently open
      if (selectedCourse) {
        const gradesRes = await axios.get(
          `${API_BASE}/me/grades/?course_id=${selectedCourse.course_id}`,
          { headers: authHeaders() }
        );
        setGradesData(gradesRes.data);
      }
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Grading failed ❌");
    } finally {
      setLoading(false);
    }
  };

  const lockOne = async (submissionId) => {
    setLoading(true);
    setMessage("");
    try {
      const res = await axios.post(
        `${API_BASE}/lecturer/submissions/${submissionId}/lock/`,
        {},
        { headers: authHeaders() }
      );
      setMessage(res.data.detail || "Locked ✅");
      await loadLecturerSubmissions();

      // refresh student panel if open
      if (selectedCourse) {
        const gradesRes = await axios.get(
          `${API_BASE}/me/grades/?course_id=${selectedCourse.course_id}`,
          { headers: authHeaders() }
        );
        setGradesData(gradesRes.data);
      }
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Lock failed ❌");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadCourses();
  }, [user]);

  return (
    <div style={{ padding: 40, fontFamily: "Arial", maxWidth: 1100 }}>
      <h2>CISCOLMS – Portal</h2>

      {!user ? (
        <>
          <GoogleLogin
            onSuccess={handleLogin}
            onError={() => setMessage("Google login failed")}
          />
          <p style={{ marginTop: 10 }}>{message}</p>
        </>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <p style={{ margin: 0 }}>
                <b>{user.email}</b>
              </p>
              <p style={{ margin: "6px 0 0 0" }}>
                Cohort: <b>{user.cohort.name}</b>
              </p>
            </div>
            <button
              onClick={logout}
              style={{ padding: "8px 12px", cursor: "pointer" }}
            >
              Logout
            </button>
          </div>

          <hr style={{ margin: "20px 0" }} />

          <h3>My Courses</h3>
          {loading && <p>Loading...</p>}

          {!loading && courses.length > 0 && (
            <div style={{ display: "grid", gap: 12 }}>
              {courses.map((c) => (
                <div
                  key={c.course_id}
                  style={{
                    border: "1px solid #ddd",
                    padding: 14,
                    borderRadius: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>
                      {c.course_title}
                    </div>
                    <div style={{ color: "#444" }}>
                      {c.course_description || ""}
                    </div>
                  </div>
                  <button
                    onClick={() => viewGradesAndAssignments(c)}
                    style={{ padding: "8px 12px", cursor: "pointer" }}
                  >
                    Open Course
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedCourse && (
            <>
              <hr style={{ margin: "25px 0" }} />
              <h3>Course – {selectedCourse.course_title}</h3>

              <div style={{ display: "flex", gap: 10, margin: "10px 0 18px 0" }}>
                <button
                  onClick={() => setLecturerMode(false)}
                  style={{ padding: "8px 12px", cursor: "pointer" }}
                >
                  Student View
                </button>
                <button
                  onClick={async () => {
                    setLecturerMode(true);
                    await loadLecturerSubmissions();
                  }}
                  style={{ padding: "8px 12px", cursor: "pointer" }}
                >
                  Lecturer View (Grade)
                </button>
              </div>

              {!lecturerMode ? (
                <>
                  <h3>Grades</h3>
                  {gradesData ? (
                    <>
                      <div style={{ marginBottom: 10 }}>
                        <b>Average:</b>{" "}
                        {gradesData.average_percent === null
                          ? "N/A"
                          : `${gradesData.average_percent.toFixed(2)}%`}
                        {"  "}
                        <span style={{ marginLeft: 12 }}>
                          <b>Result:</b>{" "}
                          {gradesData.result === null ? "N/A" : gradesData.result}
                        </span>
                        <span style={{ marginLeft: 12, color: "#555" }}>
                          (Pass mark: {gradesData.pass_mark}%)
                        </span>
                      </div>

                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          border: "1px solid #ddd",
                        }}
                      >
                        <thead>
                          <tr>
                            <th
                              style={{
                                border: "1px solid #ddd",
                                padding: 8,
                                textAlign: "left",
                              }}
                            >
                              Module
                            </th>
                            <th
                              style={{
                                border: "1px solid #ddd",
                                padding: 8,
                                textAlign: "left",
                              }}
                            >
                              Assignment
                            </th>
                            <th style={{ border: "1px solid #ddd", padding: 8 }}>
                              Score
                            </th>
                            <th style={{ border: "1px solid #ddd", padding: 8 }}>
                              Max
                            </th>
                            <th style={{ border: "1px solid #ddd", padding: 8 }}>
                              Percent
                            </th>
                            <th
                              style={{
                                border: "1px solid #ddd",
                                padding: 8,
                                textAlign: "left",
                              }}
                            >
                              Feedback
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {gradesData.grades.map((g, idx) => (
                            <tr key={idx}>
                              <td
                                style={{ border: "1px solid #ddd", padding: 8 }}
                              >
                                {g.module_title}
                              </td>
                              <td
                                style={{ border: "1px solid #ddd", padding: 8 }}
                              >
                                {g.assignment_title}{" "}
                                {g.locked ? (
                                  <span style={{ marginLeft: 8 }}>
                                    <b>(FINAL ✅)</b>
                                  </span>
                                ) : null}
                              </td>
                              <td
                                style={{
                                  border: "1px solid #ddd",
                                  padding: 8,
                                  textAlign: "center",
                                }}
                              >
                                {g.score === null ? "-" : g.score}
                              </td>
                              <td
                                style={{
                                  border: "1px solid #ddd",
                                  padding: 8,
                                  textAlign: "center",
                                }}
                              >
                                {g.max_score}
                              </td>
                              <td
                                style={{
                                  border: "1px solid #ddd",
                                  padding: 8,
                                  textAlign: "center",
                                }}
                              >
                                {g.percent === null
                                  ? "-"
                                  : `${g.percent.toFixed(2)}%`}
                              </td>
                              <td
                                style={{ border: "1px solid #ddd", padding: 8 }}
                              >
                                {g.feedback || ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <h3 style={{ marginTop: 22 }}>
                        Assignment Submission (Student)
                      </h3>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          border: "1px solid #ddd",
                        }}
                      >
                        <thead>
                          <tr>
                            <th
                              style={{
                                border: "1px solid #ddd",
                                padding: 8,
                                textAlign: "left",
                              }}
                            >
                              Module
                            </th>
                            <th
                              style={{
                                border: "1px solid #ddd",
                                padding: 8,
                                textAlign: "left",
                              }}
                            >
                              Assignment
                            </th>
                            <th style={{ border: "1px solid #ddd", padding: 8 }}>
                              Max
                            </th>
                            <th
                              style={{
                                border: "1px solid #ddd",
                                padding: 8,
                                textAlign: "left",
                              }}
                            >
                              File URL
                            </th>
                            <th style={{ border: "1px solid #ddd", padding: 8 }}>
                              Status
                            </th>
                            <th style={{ border: "1px solid #ddd", padding: 8 }}>
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignments.map((a) => (
                            <tr key={a.assignment_id}>
                              <td
                                style={{ border: "1px solid #ddd", padding: 8 }}
                              >
                                {a.module_title}
                              </td>
                              <td
                                style={{ border: "1px solid #ddd", padding: 8 }}
                              >
                                {a.assignment_title}
                              </td>
                              <td
                                style={{
                                  border: "1px solid #ddd",
                                  padding: 8,
                                  textAlign: "center",
                                }}
                              >
                                {a.max_score}
                              </td>
                              <td style={{ border: "1px solid #ddd", padding: 8 }}>
                                {a.has_submission ? (
                                  <span>{a.submission?.file_url || ""}</span>
                                ) : (
                                  <input
                                    style={{ width: "100%", padding: 6 }}
                                    placeholder="Paste Google Drive / link here"
                                    value={fileUrlByAssignment[a.assignment_id] || ""}
                                    onChange={(e) =>
                                      setFileUrlByAssignment((prev) => ({
                                        ...prev,
                                        [a.assignment_id]: e.target.value,
                                      }))
                                    }
                                  />
                                )}
                              </td>
                              <td
                                style={{
                                  border: "1px solid #ddd",
                                  padding: 8,
                                  textAlign: "center",
                                }}
                              >
                                {a.has_submission ? a.submission?.status || "Submitted" : "-"}
                              </td>
                              <td
                                style={{
                                  border: "1px solid #ddd",
                                  padding: 8,
                                  textAlign: "center",
                                }}
                              >
                                {a.has_submission ? (
                                  <button disabled style={{ padding: "6px 10px" }}>
                                    Submitted ✅
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => submitFileUrl(a.assignment_id)}
                                    style={{ padding: "6px 10px", cursor: "pointer" }}
                                    disabled={loading}
                                  >
                                    Submit
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : (
                    <p>Loading...</p>
                  )}
                </>
              ) : (
                <>
                  <h3>Lecturer – Submissions</h3>
                  <p style={{ color: "#555" }}>
                    Tip: You must be marked as <b>Staff</b> in Django Admin to access this.
                  </p>

                  {lecturerSubmissions.length === 0 ? (
                    <p>No submissions yet.</p>
                  ) : (
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        border: "1px solid #ddd",
                      }}
                    >
                      <thead>
                        <tr>
                          <th
                            style={{
                              border: "1px solid #ddd",
                              padding: 8,
                              textAlign: "left",
                            }}
                          >
                            Student
                          </th>
                          <th
                            style={{
                              border: "1px solid #ddd",
                              padding: 8,
                              textAlign: "left",
                            }}
                          >
                            Module
                          </th>
                          <th
                            style={{
                              border: "1px solid #ddd",
                              padding: 8,
                              textAlign: "left",
                            }}
                          >
                            Assignment
                          </th>
                          <th
                            style={{
                              border: "1px solid #ddd",
                              padding: 8,
                              textAlign: "left",
                            }}
                          >
                            File URL
                          </th>
                          <th style={{ border: "1px solid #ddd", padding: 8 }}>
                            Sub Status
                          </th>
                          <th style={{ border: "1px solid #ddd", padding: 8 }}>
                            Score
                          </th>
                          <th
                            style={{
                              border: "1px solid #ddd",
                              padding: 8,
                              textAlign: "left",
                            }}
                          >
                            Feedback
                          </th>
                          <th style={{ border: "1px solid #ddd", padding: 8 }}>
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {lecturerSubmissions.map((s) => (
                          <tr key={s.submission_id}>
                            <td style={{ border: "1px solid #ddd", padding: 8 }}>
                              {s.student_email}
                            </td>
                            <td style={{ border: "1px solid #ddd", padding: 8 }}>
                              {s.module_title}
                            </td>
                            <td style={{ border: "1px solid #ddd", padding: 8 }}>
                              {s.assignment_title}{" "}
                              {s.grade?.locked ? (
                                <span style={{ marginLeft: 8 }}>
                                  <b>(FINAL ✅)</b>
                                </span>
                              ) : null}
                            </td>
                            <td style={{ border: "1px solid #ddd", padding: 8 }}>
                              <a href={s.file_url} target="_blank" rel="noreferrer">
                                {s.file_url}
                              </a>
                            </td>
                            <td
                              style={{
                                border: "1px solid #ddd",
                                padding: 8,
                                textAlign: "center",
                              }}
                            >
                              {s.status}
                            </td>
                            <td
                              style={{
                                border: "1px solid #ddd",
                                padding: 8,
                                textAlign: "center",
                              }}
                            >
                              <input
                                disabled={s.grade?.locked}
                                style={{ width: 80, padding: 6 }}
                                value={scoreBySubmission[s.submission_id] ?? ""}
                                onChange={(e) =>
                                  setScoreBySubmission((prev) => ({
                                    ...prev,
                                    [s.submission_id]: e.target.value,
                                  }))
                                }
                                placeholder={`0-${s.max_score}`}
                              />
                              <div style={{ fontSize: 12, color: "#666" }}>
                                Max {s.max_score}
                              </div>
                            </td>
                            <td style={{ border: "1px solid #ddd", padding: 8 }}>
                              <input
                                disabled={s.grade?.locked}
                                style={{ width: "100%", padding: 6 }}
                                value={feedbackBySubmission[s.submission_id] ?? ""}
                                onChange={(e) =>
                                  setFeedbackBySubmission((prev) => ({
                                    ...prev,
                                    [s.submission_id]: e.target.value,
                                  }))
                                }
                                placeholder="Feedback..."
                              />
                            </td>
                            <td
                              style={{
                                border: "1px solid #ddd",
                                padding: 8,
                                textAlign: "center",
                              }}
                            >
                              <button
                                onClick={() => gradeOne(s.submission_id)}
                                style={{ padding: "6px 10px", cursor: "pointer" }}
                                disabled={loading || s.grade?.locked}
                              >
                                Save Grade
                              </button>

                              <button
                                onClick={() => lockOne(s.submission_id)}
                                style={{
                                  padding: "6px 10px",
                                  cursor: "pointer",
                                  marginLeft: 8,
                                }}
                                disabled={loading || s.grade?.locked}
                              >
                                {s.grade?.locked ? "FINAL ✅" : "Lock"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </>
          )}

          <p style={{ marginTop: 14, color: "crimson" }}>{message}</p>
        </>
      )}
    </div>
  );
}
