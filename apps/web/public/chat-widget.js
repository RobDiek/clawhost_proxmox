// ClawFlow Chat Widget
(function() {
  const WS_URL = 'wss://api.clawflow.flowmatic.co.il/ws/chat';
  let ws = null;
  let sessionId = localStorage.getItem('cf_chat_session') || '';
  let isOpen = false;
  let connected = false;

  // ── Create DOM ──
  function createWidget() {
    const style = document.createElement('style');
    style.textContent = `
      #cf-chat-fab { position:fixed;bottom:24px;right:24px;z-index:9999;border-radius:12px;background:#2563EB;color:#fff;border:none;cursor:pointer;box-shadow:0 4px 16px rgba(37,99,235,0.4);display:flex;align-items:center;gap:8px;padding:10px 18px;transition:transform .2s,box-shadow .2s;font-family:'Heebo',system-ui,sans-serif;direction:rtl }
      #cf-chat-fab:hover { transform:scale(1.03);box-shadow:0 6px 24px rgba(37,99,235,0.5) }
      #cf-chat-fab svg { width:20px;height:20px;flex-shrink:0 }
      #cf-chat-fab-text { display:flex;flex-direction:column;line-height:1.2 }
      #cf-chat-fab-title { font-size:0.85rem;font-weight:600 }
      #cf-chat-fab-sub { font-size:0.65rem;opacity:0.8 }
      #cf-chat-window { position:fixed;bottom:90px;right:24px;z-index:9999;width:360px;height:480px;background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,0.15);display:none;flex-direction:column;overflow:hidden;border:1px solid #E5E7EB;font-family:'Heebo',system-ui,sans-serif }
      #cf-chat-window.open { display:flex }
      #cf-chat-header { background:#2563EB;color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0 }
      #cf-chat-header h4 { margin:0;font-size:0.95rem;font-weight:600 }
      #cf-chat-header button { background:none;border:none;color:rgba(255,255,255,0.7);cursor:pointer;font-size:18px;padding:0;line-height:1 }
      #cf-chat-header button:hover { color:#fff }
      #cf-chat-status { font-size:0.7rem;opacity:0.7 }
      #cf-chat-messages { flex:1;overflow-y:auto;padding:12px 14px;direction:rtl;display:flex;flex-direction:column;gap:8px }
      .cf-msg { max-width:80%;padding:8px 12px;border-radius:12px;font-size:0.85rem;line-height:1.5;word-break:break-word }
      .cf-msg-visitor { background:#2563EB;color:#fff;align-self:flex-start;border-bottom-left-radius:4px }
      .cf-msg-admin { background:#F3F4F6;color:#111827;align-self:flex-end;border-bottom-right-radius:4px }
      .cf-msg-system { background:none;color:#9CA3AF;font-size:0.75rem;text-align:center;align-self:center }
      #cf-chat-input-area { display:flex;gap:8px;padding:10px 12px;border-top:1px solid #E5E7EB;flex-shrink:0 }
      #cf-chat-input { flex:1;border:1px solid #E5E7EB;border-radius:8px;padding:8px 12px;font-size:0.85rem;font-family:inherit;direction:rtl;outline:none;resize:none }
      #cf-chat-input:focus { border-color:#2563EB }
      #cf-chat-send { background:#2563EB;color:#fff;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;font-family:inherit;font-size:0.85rem;font-weight:600;flex-shrink:0 }
      #cf-chat-send:hover { background:#1D4ED8 }
      #cf-chat-send:disabled { opacity:0.5;cursor:not-allowed }
      #cf-chat-name-prompt { padding:20px 16px;text-align:center }
      #cf-chat-name-prompt h4 { font-size:1rem;margin:0 0 4px;color:#111827 }
      #cf-chat-name-prompt p { font-size:0.82rem;color:#6B7280;margin:0 0 14px }
      #cf-chat-name-input { width:100%;padding:10px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:0.9rem;font-family:inherit;direction:rtl;margin-bottom:10px }
      #cf-chat-name-btn { width:100%;padding:10px;background:#2563EB;color:#fff;border:none;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;font-family:inherit }
      .cf-unread { position:absolute;top:-4px;right:-4px;width:18px;height:18px;background:#EF4444;color:#fff;border-radius:50%;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:700 }
      @media(max-width:420px) { #cf-chat-window { right:0;left:0;bottom:0;width:100%;height:100%;border-radius:0 } #cf-chat-fab { bottom:16px;right:16px;padding:8px 14px } #cf-chat-fab-title { font-size:0.78rem } }
    `;
    document.head.appendChild(style);

    // FAB button
    const fab = document.createElement('button');
    fab.id = 'cf-chat-fab';
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><div id="cf-chat-fab-text"><span id="cf-chat-fab-title">\u05D3\u05D1\u05E8\u05D5 \u05E2\u05DD \u05E0\u05E6\u05D9\u05D2 \u05D0\u05E0\u05D5\u05E9\u05D9</span><span id="cf-chat-fab-sub">\u05D0\u05E0\u05D7\u05E0\u05D5 \u05D0\u05D5\u05E0\u05DC\u05D9\u05D9\u05DF \u2022</span></div>';
    fab.onclick = toggleChat;
    document.body.appendChild(fab);

    // Chat window
    const win = document.createElement('div');
    win.id = 'cf-chat-window';
    win.innerHTML = `
      <div id="cf-chat-header">
        <div>
          <h4>ClawFlow</h4>
          <div id="cf-chat-status">מחוברים</div>
        </div>
        <button onclick="document.getElementById('cf-chat-window').classList.remove('open')">✕</button>
      </div>
      <div id="cf-chat-body">
        <div id="cf-chat-name-prompt">
          <h4>👋 שלום!</h4>
          <p>איך קוראים לכם?</p>
          <input id="cf-chat-name-input" type="text" placeholder="השם שלכם" />
          <button id="cf-chat-name-btn" onclick="cfChatStartSession()">התחילו צ׳אט</button>
        </div>
      </div>
      <div id="cf-chat-messages" style="display:none"></div>
      <div id="cf-chat-input-area" style="display:none">
        <input id="cf-chat-input" type="text" placeholder="כתבו הודעה..." onkeydown="if(event.key==='Enter')cfChatSend()" />
        <button id="cf-chat-send" onclick="cfChatSend()">שלחו</button>
      </div>
    `;
    document.body.appendChild(win);
  }

  // ── Toggle chat window ──
  function toggleChat() {
    const win = document.getElementById('cf-chat-window');
    isOpen = !isOpen;
    if (isOpen) {
      win.classList.add('open');
      // If we have session, reconnect
      if (sessionId && !connected) connectWS();
      const input = document.getElementById('cf-chat-input');
      if (input && input.offsetParent) input.focus();
    } else {
      win.classList.remove('open');
    }
  }

  // ── Start session (after name) ──
  window.cfChatStartSession = function() {
    const nameInput = document.getElementById('cf-chat-name-input');
    const name = (nameInput.value || '').trim() || 'אורח';
    localStorage.setItem('cf_chat_name', name);

    document.getElementById('cf-chat-body').style.display = 'none';
    document.getElementById('cf-chat-messages').style.display = 'flex';
    document.getElementById('cf-chat-input-area').style.display = 'flex';

    connectWS(name);
    addSystemMessage('מחוברים! כתבו הודעה ונחזור אליכם בהקדם.');
    document.getElementById('cf-chat-input').focus();
  };

  // ── Connect WebSocket ──
  function connectWS(name) {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    ws = new WebSocket(WS_URL);

    ws.onopen = function() {
      connected = true;
      document.getElementById('cf-chat-status').textContent = 'מחוברים';
      ws.send(JSON.stringify({ type: 'init', sessionId: sessionId || undefined, name: name || localStorage.getItem('cf_chat_name') || 'אורח' }));
    };

    ws.onmessage = function(e) {
      const data = JSON.parse(e.data);

      if (data.type === 'init') {
        sessionId = data.sessionId;
        localStorage.setItem('cf_chat_session', sessionId);
        // Render history
        if (data.history && data.history.length) {
          data.history.forEach(function(msg) { addMessage(msg.sender, msg.message); });
        }
      }

      if (data.type === 'message') {
        if (data.sender === 'admin') {
          addMessage('admin', data.message);
          if (!isOpen) showUnread();
        }
      }
    };

    ws.onclose = function() {
      connected = false;
      document.getElementById('cf-chat-status').textContent = 'מתחבר מחדש...';
      setTimeout(function() { if (isOpen) connectWS(); }, 3000);
    };

    ws.onerror = function() { ws.close(); };
  }

  // ── Send message ──
  window.cfChatSend = function() {
    const input = document.getElementById('cf-chat-input');
    const text = (input.value || '').trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({ type: 'message', message: text }));
    addMessage('visitor', text);
    input.value = '';
    input.focus();
  };

  // ── Add message to UI ──
  function addMessage(sender, text) {
    const container = document.getElementById('cf-chat-messages');
    const div = document.createElement('div');
    div.className = 'cf-msg ' + (sender === 'visitor' ? 'cf-msg-visitor' : sender === 'admin' ? 'cf-msg-admin' : 'cf-msg-system');
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function addSystemMessage(text) {
    addMessage('system', text);
  }

  function showUnread() {
    let badge = document.getElementById('cf-chat-unread');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'cf-chat-unread';
      badge.className = 'cf-unread';
      document.getElementById('cf-chat-fab').style.position = 'relative';
      document.getElementById('cf-chat-fab').appendChild(badge);
    }
    badge.textContent = '!';
    badge.style.display = 'flex';
  }

  // ── Auto-restore session ──
  if (sessionId) {
    // Has previous session, show messages directly (skip name prompt)
    document.addEventListener('DOMContentLoaded', function() {
      const body = document.getElementById('cf-chat-body');
      if (body) body.style.display = 'none';
      const msgs = document.getElementById('cf-chat-messages');
      if (msgs) msgs.style.display = 'flex';
      const inputArea = document.getElementById('cf-chat-input-area');
      if (inputArea) inputArea.style.display = 'flex';
    });
  }

  // ── Init ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();