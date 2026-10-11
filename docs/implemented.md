# Implementation tracker

**As of 11 October 2026:** The first implementation slice is a demo policy file, standard-library validator, and unit tests. No application, database migrations, service configuration, infrastructure, or live integration have been implemented or verified.

## Present in the repository

| Item | Status | Evidence |
|---|---|---|
| Research and concept | Documented | [info.md](../info.md) |
| Product requirements | Documented | [prd.md](../prd.md) |
| Roadmap and technical specifications | Documented | [Documentation index](./README.md) |
| Demo pilot policy and validator | Verified locally | [Policy file](../config/policies/demo-pilot-v1.json), [validator](../govfix/policy.py), [tests](../tests/test_policy.py); `python3 -m govfix.policy config/policies/demo-pilot-v1.json` and `python3 -m unittest discover -s tests -v` passed on macOS, 11 Oct 2026 |
| Backend workflow engine | Not started | No source code |
| Database and migrations | Not started | No source code |
| Citizen, officer, or supervisor UI | Not started | No source code |
| ElevenLabs integration | Not started | No source code or tested account configuration |
| Automated tests | Verified locally for policy validation only | Seven tests passed on macOS, 11 Oct 2026 |
| Deployment | Not started | No deployment configuration |

## How to update this file

Move an item to **Implemented** only when its code is in the repository. Move it to **Verified** only after recording a reproducible test or demo result with the relevant command, environment, date, and link to the artifact or commit. List partial work plainly; do not infer completion from a design document or screenshot.

| Feature | Status | Evidence / test | Last checked |
|---|---|---|---|
| Demo policy validation | Verified locally | CLI accepted demo policy (SHA-256 `99d7a59147c45735a8e6bb3ed68d9f2d13158232ffa1c26a92f8135b5a898b68`); seven unit tests passed | 11 Oct 2026 |
| Case creation and confirmation | Not started | — | 11 Oct 2026 |
| Transition and role enforcement | Not started | — | 11 Oct 2026 |
| Audit of accepted and refused actions | Not started | — | 11 Oct 2026 |
| SLA and escalation worker | Not started | — | 11 Oct 2026 |
| Resolution evidence and verification | Not started | — | 11 Oct 2026 |
| Voice intake and status | Not started | — | 11 Oct 2026 |
| Officer and supervisor views | Not started | — | 11 Oct 2026 |

The [roadmap](./roadmap.md) records intended sequence, not completed progress.
