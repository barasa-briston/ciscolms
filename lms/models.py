from django.db import models

# Create your models here.

from django.conf import settings
from django.db import models
from django.utils import timezone

class Cohort(models.Model):
    name = models.CharField(max_length=120, unique=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    def __str__(self):
        return self.name


class ApprovedStudentEmail(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING"
        APPROVED = "APPROVED"
        REVOKED = "REVOKED"

    email = models.EmailField(unique=True)
    cohort = models.ForeignKey(Cohort, on_delete=models.PROTECT, related_name="approved_emails")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="approved_students"
    )
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.email} ({self.status})"


class Course(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.title


class Enrollment(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE"
        COMPLETED = "COMPLETED"
        DROPPED = "DROPPED"

    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="enrollments")
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="enrollments")
    cohort = models.ForeignKey(Cohort, on_delete=models.PROTECT, related_name="enrollments")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    enrolled_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("student", "course", "cohort")


class Module(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="modules")
    title = models.CharField(max_length=200)
    order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["order"]


class Assignment(models.Model):
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="assignments")
    title = models.CharField(max_length=200)
    instructions = models.TextField(blank=True)
    due_date = models.DateTimeField(null=True, blank=True)
    max_score = models.PositiveIntegerField(default=100)
    allow_late = models.BooleanField(default=True)


class Submission(models.Model):
    class Status(models.TextChoices):
        ON_TIME = "ON_TIME"
        LATE = "LATE"
        MISSING = "MISSING"

    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="submissions")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="submissions")
    file_url = models.URLField()  # later you can switch to FileField + S3/R2
    submitted_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ON_TIME)

    class Meta:
        unique_together = ("assignment", "student")


class Grade(models.Model):
    submission = models.OneToOneField("Submission", on_delete=models.CASCADE, related_name="grade")
    score = models.FloatField()
    feedback = models.TextField(blank=True, default="")

    # ✅ NEW: Locking fields
    locked = models.BooleanField(default=False)
    locked_at = models.DateTimeField(null=True, blank=True)
    locked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="locked_grades"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def lock(self, by_user=None):
        self.locked = True
        self.locked_at = timezone.now()
        self.locked_by = by_user
        self.save(update_fields=["locked", "locked_at", "locked_by"])
