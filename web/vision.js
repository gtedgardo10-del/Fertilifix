(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const fileInput = byId("plant-image-input");
  const selectButton = byId("plant-image-select");
  const card = byId("plant-image-card");
  const preview = byId("plant-image-preview");
  const imageWrap = byId("plant-image-wrap");
  const loading = byId("plant-image-loading");
  const loadingText = byId("plant-image-loading-text");
  const status = byId("plant-image-status");
  const retryButton = byId("plant-image-retry");
  const typeResult = byId("plant-identification");
  const stateResult = byId("plant-state-result");
  const correctionForm = byId("plant-crop-correction");
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const maximumBytes = 8 * 1024 * 1024;
  const maximumImageEdge = 2048;
  const optimizeAboveBytes = 1.5 * 1024 * 1024;

  let imageData = "";
  let previewUrl = "";
  let requestId = 0;
  let controller = null;
  let identification = null;
  let stateAssessment = null;
  let confirmedCrop = "";
  let retryPhase = "plant";

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
      reader.addEventListener("error", () => reject(new Error("No se pudo leer el archivo.")), { once: true });
      reader.readAsDataURL(file);
    });
  }

  async function prepareImageData(file) {
    if (typeof createImageBitmap !== "function") return readAsDataUrl(file);

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return readAsDataUrl(file);
    }

    try {
      const longestEdge = Math.max(bitmap.width, bitmap.height);
      if (longestEdge <= maximumImageEdge && file.size <= optimizeAboveBytes) {
        return await readAsDataUrl(file);
      }

      const scale = Math.min(1, maximumImageEdge / longestEdge);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { alpha: file.type !== "image/jpeg" });
      if (!context) return await readAsDataUrl(file);
      if (file.type === "image/jpeg") {
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const outputType = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
      const optimized = await new Promise((resolve) => {
        canvas.toBlob(resolve, outputType, 0.88);
      });
      if (!optimized || optimized.size >= file.size) return await readAsDataUrl(file);
      return await readAsDataUrl(optimized);
    } finally {
      bitmap.close?.();
    }
  }

  function setPhase(active, message, completeThrough = active - 1) {
    const list = byId("plant-scan-progress");
    list.hidden = false;
    for (const item of list.querySelectorAll("[data-phase]")) {
      const phase = item.dataset.phase;
      const number = phase === "plant" ? 1 : phase === "state" ? 2 : 3;
      item.classList.toggle("is-complete", number <= completeThrough);
      item.classList.toggle("is-active", number === active && number > completeThrough);
      if (number === active && number > completeThrough) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    }
    const scanStatus = byId("plant-scan-status");
    scanStatus.hidden = !message;
    scanStatus.textContent = message;
  }

  function setLoading(value, text = "Analizando foto…") {
    imageWrap.classList.toggle("is-loading", value);
    loading.hidden = !value;
    loadingText.textContent = text;
    if (value) retryButton.hidden = true;
    window.dispatchEvent(new CustomEvent("fertilifix:vision-busy", {
      detail: { busy: value },
    }));
  }

  function resetAnalysis() {
    identification = null;
    stateAssessment = null;
    confirmedCrop = "";
    typeResult.hidden = true;
    stateResult.hidden = true;
    correctionForm.hidden = true;
    byId("plant-confidence-warning").hidden = true;
    byId("plant-stage-reason").hidden = true;
    byId("plant-scan-progress").hidden = true;
    byId("plant-scan-status").hidden = true;
    byId("plant-use-identification").hidden = false;
    byId("plant-correct-plant").hidden = false;
    byId("plant-image-upload-error").hidden = true;
    status.textContent = "";
  }

  function clearImage() {
    requestId += 1;
    controller?.abort();
    controller = null;
    imageData = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    preview.removeAttribute("src");
    fileInput.value = "";
    card.hidden = true;
    imageWrap.classList.remove("is-loading");
    loading.hidden = true;
    retryButton.hidden = true;
    resetAnalysis();
  }

  async function readResponse(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "No se pudo analizar la foto.");
    return data;
  }

  function showTypeResult(data) {
    identification = data;
    byId("plant-result-name").textContent = data.plant_name || "No se identificó la planta";
    const scientificName = byId("plant-result-scientific");
    scientificName.textContent = data.scientific_name || "";
    scientificName.hidden = !data.scientific_name;
    byId("plant-result-confidence-row").hidden = false;
    byId("plant-result-confidence").textContent = `${data.confidence ?? 0}%`;

    const lowConfidence = !data.identified || data.confidence < 60;
    const warning = byId("plant-confidence-warning");
    warning.hidden = !lowConfidence;
    warning.textContent = lowConfidence
      ? `No se identificó con claridad: ${data.confidence_reason || "la foto no muestra suficientes detalles para distinguir la planta."}`
      : "";

    byId("plant-use-identification").hidden = !data.identified;
    byId("plant-correct-plant").hidden = !data.identified;
    correctionForm.hidden = Boolean(data.identified);
    typeResult.hidden = false;
    retryButton.hidden = true;
    setPhase(1, data.identified
      ? "1 de 3 · Confirma la planta para analizar su etapa y sus señales visibles."
      : "1 de 3 · No pude confirmar el tipo; escribe el nombre para continuar con la foto.", 0);
  }

  async function analyzePlant(token) {
    retryPhase = "plant";
    setPhase(1, "1 de 3 · Identificando el tipo de planta…", 0);
    setLoading(true, "1/3 · Identificando planta…");
    controller = new AbortController();
    try {
      const response = await fetch("/identify-plant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_data: imageData }),
        signal: controller.signal,
      });
      const data = await readResponse(response);
      if (token !== requestId) return;
      showTypeResult(data);
    } catch (error) {
      if (token !== requestId || error.name === "AbortError") return;
      status.textContent = error.message || "No se pudo identificar la planta.";
      retryButton.hidden = false;
      typeResult.hidden = false;
      byId("plant-result-name").textContent = "No pude identificar la planta";
      byId("plant-result-scientific").hidden = true;
      byId("plant-result-confidence-row").hidden = true;
      byId("plant-use-identification").hidden = true;
      byId("plant-correct-plant").hidden = true;
      correctionForm.hidden = false;
      setPhase(1, "Puedes escribir el tipo de planta para seguir con el análisis.", 0);
    } finally {
      if (token === requestId) {
        controller = null;
        setLoading(false);
      }
    }
  }

  function renderVisualFindings(visual) {
    byId("plant-visual-summary").textContent = visual?.summary
      || "No se detectaron señales claras en esta foto; podrían existir problemas que no sean visibles.";
    const list = byId("plant-visual-findings");
    list.replaceChildren();
    for (const finding of Array.isArray(visual?.findings) ? visual.findings : []) {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      title.textContent = finding.finding || "Señal visible";
      item.appendChild(title);
      if (finding.possible_cause) {
        const cause = document.createElement("p");
        cause.textContent = `Posible causa: ${finding.possible_cause}`;
        item.appendChild(cause);
      }
      if (finding.recommended_check) {
        const check = document.createElement("p");
        check.textContent = `Qué revisar: ${finding.recommended_check}`;
        item.appendChild(check);
      }
      list.appendChild(item);
    }
  }

  function showStateResult(data) {
    stateAssessment = data;
    const stage = data.stage || {};
    byId("plant-stage-label").textContent = stage.identified
      ? `Etapa sugerida: ${stage.label}`
      : "No pude distinguir la etapa con claridad.";
    byId("plant-stage-confidence").textContent = stage.identified
      ? `${stage.confidence ?? 0}%`
      : "Sin coincidencia suficiente";
    const reason = byId("plant-stage-reason");
    const lowConfidence = !stage.identified || (stage.confidence ?? 0) < 60;
    reason.hidden = !lowConfidence;
    reason.textContent = !lowConfidence
      ? ""
      : stage.identified
        ? `La coincidencia es baja; confirma si coincide o elige la etapa manualmente. ${stage.reason || "La foto no muestra suficientes señales para distinguirla."}`
        : `El asesor te preguntará la etapa manualmente. ${stage.reason || "La foto no muestra suficientes señales para distinguirla."}`;
    byId("plant-confirm-stage").hidden = !stage.identified;
    byId("plant-stage-manual").textContent = "Elegir etapa manualmente";
    renderVisualFindings(data.visual);
    stateResult.hidden = false;
    status.textContent = "";
    retryButton.hidden = true;
    setPhase(2, stage.identified
      ? "2 de 3 · Revisa la etapa sugerida y las señales de la foto."
      : "2 de 3 · La etapa se confirmará con el asesor usando la respuesta manual.", 1);
  }

  function showStateFailure(errorMessage) {
    stateAssessment = null;
    byId("plant-stage-label").textContent = "Análisis visual incompleto";
    byId("plant-stage-confidence").textContent = "Sin resultado";
    byId("plant-stage-reason").textContent = "El asesor te preguntará la etapa manualmente.";
    byId("plant-stage-reason").hidden = false;
    byId("plant-confirm-stage").hidden = true;
    byId("plant-stage-manual").textContent = "Continuar y elegir etapa manualmente";
    byId("plant-visual-summary").textContent = errorMessage;
    byId("plant-visual-findings").replaceChildren();
    stateResult.hidden = false;
    status.textContent = "";
    setPhase(2, "2 de 3 · Puedes continuar; el asesor preguntará la etapa.", 1);
  }

  async function analyzeState(crop, token = requestId) {
    if (!imageData || !crop || token !== requestId) return;
    confirmedCrop = crop;
    const identifiedName = String(identification?.plant_name || "").trim().toLocaleLowerCase();
    const manuallyNamed = !identification?.identified
      || identifiedName !== crop.trim().toLocaleLowerCase();
    byId("plant-result-name").textContent = crop;
    const scientificName = byId("plant-result-scientific");
    if (manuallyNamed) {
      scientificName.textContent = "Tipo indicado por ti";
      scientificName.hidden = false;
      byId("plant-result-confidence-row").hidden = true;
    } else {
      byId("plant-result-confidence-row").hidden = false;
    }
    byId("plant-use-identification").hidden = true;
    byId("plant-correct-plant").hidden = true;
    correctionForm.hidden = true;
    retryPhase = "state";
    stateAssessment = null;
    stateResult.hidden = true;
    setPhase(2, "2 de 3 · Analizando etapa y señales visibles…", 1);
    setLoading(true, "2/3 · Analizando etapa y estado visible…");
    controller = new AbortController();
    try {
      const response = await fetch("/analyze-plant-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_data: imageData, crop }),
        signal: controller.signal,
      });
      const data = await readResponse(response);
      if (token !== requestId) return;
      showStateResult(data);
    } catch (error) {
      if (token !== requestId || error.name === "AbortError") return;
      showStateFailure(error.message || "No se pudo terminar el análisis visual.");
      retryButton.hidden = false;
    } finally {
      if (token === requestId) {
        controller = null;
        setLoading(false);
      }
    }
  }

  function continueToProfile(stage = "") {
    if (!confirmedCrop) return;
    const detail = {
      crop: confirmedCrop,
      stage,
      visual_assessment: stateAssessment,
    };
    if (stage) {
      setPhase(3, "3 de 3 · Indica la localidad; el asesor preguntará si está dentro o fuera para considerar la lluvia.", 2);
    } else {
      setPhase(2, "2 de 3 · Indica la localidad; el asesor preguntará dónde está y te ayudará a elegir la etapa.", 1);
    }
    window.dispatchEvent(new CustomEvent("fertilifix:vision-ready", { detail }));
  }

  function openManualProfile() {
    controller?.abort();
    controller = null;
    setLoading(false);
    confirmedCrop = "";
    stateAssessment = null;
    resetAnalysis();
    window.dispatchEvent(new CustomEvent("fertilifix:vision-manual"));
  }

  selectButton.addEventListener("click", () => fileInput.click());
  byId("plant-manual-start").addEventListener("click", openManualProfile);

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const uploadError = byId("plant-image-upload-error");
    if (!allowedTypes.has(file.type)) {
      uploadError.textContent = "Selecciona una foto JPEG, PNG o WebP.";
      uploadError.hidden = false;
      fileInput.value = "";
      return;
    }
    if (file.size > maximumBytes) {
      uploadError.textContent = "La foto debe pesar como máximo 8 MB.";
      uploadError.hidden = false;
      fileInput.value = "";
      return;
    }

    uploadError.hidden = true;
    const token = ++requestId;
    controller?.abort();
    controller = null;
    resetAnalysis();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    card.hidden = false;
    status.textContent = "Preparando foto para agilizar el análisis…";
    retryButton.hidden = true;
    setPhase(1, "1 de 3 · Optimizando la foto si hace falta y preparando el análisis.", 0);
    setLoading(true, "1/3 · Preparando foto…");
    try {
      imageData = await prepareImageData(file);
      if (token !== requestId) return;
      await analyzePlant(token);
    } catch (error) {
      if (token !== requestId) return;
      imageData = "";
      setLoading(false);
      status.textContent = error.message || "No se pudo leer la foto.";
    }
  });

  byId("plant-use-identification").addEventListener("click", () => {
    if (!identification?.identified) return;
    analyzeState(identification.plant_name);
  });

  byId("plant-correct-plant").addEventListener("click", () => {
    correctionForm.hidden = false;
    byId("plant-crop-correction-input").focus();
  });
  correctionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const crop = byId("plant-crop-correction-input").value.trim();
    if (!crop) {
      byId("plant-crop-correction-input").focus();
      return;
    }
    analyzeState(crop);
  });

  byId("plant-confirm-stage").addEventListener("click", () => {
    const stage = stateAssessment?.stage;
    if (!stage?.identified) return;
    continueToProfile(stage.value);
  });
  byId("plant-stage-manual").addEventListener("click", () => continueToProfile(""));
  retryButton.addEventListener("click", () => {
    const token = ++requestId;
    controller?.abort();
    if (retryPhase === "state" && confirmedCrop) analyzeState(confirmedCrop, token);
    else analyzePlant(token);
  });
  byId("plant-image-remove").addEventListener("click", clearImage);

  window.addEventListener("fertilifix:manual-stage-confirmed", () => {
    if (imageData && confirmedCrop) {
      setPhase(3, "3 de 3 · Etapa confirmada manualmente. Continúa con las recomendaciones.", 2);
    }
  });
  window.addEventListener("fertilifix:profile-ready", () => {
    if (imageData && confirmedCrop) {
      setPhase(3, "Recomendaciones listas con los datos del sensor y las señales de la foto.", 3);
    }
  });
})();
