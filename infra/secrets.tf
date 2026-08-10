resource "random_password" "admin_token" {
  count   = var.admin_token == null ? 1 : 0
  length  = 48
  special = false
}

locals {
  admin_token_value = var.admin_token != null ? var.admin_token : random_password.admin_token[0].result

  secret_values = {
    google-api-key             = var.google_api_key
    admin-token                = local.admin_token_value
    sentry-dsn                 = var.sentry_dsn
    electrolux-api-key         = var.electrolux_api_key
    electrolux-refresh-token   = var.electrolux_refresh_token
  }

  # Secret Manager rejects empty payloads, so we drive iteration off a
  # non-sensitive set of secret IDs and skip optional ones (sentry-dsn) when
  # their value is empty. Iterating a map of sensitive values would propagate
  # sensitivity into for_each keys, which Terraform forbids — hence
  # nonsensitive().
  secret_ids = toset(compact([
    "google-api-key",
    "admin-token",
    nonsensitive(var.sentry_dsn) != "" ? "sentry-dsn" : "",
    # The oven is optional and its two credentials travel together: provisioning
    # one without the other would leave the function with a key it cannot refresh.
    nonsensitive(var.electrolux_api_key) != "" ? "electrolux-api-key" : "",
    nonsensitive(var.electrolux_refresh_token) != "" ? "electrolux-refresh-token" : "",
  ]))
}

resource "google_secret_manager_secret" "this" {
  for_each  = local.secret_ids
  project   = google_project.this.project_id
  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "this" {
  for_each    = local.secret_ids
  secret      = google_secret_manager_secret.this[each.value].id
  secret_data = local.secret_values[each.value]
}
