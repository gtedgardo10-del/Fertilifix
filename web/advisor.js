(() => {
  "use strict";
  const byId = (id) => document.getElementById(id);
  const panel = byId("chatbot");
  const toggle = byId("chat-toggle");
  const setup = byId("chat-setup");
  const cropInput = byId("chat-crop");
  const locationInput = byId("chat-location");
  const conversationView = byId("chat-conversation");
  const messages = byId("chat-messages");
  const options = byId("chat-options");
  const form = byId("chat-form");
  const input = byId("chat-input");
  const retryButton = byId("chat-retry");
  const savedPlantSelect = byId("saved-plant-select");
  const savedPlantSaveButton = byId("saved-plant-save");
  const savedPlantRenameButton = byId("saved-plant-rename");
  const savedPlantNewButton = byId("saved-plant-new");
  const renamePlantForm = byId("saved-plant-rename-form");
  const renamePlantInput = byId("saved-plant-name");
  const savedPlantStatus = byId("saved-plant-status");
  const SAVED_PLANTS_KEY = "fertilifix_saved_plants_v1";
  let profile = null;
  let savedPlants = loadSavedPlants();
  let currentSavedPlantId = null;
  let conversation = [];
  let followUp = null;
  let busy = false;
  let retryRequest = null;
  let visionData = null;
  let latestAssessment = null;
  let mascotMoodTimer = null;

  function loadSavedPlants() {
    try {
      const stored = JSON.parse(localStorage.getItem(SAVED_PLANTS_KEY) || "[]");
      if (!Array.isArray(stored)) return [];
      return stored.filter((plant) => plant && typeof plant.id === "string"
        && typeof plant.crop === "string" && typeof plant.location === "string")
        .map((plant) => ({
          id: plant.id,
          nickname: typeof plant.nickname === "string" && plant.nickname.trim()
            ? plant.nickname.trim() : plant.crop,
          crop: plant.crop,
          location: plant.location,
          stage: typeof plant.stage === "string" ? plant.stage : "",
          substrate: typeof plant.substrate === "string" ? plant.substrate : "",
          placement: typeof plant.placement === "string" ? plant.placement : "",
          visual_assessment: plant.visual_assessment && typeof plant.visual_assessment === "object"
            ? plant.visual_assessment : null,
        }));
    } catch {
      return [];
    }
  }

  function showSavedPlantStatus(message) {
    savedPlantStatus.textContent = message;
    savedPlantStatus.hidden = false;
  }

  function renderSavedPlants() {
    savedPlantSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = savedPlants.length
      ? "Selecciona una planta guardada"
      : "Aún no hay plantas guardadas";
    savedPlantSelect.appendChild(placeholder);
    for (const plant of savedPlants) {
      const option = document.createElement("option");
      option.value = plant.id;
      option.textContent = plant.nickname === plant.crop
        ? plant.nickname : `${plant.nickname} · ${plant.crop}`;
      savedPlantSelect.appendChild(option);
    }
    savedPlantSelect.value = currentSavedPlantId || "";
    savedPlantRenameButton.disabled = busy || !savedPlants.some((plant) => plant.id === currentSavedPlantId);
    savedPlantSaveButton.disabled = busy || !profile?.crop || !profile?.location;
    savedPlantNewButton.disabled = busy;
    savedPlantSelect.disabled = busy;
  }

  function saveActivePlant(notify = false) {
    if (!profile?.crop || !profile?.location) return false;
    const existing = savedPlants.find((plant) => plant.id === currentSavedPlantId);
    const id = currentSavedPlantId || (window.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const sameCrop = existing?.crop.trim().toLocaleLowerCase()
      === profile.crop.trim().toLocaleLowerCase();
    const visual = visionData
      && visionData.crop.trim().toLocaleLowerCase() === profile.crop.trim().toLocaleLowerCase()
      ? visionData.visual_assessment
      : sameCrop ? existing?.visual_assessment || null : null;
    const next = {
      id,
      nickname: existing?.nickname || profile.crop,
      crop: profile.crop,
      location: profile.location,
      stage: profile.stage || "",
      substrate: profile.substrate || "",
      placement: profile.placement || "",
      visual_assessment: visual,
    };
    const comparableExisting = existing && {
      id: existing.id,
      nickname: existing.nickname,
      crop: existing.crop,
      location: existing.location,
      stage: existing.stage,
      substrate: existing.substrate,
      placement: existing.placement,
      visual_assessment: existing.visual_assessment,
    };
    const changed = !existing || JSON.stringify(comparableExisting) !== JSON.stringify(next);
    currentSavedPlantId = id;
    if (changed) {
      next.updated_at = new Date().toISOString();
      const nextPlants = [next, ...savedPlants.filter((plant) => plant.id !== id)];
      try {
        localStorage.setItem(SAVED_PLANTS_KEY, JSON.stringify(nextPlants));
      } catch {
        showSavedPlantStatus("No pude guardar la planta en este navegador.");
        renderSavedPlants();
        return false;
      }
      savedPlants = nextPlants;
    }
    renderSavedPlants();
    if (notify) {
      showSavedPlantStatus(changed ? "Planta guardada en este navegador." : "Esta planta ya está guardada.");
    }
    return changed;
  }

  function activateSavedPlant(plant) {
    if (busy || !plant) return;
    currentSavedPlantId = plant.id;
    profile = {
      crop: plant.crop,
      location: plant.location,
      stage: plant.stage,
      substrate: plant.substrate,
      placement: plant.placement,
    };
    visionData = plant.visual_assessment
      ? { crop: plant.crop, stage: plant.stage, visual_assessment: plant.visual_assessment }
      : null;
    conversation = [];
    followUp = null;
    retryRequest = null;
    messages.replaceChildren();
    options.replaceChildren();
    options.hidden = true;
    input.value = "";
    setup.hidden = true;
    conversationView.hidden = false;
    renamePlantForm.hidden = true;
    savedPlantStatus.hidden = true;
    renderSavedPlants();
    renderProfile();
    addMessage(`Planta seleccionada: ${plant.nickname}.`, "user");
    remember("user", `Planta seleccionada: ${plant.nickname}.`);
    send("start", "", profile);
  }

  renderSavedPlants();
  savedPlantSelect.addEventListener("change", () => {
    const plant = savedPlants.find((item) => item.id === savedPlantSelect.value);
    if (plant) activateSavedPlant(plant);
    else renderSavedPlants();
  });
  savedPlantSaveButton.addEventListener("click", () => saveActivePlant(true));
  savedPlantRenameButton.addEventListener("click", () => {
    const plant = savedPlants.find((item) => item.id === currentSavedPlantId);
    if (!plant) return;
    renamePlantInput.value = plant.nickname;
    renamePlantForm.hidden = false;
    renamePlantInput.focus();
  });
  renamePlantForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = renamePlantInput.value.trim();
    if (!name || !currentSavedPlantId) return;
    const nextPlants = savedPlants.map((plant) => plant.id === currentSavedPlantId
      ? { ...plant, nickname: name, updated_at: new Date().toISOString() }
      : plant);
    try {
      localStorage.setItem(SAVED_PLANTS_KEY, JSON.stringify(nextPlants));
    } catch {
      showSavedPlantStatus("No pude guardar el nombre en este navegador.");
      return;
    }
    savedPlants = nextPlants;
    renamePlantForm.hidden = true;
    renderSavedPlants();
    renderProfile();
    showSavedPlantStatus("Nombre actualizado.");
  });
  byId("saved-plant-rename-cancel").addEventListener("click", () => {
    renamePlantForm.hidden = true;
  });
  savedPlantNewButton.addEventListener("click", () => {
    if (busy) return;
    savedPlantStatus.hidden = true;
    byId("plant-manual-start").click();
  });

  function setMascotState(state) {
    window.clearTimeout(mascotMoodTimer);
    mascotMoodTimer = null;
    window.dispatchEvent(new CustomEvent("fertilifix:mascot-state", {
      detail: { state },
    }));
  }

  function animateReplyMood(state) {
    setMascotState("speaking");
    mascotMoodTimer = window.setTimeout(() => {
      mascotMoodTimer = null;
      if (!busy) {
        window.dispatchEvent(new CustomEvent("fertilifix:mascot-state", {
          detail: { state },
        }));
      }
    }, 900);
  }

  function visualFindingsPresent() {
    const findings = visionData?.visual_assessment?.visual?.findings;
    return Array.isArray(findings) && findings.length > 0;
  }

  function sensorMascotMood() {
    return visualFindingsPresent() ? "sad" : "idle";
  }

  function responseMascotMood(payload) {
    const risks = Array.isArray(payload.risks) ? payload.risks : [];
    if (risks.length || visualFindingsPresent()) return "sad";
    const assessment = payload.assessment || latestAssessment;
    const sensorMood = sensorMascotMood(assessment);
    if (sensorMood !== "idle") return sensorMood;

    const answer = String(payload.answer || "");
    const saysGood = /\b(?:todo (?:está|va) bien|es una buena señal|se ve saludable|va por buen camino|lecturas dentro de (?:las )?referencias)\b/i.test(answer);
    const saysConcern = /\b(?:no todo está bien|no es una buena señal|no puedo confirmar que .* esté bien)\b/i.test(answer);
    return saysGood && !saysConcern ? "happy" : "idle";
  }

  function recommendationIndicators(payload) {
    const review = payload?.watering_review;
    const indicators = [];
    if (review) {
      const historical = review.historical_reading === true;
      const humidity = Number.isFinite(review.humidity_percent)
        ? ` (${review.humidity_percent}%)` : "";
      const lower = Number.isFinite(review.reference_min_percent)
        ? review.reference_min_percent : 45;
      const upper = Number.isFinite(review.reference_max_percent)
        ? review.reference_max_percent : 70;
      if (review.low_humidity_triggered && review.activated) {
        indicators.push({
          key: "hum",
          level: historical ? "historical" : "action",
          label: historical ? "Riego histórico" : "Regar",
          text: historical
            ? `La lectura histórica de humedad${humidity} estaba por debajo de ${lower}%; para ese momento habría recomendado regar, no describe el estado actual.`
            : `La humedad actual${humidity} está por debajo del límite inferior de la referencia original (${lower}–${upper}%): la recomendación es regar la planta.`,
        });
      } else if (review.high_humidity_triggered) {
        const range = `${lower}–${upper}%`;
        indicators.push({
          key: "hum",
          level: historical ? "historical" : "warning",
          label: historical ? "Sobre rango (hist.)" : "Sobre referencia",
          text: historical
            ? `La lectura histórica de humedad${humidity} superaba la referencia original (${range}); no describe el estado actual ni confirma exceso de agua.`
            : `La humedad actual${humidity} supera el límite de la referencia original (${range}); esto no confirma encharcamiento ni un diagnóstico.`,
        });
      }
    }

    const fertilizer = payload?.fertilizer_review;
    if (!fertilizer) return indicators;
    const historical = fertilizer.source === "test";
    const fertility = Number.isFinite(fertilizer.fert_value)
      ? ` (${fertilizer.fert_value})` : "";
    if (fertilizer.fertility_high) {
      indicators.push({
        key: "fert",
        level: historical ? "historical" : "warning",
        label: historical ? "FERT alto (hist.)" : "FERT >70 · no añadir",
        text: historical
          ? `En esa lectura histórica FERT${fertility} superaba 70. Según el criterio definido para este sensor, no se habría agregado más fertilizante entonces; no describe el estado actual.`
          : `El sensor reporta FERT${fertility}, por encima de 70. Según el criterio definido para este equipo, no se recomienda agregar más fertilizante por ahora.`,
      });
    }

    const trend = fertilizer.trend;
    if (trend?.available && trend.npk_ec_rising) {
      const minutes = trend.window_minutes || 20;
      const names = { ec: "EC", n: "N", p: "P", k: "K", fert: "FERT" };
      const changes = trend.changes || {};
      const increaseSummary = Object.entries(changes)
        .filter(([, change]) => Number.isFinite(change) && change > 0)
        .map(([key, change]) => `${names[key] || key} +${change}`)
        .join(", ");
      const detail = trend.fertilizer_signal_rising
        ? `En ${minutes} minutos subieron conjuntamente EC, N, P, K y FERT (${increaseSummary}). Es compatible con un aumento de la señal de sales/nutrientes, pero no confirma por sí solo que se aplicó fertilizante.`
        : `En ${minutes} minutos subieron conjuntamente EC y N, P, K (${increaseSummary}). Es compatible con un cambio en la señal de sales/nutrientes, pero no confirma por sí solo que se aplicó fertilizante.`;
      for (const key of ["ec", "n", "p", "k", ...(!fertilizer.fertility_high ? ["fert"] : [])]) {
        indicators.push({
          key,
          level: historical ? "historical" : "info",
          label: historical ? "Subida hist." : "Subiendo",
          text: `${detail}${historical ? " No describe el estado actual." : ""}`,
        });
      }
    }
    return indicators;
  }

  function addMessage(text, role = "bot") {
    const item = document.createElement("div");
    item.className = `chat-message ${role}`;
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
    return item;
  }

  function remember(role, content) {
    conversation.push({ role, content });
    conversation = conversation.slice(-8);
  }

  function addSources(items) {
    if (!Array.isArray(items) || !items.length) return;
    const wrapper = document.createElement("div");
    wrapper.className = "chat-sources";
    const heading = document.createElement("strong");
    heading.textContent = "Referencias";
    wrapper.appendChild(heading);
    const list = document.createElement("ul");
    for (const item of items) {
      if (typeof item?.url !== "string" || !/^https?:\/\//i.test(item.url)) continue;
      const entry = document.createElement("li");
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.title || "Consultar fuente";
      entry.appendChild(link);
      list.appendChild(entry);
    }
    if (list.children.length) {
      wrapper.appendChild(list);
      messages.appendChild(wrapper);
    }
    messages.scrollTop = messages.scrollHeight;
  }

  function setBusy(value) {
    busy = value;
    renderSavedPlants();
    if (value) setMascotState("thinking");
    panel.setAttribute("aria-busy", String(value));
    form.querySelectorAll("input, button").forEach((el) => { el.disabled = value; });
    options.querySelectorAll("button").forEach((el) => { el.disabled = value; });
    byId("chat-edit").disabled = value;
    retryButton.disabled = value;
  }

  function renderProfile() {
    const savedPlant = savedPlants.find((plant) => plant.id === currentSavedPlantId);
    const displayName = savedPlant && savedPlant.nickname !== profile.crop
      ? `${savedPlant.nickname} (${profile.crop})` : profile.crop;
    byId("chat-profile-summary").textContent = [
      displayName, profile.location,
      profile.placement ? profile.placement_label : "",
      profile.stage ? profile.stage_label : "",
      profile.substrate ? profile.substrate_label : "",
    ].filter(Boolean).join(" · ");
  }

  function renderOptions() {
    options.replaceChildren();
    options.hidden = !followUp;
    byId("chat-step").textContent = followUp?.field === "placement"
      ? "Ubicación · Considerar si la lluvia puede llegar a la planta"
      : followUp?.field === "stage"
        ? "Etapa · Reconocer el estado de la planta"
        : followUp?.field === "substrate"
          ? "Sustrato · Contexto para interpretar la humedad"
          : "Perfil registrado · Puedes seguir preguntando";
    input.placeholder = followUp?.field === "stage"
      ? "Pregunta cómo reconocer la etapa o describe lo que ves"
      : followUp?.field === "placement"
        ? "Describe si está dentro, fuera o bajo techo"
        : followUp
          ? "Pregunta sobre el sustrato de tu planta"
          : "Pregunta sobre tu planta y sus mediciones";
    for (const option of followUp?.options || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chat-choice";
      button.textContent = option.label;
      button.dataset.value = option.value;
      button.addEventListener("click", () => {
        if (busy || !followUp) return;
        const updated = { ...profile, [followUp.field]: option.value };
        if (followUp.field === "stage") {
          window.dispatchEvent(new CustomEvent("fertilifix:manual-stage-confirmed"));
        }
        send("select", option.label, updated);
      });
      options.appendChild(button);
    }
  }

  async function send(action, message, requestedProfile = profile, retry = false) {
    if (busy) return;
    // Capture the prior history before adding this message: do not duplicate it.
    const body = retry ? retryRequest : {
      ...requestedProfile, action, message,
      use_web: false,
      history: [...conversation],
      visual_assessment: visionData
        && visionData.crop.trim().toLocaleLowerCase() === String(requestedProfile?.crop || "").trim().toLocaleLowerCase()
        ? visionData.visual_assessment : null,
    };
    if (!body) return;
    retryButton.hidden = true;
    if (!retry && action !== "start") {
      addMessage(message, "user");
      remember("user", message);
    }
    setBusy(true);
    const pending = addMessage(action === "start" ? "Preparando las preguntas para tu planta…" : "Preparando la respuesta…", "pending");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo consultar el asesor.");
      if (!payload.profile || typeof payload.answer !== "string") {
        throw new Error("El servidor devolvió una respuesta incompleta.");
      }
      pending.remove();
      profile = payload.profile;
      followUp = payload.follow_up || null;
      latestAssessment = payload.assessment || latestAssessment;
      window.dispatchEvent(new CustomEvent("fertilifix:metric-recommendations", {
        detail: { indicators: recommendationIndicators(payload) },
      }));
      if (saveActivePlant(false)) {
        showSavedPlantStatus("Perfil de planta actualizado.");
      }
      retryRequest = null;
      addMessage(payload.answer);
      remember("assistant", payload.answer);
      addSources(payload.sources || payload.web_alerts?.items);
      renderProfile();
      renderOptions();
      animateReplyMood(responseMascotMood(payload));
      if (!followUp) {
        window.dispatchEvent(new CustomEvent("fertilifix:profile-ready", {
          detail: { profile },
        }));
      }
    } catch (error) {
      pending.remove();
      setMascotState("sad");
      const detail = error.name === "AbortError"
        ? "La consulta tardó demasiado. Puedes reintentar."
        : error.message;
      addMessage(`No pude completar la consulta: ${detail}`, "error");
      retryRequest = body;
      retryButton.hidden = false;
    } finally {
      clearTimeout(timeout);
      setBusy(false);
      if (!panel.hidden) {
        const nextButton = options.querySelector("button");
        (retryRequest ? retryButton : nextButton || input).focus({ preventScroll: true });
      }
    }
  }

  setup.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy || !setup.reportValidity()) return;
    const crop = cropInput.value.trim();
    const location = locationInput.value.trim();
    const error = byId("setup-error");
    error.hidden = Boolean(crop && location);
    if (!crop || !location) {
      error.textContent = "Escribe la planta y su ciudad o municipio.";
      return;
    }
    const previousProfile = currentSavedPlantId ? profile : null;
    const matchingVision = visionData
      && visionData.crop.trim().toLocaleLowerCase() === crop.toLocaleLowerCase()
      ? visionData : null;
    const sameCrop = previousProfile?.crop.trim().toLocaleLowerCase() === crop.toLocaleLowerCase();
    if (!matchingVision && visionData
        && visionData.crop.trim().toLocaleLowerCase() !== crop.toLocaleLowerCase()) {
      visionData = null;
    }
    profile = {
      crop, location,
      stage: matchingVision?.stage || (sameCrop ? previousProfile?.stage : "") || "",
      substrate: previousProfile?.substrate || "",
      placement: previousProfile?.placement || "",
    };
    window.dispatchEvent(new CustomEvent("fertilifix:profile-cleared"));
    conversation = [];
    followUp = null;
    retryRequest = null;
    messages.replaceChildren();
    options.replaceChildren();
    options.hidden = true;
    input.value = "";
    setup.hidden = true;
    conversationView.hidden = false;
    byId("chat-step").textContent = "Ubicación · Considerar si la lluvia puede llegar a la planta";
    renderProfile();
    saveActivePlant(true);
    addMessage(`Mi planta: ${crop}. Ubicación: ${location}.`, "user");
    send("start", "");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy || !profile) return;
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    send("chat", message);
  });
  retryButton.addEventListener("click", () => send("chat", "", profile, true));

  byId("chat-edit").addEventListener("click", () => {
    if (busy) return;
    window.dispatchEvent(new CustomEvent("fertilifix:profile-cleared"));
    setup.hidden = false;
    conversationView.hidden = true;
    savedPlantStatus.hidden = true;
    renamePlantForm.hidden = true;
    cropInput.value = profile?.crop || "";
    locationInput.value = profile?.location || "";
    cropInput.focus();
  });

  window.addEventListener("fertilifix:vision-ready", (event) => {
    const detail = event.detail || {};
    if (typeof detail.crop !== "string" || !detail.crop.trim()) return;
    visionData = {
      crop: detail.crop.trim(),
      stage: typeof detail.stage === "string" ? detail.stage : "",
      visual_assessment: detail.visual_assessment || null,
    };
    currentSavedPlantId = null;
    renderSavedPlants();
    if (setup.hidden && !conversationView.hidden) byId("chat-edit").click();
    setup.hidden = false;
    conversationView.hidden = true;
    cropInput.value = visionData.crop;
    setup.scrollIntoView({ block: "nearest", behavior: "smooth" });
    locationInput.focus({ preventScroll: true });
  });

  window.addEventListener("fertilifix:vision-manual", () => {
    visionData = null;
    if (setup.hidden && !conversationView.hidden) byId("chat-edit").click();
    currentSavedPlantId = null;
    profile = null;
    conversation = [];
    followUp = null;
    retryRequest = null;
    messages.replaceChildren();
    options.replaceChildren();
    options.hidden = true;
    cropInput.value = "";
    locationInput.value = "";
    renamePlantForm.hidden = true;
    renderSavedPlants();
    setup.hidden = false;
    conversationView.hidden = true;
    setup.scrollIntoView({ block: "nearest", behavior: "smooth" });
    cropInput.focus({ preventScroll: true });
  });

  window.addEventListener("fertilifix:vision-busy", (event) => {
    if (!busy) {
      const visionBusy = event.detail?.busy === true;
      panel.setAttribute("aria-busy", String(visionBusy));
      setMascotState(visionBusy ? "thinking" : "idle");
    }
  });

  window.addEventListener("fertilifix:reading", (event) => {
    latestAssessment = event.detail?.assessment || null;
    if (!busy && profile && !followUp && !conversationView.hidden) {
      setMascotState(sensorMascotMood(latestAssessment));
    }
  });

  function close() {
    panel.hidden = true;
    document.body.classList.remove("advisor-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  }
  toggle.addEventListener("click", () => {
    if (!panel.hidden) return close();
    panel.hidden = false;
    document.body.classList.add("advisor-open");
    toggle.setAttribute("aria-expanded", "true");
    (setup.hidden ? input : cropInput).focus({ preventScroll: true });
    panel.scrollIntoView({ block: "start", behavior: "smooth" });
  });
  if (window.matchMedia("(min-width: 1180px)").matches) {
    panel.hidden = false;
    document.body.classList.add("advisor-open");
    toggle.setAttribute("aria-expanded", "true");
  }
  byId("chat-close").addEventListener("click", close);
  panel.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });

})();
