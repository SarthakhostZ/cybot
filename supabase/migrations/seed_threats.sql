-- ============================================================
-- Seed: threat_alerts dev data (matches 008_threat_alerts_live schema)
-- Run AFTER 008_threat_alerts_live.sql
-- DO NOT run in production.
-- Replace <YOUR_USER_UUID> with your actual Supabase auth user UUID
-- (find it in Authentication → Users in the Supabase dashboard).
-- ============================================================

INSERT INTO public.threat_alerts
    (user_id, title, description, severity, threat_type, confidence, source_ip, is_active, ml_model_used)
VALUES
    (
        NULL,
        'https://cyb0t-secure-login.tk/verify',
        'Phishing page impersonating Cybot login. Credential harvesting form detected. '
        'Domain registered 2 days ago with high-risk TLD.',
        'CRITICAL', 'phishing', 0.9730, NULL, TRUE, 'source:scan'
    ),
    (
        NULL,
        'https://amazon-account-verify.ml/update-billing',
        'Brand impersonation targeting Amazon customers. Fake billing page with '
        'form that exfiltrates card details. SSL certificate mismatch detected.',
        'CRITICAL', 'phishing', 0.9410, NULL, TRUE, 'source:clipboard'
    ),
    (
        NULL,
        'https://192.168.1.105/admin/login',
        'Internal host scanning with IP address used directly as URL. '
        'Suspicious admin panel probe on LAN subnet.',
        'HIGH', 'vulnerability', 0.8200, '192.168.1.105', TRUE, 'source:scan'
    ),
    (
        NULL,
        'Mass credential stuffing — api.example.com',
        'Automated login attempts using leaked credential lists detected across '
        '12 services. Source IPs traced to botnet C2. Blocking recommended.',
        'HIGH', 'malware', 0.8850, '203.0.113.42', TRUE, NULL
    ),
    (
        NULL,
        'https://free-prize-claim.xyz/winner?ref=email',
        'Lottery scam page. Social engineering language detected: "You have been '
        'selected", "Claim your $1000 prize now". Redirects to payment harvesting.',
        'MEDIUM', 'phishing', 0.7200, NULL, TRUE, 'source:scan'
    ),
    (
        NULL,
        'Suspicious DNS tunnelling — 3x baseline',
        'Unusually long DNS query strings (> 200 chars) detected at 3x normal '
        'baseline. Pattern consistent with DNS-over-HTTPS data exfiltration.',
        'MEDIUM', 'data_breach', 0.6800, NULL, TRUE, NULL
    ),
    (
        NULL,
        'https://google-security-alert.work/verify-device',
        'Google brand impersonation. Fake security alert page requesting device '
        'verification. Credential harvesting intent confirmed.',
        'HIGH', 'phishing', 0.9100, NULL, FALSE, 'source:scan'  -- resolved
    )
ON CONFLICT DO NOTHING;

-- Verify
SELECT severity, COUNT(*) AS count, BOOL_AND(is_active) AS all_active
FROM public.threat_alerts
GROUP BY severity
ORDER BY count DESC;
