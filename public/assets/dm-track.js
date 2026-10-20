/*
 * Proposal analytics (PostHog): visits, heatmaps, session replay, section reading time.
 *
 * Only visitors who arrive through a personal link are tracked, so drafts and
 * internal reviews of the plain URL stay out of the data.
 * Personal links:  page/?r=mark-hari  -> visits are attributed to "Mark Hari".
 *   The address bar is rewritten to ?via=mark-hari, so a link copied from the
 *   browser and forwarded shows up as "forwarded from Mark Hari", not as Mark.
 *   Once a browser has arrived through a personal link, later visits from it
 *   are tracked even without the parameter (bookmarks, history).
 * Exclude yourself: open any page once with ?notrack=1 (per browser/device).
 *   ?notrack=0 turns tracking back on. Local previews are never tracked.
 * Pages can log their own events with window.dmTrack('event_name', { ... }).
 * Tracked visits are also reported to /api/proposal-event (functions/proposals.js),
 * which emails the team when a visit starts and feeds the activity view at /admin/
 * and Proposal Studio. Reports carry PostHog's session id so a visit links to its recording.
 * Keep this file identical in DM-Customer-Program and proposal-studio.
 */
(function () {
  var KEY = 'phc_pXxJdUE8BHfYXhm4XETiMBw3E5DZRmYidgwpZEt6CB8D';
  var HOST = 'https://us.i.posthog.com';

  window.dmTrack = function () {};

  var params = new URLSearchParams(location.search);
  if (/^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname) || location.protocol === 'file:') return;
  var personal = params.has('r') || params.has('via');
  try {
    if (params.get('notrack') === '1') localStorage.setItem('dm_notrack', '1');
    if (params.get('notrack') === '0') localStorage.removeItem('dm_notrack');
    if (localStorage.getItem('dm_notrack') === '1') return;
    if (personal) localStorage.setItem('dm_tracked', '1');
    else if (localStorage.getItem('dm_tracked') !== '1') return;
  } catch (e) {
    if (!personal) return;
  }

  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  function prettyName(slug) {
    return slug.split(/[-_.]+/).filter(Boolean).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }

  var recipient = (params.get('r') || '').trim().toLowerCase();
  var via = (params.get('via') || '').trim().toLowerCase();
  var proposal = location.pathname.split('/').filter(Boolean)[0] || 'home';

  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: 'always',
    capture_pageview: true,
    capture_pageleave: true,
    enable_heatmaps: true,
    session_recording: { maskAllInputs: true },
    loaded: function (ph) {
      ph.register({ proposal: proposal });
      if (recipient) {
        ph.identify(recipient, { name: prettyName(recipient) });
        params.delete('r');
        params.set('via', recipient);
        history.replaceState(null, '', location.pathname + '?' + params.toString() + location.hash);
      } else if (via && ph.get_distinct_id() !== via) {
        ph.register({ forwarded_from: prettyName(via) });
        ph.capture('forwarded_link_opened', { forwarded_from: prettyName(via) });
      }
      // The visit's "open" report went out before PostHog loaded, so this one carries the session id.
      setTimeout(function () { sendUpdate(false); }, 5000);
    }
  });

  window.dmTrack = function (name, props) { posthog.capture(name, props || {}); };

  function beacon(name, props) { posthog.capture(name, props, { transport: 'sendBeacon' }); }

  // Team alerts and the admin activity view (/admin/) are fed by /api/proposal-event.
  var who = { person: recipient || null, via: null };
  try {
    if (who.person) localStorage.setItem('dm_person', who.person);
    else if (via && localStorage.getItem('dm_person') === via) who.person = via;
    else if (via) { who.via = via; if (!localStorage.getItem('dm_person')) localStorage.setItem('dm_via', via); }
    else { who.person = localStorage.getItem('dm_person'); if (!who.person) who.via = localStorage.getItem('dm_via'); }
  } catch (e) {}
  var totals = {}, printed = false, emailClicked = false, vid = null, liveSnapshot = function () { return totals; };
  function report(body, useBeacon) {
    var data = JSON.stringify(body);
    try {
      if (useBeacon && navigator.sendBeacon) navigator.sendBeacon('/api/proposal-event', new Blob([data], { type: 'application/json' }));
      else fetch('/api/proposal-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: data, keepalive: true });
    } catch (e) {}
  }
  // A visit can span reloads in one tab; earlier page loads' reading time is kept in sessionStorage.
  var base = {};
  function visitTotals() {
    var out = {}, live = liveSnapshot(), k;
    for (k in base) out[k] = base[k];
    for (k in live) out[k] = (out[k] || 0) + live[k];
    return out;
  }
  // PostHog's session id, which names the visit's recording. Undefined until PostHog has loaded.
  function sessionId() {
    try { var s = posthog.get_session_id && posthog.get_session_id(); return typeof s === 'string' ? s : null; } catch (e) { return null; }
  }
  function sendUpdate(useBeacon) {
    if (!vid) return;
    var sections = visitTotals(), secs = 0;
    for (var k in sections) secs += sections[k];
    try { sessionStorage.setItem('dm_tot_' + vid, JSON.stringify(sections)); } catch (e) {}
    report({ type: 'update', vid: vid, proposal: proposal, person: who.person, via: who.via, session: sessionId(), seconds: secs, sections: sections, printed: printed, emailClicked: emailClicked }, useBeacon);
  }
  if (who.person || who.via) {
    var vidKey = 'dm_vid_' + proposal;
    try { vid = sessionStorage.getItem(vidKey); base = vid ? JSON.parse(sessionStorage.getItem('dm_tot_' + vid) || '{}') : {}; } catch (e) {}
    if (!vid) {
      vid = (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).replace(/[^a-z0-9]/g, '');
      try { sessionStorage.setItem(vidKey, vid); } catch (e) {}
      report({ type: 'open', vid: vid, proposal: proposal, person: who.person, via: who.via, title: document.title });
    }
    setInterval(function () { if (!document.hidden) sendUpdate(false); }, 30000);
    document.addEventListener('visibilitychange', function () { if (document.hidden) sendUpdate(true); });
    window.addEventListener('pagehide', function () { sendUpdate(true); });
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="mailto:"], a[href^="tel:"]');
    if (a) {
      beacon(a.href.indexOf('tel:') === 0 ? 'phone_clicked' : 'email_clicked', { href: a.getAttribute('href') });
      emailClicked = emailClicked || a.href.indexOf('mailto:') === 0;
      sendUpdate(true);
    }
  }, true);
  window.addEventListener('beforeprint', function () { dmTrack('proposal_printed'); printed = true; sendUpdate(true); });
  window.addEventListener('blur', function () {
    setTimeout(function () {
      var f = document.activeElement;
      if (f && f.tagName === 'IFRAME') dmTrack('embed_played', { src: (f.src || '').split('?')[0] });
    }, 0);
  });

  function startSectionTiming() {
    var sections = document.querySelectorAll('section[data-title], section[id]');
    if (!sections.length || !window.IntersectionObserver) return;
    var current = null, since = 0;
    function label(s) { return s.dataset.title || s.id; }
    function flush() {
      if (current && since) {
        var secs = Math.min(Math.round((Date.now() - since) / 1000), 900);
        if (secs >= 2) {
          beacon('section_read', { section: label(current), section_id: current.id, seconds: secs });
          totals[label(current)] = (totals[label(current)] || 0) + secs;
        }
      }
      since = current && !document.hidden ? Date.now() : 0;
    }
    liveSnapshot = function () {
      var out = {};
      for (var k in totals) out[k] = totals[k];
      if (current && since) {
        var secs = Math.min(Math.round((Date.now() - since) / 1000), 900);
        if (secs >= 2) out[label(current)] = (out[label(current)] || 0) + secs;
      }
      return out;
    };
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && en.target !== current) { flush(); current = en.target; since = document.hidden ? 0 : Date.now(); }
      });
    }, { rootMargin: '-45% 0px -54% 0px' });
    sections.forEach(function (s) { io.observe(s); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { flush(); since = 0; } else if (current) { since = Date.now(); }
    });
    window.addEventListener('pagehide', flush);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startSectionTiming);
  else startSectionTiming();
})();
