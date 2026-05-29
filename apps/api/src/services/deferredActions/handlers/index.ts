/**
 * Handler registration entrypoint — K15.
 *
 * Importing this module side-effects: each handler self-registers into
 * the registry at module load. The scheduler imports './handlers/index'
 * to ensure all handlers are registered before scanning.
 */

import './biddingStrategy'
// Future handlers register here as they're added:
// import './pluginTrackingDisable'
// import './campaignPause'
// import './ga4SettingChange'