# Database Schema (Google Sheets)

> Generated from `src/Config.gs` by `node tests/gen-docs.cjs`. Do not edit by hand.

All sheets are formatted as **plain text** (no date/number/formula coercion). Dates are `YYYY-MM-DD`; timestamps are `YYYY-MM-DDTHH:mm:ss` (Asia/Qatar). Percentages are stored as numbers. Record IDs are stable identifiers (`PREFIX-000001`); row numbers are never used as identifiers. Rows are never physically deleted by the application - deletion sets `IsDeleted = Y` (soft delete).

## Users

Authorised users. Only Active users listed here can sign in.

ID format: `USR-000001`

| Column | Notes |
|---|---|
| UserID | primary identifier |
| Name | text; required |
| Email | email; required |
| Role | select; required |
| Department | text |
| Status | select; required; values: Active / Inactive |
| Notes | textarea |
| DateAdded |  |
| LastLogin |  |
| AddedBy |  |
| UpdatedBy |  |
| UpdatedAt |  |

## Companies

Company / client master record. FolderID is the Drive folder ID (server-side only).

ID format: `CMP-000001`

| Column | Notes |
|---|---|
| CompanyID | primary identifier |
| LegalName | text; required |
| TradingName | text |
| QFCNumber | text |
| CRNumber | text |
| TradeLicenseNumber | text |
| TaxCardNumber | text |
| ComputerCardNumber | text |
| ParentCompanyCR | text |
| CountryOfIncorporation | text; required |
| LegalForm | text |
| RegisteredAddress | textarea |
| BusinessActivity | textarea |
| DateOfIncorporation | date |
| CompanyStatus | select; required; values: Active / Inactive / Dormant / In Liquidation / Struck Off |
| ContactPerson | text |
| ContactEmail | email |
| ContactTelephone | text |
| RiskRating |  |
| KycStatus |  |
| LastKycReviewDate |  |
| NextKycReviewDate |  |
| FolderID |  |
| AuthorizedUsers |  |
| IsTestData |  |
| IsDeleted |  |
| DeletedBy |  |
| DeletedAt |  |
| CreatedBy |  |
| CreatedAt |  |
| UpdatedBy |  |
| UpdatedAt |  |

## Engagements

Multiple engagements per company.

ID format: `ENG-000001`

| Column | Notes |
|---|---|
| EngagementID | primary identifier |
| CompanyID | foreign key -> Companies |
| EngagementType | select; required |
| StartDate | date; required |
| EndDate | date |
| PartnerManager | text |
| AssignedAuditor | user |
| EngagementStatus | select; required; values: Proposed / Active / Completed / Cancelled |
| RiskLevel | select; editable only with RISK_EDIT_FINAL; values: Not Rated / Low / Medium / High |
| LastKycReviewDate | date; system-set |
| NextKycReviewDate | date; system-set |
| IsDeleted |  |
| DeletedBy |  |
| DeletedAt |  |
| CreatedBy |  |
| CreatedAt |  |
| UpdatedBy |  |
| UpdatedAt |  |

## UBOs

Ultimate beneficial owners (multiple per company). QID/passport are sensitive.

ID format: `UBO-000001`

| Column | Notes |
|---|---|
| UBOID | primary identifier |
| CompanyID | foreign key -> Companies |
| FullName | text; required |
| Nationality | text; required |
| DateOfBirth | date |
| CountryOfResidence | text |
| QIDNumber | text; sensitive |
| PassportNumber | text; sensitive |
| QFCNumber | text |
| OwnershipPercentage | number; required |
| VotingPercentage | number |
| OwnershipType | select; values: Shareholding / Voting rights / Control by other means / Senior managing official / Trust / arrangement role |
| DirectIndirect | select; values: Direct / Indirect / Both |
| PEPStatus | select; values: Not screened / Not a PEP / PEP / Family member of PEP / Close associate of PEP |
| SanctionsStatus | select; values: Not screened / Clear / Potential match / Confirmed match |
| AdverseMediaStatus | select; values: Not screened / None identified / Negative media identified / Further review required |
| SourceOfWealth | textarea |
| SourceOfFunds | textarea |
| RiskRating | select; editable only with RISK_EDIT_FINAL; values: Not Rated / Low / Medium / High |
| VerificationStatus | select; values: Pending / In progress / Verified / Rejected |
| VerificationDate | date |
| Notes | textarea |
| IsDeleted |  |
| DeletedBy |  |
| DeletedAt |  |
| CreatedBy |  |
| CreatedAt |  |
| UpdatedBy |  |
| UpdatedAt |  |

## Shareholders

Ownership structure. HeldThroughID links a holder to the intermediate entity it holds shares in (blank = direct holder).

ID format: `SHR-000001`

| Column | Notes |
|---|---|
| ShareholderID | primary identifier |
| CompanyID | foreign key -> Companies |
| ShareholderName | text; required |
| EntityType | select; required; values: Individual / Entity |
| Country | text |
| HoldingPercentage | number; required |
| HeldThroughID | ref |
| IsUltimateParent | flag |
| IsNominee | flag |
| UBOID | ref |
| Notes | textarea |
| IsDeleted |  |
| DeletedBy |  |
| DeletedAt |  |
| CreatedBy |  |
| CreatedAt |  |
| UpdatedBy |  |
| UpdatedAt |  |

## Documents

Document register. Files live in Drive; only metadata and the file ID are stored. Versioning via VersionNo / VersionStatus / SupersededByID.

ID format: `DOC-000001`

| Column | Notes |
|---|---|
| DocumentID | primary identifier |
| CompanyID | foreign key -> Companies |
| DocType |  |
| Category |  |
| FileName |  |
| DriveFileID |  |
| FolderID |  |
| UploadedBy |  |
| UploadDate |  |
| ExpiryDate |  |
| Status |  |
| VersionNo |  |
| VersionStatus |  |
| SupersededByID |  |
| Subject |  |
| Remarks |  |
| MimeType |  |
| SizeBytes |  |
| Checksum |  |
| StatusChangedBy |  |
| StatusChangedAt |  |
| IsDeleted |  |
| DeletedBy |  |
| DeletedAt |  |
| CreatedBy |  |
| CreatedAt |  |
| UpdatedBy |  |
| UpdatedAt |  |

## KYC_Reviews

Review cycles and workflow status. Checklist is JSON {itemId:{done,na,comment,by,at}}.

ID format: `REV-000001`

| Column | Notes |
|---|---|
| ReviewID | primary identifier |
| CompanyID | foreign key -> Companies |
| EngagementID |  |
| CycleNo |  |
| Status |  |
| Checklist |  |
| RiskRatingAtReview |  |
| SubmittedBy |  |
| SubmittedAt |  |
| ReviewerEmail |  |
| ReviewedAt |  |
| Decision |  |
| DecisionComments |  |
| ReviewDate |  |
| NextReviewDate |  |
| CreatedBy |  |
| CreatedAt |  |
| UpdatedBy |  |
| UpdatedAt |  |

## Risk_Assessments

Risk assessment history. Answers is JSON {factorId: optionValue}. FinalRating is set only by MLRO/DMLRO.

ID format: `RSK-000001`

| Column | Notes |
|---|---|
| RiskID | primary identifier |
| CompanyID | foreign key -> Companies |
| EngagementID |  |
| Answers |  |
| Score |  |
| CalculatedRating |  |
| Escalations |  |
| FinalRating |  |
| FinalRatingBy |  |
| FinalRatingAt |  |
| OverrideReason |  |
| ConfigVersion |  |
| Notes |  |
| IsCurrent |  |
| CreatedBy |  |
| CreatedAt |  |
| UpdatedBy |  |
| UpdatedAt |  |

## Audit_Log

Append-only, hash-chained audit trail (PrevHash/Hash).

ID format: `LOG-000001`

| Column | Notes |
|---|---|
| LogID | primary identifier |
| Timestamp |  |
| UserEmail |  |
| UserRole |  |
| Action |  |
| CompanyID | foreign key -> Companies |
| RecordType |  |
| RecordID |  |
| OldValue |  |
| NewValue |  |
| ClientInfo |  |
| Comments |  |
| PrevHash |  |
| Hash |  |

## Settings

Key/value configuration (JSON values).

ID format: `(setting key)`

| Column | Notes |
|---|---|
| Key | primary identifier |
| Value |  |
| Description |  |
| UpdatedBy |  |
| UpdatedAt |  |

## Error_Log

Technical errors (not shown to users).

ID format: `ERR-...`

| Column | Notes |
|---|---|
| ErrorID | primary identifier |
| Timestamp |  |
| UserEmail |  |
| Action |  |
| Message |  |
| Stack |  |

