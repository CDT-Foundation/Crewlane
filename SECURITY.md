# Security Policy

## Supported Versions

We actively support and provide security patches for the following versions of Crewlane:

| Version | Supported          |
| :--- | :--- |
| `0.1.x` (current development) | :white_check_mark: |
| `< 0.1.0` | :x: |

---

## Reporting a Vulnerability

The Crewlane team takes security seriously. If you discover a security vulnerability or potential threat in Crewlane, please report it responsibly so we can investigate and address it promptly.

### Preferred Method: Private Vulnerability Reporting

Please submit reports through GitHub's **[Private Vulnerability Reporting](https://github.com/CDT-Foundation/Crewlane/security/advisories/new)**:

1. Navigate to the **Security** tab of the repository.
2. Click **Advisories** under "Reporting".
3. Click **Report a vulnerability** to open a confidential advisory draft.
4. Provide a detailed summary, proof of concept (PoC), and affected components.

### Alternative Method: Security Email

If you cannot submit via GitHub Private Vulnerability Reporting, you may email our security team:
- **Email:** `security@crewlane.internal` (or reach out to repository maintainers via GitHub).
- Include detailed reproduction steps, logs, and potential impact.

> [!IMPORTANT]
> **Please do not report security vulnerabilities through public GitHub issues or public discussions.**

---

## Response Timeline & SLA

- **Initial Triage & Acknowledgment:** Within 48 hours.
- **Vulnerability Assessment & Fix Target:** Critical issues within 7 days; high/moderate issues within 14–30 days.
- **Coordinated Disclosure:** We will notify you once a fix is ready before publishing a security advisory and releasing the patch.

---

## Security Practices in Crewlane

- **Tenant Isolation:** Enforced via PostgreSQL Row-Level Security (RLS) with strict `tenant_id` verification.
- **Local AI Privacy:** Ownmind inference runs 100% locally via Ollama / vLLM. No prompt data or employee PII leaves the host environment.
- **Secret Scanning & Push Protection:** Enabled across all branches to prevent credential leaks.
- **CodeQL Scanning:** Automated static analysis scans every push and PR for security vulnerabilities.
