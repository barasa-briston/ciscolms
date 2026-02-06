import os

from django.contrib.auth import get_user_model
from django.db import IntegrityError

from google.oauth2 import id_token
from google.auth.transport import requests

from rest_framework.views import APIView
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.permissions import IsAuthenticated

from rest_framework_simplejwt.tokens import RefreshToken

from .models import ApprovedStudentEmail, Enrollment, Submission
from .serializers import GoogleAuthSerializer

User = get_user_model()
PASS_MARK = 70.0


def issue_jwt_for_user(user) -> dict:
    refresh = RefreshToken.for_user(user)
    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
    }


class GoogleAuthView(APIView):
    permission_classes = [permissions.AllowAny]

    # Optional: helpful message if you open endpoint in browser
    def get(self, request):
        return Response(
            {"detail": "Use POST with JSON: {'id_token': '<google_id_token>'}"},
            status=status.HTTP_200_OK
        )

    def post(self, request):
        serializer = GoogleAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token = serializer.validated_data["id_token"]

        google_client_id = os.getenv("GOOGLE_CLIENT_ID")

        try:
            if google_client_id:
                payload = id_token.verify_oauth2_token(
                    token,
                    requests.Request(),
                    audience=google_client_id
                )
            else:
                # fallback for local dev
                payload = id_token.verify_oauth2_token(
                    token,
                    requests.Request()
                )
        except Exception:
            return Response(
                {"detail": "Invalid Google token."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        email = (payload.get("email") or "").lower().strip()
        email_verified = payload.get("email_verified", False)

        if not email or not email_verified:
            return Response(
                {"detail": "Google email not verified."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        approved = (
            ApprovedStudentEmail.objects
            .filter(email=email, status="APPROVED")
            .select_related("cohort")
            .first()
        )

        if not approved:
            return Response(
                {"detail": "Your email is not approved yet. Please contact the administrator."},
                status=status.HTTP_403_FORBIDDEN
            )

        # ✅ Safer user creation (prevents MultipleObjectsReturned & username collisions)
        # Prefer existing user by email
        user = User.objects.filter(email=email).order_by("id").first()

        if not user:
            base_username = email.split("@")[0]

            # ensure username uniqueness
            username = base_username
            i = 1
            while User.objects.filter(username=username).exists():
                i += 1
                username = f"{base_username}{i}"

            try:
                user = User.objects.create_user(
                    username=username,
                    email=email
                )
            except IntegrityError:
                # if something still raced, just fetch
                user = User.objects.filter(email=email).order_by("id").first()

        tokens = issue_jwt_for_user(user)

        return Response({
            "tokens": tokens,
            "user": {
                "id": user.id,
                "email": user.email,
                "cohort": {
                    "id": approved.cohort.id,
                    "name": approved.cohort.name,
                },
                # ✅ Role flags for frontend
                "is_lecturer": bool(user.is_staff),
                "is_admin": bool(user.is_superuser),
            }
        })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_course_grades(request):
    course_id = request.query_params.get("course_id")
    if not course_id:
        return Response(
            {"detail": "course_id is required"},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not Enrollment.objects.filter(
        student=request.user,
        course_id=course_id,
        status="ACTIVE"
    ).exists():
        return Response(
            {"detail": "Not enrolled in this course."},
            status=status.HTTP_403_FORBIDDEN
        )

    submissions = (
        Submission.objects
        .filter(
            student=request.user,
            assignment__module__course_id=course_id
        )
        .select_related("assignment", "assignment__module", "grade")
        .order_by("assignment__module__order", "assignment__id")
    )

    items = []
    percents = []

    for s in submissions:
        assignment = s.assignment
        grade = getattr(s, "grade", None)

        if grade and assignment.max_score > 0:
            percent = (float(grade.score) / float(assignment.max_score)) * 100.0
            percents.append(percent)
        else:
            percent = None

        items.append({
            "assignment_id": assignment.id,
            "module_title": assignment.module.title,
            "assignment_title": assignment.title,
            "max_score": assignment.max_score,
            "score": None if not grade else grade.score,
            "percent": percent,
            "feedback": "" if not grade else (grade.feedback or ""),
            "locked": False if grade is None else bool(getattr(grade, "locked", False)),
            "submitted_at": s.submitted_at,
        })

    average = (sum(percents) / len(percents)) if percents else None

    if average is None:
        result = None
    else:
        result = "PASS" if average >= PASS_MARK else "F"

    return Response({
        "course_id": int(course_id),
        "average_percent": average,
        "result": result,
        "pass_mark": PASS_MARK,
        "grades": items,
    })
