from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Submission, Grade


def require_staff(user):
    return bool(user and user.is_authenticated and user.is_staff)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def lecturer_submissions(request):
    if not require_staff(request.user):
        return Response({"detail": "Staff only."}, status=status.HTTP_403_FORBIDDEN)

    course_id = request.query_params.get("course_id")
    assignment_id = request.query_params.get("assignment_id")

    if not course_id:
        return Response({"detail": "course_id is required"}, status=status.HTTP_400_BAD_REQUEST)

    qs = (
        Submission.objects
        .filter(assignment__module__course_id=course_id)
        .select_related("student", "assignment", "assignment__module")
        .order_by("-submitted_at")
    )
    if assignment_id:
        qs = qs.filter(assignment_id=assignment_id)

    grades = Grade.objects.filter(submission__in=qs).select_related("locked_by")
    grade_map = {g.submission_id: g for g in grades}

    items = []
    for s in qs:
        g = grade_map.get(s.id)
        items.append({
            "submission_id": s.id,
            "student_email": getattr(s.student, "email", "") or s.student.username,
            "module_title": s.assignment.module.title,
            "assignment_id": s.assignment.id,
            "assignment_title": s.assignment.title,
            "max_score": s.assignment.max_score,
            "file_url": getattr(s, "file_url", "") or "",
            "status": getattr(s, "status", "") or "",
            "submitted_at": getattr(s, "submitted_at", None),

            "graded": g is not None,
            "grade": None if not g else {
                "score": g.score,
                "feedback": g.feedback,
                "locked": g.locked,
                "locked_at": g.locked_at,
                "locked_by": getattr(g.locked_by, "email", None) if g.locked_by else None,
            }
        })

    return Response({"submissions": items})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def grade_submission(request, submission_id: int):
    if not require_staff(request.user):
        return Response({"detail": "Staff only."}, status=status.HTTP_403_FORBIDDEN)

    score = request.data.get("score")
    feedback = request.data.get("feedback", "")

    if score is None:
        return Response({"detail": "score is required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        score = float(score)
    except Exception:
        return Response({"detail": "score must be a number"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        submission = Submission.objects.select_related("assignment").get(id=submission_id)
    except Submission.DoesNotExist:
        return Response({"detail": "Submission not found."}, status=status.HTTP_404_NOT_FOUND)

    max_score = float(submission.assignment.max_score)
    if score < 0 or score > max_score:
        return Response({"detail": f"score must be between 0 and {max_score}"}, status=status.HTTP_400_BAD_REQUEST)

    grade = Grade.objects.filter(submission=submission).first()

    # ✅ If locked, do not allow edits
    if grade and grade.locked:
        return Response({"detail": "Grade is locked (FINAL). Cannot edit."}, status=status.HTTP_409_CONFLICT)

    if not grade:
        grade = Grade.objects.create(submission=submission, score=score, feedback=feedback)
    else:
        grade.score = score
        grade.feedback = feedback
        grade.save()

    return Response({
        "detail": "Graded successfully ✅",
        "grade": {"score": grade.score, "feedback": grade.feedback, "locked": grade.locked},
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def lock_grade(request, submission_id: int):
    """
    Lock grade for a submission (finalize).
    Requires grade exists.
    """
    if not require_staff(request.user):
        return Response({"detail": "Staff only."}, status=status.HTTP_403_FORBIDDEN)

    grade = Grade.objects.filter(submission_id=submission_id).first()
    if not grade:
        return Response({"detail": "Grade not found. Grade first, then lock."}, status=status.HTTP_404_NOT_FOUND)

    if grade.locked:
        return Response({"detail": "Already locked."}, status=status.HTTP_200_OK)

    grade.lock(by_user=request.user)

    return Response({"detail": "Grade locked (FINAL) ✅"})
