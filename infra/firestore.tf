resource "google_firebaserules_ruleset" "firestore" {
  provider = google-beta
  project  = google_project.this.project_id

  source {
    files {
      name    = "firestore.rules"
      content = file("${path.root}/../firestore.rules")
    }
  }

  depends_on = [google_firestore_database.default]
}

resource "google_firebaserules_release" "firestore" {
  provider     = google-beta
  project      = google_project.this.project_id
  name         = "cloud.firestore"
  ruleset_name = "projects/${google_project.this.project_id}/rulesets/${google_firebaserules_ruleset.firestore.name}"
}

locals {
  firestore_indexes = jsondecode(file("${path.root}/../firestore.indexes.json")).indexes
}

resource "google_firestore_index" "composite" {
  # Keyed by a stable identifier (collection + fields), not the array position, so
  # adding or removing an index never re-keys — and therefore never destroys and
  # recreates — the others. A position key caused a transient FAILED_PRECONDITION
  # whenever the list changed in the middle.
  for_each = {
    for idx in local.firestore_indexes :
    "${idx.collectionGroup}|${join(",", [for f in idx.fields : "${f.fieldPath}:${try(f.order, f.arrayConfig, "NA")}"])}" => idx
  }

  provider    = google-beta
  project     = google_project.this.project_id
  database    = google_firestore_database.default.name
  collection  = each.value.collectionGroup
  query_scope = each.value.queryScope

  # A field is indexed either by its order (ASCENDING/DESCENDING) or, when it holds an
  # array queried with `array-contains`, by its array config — never both, and Firestore
  # refuses a field that declares neither.
  dynamic "fields" {
    for_each = each.value.fields
    content {
      field_path   = fields.value.fieldPath
      order        = try(fields.value.order, null)
      array_config = try(fields.value.arrayConfig, null)
    }
  }
}
