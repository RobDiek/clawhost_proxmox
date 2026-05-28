<?php
/**
 * Plugin Name: ClawFlow Companion
 * Plugin URI: https://flowmatic.co.il/clawflow
 * Description: ClawFlow platform companion — injects GTM snippets to <head>+<body> via REST API, scans for legacy GTM snippets, supports clean migration.
 * Version: 1.0.0
 * Author: ClawFlow by Flowmatic
 * Author URI: https://flowmatic.co.il
 * License: MIT
 * Requires at least: 5.5
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) exit;

/**
 * GTM Snippet Storage + REST Endpoints
 *
 * Three endpoints under /wp-json/clawflow/v1/:
 *   - GET  /gtm-snippet               — current installed snippet
 *   - POST /gtm-snippet               — install/replace snippet
 *   - DEL  /gtm-snippet               — remove snippet (does NOT inject)
 *   - POST /scan-other-gtm            — scan content for OTHER GTM- snippets
 *   - POST /remove-stale-gtm          — best-effort remove legacy GTM patterns
 *
 * Auth: WordPress Application Password (Basic Auth). Caller must have
 * `manage_options` capability (i.e. admin user) — REST permissions enforced
 * via the `permission_callback` on each route.
 */

add_action('rest_api_init', function () {
    $perm = function () {
        return current_user_can('manage_options');
    };

    register_rest_route('clawflow/v1', '/gtm-snippet', [
        'methods'             => 'GET',
        'permission_callback' => $perm,
        'callback'            => function () {
            return [
                'publicId' => get_option('clawflow_gtm_public_id', ''),
                'head'     => get_option('clawflow_gtm_head_snippet', ''),
                'body'     => get_option('clawflow_gtm_body_snippet', ''),
                'installedAt' => get_option('clawflow_gtm_installed_at', ''),
            ];
        },
    ]);

    register_rest_route('clawflow/v1', '/gtm-snippet', [
        'methods'             => 'POST',
        'permission_callback' => $perm,
        'callback'            => function (WP_REST_Request $req) {
            $publicId = trim((string)$req->get_param('publicId'));
            $head     = (string)$req->get_param('head');
            $body     = (string)$req->get_param('body');
            if (!preg_match('/^GTM-[A-Z0-9]{4,}$/', $publicId)) {
                return new WP_Error('invalid_public_id', 'publicId must match GTM-XXXXXXX', ['status' => 400]);
            }
            update_option('clawflow_gtm_public_id', $publicId, false);
            update_option('clawflow_gtm_head_snippet', $head, false);
            update_option('clawflow_gtm_body_snippet', $body, false);
            update_option('clawflow_gtm_installed_at', gmdate('c'), false);
            return ['ok' => true, 'publicId' => $publicId];
        },
    ]);

    register_rest_route('clawflow/v1', '/gtm-snippet', [
        'methods'             => 'DELETE',
        'permission_callback' => $perm,
        'callback'            => function () {
            delete_option('clawflow_gtm_public_id');
            delete_option('clawflow_gtm_head_snippet');
            delete_option('clawflow_gtm_body_snippet');
            delete_option('clawflow_gtm_installed_at');
            return ['ok' => true];
        },
    ]);

    /**
     * POST /scan-other-gtm — searches well-known locations for GTM-XXX
     * patterns OTHER than ours. Used by the migration wizard to surface
     * stale snippets the user must remove before activating ours.
     *
     * Scanned surfaces:
     *   - wp_options: any option containing a GTM- pattern (covers Headers/
     *     Footers, OptionsTree, theme custom code panels)
     *   - Currently-installed theme's header.php + functions.php (if readable)
     *   - Customizer settings (theme_mod_*)
     *
     * Returns: array of { source, key, gtmIds[], excerpt } findings.
     */
    register_rest_route('clawflow/v1', '/scan-other-gtm', [
        'methods'             => 'POST',
        'permission_callback' => $perm,
        'callback'            => function () {
            global $wpdb;
            $ourId = get_option('clawflow_gtm_public_id', '');
            $findings = [];

            // 1. Scan wp_options for GTM- patterns (catches plugin-stored snippets)
            $rows = $wpdb->get_results(
                "SELECT option_name, option_value FROM {$wpdb->options}
                 WHERE option_value LIKE '%GTM-%'
                 LIMIT 200",
                ARRAY_A
            );
            foreach ($rows as $row) {
                $val = (string)$row['option_value'];
                if (preg_match_all('/GTM-[A-Z0-9]{4,}/', $val, $m)) {
                    $ids = array_unique($m[0]);
                    $foreignIds = array_values(array_filter($ids, function ($id) use ($ourId) {
                        return $id !== $ourId;
                    }));
                    if (!empty($foreignIds)) {
                        // Skip our own option keys
                        if (strpos($row['option_name'], 'clawflow_gtm_') === 0) continue;
                        $findings[] = [
                            'source'  => 'wp_options',
                            'key'     => $row['option_name'],
                            'gtmIds'  => $foreignIds,
                            'excerpt' => mb_substr(preg_replace('/\s+/', ' ', $val), 0, 240),
                        ];
                    }
                }
            }

            // 2. Scan theme files (header.php, functions.php) if readable
            $themeDir = get_template_directory();
            foreach (['header.php', 'functions.php'] as $f) {
                $p = $themeDir . '/' . $f;
                if (is_readable($p)) {
                    $contents = (string)file_get_contents($p);
                    if (preg_match_all('/GTM-[A-Z0-9]{4,}/', $contents, $m)) {
                        $ids = array_unique($m[0]);
                        $foreignIds = array_values(array_filter($ids, function ($id) use ($ourId) {
                            return $id !== $ourId;
                        }));
                        if (!empty($foreignIds)) {
                            $findings[] = [
                                'source'  => 'theme_file',
                                'key'     => $f,
                                'gtmIds'  => $foreignIds,
                                'excerpt' => 'in ' . basename($themeDir) . '/' . $f,
                            ];
                        }
                    }
                }
            }

            return [
                'ourPublicId' => $ourId,
                'findings'    => $findings,
                'foreignCount'=> count($findings),
            ];
        },
    ]);

    /**
     * POST /remove-stale-gtm — best-effort removal of foreign GTM snippets
     * from wp_options. Theme file edits are NOT performed (too risky); user
     * must edit those manually.
     *
     * Body: { confirm: true, removeOptionKeys: [...] } — explicit list of
     * option keys to clear (from a prior scan). Without confirm=true, no-op.
     */
    register_rest_route('clawflow/v1', '/remove-stale-gtm', [
        'methods'             => 'POST',
        'permission_callback' => $perm,
        'callback'            => function (WP_REST_Request $req) {
            $confirm = (bool)$req->get_param('confirm');
            $keys    = (array)$req->get_param('removeOptionKeys');
            if (!$confirm) {
                return new WP_Error('not_confirmed', 'confirm=true required', ['status' => 400]);
            }
            $removed = [];
            foreach ($keys as $key) {
                $key = sanitize_key($key);
                if ($key && strpos($key, 'clawflow_gtm_') !== 0) {
                    if (delete_option($key)) $removed[] = $key;
                }
            }
            return ['ok' => true, 'removed' => $removed];
        },
    ]);
});

/**
 * Inject saved snippets to <head> + after <body open>. Standard GTM
 * pattern. Only fires if snippets are non-empty AND publicId is set.
 */
add_action('wp_head', function () {
    $head = get_option('clawflow_gtm_head_snippet', '');
    $pid  = get_option('clawflow_gtm_public_id', '');
    if ($head && $pid) {
        echo "\n<!-- ClawFlow GTM ($pid) -->\n";
        echo $head;
        echo "\n<!-- End ClawFlow GTM -->\n";
    }
}, 1);

add_action('wp_body_open', function () {
    $body = get_option('clawflow_gtm_body_snippet', '');
    $pid  = get_option('clawflow_gtm_public_id', '');
    if ($body && $pid) {
        echo "\n<!-- ClawFlow GTM noscript ($pid) -->\n";
        echo $body;
        echo "\n<!-- End ClawFlow GTM noscript -->\n";
    }
}, 1);
