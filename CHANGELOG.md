# Changelog

## [7.5.0] - 2026-07-18

### Added
- **Company Margin Reporting Tab**: Added a dedicated, itemized, filterable, and exportable view for branch admins and PDGs. Allows monitoring confirmed withdrawal transactions with full details of client name, effective agent name, withdrawal amount, 3% company fee margin, net payout, and withdrawal date. Includes search, sorting, and pagination.
- **Agent Portfolios Dashboard**: Introduced a high-fidelity nested collapsible client balance viewer allowing branch admins and PDGs to monitor portfolios of agent-recruited clients with full details of active status, balances, and withdrawal summaries.
- **Bulk Styled Excel Export Utility**: Created a reusable `buildStyledNestedWorkbook` module powered by `exceljs` featuring frozen header rows, corporate brand styling (#4B2D7F headers, F1EFF5 section bars), custom alignments, and auto-computed column widths.
- **Configurable Deposit Dispute/Auto-Confirm Window**: Created a runtime-configurable deposit dispute window policy limit (`deposit_dispute_window_hours`), allowing PDG to establish a global default and branch admins to specify a local override for their respective branches.
- **Deposit Correction Window Management Console**: Added a high-contrast settings card within the administrative "Settings" tab with full dual-language support, positive-hour validation, and live-updated currently applied window indicators.
- **Cash Deposit Traceability Checkpoint**: Added explicit branch/cashier cash remittance confirmation checkpoint for agent-collected cash deposits from clients without app access. Manual cash receipt confirmation acts as the primary confirmation path.
- **Pending Cash Confirmation Console**: Added an administrative "Pending Cash Confirmation" table inside the remittances sub-tab of the reconciliation panel, featuring per-agent outstanding subtotals, row-level collections, and real-time "Confirm Received" actions with dual-language/multi-locale support.
- **Deposit Correction Reversal Logic**: Added a robust reverse-then-reapply mechanism for correcting already-confirmed transactions. Approved corrections now correctly reverse the previously applied amount before applying the new amount to maintain balance and deposit statistics integrity.
- **Deposit Confirmed Correction Warning**: Embedded an inline informational notice for agents when submitting deposit corrections on already-confirmed transactions inside the mobile modal context.

## [6.1.1] - 2026-07-17

### Fixed
- **Business Hours Overnight/Wraparound Bug**: Implemented overnight wraparound-aware logic to correctly check business hours when closing times fall after midnight (e.g., 20:00 to 02:00). Updated `checkBusinessHours` (client-side) and `checkBusinessHoursServer` (both server-side engines) to correctly compute open windows spanning midnight.
- **Day-of-Week Overnight Matching**: Adjusted day-of-week active matching in business hours validation. When checking active hours in the post-midnight portion of an overnight window (e.g., 01:00 AM), the check dynamically evaluates against yesterday's weekday (the shift's start day) to maintain accurate active day restrictions.

### Added
- **Midnight Crossover Settings Indicators**: Embedded custom non-blocking warning banners in the PDG global settings, branch self-serve hours panel, and appeal proposal form. Banners instantly notify admins when a selected time range crosses midnight, validating configuration clarity prior to saving.

## [6.1.0] - 2026-07-17

### Added
- **Live Agent Status Indicator**: Built a dynamic agent presence/connectivity indicator on the admin dashboard utilizing live heartbeat polling rates (20s) and document visibility listeners. Mapped unstable and offline states gracefully.
- **ID Card & Receipt Fraud Prevention**: Centralized strict server-side validation for ID Card number formats (exactly 9 or 17 numeric digits) and duplicate prevention during new cooperator registrations. Integrated Gemini AI-powered mobile money screenshot verification in both primary and export Express backends. Designed a comprehensive frontend Drag-and-Drop receipt screenshot uploader with live, real-time audit verification feedback, automatic memo ref populating, amount-matching integrity audits, and replay/duplicate receipt protection.
- **Data Saver Mode (Bandwidth Optimizer)**: Implemented an off-to-on toggle switch inside Account Preferences. Dynamic heartbeats down-throttle from 20s to 60s when active, client-side member avatars lazy-load and download only on active touch/click feedback, and a custom `x-data-saver` HTTP request header triggers server-side select optimizations by stripping heavy payload assets (like high-res photo URLs) to minimize network overhead.

## [6.0.0] - 2026-07-17

### Added
- **Configurable Business Hours**: Enabled administrators (`branch_admin` and `pdg`) to dynamically define operational hours, active days, and a master gate toggle (on/off) per branch or globally. Enforced during deposits, withdrawals, and registration transactions.
- **Emergency Lockout Bypass Appeal Workflow**: Created a comprehensive appeal pipeline. Clients and agents locked out by business hours can submit emergency bypass appeals with reason justifications and requested amounts directly from the lockout banner.
- **Admin Appeal Review Panel**: Added a dedicated management view for administrators to review, approve, or reject pending appeals with custom feedback notes, which instantly notifies the appellant.
- **Approved Appeal Consumption**: Integrated bypass approval checks into deposit and withdrawal transactions, automatically consuming the approved appeal upon transaction completion.

### Changed
- **Notification Sync & Archive**: Shifted state management of notifications to a unified notification database with `is_archived` support, ensuring unread badge counts across `AdminApp.tsx` and `MobileApp.tsx` only compute active, non-archived items.
