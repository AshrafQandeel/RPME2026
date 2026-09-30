# Test Cases (Production-readiness checklist)

Automated coverage (mock environment): `node tests/run-tests.cjs`, `node tests/e2e.cjs`. Automated tests are marked **[A]**. **Every case must also be executed manually in the real Google Workspace before go-live** (record result, tester, date). Prepare users: `mlro@`, `dmlro@`, `sysadmin@`, `auditor1@`, `auditor2@`, `viewer@`, plus one unregistered Google account.

## A. Authentication
| # | Case | Expected |
|---|---|---|
| A1 | Unregistered Google account opens the URL | "Access Denied" page; no data returned **[A]** |
| A2 | Registered but *Inactive* user | Access Denied |
| A3 | Auditor / MLRO / DMLRO / System Administrator / Viewer sign in | Each sees only the navigation and actions of their role **[A]** |
| A4 | Call `api('userList')` as Auditor (browser console) | "You do not have permission..." and a `Permission Denied` audit entry **[A]** |
| A5 | Call `google.script.run.setupAMLSystem()` as a normal user | Rejected (owner only) **[A]** |

## B. Company management
| # | Case | Expected |
|---|---|---|
| B1 | Create company with required fields | ID `CMP-00000n`; Drive folder + 8 sub-folders; audit `Company Created` **[A]** |
| B2 | Create without QFC and CR | Error "Provide at least a QFC number or a CR number" **[A]** |
| B3 | Duplicate QFC / CR (any case/spacing) / name | Errors "QFC number already registered", "CR number already registered", "Company already exists" **[A]** |
| B4 | Invalid date (2026-02-31), invalid email | Validation errors **[A]** |
| B5 | Edit as Auditor (own, Draft) / as Viewer | Allowed / denied **[A]** |
| B6 | Search by name, QFC, CR, UBO name, QID (MLRO only), engagement, auditor, risk | Correct hits; Viewer cannot search QID **[A]** |
| B7 | Filters: risk, engagement type, review status, document status, auditor, dates, expiry range, company status | Correct subsets |
| B8 | Delete as Auditor / as MLRO (reason required) | Denied / soft-deleted, hidden from lists, Drive folder kept **[A]** |
| B9 | Restore as MLRO; re-create deleted duplicate | Restored / duplicate blocked with "deleted records" hint **[A]** |
| B10 | Run `setupAMLSystem()` again | No duplicate spreadsheet/folders/sheets **[A]** |

## C. Documents
| # | Case | Expected |
|---|---|---|
| C1 | Upload PDF to each document type | Stored in the mapped sub-folder; metadata row; file ID not visible in browser **[A]** |
| C2 | Upload `.exe`, wrong-content `.pdf`, > limit | "File type not supported" / "File size exceeds allowed limit" **[A]** |
| C3 | Upload second CR | Old = Superseded, new = Current, v2, history kept **[A]** |
| C4 | Multiple Bank Statements | All Current **[A]** |
| C5 | Passport for a UBO re-uploaded | Previous version for that UBO superseded **[A]** |
| C6 | View (PDF/image) and Download | Opens/downloads; audit `Document Viewed/Downloaded` **[A]** |
| C7 | Expiry in past / within 7/30/60/90 days | Shown as Expired / badges; dashboard buckets; daily trigger marks Expired **[A]** |
| C8 | Auditor deletes own document / another user's | Allowed with reason / denied; previous version restored **[A]** |
| C9 | MLRO sets Verified; Rejected without remarks | Allowed / blocked **[A]** |
| C10 | Auditor tries to set status; Viewer uploads | Denied **[A]** |
| C11 | Try to open a document id of an inaccessible company | "Document not found" |

## D. UBO and ownership
| # | Case | Expected |
|---|---|---|
| D1 | Add / edit / delete UBO; multiple UBOs | Works; audit entries **[A]** |
| D2 | Percentage 120, QID not 11 digits | Validation errors **[A]** |
| D3 | Direct UBO total > 100% | Warning **[A]** |
| D4 | Shareholders not summing to 100% | Warning "Total direct ownership is X% (expected 100%)" **[A]** |
| D5 | Holdco -> Person chain | Effective % = product; individual above threshold and not a UBO flagged **[A]** |
| D6 | Circular chain, individual as parent, deleting entity with holders | Blocked **[A]** |
| D7 | Auditor sets UBO/engagement risk rating | Ignored (Not Rated) **[A]** |

## E. Workflow (maker-checker)
| # | Case | Expected |
|---|---|---|
| E1 | Auditor submits Draft | Submitted for Review; record locked; MLRO/DMLRO notified (if enabled) **[A]** |
| E2 | Auditor tries to approve / edit while in review | Denied / locked **[A]** |
| E3 | Reviewer starts review, approval blocked (checklist, risk rating, documents, UBO) | Clear list of blockers **[A]** |
| E4 | MLRO sets final rating (override needs reason), completes checklist, approves | Approved; next review date per frequency; engagements updated **[A]** |
| E5 | Reject (comment required) -> Returned -> Resubmit | Statuses follow the workflow **[A]** |
| E6 | Submitter who is also MLRO tries to review own submission | Blocked (segregation of duties) **[A]** |
| E7 | System Administrator attempts approval / rating / doc status | Denied **[A]** |
| E8 | Auditor edits approved record | Blocked until new review cycle started **[A]** |

## F. Authorisation / users
| # | Case | Expected |
|---|---|---|
| F1 | DMLRO creates Auditor; DMLRO creates System Administrator | Allowed / denied **[A]** |
| F2 | User edits own role/status; deactivate last role manager | Blocked **[A]** |
| F3 | `restrictToAssigned` on: unassigned auditor opens company | Not found **[A]** |

## G. Audit
| # | Case | Expected |
|---|---|---|
| G1 | Perform each sensitive action | One audit entry each: Company Created/Updated/Deleted, UBO Added/Updated/Deleted, Document Uploaded/Replaced/Deleted/Status Changed/Viewed/Downloaded, Risk Rating Changed, KYC Submitted/Approved/Rejected/Resubmitted/Returned, User Created, Role Changed, Setting Changed, Database Backup **[A]** |
| G2 | Verify integrity; then edit a cell in `Audit_Log` manually | OK / failure reported at the tampered entry **[A]** |
| G3 | Auditor opens global Audit Log | Denied; company-scoped history allowed **[A]** |
| G4 | Full QID in audit values | Never (masked) **[A]** |

## H. Dashboard, reports, backup, notifications
| # | Case | Expected |
|---|---|---|
| H1 | Dashboard numbers vs list pages | Consistent **[A]** |
| H2 | Each report; PDF and CSV export | Generated; audit `Report Generated` **[A]** |
| H3 | Backup database | `AML_KYC_DB_Backup_YYYY-MM-DD_HHmm` in System Documents/Backups **[A]** |
| H4 | Enable notifications; submit / reject / expiry digest | Emails received; no identity data inside |
| H5 | Concurrency: two users create companies simultaneously | Unique IDs, no lost rows |
