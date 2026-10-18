# Additional Instructions: Technology Freedom, Architecture Review, and User Access

These instructions supplement the existing Mabubu Business Management System requirements. They do not replace or repeat the original business requirements.

## 1. Independently evaluate the technology stack

The previously suggested technologies, including React, TypeScript, IndexedDB, Supabase, PostgreSQL, and PWA architecture, are recommendations only. They are not mandatory technical requirements.

You have the freedom and responsibility to evaluate the full project and select whichever programming languages, frameworks, databases, storage systems, synchronization mechanisms, and deployment architecture best satisfy the actual business requirements.

Consider appropriate alternatives where relevant, including JavaScript, TypeScript, Python, Java, Kotlin, C#, Go, other suitable languages, relational or embedded databases, and alternative offline-first architectures. This is not a requirement to use any particular language or framework.

Do not select a technology merely because it is popular, familiar, easy for AI to generate, or already mentioned in the initial proposal.

Evaluate the alternatives against:

Reliable offline operation on laptops and Android phones.
Safe synchronization between multiple users and locations.
Inventory accuracy and traceable stock movements.
Financial accuracy and auditability.
Authentication, permissions, and protection of business data.
Development speed within the three-day initial build window.
Ease of maintenance by one developer using VS Code and AI coding agents.
Hosting availability, free-tier restrictions, and realistic long-term operating costs.
Performance, reliability, backup, recovery, and future scalability.
The quality of the final user experience.

Before committing to the architecture, provide a concise comparison of the strongest realistic options. Explain the trade-offs, identify the recommended solution, and justify why it fits this specific project better than the alternatives.

Do not waste time comparing every technology available. Focus on a small number of credible candidates.

Clearly distinguish free services from paid services, including limitations that could affect real business operations. Verify current pricing and terms using authoritative sources when internet research is available. Do not create accounts, activate paid plans, or incur costs without explicit owner approval.

If your analysis concludes that the original recommendations are best, retain them and explain why. If a different approach is better, recommend it confidently and explain the migration or setup implications before implementation.

## 2. User identity and login experience

The system needs a simple login experience suitable for family members and workers who may not be comfortable with complicated software.

The intended experience is:

A user selects or enters their name.
They enter their assigned short numerical access code, normally four digits.
The system identifies their account and grants the appropriate interface and permissions.
The user is taken directly to the interface relevant to their role.

Examples of numerical codes are illustrative only. Never hardcode these example codes as real credentials.

The owner must be able to create, disable, and manage user accounts and assign roles.

### Security requirements

Keep the login simple without making the system unnecessarily insecure.

Do not use a person's name as proof of identity.
Do not store access codes in plaintext.
Apply reasonable attempt limits, cooldowns, and account protection.
Do not expose account details or other users' records before authentication.
Protect sessions and enforce permissions on the backend.
Make account recovery and code replacement manageable by an authorized administrator.
Consider that a four-digit code has a limited number of possible combinations. Assess the risk and propose suitable protections rather than assuming a short code alone is sufficient for a publicly exposed system.
Never hardcode a shared administrator password or embed privileged database credentials in the client application.

If a stronger authentication mechanism is necessary for remote access or administrative accounts, explain the simplest practical option and its cost before introducing additional complexity.

## 3. Role-specific interfaces

The system must present different interfaces according to the authenticated user's role.

### Worker interface

Workers should see only the tools required for their assigned work, such as:

Recording garments physically collected.
Viewing their own recorded stock collections.
Recording returned garments.
Submitting daily sales and money received.
Recording permitted expenses and explaining discrepancies.
Checking whether their records have synchronized.
Reviewing their own relevant work history.

Keep the worker interface simple, fast, mobile-friendly, and free from unnecessary accounting screens, administrative settings, profit reports, or complex dashboards.

### Manager and family interface

Authorized managers and family members should have access to the management capabilities permitted by their assigned roles, including relevant stock, purchasing, inspection, shipments, expenses, sales reconciliation, reporting, and historical records.

The owner or administrator should control role assignments and permissions.

Do not assume every family member requires identical privileges. Allow the administrator to grant appropriate permissions where useful.

### Enforce permissions properly

Different interfaces are not sufficient security by themselves. Workers must not be able to access restricted information by manually changing a URL, calling an API, manipulating client-side state, or using developer tools.

Enforce authorization in the data layer and backend, and test both permitted and denied operations.

## 4. Preserve the existing business requirements

Technology decisions must serve the agreed business rules rather than force the business to adapt to arbitrary software limitations.

Do not remove, simplify away, or silently reinterpret existing requirements because a particular framework or database makes them inconvenient.

If a requirement cannot be implemented safely within the selected architecture or deadline, explain the limitation, propose alternatives, and identify what requires the owner's approval.

## 5. Required decision before major implementation

Before making an irreversible architecture commitment, present:

The recommended technology stack.
The strongest realistic alternatives considered.
The reasons for selecting the recommendation.
Expected initial and recurring costs.
How offline storage and synchronization will work.
How user authentication and role-based access will work.
Any important limitations or risks.
Which parts can be delivered reliably in the three-day initial build.

Then proceed with the best-supported option once the decision is clear. Avoid unnecessary delays or endless architecture discussions. The goal is to make a well-reasoned choice and build a reliable, maintainable system.
