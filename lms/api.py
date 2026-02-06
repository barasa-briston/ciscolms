from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Enrollment, Assignment, Submission


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_courses(request):
    qs = (
        Enrollment.objects
        .filter(student=request.user, status="ACTIVE")
        .select_related("course", "cohort")
        .order_by("course__title")
    )

    courses = []
    for e in qs:
        courses.append({
            "course_id": e.course.id,
            "course_title": e.course.title,
            "course_description": getattr(e.course, "description", "") or "",
            "cohort": {"id": e.cohort.id, "name": e.cohort.name},
        })

    return Response({"courses": courses})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def course_assignments(request):
    """
    Returns all assignments in a course + the student's submission (if any).
    """
    course_id = request.query_params.get("course_id")
    if not course_id:
        return Response({"detail": "course_id is required"}, status=status.HTTP_400_BAD_REQUEST)

    if not Enrollment.objects.filter(student=request.user, course_id=course_id, status="ACTIVE").exists():
        return Response({"detail": "Not enrolled in this course."}, status=status.HTTP_403_FORBIDDEN)

    assignments = (
        Assignment.objects
        .filter(module__course_id=course_id)
        .select_related("module")
        .order_by("module__order", "id")
    )

    subs = Submission.objects.filter(student=request.user, assignment__in=assignments)
    sub_map = {s.assignment_id: s for s in subs}

    data = []
    for a in assignments:
        s = sub_map.get(a.id)

        # Try to read due date safely (your model might use due_date or due_at)
        due = getattr(a, "due_date", None) or getattr(a, "due_at", None)

        data.append({
            "assignment_id": a.id,
            "module_title": a.module.title,
            "assignment_title": a.title,
            "max_score": a.max_score,
            "due_date": due,
            "has_submission": s is not None,
            "submission": None if not s else {
                "id": s.id,
                "file_url": getattr(s, "file_url", "") or "",
                "status": getattr(s, "status", "") or "",
                "submitted_at": getattr(s, "submitted_at", None),
            }
        })

    return Response({"assignments": data})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def submit_assignment(request, assignment_id: int):
    """
    Submit a file URL for an assignment.
    Rule: one submission per student per assignment.
    Auto-status: Late if past due date, else On Time.
    """
    file_url = (request.data.get("file_url") or "").strip()
    if not file_url:
        return Response({"detail": "file_url is required"}, status=status.HTTP_400_BAD_REQUEST)

    # Ensure assignment exists
    try:
        assignment = Assignment.objects.select_related("module").get(id=assignment_id)
    except Assignment.DoesNotExist:
        return Response({"detail": "Assignment not found."}, status=status.HTTP_404_NOT_FOUND)

    course_id = assignment.module.course_id

    # Ensure enrolled
    if not Enrollment.objects.filter(student=request.user, course_id=course_id, status="ACTIVE").exists():
        return Response({"detail": "Not enrolled in this course."}, status=status.HTTP_403_FORBIDDEN)

    # Prevent duplicates
    if Submission.objects.filter(student=request.user, assignment=assignment).exists():
        return Response({"detail": "You already submitted this assignment."}, status=status.HTTP_409_CONFLICT)

    now = timezone.now()
    due = getattr(assignment, "due_date", None) or getattr(assignment, "due_at", None)

    # Default status labels (match your admin choices if different)
    status_value = "On Time"
    if due and now > due:
        status_value = "Late"

    submission = Submission.objects.create(
        assignment=assignment,
        student=request.user,
        file_url=file_url,
        status=status_value,
    )

    return Response({
        "detail": "Submitted successfully ✅",
        "submission": {
            "id": submission.id,
            "assignment_id": assignment.id,
            "file_url": submission.file_url,
            "status": submission.status,
            "submitted_at": getattr(submission, "submitted_at", None),
        }
    }, status=status.HTTP_201_CREATED)
