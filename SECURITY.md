# Security Policy

## Reporting a Vulnerability

I take security seriously please report it responsibly and discreetly.

**Do not open a public GitHub issue for security vulnerabilities.** Instead, please email:

📧 **nick@antonizick.com**

### What to Include

Please include the following details to help us understand and address the issue:

- **Type of vulnerability** (e.g., authentication bypass, XSS, CSRF, privilege escalation, information disclosure)
- **Location** (file path, endpoint, component, or specific code section)
- **Detailed description** of the vulnerability, including:
  - How you discovered it
  - The impact if exploited (data loss, unauthorized access, etc.)
  - Steps to reproduce (if possible)
- **Proof of concept** (screenshot, code snippet, or minimal reproduction)
- **Environment details** (OS, Node version, browser, deployment configuration)
- **Suggested fix** (optional but appreciated)

## Response Timeline

- **Initial acknowledgment**: Within 5 Days
- **Status updates**: Every 3-5 days during investigation and remediation
- **Fix and release**: As soon as practically possible, typically within 30 days for critical issues
- **Public disclosure**: Coordinated with you after a fix is released or 90 days have passed, whichever comes first

## Scope

### In Scope

- Deployed games ONLY, not the admin builder environment
- Cross-site scripting (XSS) in admin panel or game interface
- Cross-site request forgery (CSRF) affecting state-changing operations
- Server-side request forgery (SSRF)
- SQL injection / NoSQL injection (if applicable)
- Path traversal / directory traversal
- Remote code execution
- Denial of service attacks with reasonable effort
- Insecure deserialization
- Cryptographic weaknesses

### Out of Scope

- Vulnerabilities in third-party dependencies (report directly to the maintainer)
- Social engineering or phishing attacks
- Theoretical attacks without proof of concept
- Vulnerabilities in demonstration/test deployments
- Missing security.txt or similar advisory files
- Known issues already documented in the README or issue tracker
- Vulnerabilities that require physical access to the admin or build server
- Default credentials used only in development/demo environments
- Reflected vulnerabilities in error messages that don't leak sensitive data
- Low-impact UI/UX issues (misleading text, confusing design)

## Security Best Practices (for contributors)

If you're contributing to Nx3DWolf, please follow these guidelines:

### Authentication & Authorization
- All API endpoints requiring authentication must validate the auth cookie and user role
- Tenant data must be scoped to the authenticated tenant
- Multi-tenant isolation is critical — never trust `tenantId` from user input without validation
- Use `useTenant()` in React components; never assume tenant from URL parameters alone

### File Handling
- Always use `writeJson()` from `fileStore.ts` for atomic writes — never `fs.writeFile()` directly
- Validate file uploads: check MIME type, size, and content
- Asset files (textures, sprites, sounds) must not execute code
- Use `processAndSaveAsset()` to normalize and compress user-uploaded images

### Input Validation
- Validate all user inputs at system boundaries (API endpoints, form submissions)
- Sanitize tenant config values before storing or using in templates
- Game state (enemy count, weapon stats, etc.) must come from tenant config, never trust client data

### Data Exposure
- Auth cookies are httpOnly and Secure-flagged — never expose to JavaScript
- Tenant saves and game state are stored locally; encryption not required for single-player deployed games
- API responses must not leak user passwords, session tokens, or cross-tenant data
- Error messages must not expose file paths, stack traces, or internal details in production

### Dependency Management
- Keep Node.js, npm, and all dependencies up-to-date
- Run `npm audit` regularly and fix critical/high-severity issues promptly
- Review dependency changelogs before updating major versions
- Avoid dependencies with known unpatched vulnerabilities

### Deployment Security
- Always use HTTPS in production (enforced by Caddy config)
- Keep the `.env` file out of version control — use `.env.example` for reference
- The deployed standalone game (`server.mjs`) runs without authentication; secure the entire deployment context
- Systemd detection must check `[[ "$(cat /proc/1/comm)" == "systemd" ]]` before using `systemctl`

## Known Limitations & Design Decisions

Nx3D is built as a **single-player or locally-networked game** with optional multi-tenant admin capabilities. It is **not designed for large-scale production SaaS deployments**. Key limitations:

- **No database**: Tenant data is JSON files on the filesystem; not suitable for high-concurrency environments
- **Single-server only**: No clustering, horizontal scaling, or distributed session management
- **Filesystem isolation only**: Tenant data separation relies on directory structure, not OS-level or database-level ACLs
- **Admin panel authentication**: Basic JWT-based; appropriate for trusted internal use, not public-facing
- **Game saves**: Stored as plaintext JSON; encrypted storage not implemented
- **No rate limiting**: Deployment may require external rate limiting (reverse proxy like Caddy)
- **No Tenant isolation **: Tenant isolation is not implemented in any way. 

If you plan to deploy Nx3D  in a higher-security context, please conduct a threat model review with a security professional.

## Security Headers & Configuration

The production Caddy config (`Caddyfile`) should enforce:

```
header Strict-Transport-Security "max-age=31536000; includeSubDomains"
header X-Content-Type-Options "nosniff"
header X-Frame-Options "SAMEORIGIN"
header X-XSS-Protection "1; mode=block"
header Referrer-Policy "strict-origin-when-cross-origin"
header Permissions-Policy "geolocation=(), microphone=(), camera=()"
```

Admin panel should set:
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';
```

## Acknowledgment

I appreciate your help in keeping Nx3D secure. Upon responsible disclosure and remediation, we will acknowledge your contribution in our release notes (with your permission).

## Questions?

If you have questions about the security policy or whether something is in scope, feel free to email nick@antonizick.com.

---

**Last updated**: May 2026
