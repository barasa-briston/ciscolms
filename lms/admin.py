from django.contrib import admin

# Register your models here.

from django.contrib import admin
from .models import *

admin.site.register(Cohort)
admin.site.register(ApprovedStudentEmail)
admin.site.register(Course)
admin.site.register(Enrollment)
admin.site.register(Module)
admin.site.register(Assignment)
admin.site.register(Submission)
admin.site.register(Grade)
