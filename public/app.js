import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const statusNote = document.getElementById("statusNote");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const situationsList = document.getElementById("situationsList");
const linksList = document.getElementById("linksList");
const stageTitle = document.getElementById("stageTitle");
const stageSubtitle = document.getElementById("stageSubtitle");
const sceneAmbience = document.getElementById("sceneAmbience");
const sceneAccent = document.getElementById("sceneAccent");
const promptEditor = document.getElementById("promptEditor");
const savePromptBtn = document.getElementById("savePromptBtn");
const resetPromptBtn = document.getElementById("resetPromptBtn");
const conversationLog = document.getElementById("conversationLog");
const textInput = document.getElementById("textInput");
const sendTextBtn = document.getElementById("sendTextBtn");
const authEmail = document.getElementById("authEmail");
const authSendLinkBtn = document.getElementById("authSendLinkBtn");
const authSignOutBtn = document.getElementById("authSignOutBtn");
const authStatus = document.getElementById("authStatus");

const state = {
  situations: [],
  activeSituation: null,
  originalPrompt: "",
  connection: null,
  dataChannel: null,
  sessionId: null,
  pendingEvents: [],
  assistantBuffer: "",
  userId: null,
  accessToken: null,
  supabase: null,
  usageTimer: null,
  remainingSeconds: null,
};

function setStatus(connected, note) {
  statusDot.style.background = connected ? "#2a9d8f" : "#d45b5b";
  statusText.textContent = connected ? "Connected" : "Disconnected";
  statusNote.textContent = note;
}

function addMessage(text, role = "assistant") {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  message.textContent = text;
  conversationLog.appendChild(message);
  conversationLog.scrollTop = conversationLog.scrollHeight;
}

function clearConversation() {
  conversationLog.innerHTML = "";
}

function formatRemaining(seconds) {
  if (seconds === null || seconds === undefined) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m${secs.toString().padStart(2, "0")}s restantes`;
}

function setAuthStatus(message) {
  authStatus.textContent = message || "";
}

function updateAuthUI(session) {
  if (session?.user) {
    state.userId = session.user.id;
    state.accessToken = session.access_token;
    authSendLinkBtn.classList.add("hidden");
    authSignOutBtn.classList.remove("hidden");
    authEmail.disabled = true;
    setAuthStatus(`Connecté: ${session.user.email || "utilisateur"}`);
    startBtn.disabled = false;
  } else {
    state.userId = null;
    state.accessToken = null;
    authSendLinkBtn.classList.remove("hidden");
    authSignOutBtn.classList.add("hidden");
    authEmail.disabled = false;
    setAuthStatus("Connectez-vous pour activer la limite quotidienne.");
    startBtn.disabled = true;
  }
}

function renderSituations() {
  situationsList.innerHTML = "";
  state.situations.forEach((situation) => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = situation.id;
    if (state.activeSituation?.id === situation.id) {
      card.classList.add("active");
    }

    card.innerHTML = `
      <h3>${situation.title}</h3>
      <p>${situation.theme}</p>
    `;
    card.addEventListener("click", () => selectSituation(situation.id));
    situationsList.appendChild(card);
  });
}

function renderLinks(links = []) {
  linksList.innerHTML = "";
  links.forEach((link) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.type = "button";
    chip.textContent = link;
    chip.addEventListener("click", () => {
      if (!state.dataChannel) {
        addMessage("Start the conversation before sending a prompt.", "system");
        return;
      }
      sendText(link, true);
    });
    linksList.appendChild(chip);
  });
}

function selectSituation(id) {
  const situation = state.situations.find((item) => item.id === id);
  if (!situation) return;

  state.activeSituation = situation;
  state.originalPrompt = situation.prompt;
  stageTitle.textContent = situation.title;
  stageSubtitle.textContent = situation.theme;
  sceneAmbience.textContent = situation.ambience || "-";
  sceneAccent.textContent = situation.accent || "-";
  promptEditor.value = situation.prompt;
  renderSituations();
  renderLinks(situation.links);
  clearConversation();
  addMessage("Select start to enter the scene.", "system");
}

async function loadSituations() {
  try {
    const response = await fetch("/api/situations");
    if (!response.ok) {
      throw new Error("Failed to load situations.");
    }
    const data = await response.json();
    state.situations = data.situations || [];
    renderSituations();
    if (state.situations.length) {
      selectSituation(state.situations[0].id);
    }
  } catch (error) {
    addMessage("Unable to load situations. Refresh the page.", "system");
    setStatus(false, "API unreachable. Refresh after the server starts.");
    console.error(error);
  }
}

async function savePrompt() {
  if (!state.activeSituation) return;
  const updated = {
    ...state.activeSituation,
    prompt: promptEditor.value.trim(),
  };

  const response = await fetch(`/api/situations/${state.activeSituation.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated),
  });

  if (!response.ok) {
    addMessage("Failed to save the prompt.", "system");
    return;
  }

  const result = await response.json();
  const saved = result.situation;
  state.situations = state.situations.map((item) =>
    item.id === saved.id ? saved : item
  );
  state.activeSituation = saved;
  state.originalPrompt = saved.prompt;
  renderSituations();
  addMessage("Prompt updated for this situation.", "system");
}

function resetPrompt() {
  if (!state.activeSituation) return;
  promptEditor.value = state.originalPrompt;
}

async function startSession() {
  if (!state.activeSituation) {
    addMessage("Choose a situation before starting.", "system");
    return;
  }
  if (!state.userId || !state.accessToken) {
    addMessage("Please sign in before starting.", "system");
    return;
  }

  startBtn.disabled = true;
  stopBtn.disabled = false;
  setStatus(false, "Preparing microphone...");

  try {
    setStatus(false, "Requesting session...");
    const response = await fetch("/api/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.accessToken}`,
      },
      body: JSON.stringify({
        situationId: state.activeSituation.id,
        promptOverride:
          promptEditor.value.trim() === state.activeSituation.prompt
            ? ""
            : promptEditor.value.trim(),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create session.");
    }

    const data = await response.json();
    state.sessionId = data.sessionId;
    state.remainingSeconds = data.remainingSeconds ?? null;
    if (state.remainingSeconds !== null) {
      setStatus(false, formatRemaining(state.remainingSeconds));
    }

    const pc = new RTCPeerConnection();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.srcObject = event.streams[0];
      document.body.appendChild(audio);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setStatus(true, "Conversation active. Speak when you are ready.");
      } else if (pc.connectionState === "failed") {
        setStatus(false, "Connection failed. Try again.");
      }
    };

    const dc = pc.createDataChannel("oai-events");
    dc.onopen = () => {
      setStatus(true, "Conversation active. Speak when you are ready.");
    };
    dc.onclose = () => {
      setStatus(false, "Connection closed.");
    };
    dc.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        state.pendingEvents.push(message);
        if (message.type === "error") {
          addMessage(`Realtime error: ${message.message || "unknown"}`, "system");
        }
        handleRealtimeEvent(message);
      } catch (error) {
        state.pendingEvents.push({ type: "raw", data: event.data });
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpResponse = await fetch(
      "https://api.openai.com/v1/realtime?model=" +
        encodeURIComponent(data.model),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.clientSecret}`,
          "Content-Type": "application/sdp",
          "OpenAI-Beta": "realtime=v1",
        },
        body: offer.sdp,
      }
    );

    const answer = await sdpResponse.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answer });

    state.connection = pc;
    state.dataChannel = dc;
    startUsagePing();

    addMessage("Connection ready. You can speak.", "system");
  } catch (error) {
    addMessage(`Error: ${error.message}`, "system");
    setStatus(false, "Failed to connect. Check console for details.");
    stopSession();
  }
}

function handleRealtimeEvent(event) {
  const type = event.type || "";

  if (type === "response.text.delta") {
    state.assistantBuffer += event.delta || "";
    updateAssistantBuffer();
    return;
  }

  if (type === "response.text.done") {
    if (state.assistantBuffer.trim()) {
      const pending = conversationLog.querySelector(
        ".message.assistant.pending"
      );
      if (pending) {
        pending.textContent = state.assistantBuffer;
        pending.classList.remove("pending");
      } else {
        addMessage(state.assistantBuffer, "assistant");
      }
      flushLogs();
    }
    state.assistantBuffer = "";
    return;
  }

  if (type === "input_audio_transcription.done") {
    if (event.transcript) {
      addMessage(event.transcript, "user");
    }
    return;
  }
}

function updateAssistantBuffer() {
  const last = conversationLog.querySelector(".message.assistant.pending");
  if (!last) {
    const message = document.createElement("div");
    message.className = "message assistant pending";
    message.textContent = state.assistantBuffer;
    conversationLog.appendChild(message);
  } else {
    last.textContent = state.assistantBuffer;
  }
  conversationLog.scrollTop = conversationLog.scrollHeight;
}

async function sendUsagePing(seconds) {
  if (!state.userId || !state.accessToken) return;
  try {
    const response = await fetch("/api/usage/ping", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.accessToken}`,
      },
      body: JSON.stringify({ seconds }),
    });

    if (!response.ok) return;
    const data = await response.json();
    state.remainingSeconds = data.remainingSeconds ?? null;
    if (state.remainingSeconds !== null) {
      setStatus(true, formatRemaining(state.remainingSeconds));
      if (state.remainingSeconds <= 0) {
        addMessage("Limite quotidienne atteinte.", "system");
        stopSession();
      }
    }
  } catch (error) {
    console.error(error);
  }
}

function startUsagePing() {
  clearUsagePing();
  state.usageTimer = setInterval(() => {
    sendUsagePing(10);
  }, 10000);
}

function clearUsagePing() {
  if (state.usageTimer) {
    clearInterval(state.usageTimer);
    state.usageTimer = null;
  }
}

async function flushLogs() {
  if (!state.sessionId || state.pendingEvents.length === 0) return;
  const payload = {
    sessionId: state.sessionId,
    situationId: state.activeSituation?.id,
    events: state.pendingEvents.splice(0, state.pendingEvents.length),
  };

  await fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function sendText(text, fromLink = false) {
  if (!state.dataChannel) return;
  if (!text.trim()) return;

  if (!fromLink) {
    addMessage(text.trim(), "user");
  }

  state.dataChannel.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: text.trim() }],
      },
    })
  );
  state.dataChannel.send(JSON.stringify({ type: "response.create" }));

  textInput.value = "";
}

function stopSession() {
  if (state.connection) {
    state.connection.getSenders().forEach((sender) => sender.track?.stop());
    state.connection.close();
  }
  state.connection = null;
  state.dataChannel = null;
  clearUsagePing();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus(false, "Sessao encerrada.");
  flushLogs();
}

async function initSupabase() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      throw new Error("Missing Supabase public config.");
    }
    const { supabaseUrl, supabaseAnonKey } = await response.json();
    state.supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (code) {
      const { error } = await state.supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setAuthStatus("Lien invalide ou expiré.");
      }
      url.searchParams.delete("code");
      window.history.replaceState({}, "", url.toString());
    }

    const { data } = await state.supabase.auth.getSession();
    updateAuthUI(data.session);
    state.supabase.auth.onAuthStateChange((_event, session) => {
      updateAuthUI(session);
    });
  } catch (error) {
    setAuthStatus("Supabase non configuré.");
    startBtn.disabled = true;
    console.error(error);
  }
}

async function sendMagicLink() {
  if (!state.supabase) return;
  const email = authEmail.value.trim();
  if (!email) {
    setAuthStatus("Ajoute un email valide.");
    return;
  }
  setAuthStatus("Envoi du lien magique...");
  const { error } = await state.supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) {
    setAuthStatus("Erreur: impossible d'envoyer le lien.");
    return;
  }
  setAuthStatus("Lien envoyé. Vérifie ta boîte mail.");
}

async function signOut() {
  if (!state.supabase) return;
  await state.supabase.auth.signOut();
  updateAuthUI(null);
}

startBtn.addEventListener("click", startSession);
stopBtn.addEventListener("click", stopSession);

savePromptBtn.addEventListener("click", savePrompt);
resetPromptBtn.addEventListener("click", resetPrompt);

sendTextBtn.addEventListener("click", () => sendText(textInput.value));
textInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendText(textInput.value);
  }
});

loadSituations();
startBtn.disabled = true;
initSupabase();
setStatus(false, "Choose a situation and click start.");

authSendLinkBtn.addEventListener("click", sendMagicLink);
authSignOutBtn.addEventListener("click", signOut);
