<?php
/**
 * Plugin Name: ClawFlow Companion
 * Plugin URI: https://flowmatic.co.il/clawflow
 * Description: ClawFlow platform companion — GTM snippet injection, recursive legacy GTM scanning + cleanup, WooCommerce ecommerce dataLayer auto-push.
 * Version: 1.2.0
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

            // 2. Recursively scan ALL .php files in active theme + child theme
            //    + mu-plugins (most common hiding spots for hard-coded GTM
            //    snippets). Skip vendor/, node_modules/ (rare in WP but possible).
            $scanDirs = array_unique(array_filter([
                get_stylesheet_directory(),       // child theme (if active)
                get_template_directory(),         // parent theme
                WPMU_PLUGIN_DIR,                  // mu-plugins
            ]));
            foreach ($scanDirs as $dir) {
                if (!is_dir($dir) || !is_readable($dir)) continue;
                $rii = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
                $checked = 0;
                foreach ($rii as $f) {
                    if ($checked++ > 500) break;  // safety cap
                    if (!$f->isFile()) continue;
                    $path = $f->getPathname();
                    if (!preg_match('/\\.(php|phtml)$/i', $path)) continue;
                    if (preg_match('#/(vendor|node_modules|cache|backup)/#i', $path)) continue;
                    $contents = @file_get_contents($path);
                    if (!$contents) continue;
                    if (!preg_match_all('/GTM-[A-Z0-9]{4,}/', $contents, $m)) continue;
                    $ids = array_unique($m[0]);
                    $foreignIds = array_values(array_filter($ids, function ($id) use ($ourId) {
                        return $id !== $ourId;
                    }));
                    if (empty($foreignIds)) continue;
                    $rel = ltrim(str_replace($dir, '', $path), '/\\');
                    // capture ~120 chars of context around first match for hint
                    $pos = strpos($contents, $foreignIds[0]);
                    $excerpt = $pos !== false
                        ? trim(preg_replace('/\s+/', ' ', substr($contents, max(0, $pos - 80), 240)))
                        : 'in ' . basename($dir) . '/' . $rel;
                    $findings[] = [
                        'source'  => 'theme_file',
                        'key'     => basename($dir) . '/' . $rel,
                        'gtmIds'  => $foreignIds,
                        'excerpt' => mb_substr($excerpt, 0, 240),
                    ];
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

/**
 * WooCommerce ecommerce dataLayer auto-push (Pattern K3)
 *
 * Pushes GA4-style ecommerce events into the dataLayer so GTM tags
 * (Google Ads awct sendValue + GA4 gaawe) can pick them up and forward to
 * Google Ads / GA4 with full value + transaction_id + items context. No
 * configuration required on the user side — works the moment GTM is
 * installed AND WooCommerce is active.
 *
 * Events pushed (mirrors GA4 ecommerce schema):
 *   add_to_cart      — woocommerce_add_to_cart action
 *   begin_checkout   — woocommerce_before_checkout_form action
 *   purchase         — woocommerce_thankyou action (the conversion event)
 *
 * The purchase push uses the standard GA4 keys (value, currency,
 * transaction_id, items[]) so the awct tag's {{DLV - lead_value}} +
 * {{DLV - transaction_id}} variables resolve correctly. Also doubles as
 * a generate_lead/form_submit signal mirror — the GTM custom event
 * triggers fire on _event names matching our PrimaryActionKey schema.
 */
add_action('init', function () {
    if (!class_exists('WooCommerce')) return;

    // purchase — woocommerce_thankyou is the canonical "order complete" hook
    add_action('woocommerce_thankyou', function ($order_id) {
        if (!$order_id) return;
        $order = wc_get_order($order_id);
        if (!$order) return;

        // Guard: only push once per session per order (WooCommerce can
        // call thankyou twice if user refreshes).
        $session_key = 'clawflow_purchase_pushed_' . $order_id;
        if (function_exists('WC') && WC()->session && WC()->session->get($session_key)) return;
        if (function_exists('WC') && WC()->session) WC()->session->set($session_key, 1);

        $items = [];
        foreach ($order->get_items() as $item) {
            $product = $item->get_product();
            $items[] = [
                'item_id'    => $product ? (string)$product->get_id() : '',
                'item_name'  => (string)$item->get_name(),
                'price'      => $product ? (float)$product->get_price() : 0,
                'quantity'   => (int)$item->get_quantity(),
                'item_brand' => $product ? (string)wp_strip_all_tags(get_post_meta($product->get_id(), '_brand', true)) : '',
            ];
        }
        $payload = [
            'event'           => 'purchase',
            'ecommerce'       => [
                'transaction_id' => (string)$order->get_id(),
                'value'          => (float)$order->get_total(),
                'tax'            => (float)$order->get_total_tax(),
                'shipping'       => (float)$order->get_shipping_total(),
                'currency'       => (string)$order->get_currency(),
                'coupon'         => implode(',', $order->get_coupon_codes()),
                'items'          => $items,
            ],
            // Top-level mirrors so {{DLV - lead_value}} + {{DLV - transaction_id}}
            // (the awct tag's value/orderId references) resolve without nested
            // path complications.
            'lead_value'      => (float)$order->get_total(),
            'transaction_id'  => (string)$order->get_id(),
        ];
        ?>
        <script>
        window.dataLayer = window.dataLayer || [];
        // Reset previous ecommerce object per GA4 best-practice before push
        window.dataLayer.push({ ecommerce: null });
        window.dataLayer.push(<?php echo wp_json_encode($payload); ?>);
        </script>
        <?php
    }, 10, 1);

    // begin_checkout — fires on checkout page load
    add_action('woocommerce_before_checkout_form', function () {
        if (!function_exists('WC') || !WC()->cart) return;
        $cart = WC()->cart;
        $items = [];
        foreach ($cart->get_cart() as $cart_item) {
            $product = $cart_item['data'] ?? null;
            $items[] = [
                'item_id'   => $product ? (string)$product->get_id() : '',
                'item_name' => $product ? (string)$product->get_name() : '',
                'price'     => $product ? (float)$product->get_price() : 0,
                'quantity'  => (int)($cart_item['quantity'] ?? 1),
            ];
        }
        $payload = [
            'event'     => 'begin_checkout',
            'ecommerce' => [
                'value'    => (float)$cart->get_total('edit'),
                'currency' => (string)get_woocommerce_currency(),
                'items'    => $items,
            ],
        ];
        ?>
        <script>
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ ecommerce: null });
        window.dataLayer.push(<?php echo wp_json_encode($payload); ?>);
        </script>
        <?php
    }, 5);

    // add_to_cart — fires on every add. Async product fetch keeps it
    // server-rendered (no fragile JS heuristics).
    add_action('woocommerce_add_to_cart', function ($cart_item_key, $product_id, $quantity, $variation_id) {
        $product = wc_get_product($variation_id ?: $product_id);
        if (!$product) return;
        $payload = [
            'event'     => 'add_to_cart',
            'ecommerce' => [
                'currency' => (string)get_woocommerce_currency(),
                'value'    => (float)$product->get_price() * (int)$quantity,
                'items'    => [[
                    'item_id'   => (string)$product->get_id(),
                    'item_name' => (string)$product->get_name(),
                    'price'     => (float)$product->get_price(),
                    'quantity'  => (int)$quantity,
                ]],
            ],
        ];
        // add_to_cart fires server-side without a page render — push via
        // a transient that the next page-load picks up.
        set_transient('clawflow_pending_atc_' . get_current_user_id(), $payload, 60);
    }, 10, 4);

    // Drain pending add_to_cart payloads on the next page-load
    add_action('wp_footer', function () {
        $pending = get_transient('clawflow_pending_atc_' . get_current_user_id());
        if (!$pending) return;
        delete_transient('clawflow_pending_atc_' . get_current_user_id());
        ?>
        <script>
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ ecommerce: null });
        window.dataLayer.push(<?php echo wp_json_encode($pending); ?>);
        </script>
        <?php
    }, 100);
});

/**
 * Capability discovery endpoint — UI uses this to decide whether to
 * mention WooCommerce in chainSteps and whether to expect ecommerce
 * events. Also surfaces other relevant flags (whether Application
 * Password auth is configured properly etc.).
 */
add_action('rest_api_init', function () {
    register_rest_route('clawflow/v1', '/capabilities', [
        'methods'             => 'GET',
        'permission_callback' => function () { return current_user_can('manage_options'); },
        'callback'            => function () {
            return [
                'pluginVersion'       => '1.2.0',
                'wordpressVersion'    => get_bloginfo('version'),
                'wooCommerceActive'   => class_exists('WooCommerce'),
                'wooCommerceVersion'  => defined('WC_VERSION') ? WC_VERSION : null,
                'gtmInstalled'        => !empty(get_option('clawflow_gtm_public_id', '')),
                'siteUrl'             => get_site_url(),
            ];
        },
    ]);
});
