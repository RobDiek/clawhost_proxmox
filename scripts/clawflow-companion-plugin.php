<?php
/**
 * Plugin Name: Flowmatic Companion
 * Plugin URI: https://flowmatic.co.il
 * Description: Flowmatic platform companion — GTM snippet injection, recursive legacy GTM scanning + cleanup, WooCommerce ecommerce dataLayer auto-push, first-party GCLID capture (survives payment-gateway redirect → order meta for the offline Ads bridge), server-side GA4 Measurement Protocol purchase backfill (captures redirect-gateway orders the client-side tag misses, deduped by transaction_id), tracking conflict detection + surgical resolution + manual snippet (IHAF) detection + orphaned wp_options cleanup, page-builder awareness (builder-info) + native Elementor content append.
 * Version: 1.15.0
 * Author: Flowmatic
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

    // ── Site Widgets — floating WhatsApp/call button + exit-intent popup ──
    // Stored as one JSON blob in wp_options; rendered in wp_footer. Lets the
    // platform auto-provision the "כפתור WhatsApp צף" + "חלון יציאה" tasks.
    register_rest_route('clawflow/v1', '/site-widgets', [
        'methods'             => 'GET',
        'permission_callback' => $perm,
        'callback'            => function () {
            $cfg = json_decode(get_option('clawflow_site_widgets', '{}'), true);
            return ['config' => is_array($cfg) ? $cfg : new stdClass(), 'updatedAt' => get_option('clawflow_site_widgets_at', '')];
        },
    ]);
    register_rest_route('clawflow/v1', '/site-widgets', [
        'methods'             => 'POST',
        'permission_callback' => $perm,
        'callback'            => function (WP_REST_Request $req) {
            $cfg = $req->get_param('config');
            if (is_array($cfg)) $cfg = wp_json_encode($cfg);
            if (!is_string($cfg) || json_decode($cfg) === null) {
                return new WP_Error('invalid_config', 'config must be valid JSON', ['status' => 400]);
            }
            update_option('clawflow_site_widgets', $cfg, false);
            update_option('clawflow_site_widgets_at', gmdate('c'), false);
            return ['ok' => true];
        },
    ]);
    register_rest_route('clawflow/v1', '/site-widgets', [
        'methods'             => 'DELETE',
        'permission_callback' => $perm,
        'callback'            => function () {
            delete_option('clawflow_site_widgets');
            delete_option('clawflow_site_widgets_at');
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
        echo "\n<!-- Flowmatic GTM ($pid) -->\n";
        echo $head;
        echo "\n<!-- End Flowmatic GTM -->\n";
    }
}, 1);

add_action('wp_body_open', function () {
    $body = get_option('clawflow_gtm_body_snippet', '');
    $pid  = get_option('clawflow_gtm_public_id', '');
    if ($body && $pid) {
        echo "\n<!-- Flowmatic GTM noscript ($pid) -->\n";
        echo $body;
        echo "\n<!-- End Flowmatic GTM noscript -->\n";
    }
}, 1);

/**
 * Site Widgets render — floating WhatsApp/call button + exit-intent popup.
 * Driven by the clawflow_site_widgets option (set via REST). The wa.me / tel:
 * links are picked up by the GTM Click-to-Contact capture → GA4 events.
 */
add_action('wp_footer', function () {
    $raw = get_option('clawflow_site_widgets', '');
    if (!$raw) return;
    $cfg = json_decode($raw, true);
    if (!is_array($cfg)) return;
    $wa   = !empty($cfg['whatsapp']['enabled']) ? $cfg['whatsapp'] : null;
    $call = !empty($cfg['call']['enabled']) ? $cfg['call'] : null;
    $pop  = !empty($cfg['exitPopup']['enabled']) ? $cfg['exitPopup'] : null;
    if (!$wa && !$call && !$pop) return;
    echo "\n<!-- Flowmatic Site Widgets -->\n";

    if ($wa || $call) {
        echo '<div id="cf-fab" style="position:fixed;bottom:18px;left:18px;z-index:99998;display:flex;flex-direction:column;gap:10px">';
        if ($wa) {
            $phone = preg_replace('/[^0-9]/', '', (string)($wa['phone'] ?? ''));
            $msg   = rawurlencode((string)($wa['message'] ?? ''));
            $href  = 'https://wa.me/' . $phone . ($msg ? '?text=' . $msg : '');
            echo '<a href="' . esc_url($href) . '" target="_blank" rel="noopener" aria-label="WhatsApp" style="width:56px;height:56px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,.25)"><svg width="30" height="30" viewBox="0 0 24 24" fill="#fff"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.78h-.01a9.87 9.87 0 01-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 01-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 012.89 6.99c0 5.45-4.44 9.88-9.89 9.88M20.46 3.49A11.82 11.82 0 0012.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 005.69 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.49-8.42"/></svg></a>';
        }
        if ($call) {
            $cphone = (string)($call['phone'] ?? '');
            echo '<a href="tel:' . esc_attr($cphone) . '" aria-label="Call" style="width:56px;height:56px;border-radius:50%;background:#2563EB;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,.25)"><svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg></a>';
        }
        echo '</div>';
    }

    if ($pop) {
        $h      = esc_html((string)($pop['headline'] ?? ''));
        $b      = esc_html((string)($pop['body'] ?? ''));
        $coupon = esc_html((string)($pop['couponCode'] ?? ''));
        $cta    = esc_html((string)($pop['ctaText'] ?? 'קבלו את ההטבה'));
        $href   = esc_url((string)($pop['ctaHref'] ?? '#'));
        echo '<div id="cf-exit" style="display:none;position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.6);align-items:center;justify-content:center"><div style="background:#fff;max-width:420px;width:90%;border-radius:14px;padding:28px;text-align:center;direction:rtl;font-family:Arial,sans-serif;position:relative"><button id="cf-exit-x" aria-label="סגירה" style="position:absolute;top:10px;left:14px;border:0;background:0;font-size:22px;cursor:pointer;color:#94A3B8">&times;</button><h3 style="margin:0 0 10px;font-size:1.35rem;color:#0F172A">' . $h . '</h3><p style="margin:0 0 16px;color:#475569;font-size:.95rem;line-height:1.5">' . $b . '</p>' . ($coupon ? '<div style="font-size:1.2rem;font-weight:800;letter-spacing:1px;background:#F1F5F9;border:1px dashed #2563EB;border-radius:8px;padding:10px;margin-bottom:16px;color:#1D4ED8">' . $coupon . '</div>' : '') . '<a href="' . $href . '" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;font-weight:700;padding:11px 26px;border-radius:8px">' . $cta . '</a></div></div>';
        echo "<script>(function(){try{if(sessionStorage.getItem('cf_exit_seen'))return;var m=document.getElementById('cf-exit');if(!m)return;function show(){if(sessionStorage.getItem('cf_exit_seen'))return;sessionStorage.setItem('cf_exit_seen','1');m.style.display='flex';}function hide(){m.style.display='none';}document.addEventListener('mouseout',function(e){if(e.clientY<=0&&!e.relatedTarget)show();});setTimeout(show,45000);var x=document.getElementById('cf-exit-x');if(x)x.addEventListener('click',hide);m.addEventListener('click',function(e){if(e.target===m)hide();});}catch(e){}})();</script>";
    }
    echo "\n<!-- End Flowmatic Site Widgets -->\n";
}, 20);

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
 * Server-side GA4 Measurement Protocol purchase backfill (v1.8.0)
 *
 * Client-side dataLayer.purchase misses orders where the customer never lands
 * on the order-received page (redirect payment gateways, closed tab) — on some
 * stores that's ~50% of orders. This fires the purchase SERVER-SIDE on order
 * status change, deduped against the client-side hit by transaction_id (= order
 * id). client_id is captured from the _ga cookie at checkout so GA4 attributes
 * the purchase to the correct (ad) session. Requires measurement_id + api_secret
 * configured via POST /clawflow/v1/serverside-config.
 */
function clawflow_parse_ga_client_id($ga_cookie) {
    if (!$ga_cookie) return '';
    // _ga cookie: GA1.1.XXXXXXXXXX.YYYYYYYYYY -> client_id = XXXXXXXXXX.YYYYYYYYYY
    $parts = explode('.', $ga_cookie);
    $n = count($parts);
    if ($n >= 4) return $parts[$n - 2] . '.' . $parts[$n - 1];
    return '';
}

function clawflow_capture_attribution($order) {
    if (!$order || !is_object($order)) return;
    $cid = clawflow_parse_ga_client_id(isset($_COOKIE['_ga']) ? sanitize_text_field(wp_unslash($_COOKIE['_ga'])) : '');
    if ($cid && !$order->get_meta('_clawflow_ga_client_id')) $order->update_meta_data('_clawflow_ga_client_id', $cid);
    // gclid priority: our first-party capture cookie (set from the landing URL,
    // survives the payment-gateway round-trip) > raw `gclid` cookie > Google's
    // `_gcl_aw` (extract the raw gclid from its GCL.<ts>.<gclid> wrapper).
    $gclid = '';
    if (!empty($_COOKIE['clawflow_gclid'])) {
        $gclid = sanitize_text_field(wp_unslash($_COOKIE['clawflow_gclid']));
    } else {
        foreach (['gclid', '_gcl_aw'] as $ck) {
            if (empty($_COOKIE[$ck])) continue;
            $raw = sanitize_text_field(wp_unslash($_COOKIE[$ck]));
            if ($ck === '_gcl_aw' && strpos($raw, '.') !== false) {
                $parts = explode('.', $raw);
                $raw = end($parts);   // GCL.<ts>.<gclid> -> <gclid>
            }
            $gclid = $raw;
            break;
        }
    }
    if ($gclid && !$order->get_meta('_clawflow_gclid')) $order->update_meta_data('_clawflow_gclid', $gclid);
    $order->save();
}
add_action('woocommerce_checkout_create_order', function ($order) { clawflow_capture_attribution($order); }, 10, 1);
add_action('woocommerce_store_api_checkout_update_order_from_request', function ($order, $request) { clawflow_capture_attribution($order); }, 10, 2);

/**
 * First-party GCLID capture (v1.13.0).
 *
 * The offline store->Ads bridge needs the gclid persisted ON THE ORDER. Relying
 * on Google's `_gcl_aw` cookie is unreliable (Conversion Linker may not fire,
 * consent-mode may block it), and the order is created AFTER the payment-gateway
 * redirect — by which time any checkout form field is gone. So we capture the
 * gclid from the LANDING URL into a first-party cookie (90d) that survives the
 * gateway round-trip (same origin, SameSite=Lax → sent on the top-level return)
 * and is readable server-side at woocommerce_checkout_create_order.
 *
 * Two writers for robustness: client JS (runs even on full-page-cached pages)
 * + server-side setcookie on init (non-JS fallback).
 */
add_action('wp_head', function () {
    ?>
<script>(function(){try{var p=new URLSearchParams(location.search);var g=p.get('gclid')||p.get('gbraid')||p.get('wbraid');if(g){document.cookie='clawflow_gclid='+encodeURIComponent(g)+';path=/;max-age=7776000;samesite=lax'+(location.protocol==='https:'?';secure':'');}}catch(e){}})();</script>
    <?php
}, 1);

add_action('init', function () {
    if (headers_sent() || !empty($_COOKIE['clawflow_gclid'])) return;
    foreach (['gclid', 'gbraid', 'wbraid'] as $k) {
        if (empty($_GET[$k])) continue;
        $v = sanitize_text_field(wp_unslash($_GET[$k]));
        if ($v === '') continue;
        setcookie('clawflow_gclid', $v, time() + 90 * 24 * 3600, '/', '', is_ssl(), false);
        $_COOKIE['clawflow_gclid'] = $v;   // available within the same request
        break;
    }
}, 1);

function clawflow_send_mp_purchase($order_id) {
    $mid = get_option('clawflow_mp_measurement_id', '');
    $secret = get_option('clawflow_mp_api_secret', '');
    if (!$mid || !$secret || !$order_id) return;
    if (!function_exists('wc_get_order')) return;
    $order = wc_get_order($order_id);
    if (!$order) return;
    if ($order->get_meta('_clawflow_mp_sent')) return;  // once-per-order dedup guard

    $cid = $order->get_meta('_clawflow_ga_client_id');
    if (!$cid) {
        // Fallback: deterministic client_id (purchase still counts; session attribution weaker)
        $ts = $order->get_date_created() ? $order->get_date_created()->getTimestamp() : time();
        $cid = '555' . (int)$order_id . '.' . $ts;
    }
    $items = [];
    foreach ($order->get_items() as $item) {
        $product = $item->get_product();
        $items[] = [
            'item_id'   => $product ? (string)$product->get_id() : '',
            'item_name' => (string)$item->get_name(),
            'price'     => $product ? (float)$product->get_price() : 0,
            'quantity'  => (int)$item->get_quantity(),
        ];
    }
    $payload = [
        'client_id' => $cid,
        'events' => [[
            'name' => 'purchase',
            'params' => [
                'transaction_id' => (string)$order->get_id(),   // == client-side hit -> GA4 dedups
                'value'          => (float)$order->get_total(),
                'currency'       => (string)$order->get_currency(),
                'items'          => $items,
            ],
        ]],
    ];
    $url = 'https://www.google-analytics.com/mp/collect?measurement_id=' . rawurlencode($mid) . '&api_secret=' . rawurlencode($secret);
    $resp = wp_remote_post($url, [
        'timeout'  => 8,
        'headers'  => ['Content-Type' => 'application/json'],
        'body'     => wp_json_encode($payload),
        'blocking' => true,
    ]);
    if (!is_wp_error($resp)) {
        $order->update_meta_data('_clawflow_mp_sent', gmdate('c'));
        $order->save();
    }
}
add_action('woocommerce_order_status_processing', 'clawflow_send_mp_purchase', 20, 1);
add_action('woocommerce_order_status_completed', 'clawflow_send_mp_purchase', 20, 1);

/**
 * Server-side config endpoints — set/read the GA4 MP measurement_id + api_secret.
 * The secret is stored in wp_options (autoload off) and never echoed back.
 */
add_action('rest_api_init', function () {
    $perm = function () { return current_user_can('manage_options'); };
    register_rest_route('clawflow/v1', '/serverside-config', [
        'methods' => 'GET',
        'permission_callback' => $perm,
        'callback' => function () {
            $mid = get_option('clawflow_mp_measurement_id', '');
            $sec = get_option('clawflow_mp_api_secret', '');
            return ['measurementId' => $mid, 'hasApiSecret' => !empty($sec), 'enabled' => !empty($mid) && !empty($sec)];
        },
    ]);
    register_rest_route('clawflow/v1', '/serverside-config', [
        'methods' => 'POST',
        'permission_callback' => $perm,
        'callback' => function (WP_REST_Request $req) {
            $mid = trim((string)$req->get_param('measurementId'));
            $secret = trim((string)$req->get_param('apiSecret'));
            if ($mid !== '') update_option('clawflow_mp_measurement_id', $mid, false);
            if ($secret !== '') update_option('clawflow_mp_api_secret', $secret, false);
            return ['ok' => true, 'measurementId' => get_option('clawflow_mp_measurement_id', ''), 'hasApiSecret' => !empty(get_option('clawflow_mp_api_secret', ''))];
        },
    ]);
});

/**
 * Capability discovery endpoint — UI uses this to decide whether to
 * mention WooCommerce in chainSteps and whether to expect ecommerce
 * events. Also surfaces other relevant flags (whether Application
 * Password auth is configured properly etc.).
 */
/**
 * SEO meta REST writability.
 *
 * Yoast + Rank Math store the meta description in protected/custom post meta
 * (`_yoast_wpseo_metadesc`, `rank_math_description`) that is NOT writable via
 * the core REST API by default — a POST including them returns 200 but the
 * value is silently dropped. Flowmatic's seoMetaBatch needs to set these, so we
 * register them here with show_in_rest + an edit-capability auth_callback.
 *
 * The active SEO plugin reads its own key; the inactive plugin's key is simply
 * harmless extra post meta. We register on both 'post' and 'page'. After this,
 * a POST /wp/v2/{posts|pages}/{id} with `meta: { _yoast_wpseo_metadesc: "…",
 * rank_math_description: "…" }` persists.
 */
add_action('init', function () {
    $seoMetaKeys = [
        '_yoast_wpseo_metadesc',
        '_yoast_wpseo_focuskw',
        '_yoast_wpseo_title',
        'rank_math_description',
        'rank_math_focus_keyword',
        'rank_math_title',
    ];
    $editAuth = function ($allowed, $meta_key, $object_id) {
        return current_user_can('edit_post', $object_id);
    };
    // v1.12.0: include 'product' so SEO meta + Flowmatic schema (Product+Offer
    // JSON-LD) are REST-writable + rendered on WooCommerce product pages too.
    $clawflowMetaPostTypes = ['post', 'page'];
    if (post_type_exists('product')) $clawflowMetaPostTypes[] = 'product';
    foreach ($clawflowMetaPostTypes as $postType) {
        foreach ($seoMetaKeys as $key) {
            register_post_meta($postType, $key, [
                'type'          => 'string',
                'single'        => true,
                'show_in_rest'  => true,
                'auth_callback' => $editAuth,
            ]);
        }
        // Full-set schema.org JSON-LD (stored as a JSON string). When set,
        // Flowmatic OWNS structured data for that page (see render + suppression
        // below). Written via POST /wp/v2/{type}/{id} { meta: { _clawflow_schema_jsonld: "<json>" } }.
        register_post_meta($postType, '_clawflow_schema_jsonld', [
            'type'          => 'string',
            'single'        => true,
            'show_in_rest'  => true,
            'auth_callback' => $editAuth,
        ]);
    }
}, 20);  // priority 20 — run AFTER Yoast/Rank Math register their own (non-writable) meta so ours wins

/**
 * Flowmatic Schema (full-set replacement).
 *
 * When a page has `_clawflow_schema_jsonld` set, we (1) render it in <head>,
 * and (2) suppress Yoast / Rank Math structured data for that page so there's
 * exactly ONE schema graph (no duplicate/competing @graph). Pages WITHOUT our
 * meta are untouched — the existing SEO plugin keeps emitting its own.
 */
function clawflow_current_schema_jsonld() {
    if (!is_singular()) return '';
    $pid = get_queried_object_id();
    if (!$pid) return '';
    $raw = get_post_meta($pid, '_clawflow_schema_jsonld', true);
    return is_string($raw) ? trim($raw) : '';
}

add_action('wp_head', function () {
    $json = clawflow_current_schema_jsonld();
    if ($json === '') return;
    // Validate it parses before emitting — never inject broken JSON-LD.
    $decoded = json_decode($json, true);
    if (json_last_error() !== JSON_ERROR_NONE || empty($decoded)) return;
    echo "\n<script type=\"application/ld+json\" data-clawflow=\"1\">" .
        wp_json_encode($decoded) . "</script>\n";
}, 99);

// Suppress Yoast structured data when Flowmatic owns the page's schema.
add_filter('wpseo_json_ld_output', function ($data) {
    return clawflow_current_schema_jsonld() !== '' ? array() : $data;
}, 10, 1);
add_filter('wpseo_schema_graph', function ($graph) {
    return clawflow_current_schema_jsonld() !== '' ? array() : $graph;
}, 10, 1);
// Suppress Rank Math structured data likewise.
add_filter('rank_math/json_ld', function ($data) {
    return clawflow_current_schema_jsonld() !== '' ? array() : $data;
}, 99, 1);

/**
 * llms.txt / llms-full.txt — AEO files for AI crawlers (ChatGPT, Perplexity,
 * Gemini, Claude). Served from the SITE ROOT as text/plain. WordPress is a CMS,
 * not a static host, so we intercept the request early (no rewrite-flush needed)
 * and emit the stored option. Content is set by Flowmatic via the REST route below.
 */
add_action('init', function () {
    $uri = strtok($_SERVER['REQUEST_URI'] ?? '', '?');
    if ($uri === '/llms.txt' || $uri === '/llms-full.txt') {
        $opt = $uri === '/llms.txt' ? 'clawflow_llms_txt' : 'clawflow_llms_full_txt';
        $content = get_option($opt, '');
        if ($content !== '') {
            header('Content-Type: text/plain; charset=utf-8');
            header('X-Robots-Tag: noindex');
            echo $content;
            exit;
        }
    }
}, 1);

add_action('rest_api_init', function () {
    register_rest_route('clawflow/v1', '/llms-txt', [
        'methods'             => 'POST',
        'permission_callback' => function () { return current_user_can('manage_options'); },
        'callback'            => function (WP_REST_Request $req) {
            $main = (string) $req->get_param('content');
            $full = (string) $req->get_param('fullContent');
            update_option('clawflow_llms_txt', $main, false);
            if ($full !== '') update_option('clawflow_llms_full_txt', $full, false);
            update_option('clawflow_llms_updated_at', gmdate('c'), false);
            return ['ok' => true, 'bytes' => strlen($main), 'url' => get_site_url() . '/llms.txt'];
        },
    ]);

    register_rest_route('clawflow/v1', '/capabilities', [
        'methods'             => 'GET',
        'permission_callback' => function () { return current_user_can('manage_options'); },
        'callback'            => function () {
            return [
                'pluginVersion'       => '1.15.0',
                'wordpressVersion'    => get_bloginfo('version'),
                'siteWidgetsServable' => true,
                'siteWidgetsActive'   => !empty(get_option('clawflow_site_widgets', '')),
                'wooCommerceActive'   => class_exists('WooCommerce'),
                'wooCommerceVersion'  => defined('WC_VERSION') ? WC_VERSION : null,
                'gtmInstalled'        => !empty(get_option('clawflow_gtm_public_id', '')),
                'serverSideEnabled'   => !empty(get_option('clawflow_mp_measurement_id', '')) && !empty(get_option('clawflow_mp_api_secret', '')),
                'seoMetaWritable'     => true,
                'seoSchemaWritable'   => true,
                'llmsTxtServable'     => true,
                'llmsTxtInstalled'    => !empty(get_option('clawflow_llms_txt', '')),
                'siteUrl'             => get_site_url(),
            ];
        },
    ]);

    /**
     * GET /clawflow/v1/tracking-audit
     *
     * Phase 2026.02 Block 6 K8 — detect ALL active tracking plugins +
     * their configured tracking IDs (GA4 / Google Ads conversion / Meta
     * Pixel / TikTok / Pinterest). Backend uses this to flag conflicts
     * with our GTM container (e.g. PixelYourSite + GTM both sending the
     * same AW-XXX conversion → double-counted purchases → exactly the
     * conv_value_pollution audit pattern we saw on Packing Station).
     *
     * Per-plugin detection: option keys extracted from each plugin's
     * source (verified by reading the plugin code on disk). Patterns
     * cover the top 8 IL/Shopify-WC tracking plugins:
     *   - PixelYourSite (PYS) — pys_options, pys_woo_options, pys_facebook_*
     *   - Google for WooCommerce — gla_options / wc-google-listings
     *   - MonsterInsights — monsterinsights_settings
     *   - Site Kit by Google — googlesitekit-modules
     *   - GA Google Analytics (by ExactMetrics) — ga_googleanalytics
     *   - Pixel Caffeine — pca_options
     *   - Tag Manager for WordPress (DuracellTomi) — gtm4wp-options
     *   - Sales & Conversion Optimization (woopt) — woopt_*
     */
    register_rest_route('clawflow/v1', '/tracking-audit', [
        'methods'             => 'GET',
        'permission_callback' => function () { return current_user_can('manage_options'); },
        'callback'            => function () {
            if (!function_exists('is_plugin_active')) {
                require_once ABSPATH . 'wp-admin/includes/plugin.php';
            }
            $detected = [];
            $rawSources = [];

            // ─── PixelYourSite (PYS) — top IL tracking plugin ───
            if (is_plugin_active('pixelyoursite/pixelyoursite.php') ||
                is_plugin_active('pixelyoursite-pro/pixelyoursite-pro.php')) {
                $main = get_option('pys_core_settings', []);
                $fb = get_option('pys_facebook_options', []);
                $gads = get_option('pys_google_options', []) ?: get_option('pys_ads_options', []);
                $ga = get_option('pys_ga_options', []) ?: get_option('pys_analytics_options', []);
                $woo = get_option('pys_woo_options', []);

                $sends = [];
                // Facebook Pixel — PYS stores pixel IDs as JSON array string or array
                $pixelIdsRaw = $fb['pixel_id'] ?? '';
                $pixelIds = [];
                if (is_array($pixelIdsRaw)) $pixelIds = $pixelIdsRaw;
                elseif (is_string($pixelIdsRaw) && $pixelIdsRaw !== '') {
                    $decoded = json_decode($pixelIdsRaw, true);
                    $pixelIds = is_array($decoded) ? $decoded : [$pixelIdsRaw];
                }
                $pixelIds = array_filter(array_map('trim', $pixelIds));
                foreach ($pixelIds as $pid) {
                    if ($pid) $sends[] = ['platform' => 'meta_pixel', 'id' => $pid, 'feature' => 'fbq init + events'];
                }
                // Google Ads conversion id (gtag direct, AW-)
                $awId = $gads['conversion_id'] ?? '';
                if ($awId) $sends[] = ['platform' => 'google_ads', 'id' => 'AW-' . preg_replace('/^AW-/', '', $awId), 'feature' => 'gtag awct conversion'];
                // GA4 measurement id
                $g4 = $ga['ga4_measurement_id'] ?? ($ga['measurement_id'] ?? '');
                if ($g4) $sends[] = ['platform' => 'ga4', 'id' => $g4, 'feature' => 'gtag config events'];
                // WC ecommerce dataLayer pushes
                if (!empty($woo['enabled'])) $sends[] = ['platform' => 'datalayer', 'id' => 'wc_ecommerce', 'feature' => 'WooCommerce dataLayer push (add_to_cart / purchase)'];

                if (!empty($sends)) {
                    $detected[] = [
                        'plugin' => 'pixelyoursite',
                        'name'   => 'PixelYourSite',
                        'version'=> defined('PYS_VERSION') ? PYS_VERSION : 'unknown',
                        'active' => true,
                        'sends'  => $sends,
                        'resolutionHint' => 'PYS Settings → disable Facebook Pixel / Google Ads / GA4 per integration to avoid conflict with GTM.',
                    ];
                }
                $rawSources['pys'] = ['has_fb' => !empty($fb), 'has_gads' => !empty($gads), 'has_ga' => !empty($ga), 'has_woo' => !empty($woo)];
            }

            // ─── Google for WooCommerce (formerly Google Listings & Ads) ───
            // Plugin has been renamed multiple times — check all known slug
            // variants. Falls back to any active plugin slug containing
            // 'google-listings' OR 'google-for-woocommerce'.
            $glaSlugCandidates = [
                'google-listings-and-ads/google-listings-and-ads.php',
                'google-for-woocommerce/google-for-woocommerce.php',
                'woocommerce-google-feed-manager/woocommerce-google-feed-manager.php',
            ];
            $glaActive = false;
            foreach ($glaSlugCandidates as $slug) {
                if (is_plugin_active($slug)) { $glaActive = true; break; }
            }
            // Fallback: scan active_plugins for any matching pattern
            if (!$glaActive) {
                foreach ((array)get_option('active_plugins', []) as $p) {
                    if (preg_match('/(google-listings-and-ads|google-for-woocommerce|woocommerce-google-feed)/i', $p)) {
                        $glaActive = true; break;
                    }
                }
            }
            if ($glaActive) {
                $sends = [];
                // Try multiple option key variants
                $glaOpts = get_option('gla_options', []);
                if (!is_array($glaOpts)) $glaOpts = [];
                $awId = $glaOpts['ads_id']
                    ?? $glaOpts['conversion_id']
                    ?? get_option('gla_ads_conversion_action', '')
                    ?? get_option('gla_ads_id', '')
                    ?? get_option('woocommerce_google_ads_id', '');
                if ($awId) $sends[] = ['platform' => 'google_ads', 'id' => 'AW-' . preg_replace('/^AW-/', '', (string)$awId), 'feature' => 'gtag direct conversion (WC purchase)'];
                $g4 = $glaOpts['ga4_measurement_id'] ?? get_option('gla_ga4_measurement_id', '') ?? get_option('woocommerce_ga4_id', '');
                if ($g4) $sends[] = ['platform' => 'ga4', 'id' => $g4, 'feature' => 'GA4 ecommerce events'];
                // Without identifiable ID — still register the plugin so user knows it's there
                if (empty($sends)) {
                    $sends[] = ['platform' => 'google_ads', 'id' => '(configured but ID not readable from options)', 'feature' => 'gtag direct conversion — see WC Marketing → Google'];
                }
                $detected[] = [
                    'plugin' => 'google-listings-and-ads',
                    'name'   => 'Google for WooCommerce',
                    'version'=> defined('WC_GLA_VERSION') ? WC_GLA_VERSION : 'unknown',
                    'active' => true,
                    'sends'  => $sends,
                    'resolutionHint' => 'WC Admin → Marketing → Google → Settings → Conversion Tracking → OFF (avoids AW-XXX double-count vs GTM awct).',
                ];
            }

            // ─── MonsterInsights / ExactMetrics ───
            foreach ([
                ['monsterinsights-lite/googleanalytics.php', 'MonsterInsights', 'monsterinsights_settings'],
                ['google-analytics-for-wordpress/googleanalytics.php', 'MonsterInsights Pro', 'monsterinsights_settings'],
                ['google-analytics-dashboard-for-wp/gadwp.php', 'ExactMetrics', 'exactmetrics_settings'],
            ] as [$file, $name, $optKey]) {
                if (is_plugin_active($file)) {
                    $opt = get_option($optKey, []);
                    $sends = [];
                    $g4 = $opt['measurement_id'] ?? ($opt['ga4_id'] ?? '');
                    if ($g4) $sends[] = ['platform' => 'ga4', 'id' => $g4, 'feature' => 'GA4 page view + events'];
                    $detected[] = [
                        'plugin' => $file, 'name' => $name, 'version' => 'unknown',
                        'active' => true, 'sends' => $sends,
                        'resolutionHint' => $name . ' → Settings → Tracking → Disable or set "Use GTM" mode to avoid GA4 double-fire vs our GTM gaawe tags.',
                    ];
                }
            }

            // ─── Google Site Kit ───
            if (is_plugin_active('google-site-kit/google-site-kit.php')) {
                $modules = get_option('googlesitekit_active_modules', []);
                $sends = [];
                if (in_array('analytics-4', (array)$modules, true)) {
                    $a4 = get_option('googlesitekit_analytics-4_settings', []);
                    if (!empty($a4['measurementID'])) $sends[] = ['platform' => 'ga4', 'id' => $a4['measurementID'], 'feature' => 'GA4 base tag (gtag)'];
                }
                if (in_array('ads', (array)$modules, true)) {
                    $ads = get_option('googlesitekit_ads_settings', []);
                    if (!empty($ads['conversionID'])) $sends[] = ['platform' => 'google_ads', 'id' => 'AW-' . preg_replace('/^AW-/', '', $ads['conversionID']), 'feature' => 'Ads conversion tag'];
                }
                $detected[] = [
                    'plugin' => 'google-site-kit', 'name' => 'Site Kit by Google', 'version' => 'unknown',
                    'active' => true, 'sends' => $sends,
                    'resolutionHint' => 'Site Kit → disable Analytics + Ads modules (Site Kit and GTM should not BOTH inject the same tag IDs).',
                ];
            }

            // ─── Tag Manager for WordPress (GTM4WP by DuracellTomi) ───
            if (is_plugin_active('duracelltomi-google-tag-manager/duracelltomi-google-tag-manager-for-wordpress.php')) {
                $opt = get_option('gtm4wp-options', []);
                $sends = [];
                $gtmId = $opt['gtm-code'] ?? '';
                if ($gtmId) $sends[] = ['platform' => 'gtm', 'id' => $gtmId, 'feature' => 'GTM container snippet (second container — conflicts with Flowmatic GTM)'];
                $detected[] = [
                    'plugin' => 'duracelltomi-google-tag-manager', 'name' => 'GTM4WP', 'version' => 'unknown',
                    'active' => true, 'sends' => $sends,
                    'resolutionHint' => 'GTM4WP loads ANOTHER GTM container alongside Flowmatic GTM. Disable plugin OR replace its container ID with Flowmatic GTM-XXX.',
                ];
            }

            // ─── Pinterest for WooCommerce ───
            if (is_plugin_active('pinterest-for-woocommerce/pinterest-for-woocommerce.php')) {
                $opt = get_option('pinterest_for_woocommerce', []);
                $sends = [];
                if (!empty($opt['tag_id'])) $sends[] = ['platform' => 'pinterest', 'id' => $opt['tag_id'], 'feature' => 'Pinterest Tag (events)'];
                $detected[] = [
                    'plugin' => 'pinterest-for-woocommerce', 'name' => 'Pinterest for WooCommerce', 'version' => 'unknown',
                    'active' => true, 'sends' => $sends,
                    'resolutionHint' => 'Independent tracker — no conflict with GTM unless you ALSO add Pinterest Tag via GTM.',
                ];
            }

            // ─── Insert Headers and Footers (IHAF) — common snippet injector ───
            // Users paste tracking snippets here when they don't have a
            // tracking plugin OR after uninstalling one. Detects AW-XXX,
            // G-XXXX, fbq init in header/footer/body options.
            if (is_plugin_active('insert-headers-and-footers/ihaf.php') ||
                is_plugin_active('header-footer-code-manager/header-footer-code-manager.php') ||
                is_plugin_active('wpcode-lite/wpcode.php')) {
                $sends = [];
                $snippetSources = [];
                // IHAF stores HTML in wp_options 'ihaf_insert_header', '_body', '_footer'
                $ihafKeys = ['ihaf_insert_header', 'ihaf_insert_body', 'ihaf_insert_footer'];
                foreach ($ihafKeys as $ihKey) {
                    $val = (string)get_option($ihKey, '');
                    if ($val === '') continue;
                    // Detect AW conversion id
                    if (preg_match_all('/AW-(\d{6,})/i', $val, $m)) {
                        foreach (array_unique($m[1]) as $awId) {
                            $sends[] = ['platform' => 'google_ads', 'id' => 'AW-' . $awId, 'feature' => 'manual snippet in ' . $ihKey];
                        }
                        $snippetSources[] = $ihKey;
                    }
                    // Detect GA4 measurement id
                    if (preg_match_all('/G-([A-Z0-9]{8,})/i', $val, $m)) {
                        foreach (array_unique($m[1]) as $g4Id) {
                            $sends[] = ['platform' => 'ga4', 'id' => 'G-' . $g4Id, 'feature' => 'manual snippet in ' . $ihKey];
                        }
                        $snippetSources[] = $ihKey;
                    }
                    // Detect Meta Pixel fbq init
                    if (preg_match_all('/fbq\s*\(\s*[\'"]init[\'"]\s*,\s*[\'"](\d{10,})[\'"]/', $val, $m)) {
                        foreach (array_unique($m[1]) as $pxId) {
                            $sends[] = ['platform' => 'meta_pixel', 'id' => $pxId, 'feature' => 'manual fbq init in ' . $ihKey];
                        }
                        $snippetSources[] = $ihKey;
                    }
                }
                if (!empty($sends)) {
                    $detected[] = [
                        'plugin' => 'insert-headers-and-footers',
                        'name'   => 'Insert Headers and Footers (manual snippet injector)',
                        'version'=> 'unknown',
                        'active' => true,
                        'sends'  => $sends,
                        'resolutionHint' => 'WP Admin → Settings → Insert Headers and Footers → delete the tracking snippet from: ' . implode(', ', array_unique($snippetSources)),
                    ];
                }
            }

            // ─── Generic wp_options scan for residual AW/G-/fbq snippets ───
            // Catches any plugin/option (not in our known list) storing a
            // tracking ID. Lookups for "AW-XXXXX" pattern across ALL options.
            global $wpdb;
            $orphanedAw = $wpdb->get_results(
                "SELECT option_name, LEFT(option_value, 400) AS preview
                 FROM {$wpdb->options}
                 WHERE option_value LIKE '%AW-1%'
                       AND option_name NOT IN ('pys_google_options', 'pys_options', 'pys_core_settings',
                                               'pys_woo_options', 'pys_facebook_options', 'gla_options',
                                               'googlesitekit_ads_settings', 'googlesitekit_analytics-4_settings',
                                               'ihaf_insert_header', 'ihaf_insert_body', 'ihaf_insert_footer',
                                               'gtm4wp-options', 'clawflow_gtm_head_snippet',
                                               'clawflow_gtm_body_snippet')
                 LIMIT 50",
                ARRAY_A
            );
            $orphanedSends = [];
            $orphanedKeys = [];
            foreach ((array)$orphanedAw as $row) {
                if (preg_match_all('/AW-(\d{6,})/i', $row['preview'], $m)) {
                    foreach (array_unique($m[1]) as $awId) {
                        $orphanedSends[] = ['platform' => 'google_ads', 'id' => 'AW-' . $awId, 'feature' => 'wp_options.' . $row['option_name']];
                        $orphanedKeys[] = $row['option_name'];
                    }
                }
            }
            if (!empty($orphanedSends)) {
                $detected[] = [
                    'plugin' => 'orphaned-wp-options',
                    'name'   => 'Tracking snippets in wp_options (no plugin owns them)',
                    'version'=> 'n/a',
                    'active' => true,
                    'sends'  => $orphanedSends,
                    'resolutionHint' => 'These wp_options contain AW conversion IDs but no known plugin claims them: ' . implode(', ', array_unique($orphanedKeys)) . '. Manual cleanup via /clawflow/v1/delete-wp-option endpoint.',
                ];
            }

            // ─── Catch-all: scan all active plugins for tracking markers ───
            $allActive = (array)get_option('active_plugins', []);
            $knownTracking = ['pixelyoursite', 'google-listings-and-ads', 'monsterinsights', 'google-analytics-for-wordpress',
                'google-analytics-dashboard-for-wp', 'google-site-kit', 'duracelltomi-google-tag-manager',
                'pinterest-for-woocommerce', 'facebook-for-woocommerce', 'tiktok-for-business'];
            $unknownTracking = [];
            foreach ($allActive as $p) {
                $slug = explode('/', $p)[0];
                if (preg_match('/(pixel|tag-?manager|analytics|tracking|conversion|gtag|fbq|gtm|ga4|google-ads|meta-?ads)/i', $slug)
                    && !in_array($slug, $knownTracking, true)) {
                    $unknownTracking[] = $slug;
                }
            }

            return [
                'detected'        => $detected,
                'unknownTracking' => $unknownTracking,
                'raw'             => $rawSources,
                'scannedAt'       => gmdate('c'),
            ];
        },
    ]);

    /**
     * POST /clawflow/v1/disable-plugin-feature
     * Body: { plugin: 'pixelyoursite', feature: 'google_ads' | 'ga4' | 'meta_pixel' | 'all' }
     *
     * Per-plugin per-feature surgical disable. NOT a full plugin deactivation
     * — keeps the plugin active for features the user still wants (e.g. PYS
     * Facebook Pixel kept, PYS Google Ads disabled).
     */
    /**
     * POST /clawflow/v1/delete-wp-options
     * Body: { keys: ['gla_ads_conversion_action', 'gla_ga4_measurement_id', ...] }
     *
     * Deletes ORPHANED wp_options (leftovers from uninstalled plugins) that
     * still emit tracking scripts on the page. Used for AW-XXX residuals
     * from old Google for WooCommerce installs.
     *
     * Safety: only allows option names matching /^(gla_|ga_|google_|gtm_|fb_|fbq_|pys_|monsterinsights_|exactmetrics_|googlesitekit_|gtm4wp-|wc_google|woocommerce_google|leader_)/
     * — prevents accidental deletion of unrelated WP options.
     */
    register_rest_route('clawflow/v1', '/delete-wp-options', [
        'methods'             => 'POST',
        'permission_callback' => function () { return current_user_can('manage_options'); },
        'callback'            => function (WP_REST_Request $req) {
            $keys = (array)$req->get_param('keys');
            $allowedPrefixes = '/^(gla_|ga_|google_|gtm_|fb_|fbq_|pys_|monsterinsights_|exactmetrics_|googlesitekit_|gtm4wp-|wc_google|woocommerce_google|leader_|wc_facebook|wc_meta)/i';
            $deleted = [];
            $rejected = [];
            foreach ($keys as $key) {
                $key = sanitize_text_field((string)$key);
                if (!preg_match($allowedPrefixes, $key)) {
                    $rejected[] = $key . ' (prefix not in allowlist)';
                    continue;
                }
                if (get_option($key) !== false) {
                    delete_option($key);
                    $deleted[] = $key;
                } else {
                    $rejected[] = $key . ' (not in DB)';
                }
            }
            return ['ok' => true, 'deleted' => $deleted, 'rejected' => $rejected];
        },
    ]);

    // POST /clawflow/v1/set-plugin-gtm — point a third-party tracking plugin's
    // GTM container at OURS (the conflict-aware "integrate" path). Keeps the
    // plugin + its Meta/Woo; swaps only the GTM container id, so the site loads
    // a single container (ours) with our fixtures. `probe:true` lets the platform
    // feature-detect this endpoint without changing anything.
    register_rest_route('clawflow/v1', '/set-plugin-gtm', [
        'methods'             => 'POST',
        'permission_callback' => function () { return current_user_can('manage_options'); },
        'callback'            => function (WP_REST_Request $req) {
            $plugin   = sanitize_text_field((string)$req->get_param('plugin'));
            $publicId = sanitize_text_field((string)$req->get_param('publicId'));
            if ((bool)$req->get_param('probe')) return ['ok' => true, 'supported' => true, 'changes' => []];
            if (!$plugin || !preg_match('/^GTM-[A-Z0-9]{4,}$/', $publicId)) {
                return new WP_Error('bad_args', 'plugin + valid GTM-XXXX publicId required', ['status' => 400]);
            }
            $changes = [];
            if ($plugin === 'pixelyoursite') {
                // PixelYourSite stores its GTM container in pys_core_settings.
                $core = get_option('pys_core_settings', []);
                if (!is_array($core)) $core = [];
                $core['gtm_id'] = $publicId;
                $core['gtm_enabled'] = '1';
                update_option('pys_core_settings', $core, false);
                $changes[] = 'pys_core_settings.gtm_id → ' . $publicId . ' (enabled)';
            } else {
                return new WP_Error('unsupported_plugin', "integrate not supported for {$plugin} — use replace", ['status' => 422]);
            }
            return ['ok' => true, 'supported' => true, 'changes' => $changes];
        },
    ]);

    register_rest_route('clawflow/v1', '/disable-plugin-feature', [
        'methods'             => 'POST',
        'permission_callback' => function () { return current_user_can('manage_options'); },
        'callback'            => function (WP_REST_Request $req) {
            $plugin  = sanitize_text_field((string)$req->get_param('plugin'));
            $feature = sanitize_text_field((string)$req->get_param('feature'));
            if (!$plugin || !$feature) return new WP_Error('bad_args', 'plugin + feature required', ['status' => 400]);

            $changes = [];

            if ($plugin === 'pixelyoursite') {
                if ($feature === 'google_ads' || $feature === 'all') {
                    $gads = get_option('pys_google_options', []);
                    if (is_array($gads)) {
                        $gads['gads_enabled'] = '';
                        $gads['gads_purchase_event_on'] = '';
                        $gads['gads_lead_event_on'] = '';
                        update_option('pys_google_options', $gads, false);
                        $changes[] = 'pys_google_options.gads_enabled cleared';
                    }
                }
                if ($feature === 'meta_pixel' || $feature === 'all') {
                    $fb = get_option('pys_facebook_options', []);
                    if (is_array($fb)) {
                        $fb['facebook_enabled'] = '';
                        $fb['pixel_id'] = '';
                        update_option('pys_facebook_options', $fb, false);
                        $changes[] = 'pys_facebook_options.facebook_enabled + pixel_id cleared';
                    }
                }
                if ($feature === 'ga4' || $feature === 'all') {
                    $ga = get_option('pys_ga_options', []);
                    if (is_array($ga)) {
                        $ga['ga_enabled'] = '';
                        $ga['ga4_enabled'] = '';
                        update_option('pys_ga_options', $ga, false);
                        $changes[] = 'pys_ga_options.ga_enabled + ga4_enabled cleared';
                    }
                }
            }

            if ($plugin === 'google-listings-and-ads') {
                if ($feature === 'google_ads' || $feature === 'all') {
                    $gla = get_option('gla_options', []);
                    if (is_array($gla)) {
                        $gla['ads_id'] = '';
                        $gla['conversion_tracking_enabled'] = false;
                        update_option('gla_options', $gla, false);
                        $changes[] = 'gla_options.ads_id + conversion_tracking_enabled cleared';
                    }
                    delete_option('gla_ads_id');
                    delete_option('gla_ads_conversion_action');
                    $changes[] = 'gla_ads_* options deleted';
                }
                if ($feature === 'ga4' || $feature === 'all') {
                    delete_option('gla_ga4_measurement_id');
                    $changes[] = 'gla_ga4_measurement_id deleted';
                }
            }

            // ── Site Kit by Google ──
            // Site Kit modules are stored in 'googlesitekit_active_modules'
            // as an array of slugs. To disable a tracker, REMOVE that module
            // from active_modules (surgical — leaves Search Console / AdSense
            // intact if user had those). Also wipe per-module settings so
            // re-activation requires reconfigure (avoids stale tracking ID
            // sneaking back into the page).
            if ($plugin === 'google-site-kit' || strpos($plugin, 'google-site-kit') === 0) {
                $modules = (array)get_option('googlesitekit_active_modules', []);
                $modulesToRemove = [];
                if ($feature === 'ga4' || $feature === 'all') $modulesToRemove[] = 'analytics-4';
                if ($feature === 'google_ads' || $feature === 'all') $modulesToRemove[] = 'ads';
                if ($feature === 'meta_pixel') {
                    $changes[] = 'site-kit has no meta_pixel module — no-op';
                }
                $newModules = array_values(array_diff($modules, $modulesToRemove));
                if (count($newModules) !== count($modules)) {
                    update_option('googlesitekit_active_modules', $newModules, false);
                    $changes[] = 'googlesitekit_active_modules: removed ' . implode(', ', array_diff($modules, $newModules));
                }
                // Clear per-module settings so reactivating requires reconfig
                foreach ($modulesToRemove as $mod) {
                    $key = 'googlesitekit_' . $mod . '_settings';
                    if (get_option($key) !== false) {
                        delete_option($key);
                        $changes[] = $key . ' deleted';
                    }
                }
                // Also clear measurement-id-specific stored values used by
                // Site Kit's analytics-4 frontend (just in case)
                if ($feature === 'ga4' || $feature === 'all') {
                    delete_option('googlesitekit_analytics_settings');
                    delete_option('googlesitekit_analytics-4_settings');
                    $changes[] = 'analytics legacy settings wiped';
                }
            }

            // ── MonsterInsights / ExactMetrics ──
            if (strpos($plugin, 'monsterinsights') !== false || strpos($plugin, 'google-analytics-for-wordpress') !== false) {
                if ($feature === 'ga4' || $feature === 'all') {
                    $mi = get_option('monsterinsights_settings', []);
                    if (is_array($mi)) {
                        unset($mi['manual_v4_id']);
                        unset($mi['measurement_protocol_secret']);
                        $mi['analytics_profile'] = '';
                        update_option('monsterinsights_settings', $mi, false);
                        $changes[] = 'monsterinsights_settings.manual_v4_id + analytics_profile cleared';
                    }
                }
            }
            if (strpos($plugin, 'google-analytics-dashboard-for-wp') !== false) {
                if ($feature === 'ga4' || $feature === 'all') {
                    $em = get_option('exactmetrics_settings', []);
                    if (is_array($em)) {
                        unset($em['manual_v4_id']);
                        update_option('exactmetrics_settings', $em, false);
                        $changes[] = 'exactmetrics_settings.manual_v4_id cleared';
                    }
                }
            }

            // ── Insert Headers and Footers (IHAF) — surgical: remove AW/G-/fbq lines only ──
            if (strpos($plugin, 'insert-headers-and-footers') !== false) {
                $ihKeys = ['ihaf_insert_header', 'ihaf_insert_body', 'ihaf_insert_footer'];
                foreach ($ihKeys as $ihKey) {
                    $val = (string)get_option($ihKey, '');
                    if ($val === '') continue;
                    $orig = $val;
                    if ($feature === 'google_ads' || $feature === 'all') {
                        // Strip the entire <script> block(s) referencing gtag/js?id=AW-
                        // Also strip the surrounding HTML comment + inline gtag() config.
                        $val = preg_replace('#<!--\s*Global\s+site\s+tag.*?Google\s+Ads:\s*AW-\d+.*?-->#is', '', $val);
                        $val = preg_replace('#<script[^>]+gtag/js\?id=AW-\d+[^>]*>\s*</script>#i', '', $val);
                        $val = preg_replace('#<script>(?:(?!</script>).)*?gtag\s*\(\s*["\']config["\']\s*,\s*["\']AW-\d+["\'](?:(?!</script>).)*?</script>#is', '', $val);
                    }
                    if ($feature === 'ga4' || $feature === 'all') {
                        $val = preg_replace('#<script[^>]+gtag/js\?id=G-[A-Z0-9]+[^>]*>\s*</script>#i', '', $val);
                        $val = preg_replace('#<script>(?:(?!</script>).)*?gtag\s*\(\s*["\']config["\']\s*,\s*["\']G-[A-Z0-9]+["\'](?:(?!</script>).)*?</script>#is', '', $val);
                    }
                    if ($feature === 'meta_pixel' || $feature === 'all') {
                        $val = preg_replace('#<script>(?:(?!</script>).)*?fbq\s*\(\s*[\'"]init[\'"]\s*,\s*[\'"]\d{10,}[\'"](?:(?!</script>).)*?</script>#is', '', $val);
                    }
                    if ($val !== $orig) {
                        update_option($ihKey, trim($val), false);
                        $changes[] = $ihKey . ' cleaned (stripped tracking snippet)';
                    }
                }
            }

            // ── GTM4WP (DuracellTomi) ──
            if (strpos($plugin, 'duracelltomi-google-tag-manager') !== false) {
                if ($feature === 'all' || $feature === 'gtm' || $feature === 'deactivate_plugin') {
                    $opt = get_option('gtm4wp-options', []);
                    if (is_array($opt)) {
                        $opt['gtm-code'] = '';
                        update_option('gtm4wp-options', $opt, false);
                        $changes[] = 'gtm4wp-options.gtm-code cleared';
                    }
                }
            }

            // ── Deactivate entire plugin — robust slug family matching ──
            //
            // Many tracking plugins have had multiple rebrands / vendor prefix
            // changes (e.g. "Google Listings & Ads" → "Google for WooCommerce",
            // "Conversion Tracking" → "PixelYourSite Pro"). Exact slug match
            // would miss these. We define plugin FAMILIES of related slug
            // patterns and deactivate ALL active plugins matching the family.
            if ($feature === 'deactivate_plugin' && $plugin) {
                if (!function_exists('deactivate_plugins')) {
                    require_once ABSPATH . 'wp-admin/includes/plugin.php';
                }
                // Map canonical name → regex patterns of related slugs
                $families = [
                    'google-listings-and-ads' => '/(google-listings-and-ads|google-for-woocommerce|woocommerce-google-feed|wc-google-ads|google-ads-for-woo)/i',
                    'pixelyoursite'           => '/(pixelyoursite|pixel-your-site|pys-)/i',
                    'monsterinsights-lite'    => '/(monsterinsights|google-analytics-for-wordpress)/i',
                    'google-site-kit'         => '/(google-site-kit|sitekit)/i',
                    'duracelltomi-google-tag-manager' => '/(duracelltomi-google-tag-manager|gtm4wp)/i',
                    'exactmetrics'            => '/(exactmetrics|google-analytics-dashboard-for-wp)/i',
                    'pinterest-for-woocommerce' => '/pinterest-for-woocommerce/i',
                    'facebook-for-woocommerce'  => '/facebook-for-woocommerce/i',
                ];
                $pattern = $families[$plugin] ?? '/^' . preg_quote($plugin, '/') . '/i';
                $allActive = (array)get_option('active_plugins', []);
                $matched = [];
                foreach ($allActive as $p) {
                    if (preg_match($pattern, $p)) $matched[] = $p;
                }
                if (!empty($matched)) {
                    foreach ($matched as $p) {
                        deactivate_plugins($p, true);
                        $changes[] = 'plugin deactivated: ' . $p;
                    }
                } else {
                    // Diagnostic: list active plugins so caller can identify
                    // the right slug for next attempt.
                    $changes[] = 'no plugins matched pattern ' . $pattern . ' (family: ' . $plugin . ')';
                    $changes[] = 'active plugins: ' . implode(', ', array_slice($allActive, 0, 30));
                }
            }

            return ['ok' => true, 'changes' => $changes];
        },
    ]);

    /**
     * GET /clawflow/v1/builder-info?post_id=X — report how a post/page is built
     * so the platform never appends SEO text into post_content of a page-builder
     * page (where the real content lives in widgets, not post_content).
     *
     * Returns: builder type, whether it's the site front page, and — crucially —
     * rendered_words / rendered_excerpt computed by running the_content filter
     * (so Elementor/Divi/etc. render their widgets). This makes "thin content"
     * judged on the REAL rendered text, not the leftover post_content.
     */
    register_rest_route('clawflow/v1', '/builder-info', [
        'methods'             => 'GET',
        'permission_callback' => function () { return current_user_can('manage_options'); },
        'callback'            => function (WP_REST_Request $req) {
            $post_id = (int)$req->get_param('post_id');
            if ((bool)$req->get_param('probe')) return ['ok' => true, 'supported' => true];
            $p = $post_id ? get_post($post_id) : null;
            if (!$p) return new WP_Error('not_found', 'post not found', ['status' => 404]);

            // Detect builder.
            $builder = 'classic';
            $elementor_active = (defined('ELEMENTOR_VERSION') || class_exists('\\Elementor\\Plugin'));
            if ($elementor_active && get_post_meta($post_id, '_elementor_edit_mode', true) === 'builder') {
                $builder = 'elementor';
            } elseif (get_post_meta($post_id, '_et_pb_use_builder', true) === 'on') {
                $builder = 'divi';
            } elseif (get_post_meta($post_id, '_fl_builder_enabled', true)) {
                $builder = 'beaver';
            } elseif (strpos((string)$p->post_content, '[vc_row') !== false) {
                $builder = 'wpbakery';
            } elseif (strpos((string)$p->post_content, '<!-- wp:') !== false) {
                $builder = 'gutenberg';
            }

            // Render the real content via the_content filter (Elementor/Divi hook
            // in here to output their widget markup), then strip to plain words.
            // Builders read the GLOBAL $post / get_the_ID(), so set it up first.
            global $post;
            $prev_post = $post;
            $post = $p;
            setup_postdata($post);
            $rendered = (string)apply_filters('the_content', $p->post_content);
            wp_reset_postdata();
            $post = $prev_post;
            $text = trim(preg_replace('/\s+/u', ' ', wp_strip_all_tags($rendered)));
            $words = $text === '' ? 0 : count(preg_split('/\s+/u', $text));

            $front_id = (int)get_option('page_on_front');
            $is_front = ($front_id && $front_id === $post_id);

            return [
                'ok'              => true,
                'post_id'         => $post_id,
                'builder'         => $builder,
                'is_builder'      => in_array($builder, ['elementor', 'divi', 'beaver', 'wpbakery'], true),
                'is_front_page'   => (bool)$is_front,
                'rendered_words'  => $words,
                'rendered_excerpt'=> mb_substr($text, 0, 6000),
                'can_append'      => ($builder === 'elementor' && $elementor_active),
            ];
        },
    ]);

    /**
     * POST /clawflow/v1/elementor-append — natively append SEO content to an
     * Elementor page: add one new section → column → text-editor widget holding
     * our HTML, then save THROUGH Elementor's Document API (which regenerates the
     * page CSS + _elementor_data correctly). Never touches post_content.
     *
     * Body: { post_id, html }  →  { ok, added, new_rendered_words }
     */
    register_rest_route('clawflow/v1', '/elementor-append', [
        'methods'             => 'POST',
        'permission_callback' => function () { return current_user_can('manage_options'); },
        'callback'            => function (WP_REST_Request $req) {
            if ((bool)$req->get_param('probe')) {
                return ['ok' => true, 'supported' => class_exists('\\Elementor\\Plugin')];
            }
            $post_id = (int)$req->get_param('post_id');
            $html    = (string)$req->get_param('html');
            if (!$post_id || trim($html) === '') {
                return new WP_Error('bad_args', 'post_id + html required', ['status' => 400]);
            }
            if (!class_exists('\\Elementor\\Plugin')) {
                return new WP_Error('no_elementor', 'Elementor is not active on this site', ['status' => 422]);
            }
            if (get_post_meta($post_id, '_elementor_edit_mode', true) !== 'builder') {
                return new WP_Error('not_elementor_page', 'post is not an Elementor page', ['status' => 422]);
            }

            $gen = function () {
                if (class_exists('\\Elementor\\Utils') && method_exists('\\Elementor\\Utils', 'generate_random_string')) {
                    return \Elementor\Utils::generate_random_string();
                }
                return substr(md5(uniqid('', true)), 0, 7);
            };

            // Sanitize: allow the rich-but-safe subset our generator emits.
            $allowed = [
                'p' => [], 'br' => [], 'strong' => [], 'em' => [], 'b' => [], 'i' => [],
                'h2' => [], 'h3' => [], 'h4' => [], 'ul' => [], 'ol' => [], 'li' => [],
                'a' => ['href' => [], 'title' => [], 'rel' => [], 'target' => []],
                'blockquote' => [], 'table' => [], 'thead' => [], 'tbody' => [],
                'tr' => [], 'th' => [], 'td' => [],
            ];
            $clean = wp_kses($html, $allowed);

            $widget = [
                'id'         => $gen(),
                'elType'     => 'widget',
                'widgetType' => 'text-editor',
                'settings'   => ['editor' => $clean],
                'elements'   => [],
            ];
            $column = [
                'id'       => $gen(),
                'elType'   => 'column',
                'settings' => ['_column_size' => 100, '_inline_size' => null],
                'elements' => [$widget],
            ];
            $section = [
                'id'       => $gen(),
                'elType'   => 'section',
                'settings' => [],
                'elements' => [$column],
            ];

            try {
                $document = \Elementor\Plugin::$instance->documents->get($post_id);
                if (!$document) return new WP_Error('no_document', 'could not load Elementor document', ['status' => 500]);
                $data = $document->get_elements_data();
                if (!is_array($data)) $data = [];
                $data[] = $section;
                $document->save(['elements' => $data]);
                if (isset(\Elementor\Plugin::$instance->files_manager)) {
                    \Elementor\Plugin::$instance->files_manager->clear_cache();
                }
            } catch (\Throwable $e) {
                return new WP_Error('save_failed', $e->getMessage(), ['status' => 500]);
            }

            // Re-render to confirm the new word count.
            $post = get_post($post_id);
            $rendered = (string)apply_filters('the_content', $post ? $post->post_content : '');
            $text = trim(preg_replace('/\s+/u', ' ', wp_strip_all_tags($rendered)));
            $words = $text === '' ? 0 : count(preg_split('/\s+/u', $text));

            return ['ok' => true, 'added' => 1, 'new_rendered_words' => $words];
        },
    ]);
});
