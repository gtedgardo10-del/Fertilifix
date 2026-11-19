const fields = ["hum", "temp", "ec", "ph", "n", "p", "k", "fert"];
const visibleRecordFields = ["hum", "temp", "ec", "ph", "n", "p", "k", "fert"];
const recordHeaders = {
  hum: "Humedad (%)",
  temp: "Temp. (°C)",
  ec: "EC (µS/cm)",
  ph: "pH",
  n: "N (mg/kg)",
  p: "P (mg/kg)",
  k: "K (mg/kg)",
  fert: "Fertilidad (FERT)",
};
const recordUnits = {
  hum: "%",
  temp: "°C",
  ec: "µS/cm",
  ph: "",
  n: "mg/kg",
  p: "mg/kg",
  k: "mg/kg",
  fert: "",
};
const averageCountEls = Object.fromEntries(
  visibleRecordFields.map((field) => [field, document.getElementById(`avg-count-${field}`)]),
);
const averageValueEls = Object.fromEntries(
  visibleRecordFields.map((field) => [field, document.getElementById(`avg-${field}`)]),
);
const history = Object.fromEntries(fields.map((f) => [f, []]));
const chartSamples = [];
const chartRetentionMs = 20 * 60 * 1000;
let chartWindowMinutes = 20;
const statusEl = document.getElementById("status");
const recordsSection = document.getElementById("records-section");
const recordsEl = document.getElementById("records");
const recordsCount = document.getElementById("records-count");
const clearRecordsButton = document.getElementById("clear-records");
const metricPanel = document.getElementById("metric-detail-panel");
const metricChartView = document.getElementById("metric-chart-view");
const metricRecommendation = document.getElementById("metric-recommendation");
const headerClock = document.getElementById("chat-toggle-clock");
let activeField = null;
let lastReading = null;
let lastSampleId = null;
let lastAssessment = null;
let records = [];
const recommendationByMetric = new Map();

function updateHeaderClock() {
  const now = new Date();
  headerClock.dateTime = now.toISOString();
  headerClock.textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

updateHeaderClock();
window.setInterval(updateHeaderClock, 30_000);

function renderRecords() {
  recordsSection.hidden = false;
  recordsCount.textContent = records.length + (records.length === 1 ? " guardada" : " guardadas");
  clearRecordsButton.disabled = records.length === 0;
  if (!records.length) {
    recordsEl.innerHTML = '<p class="records-empty">Aún no hay lecturas guardadas.</p>';
    return;
  }
  const headers = ["Hora", ...visibleRecordFields.map((field) => recordHeaders[field])];
  recordsEl.innerHTML = `<table class="records-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${records
    .map(
      (r) =>
        `<tr><td>${r.time}</td>${visibleRecordFields
          .map((f) => `<td>${r[f] ?? "—"}</td>`)
          .join("")}</tr>`,
    )
    .join("")}</tbody></table>`;
}

document.getElementById("record-btn").addEventListener("click", async () => {
  if (!lastReading) return;
  const res = await fetch("/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ time: new Date().toLocaleTimeString(), ...lastReading }),
  });
  records = await res.json();
  renderRecords();
});

renderRecords();

clearRecordsButton.addEventListener("click", async () => {
  if (!records.length || !window.confirm("¿Vaciar el historial de lecturas guardadas?")) return;
  const res = await fetch("/records", { method: "DELETE" });
  records = await res.json();
  renderRecords();
});

if (localStorage.getItem('stem_light') === '1') document.body.classList.add('light');

document.querySelector('h1').addEventListener('dblclick', () => {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem('stem_light', isLight ? '1' : '0');
});

function draw(field) {
  const vals = history[field];
  if (vals.length < 2) return;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * 100;
      const y = 22 - ((v - min) / span) * 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  document.querySelector(`#g-${field} polyline`).setAttribute("points", pts);
}

function formatAverage(value) {
  const rounded = Number(value.toFixed(1));
  return String(rounded);
}

function renderAverages() {
  for (const field of visibleRecordFields) {
    const values = history[field];
    const count = values.length;
    const average = count ? values.reduce((sum, value) => sum + value, 0) / count : null;
    averageValueEls[field].textContent = average == null ? "—" : formatAverage(average);
    averageCountEls[field].textContent = `${count} ${count === 1 ? "lectura" : "lecturas"}`;
  }
}

function renderMetricPanel() {
  if (!activeField || metricPanel.hidden) return;
  const card = document.getElementById(activeField).closest(".card");
  document.getElementById("metric-panel-title").textContent =
    card.querySelector(".label").textContent;
  document.getElementById("metric-panel-value").textContent =
    lastReading?.[activeField] ?? "—";
  document.getElementById("metric-panel-unit").textContent = recordUnits[activeField] || "";
  document.querySelector(".chart-session-note").textContent =
    `Vista cronológica completa de las lecturas recibidas en los últimos ${chartWindowMinutes} minutos de esta sesión.`;

  const metric = lastAssessment?.metrics?.[activeField];
  const recommendation = recommendationByMetric.get(activeField)
    || [metric?.suggestion, metric?.recommendation]
    .find((item) => typeof item === "string" && item.trim())?.trim() || "";
  metricRecommendation.hidden = !recommendation;
  metricChartView.hidden = Boolean(recommendation);
  document.getElementById("metric-recommendation-text").textContent = recommendation;
  if (recommendation) return;

  const now = Date.now();
  const cutoff = now - chartWindowMinutes * 60 * 1000;
  const samples = chartSamples
    .filter((sample) => sample.timestamp >= cutoff && Number.isFinite(sample.values[activeField]))
    .sort((a, b) => a.timestamp - b.timestamp);
  const svg = document.getElementById("metric-chart-svg");
  const empty = document.getElementById("metric-chart-empty");
  const line = document.getElementById("metric-chart-line");
  const latestDot = document.getElementById("metric-chart-latest-dot");
  line.setAttribute("d", "");
  const timeStart = document.getElementById("chart-time-start");
  const timeMiddle = document.getElementById("chart-time-middle");
  const timeEnd = document.getElementById("chart-time-end");
  const summary = document.getElementById("metric-chart-summary");

  if (!samples.length) {
    svg.hidden = false;
    svg.setAttribute("aria-label", `Sin lecturas de ${chartWindowMinutes} minutos para ${card.querySelector(".label").textContent}.`);
    latestDot.hidden = true;
    empty.hidden = false;
    empty.textContent = `No hay lecturas en los últimos ${chartWindowMinutes} minutos.`;
    for (const label of ["chart-y-0", "chart-y-1", "chart-y-2", "chart-y-3", "chart-y-4"]) {
      document.getElementById(label).textContent = "—";
    }
    timeStart.textContent = "—";
    timeMiddle.textContent = "—";
    timeEnd.textContent = "—";
    summary.textContent = "0 lecturas";
    return;
  }

  svg.hidden = false;
  empty.hidden = true;
  const values = samples.map((sample) => sample.values[activeField]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const padding = (max - min) * 0.08 || Math.max(Math.abs(max) * 0.05, 0.5);
  const chartMin = min - padding;
  const chartMax = max + padding;
  const chartSpan = chartMax - chartMin || 1;
  const plotLeft = 58;
  const plotRight = 625;
  const plotTop = 24;
  const plotBottom = 210;
  const periodMs = chartWindowMinutes * 60 * 1000;

  for (let i = 0; i <= 4; i += 1) {
    const value = chartMax - (chartSpan * i) / 4;
    document.getElementById(`chart-y-${i}`).textContent = formatAverage(value);
  }

  let previousTimestamp = null;
  const path = samples.map((sample) => {
    const x = plotLeft + ((sample.timestamp - cutoff) / periodMs) * (plotRight - plotLeft);
    const y = plotTop + ((chartMax - sample.values[activeField]) / chartSpan) * (plotBottom - plotTop);
    const command = previousTimestamp == null || sample.timestamp - previousTimestamp > 5000 ? "M" : "L";
    previousTimestamp = sample.timestamp;
    return `${command}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  line.setAttribute("d", path);

  const latest = samples[samples.length - 1];
  const latestX = plotLeft + ((latest.timestamp - cutoff) / periodMs) * (plotRight - plotLeft);
  const latestY = plotTop + ((chartMax - latest.values[activeField]) / chartSpan) * (plotBottom - plotTop);
  latestDot.setAttribute("cx", latestX.toFixed(1));
  latestDot.setAttribute("cy", latestY.toFixed(1));
  latestDot.hidden = false;

  const formatTime = (timestamp) => new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  timeStart.textContent = formatTime(cutoff);
  timeMiddle.textContent = formatTime(cutoff + periodMs / 2);
  timeEnd.textContent = formatTime(now);
  summary.textContent =
    `${samples.length} lecturas · mín ${formatAverage(min)} · promedio ${formatAverage(average)} · máx ${formatAverage(max)}`;
  svg.setAttribute(
    "aria-label",
    `Gráfica cronológica de ${card.querySelector(".label").textContent}, últimos ${chartWindowMinutes} minutos, ${samples.length} lecturas.`,
  );
}

function renderRecommendationIndicators(indicators) {
  recommendationByMetric.clear();
  for (const field of fields) {
    const card = document.getElementById(field)?.closest(".card");
    if (!card) continue;
    card.classList.remove("metric-recommended");
    card.removeAttribute("data-recommendation-level");
    card.removeAttribute("aria-description");
    card.querySelector(".metric-recommendation-badge")?.remove();
  }

  const validLevels = new Set(["action", "warning", "positive", "info", "historical"]);
  for (const item of Array.isArray(indicators) ? indicators : []) {
    if (!item || !fields.includes(item.key) || !validLevels.has(item.level)) continue;
    const card = document.getElementById(item.key)?.closest(".card");
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!card || !label) continue;

    card.classList.add("metric-recommended");
    card.dataset.recommendationLevel = item.level;
    const badge = document.createElement("span");
    badge.className = "metric-recommendation-badge";
    badge.textContent = label;
    badge.setAttribute("aria-hidden", "true");
    card.insertBefore(badge, card.querySelector(".val"));
    const description = typeof item.text === "string" && item.text.trim()
      ? item.text.trim() : `Recomendación: ${label}.`;
    card.setAttribute("aria-description", description);
    recommendationByMetric.set(item.key, description);
  }

  if (!metricPanel.hidden) renderMetricPanel();
}

window.addEventListener("fertilifix:metric-recommendations", (event) => {
  renderRecommendationIndicators(event.detail?.indicators);
});
window.addEventListener("fertilifix:profile-cleared", () => {
  renderRecommendationIndicators([]);
});

window.addEventListener("fertilifix:metric-chart", (event) => {
  const key = event.detail?.key;
  if (!fields.includes(key)) return;
  activeField = key;
  metricPanel.hidden = false;
  renderMetricPanel();
  metricPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

document.querySelectorAll("[data-chart-window]").forEach((button) => {
  button.addEventListener("click", () => {
    chartWindowMinutes = Number(button.dataset.chartWindow);
    document.querySelectorAll("[data-chart-window]").forEach((option) => {
      option.setAttribute("aria-pressed", String(option === button));
    });
    renderMetricPanel();
  });
});

document.getElementById("metric-panel-close").addEventListener("click", () => {
  metricPanel.hidden = true;
  activeField = null;
});

function renderState(d, recs, assessment) {
  lastReading = d;
  lastAssessment = assessment;
  records = recs;
  renderRecords();
  const isNewSample = assessment?.sample_id != null && assessment.sample_id !== lastSampleId;
  if (isNewSample) {
    lastSampleId = assessment.sample_id;
    const values = Object.fromEntries(
      visibleRecordFields.map((field) => [field, d[field]]),
    );
    chartSamples.push({ timestamp: Number(assessment.sample_id), values });
    const retentionCutoff = Date.now() - chartRetentionMs;
    while (chartSamples.length && chartSamples[0].timestamp < retentionCutoff) {
      chartSamples.shift();
    }
    if (chartSamples.length > 3000) chartSamples.shift();
  }
  for (const f of fields) {
    const el = document.getElementById(f);
    el.textContent = d[f] ?? "--";
    if (isNewSample && typeof d[f] === "number" && Number.isFinite(d[f])) {
      history[f].push(d[f]);
      if (history[f].length > 30) history[f].shift();
      draw(f);
    }
  }
  renderAverages();
  if (!metricPanel.hidden) renderMetricPanel();
  if (assessment?.source === "live") {
    statusEl.textContent = "En vivo";
    statusEl.className = "ok";
  } else if (assessment?.source === "test") {
    statusEl.textContent = "";
    statusEl.className = "";
  } else if (assessment?.source === "demo") {
    statusEl.textContent = "Demostración";
    statusEl.className = "mock";
  } else if (assessment?.source === "stale") {
    statusEl.textContent = "Lectura antigua";
    statusEl.className = "mock";
  } else if (assessment?.source === "waiting") {
    statusEl.textContent = "Esperando sensor";
    statusEl.className = "";
  } else {
    statusEl.textContent = "Desconectado";
    statusEl.className = "";
  }
  window.dispatchEvent(new CustomEvent("fertilifix:reading", {
    detail: { reading: d, assessment },
  }));
}

const es = new EventSource("/stream");
es.onmessage = (e) => {
  const { data, records: recs, assessment } = JSON.parse(e.data);
  renderState(data, recs, assessment);
};
es.onerror = () => {
  statusEl.textContent = "Sin conexión con el servidor";
  statusEl.className = "";
  if (lastAssessment) {
    lastAssessment = {
      ...lastAssessment,
      source: "disconnected",
      source_label: "Sin conexión",
    };
    window.dispatchEvent(new CustomEvent("fertilifix:reading", {
      detail: { reading: lastReading, assessment: lastAssessment },
    }));
  }
};
