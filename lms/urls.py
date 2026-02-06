from django.urls import path

from .views import GoogleAuthView, my_course_grades
from .api import my_courses, course_assignments, submit_assignment
from .lecturer_api import lecturer_submissions, grade_submission, lock_grade

urlpatterns = [
    # Student auth
    path("auth/google/", GoogleAuthView.as_view(), name="auth-google"),

    # Student endpoints
    path("me/courses/", my_courses, name="my-courses"),
    path("me/assignments/", course_assignments, name="course-assignments"),
    path("me/grades/", my_course_grades, name="my-course-grades"),
    path("assignments/<int:assignment_id>/submit/", submit_assignment, name="submit-assignment"),

    # Lecturer endpoints (staff only)
    path("lecturer/submissions/", lecturer_submissions, name="lecturer-submissions"),
    path("lecturer/submissions/<int:submission_id>/grade/", grade_submission, name="grade-submission"),
    path("lecturer/submissions/<int:submission_id>/lock/", lock_grade, name="lock-grade"),

]
