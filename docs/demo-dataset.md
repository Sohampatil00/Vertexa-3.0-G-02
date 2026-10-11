# Civic report demo dataset

The expanded catalog is `config/policies/demo-pilot-v3.json`: 20 report types in
Public Works, Sanitation, Electrical, Water Supply, and Drainage. It covers potholes,
damaged roads/footpaths/manholes, road obstructions, speed breakers, faded markings,
waste collection, overflowing/damaged bins, dumped waste, construction debris,
street cleaning, streetlights, water leaks/outages/pressure, blocked drains,
sewage overflow, and damaged drain covers.

All locations, reports, deadlines, photos, and work outcomes are fictional demo
material. Policy v1 and the previously imported v2 remain immutable. Case records
keep their original policy; v3 applies to new reports once selected by configuration.

## Populate a database

Preview with `uv run python scripts/seed_demo.py`. This command writes nothing.
To import, explicitly export `GOVFIX_DATABASE_URL`; PostgreSQL also needs a trusted
`GOVFIX_MIGRATION_DATABASE_URL` with policy/account provisioning rights. The runtime
connection retains its restricted permissions. Then run:

```sh
uv run python scripts/seed_demo.py --apply
```

Use `--citizen pilot-citizen` to associate the sample cases with an existing active,
verified citizen without changing their password. Otherwise they belong to
`sample-citizen`. Do not change this option when repeating an import into the same
database. After a successful import, configure `GOVFIX_POLICY_VERSION=demo-pilot-v3`
and restart the API and worker.

The importer creates 11 sample accounts: citizen, intake officer, dispatcher,
supervisor, ward head, auditor, and one field officer for each of five departments.
Staff cover both demonstration wards. Random passwords are stored in
`var/demo-credentials.json` with mode 0600, excluded from Git. Retain this file for
repeat imports; no passwords are printed or written to documentation.

The 34 situations in `config/demo-scenarios-v3.json` cover:

| State | Cases |
|---|---:|
| Submitted | 9 |
| Validated | 7 |
| Assigned | 6 |
| In progress | 7 |
| Awaiting citizen verification | 1 |
| Supervisor review after a dispute | 1 |
| Closed after citizen acceptance | 2 |
| Rejected duplicate | 1 |

All workflow transitions use the application's API with scoped identities,
idempotency keys, and current case versions. Four resolution photos are validated
and uploaded to private evidence storage. For selected demo scenarios, the importer
simulates historical workflow time so the worker produces warnings and overdue
escalations; this is confined to the standalone importer. Case maps omit invented
GPS coordinates. Category photos are clearly labeled as illustrations and are not
treated as submitted evidence.

Repeating an unchanged import resumes incomplete cases and does not duplicate
cases, evidence, users, or audit events. An import interrupted after a case was
manually changed can require a new scenario key rather than forcing its state.
Temporary importer login tokens are removed after the run. Existing reports,
account passwords, and original policy definitions are preserved.

## Generated images and prompt specifications

Mode: built-in image generation (`image_gen`), separate assets, opaque backgrounds.
The resulting PNGs were resized to 1200 pixels wide and encoded as JPEGs for the
application. All eight images were visually inspected. Assets are saved under
`web/public/demo/civic-issues/` and served under `/app/demo/civic-issues/`.

Shared prompt direction: photorealistic natural documentary photograph for a
fictional municipal grievance demonstration; ordinary Indian urban surroundings;
horizontal smartphone composition; believable road or pavement materials;
daylight except the streetlight scene at dusk; no close-up people, readable signs,
plates, logos, text, or watermark. Images are synthetic examples.

| Saved image | Scene specification |
|---|---|
| `pothole.jpg` | Rainwater-filled pothole on an Indian urban road |
| `garbage.jpg` | Overflowing waste collection point beside a residential street |
| `streetlight.jpg` | Unlit streetlight along a residential lane at dusk |
| `water-leak.jpg` | Broken supply pipe leaking water beside a street |
| `blocked-drain.jpg` | Leaves and silt blocking a stormwater grate with pooled water |
| `broken-footpath.jpg` | Broken paving slabs and unsafe walking surface |
| `pothole-repaired.jpg` | Completed asphalt patch with temporary traffic cones |
| `garbage-cleared.jpg` | Cleared and swept collection point with orderly bins |

Original PNGs from this session are in
`/Users/sohampatil/.codex/generated_images/01a12b31-aa92-7e20-ac65-69b63aa201ac/`.

## Verification

`tests/test_demo_seed.py` exercises a complete import and repeat import, preserving
v2, populating every v3 category, producing overdue escalations, cleaning temporary
tokens, and checking that evidence requires authentication. The JPEG upload test
in `tests/test_operations.py` covers an actual encoded JPEG and download round trip.
Browser checks cover category selection, image loading, private evidence preview,
Marathi labels, contrast, and mobile width.

The shared Supabase import completed on 11 October 2026: 34 v3 cases belong to
`pilot-citizen`, and 11 sample accounts have been provisioned. The private local
configuration selects v3. The trusted administration connection is saved separately
from the restricted runtime connection; both remain excluded from Git. A private
pre-import snapshot is saved at `var/before-demo-v2-20261011.zip`.

The backend suite passed 182 tests, with 4 optional checks skipped. Browser checks
passed for 20 report choices, six category photos, private resolution previews,
Hindi and Marathi labels, contrast on/off, and mobile layout. The shared database
was also checked through the runtime API, including all four photo checksums and
unauthenticated evidence refusals. All 37 v3 notification messages were delivered.
The updated local interface is running at `http://127.0.0.1:8000/app/` with the
restricted runtime connection and an embedded worker; the admin URI is omitted
from the server's environment.
