resource "google_service_account" "function" {
  project      = google_project.this.project_id
  account_id   = "shuhari-runtime"
  display_name = "Shuhari runtime"
}

resource "google_project_iam_member" "function_firestore" {
  project = google_project.this.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.function.email}"
}

# Cloud Functions Gen 2 builds run in Cloud Build under the default Compute
# service account. In a fresh project that role binding is not granted by
# default, so the first deploy fails with "missing permission on the build
# service account". We bind it explicitly to make bootstrap deterministic.
data "google_compute_default_service_account" "default" {
  project    = google_project.this.project_id
  depends_on = [google_project_service.apis]
}

resource "google_project_iam_member" "compute_default_builder" {
  project = google_project.this.project_id
  role    = "roles/cloudbuild.builds.builder"
  member  = "serviceAccount:${data.google_compute_default_service_account.default.email}"
}

resource "google_secret_manager_secret_iam_member" "function" {
  for_each  = google_secret_manager_secret.this
  project   = google_project.this.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.function.email}"
}

resource "google_storage_bucket" "source" {
  project                     = google_project.this.project_id
  name                        = "${google_project.this.project_id}-fn-source"
  location                    = local.bucket_location
  force_destroy               = true
  uniform_bucket_level_access = true

  depends_on = [google_project_service.apis]
}

data "archive_file" "source" {
  type        = "zip"
  source_dir  = "${path.root}/../.output/server"
  output_path = "${path.root}/../.output/server-source.zip"
}

resource "google_storage_bucket_object" "source" {
  name   = "source-${data.archive_file.source.output_md5}.zip"
  bucket = google_storage_bucket.source.name
  source = data.archive_file.source.output_path
}

resource "google_cloudfunctions2_function" "server" {
  provider = google-beta
  project  = google_project.this.project_id
  name     = "shuhari-server"
  location = var.region

  build_config {
    runtime     = "nodejs22"
    entry_point = "server"

    source {
      storage_source {
        bucket = google_storage_bucket.source.name
        object = google_storage_bucket_object.source.name
      }
    }
  }

  service_config {
    available_memory      = "512M"
    timeout_seconds       = 60
    max_instance_count    = 100
    min_instance_count    = 0
    service_account_email = google_service_account.function.email

    # Plain variables, not Secret Manager entries: an App Store app id is public,
    # and the comp list is an access list rather than a credential. NITRO_APPLE_ENVIRONMENT
    # is deliberately unset — blank makes the server try Production then Sandbox,
    # which is what a shipped app needs (TestFlight and App Review sign in Sandbox).
    environment_variables = {
      NITRO_FIREBASE_PROJECT_ID = google_project.this.project_id
      NITRO_TRIAL_PHOTOS_BUCKET = google_storage_bucket.trial_photos.name
      NITRO_APPLE_APP_ID        = var.apple_app_id
      NITRO_PREMIUM_USER_IDS    = var.premium_user_ids
      NITRO_ELECTROLUX_USER_ID  = var.electrolux_user_id
    }

    dynamic "secret_environment_variables" {
      for_each = google_secret_manager_secret.this
      content {
        key        = "NITRO_${replace(upper(secret_environment_variables.key), "-", "_")}"
        project_id = google_project.this.project_id
        secret     = secret_environment_variables.value.secret_id
        version    = "latest"
      }
    }
  }

  depends_on = [
    google_project_iam_member.function_firestore,
    google_project_iam_member.compute_default_builder,
    google_secret_manager_secret_iam_member.function,
  ]
}

# Auth is enforced inside the function itself (server/middleware/auth.ts
# verifies the Firebase ID token), so the underlying Cloud Run service is
# left publicly invokable.
resource "google_cloud_run_service_iam_member" "invoker" {
  project  = google_project.this.project_id
  location = var.region
  service  = google_cloudfunctions2_function.server.name
  role     = "roles/run.invoker"
  member   = "allUsers"

  depends_on = [google_org_policy_policy.allow_public_iam]
}
