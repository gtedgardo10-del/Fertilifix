const fields = ["hum", "temp", "ec", "ph", "n", "p", "k", "fert"];
const ranges = {
  hum: [45, 70],
  temp: [18, 28],
  ec: [500, 1100],
  ph: [5.8, 7.0],
  n: [25, 75],
  p: [20, 55],
  k: [35, 95],
  fert: [20, 90],
};
const history = Object.fromEntries(fields.map((f) => [f, []]));
const historyTimes = [];
const statusEl = document.getElementById("status");
const recordsSection = document.getElementById("records-section");
const recordsEl = document.getElementById("records");
const modal = document.getElementById("chart-modal");
let activeField = null;
let lastReading = null;
let records = [];

function renderRecords() {
  recordsSection.hidden = records.length === 0;
  const headers = ["Time", "Hum", "Temp", "EC", "pH", "N", "P", "K", "Fert"];
  recordsEl.innerHTML = `<table class="records-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${records
    .map(
      (r) =>
        `<tr><td>${r.time}</td>${fields
          .map((f) => {
            const [min, max] = ranges[f];
            const cls =
              typeof r[f] === "number" && (r[f] < min || r[f] > max)
                ? ' class="alert"'
                : "";
            return `<td${cls}>${r[f]}</td>`;
          })
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

if (localStorage.getItem('stem_light') === '1') document.body.classList.add('light');

document.querySelector('h1').addEventListener('dblclick', () => {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem('stem_light', isLight ? '1' : '0');
});

document.querySelector('#records-section h2').addEventListener('dblclick', async () => {
  await fetch("/records", { method: "DELETE" });
  records = [];
  renderRecords();
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

function renderModal() {
  if (!activeField) return;
  const vals = history[activeField];
  const card = document.getElementById(activeField).closest(".card");
  document.getElementById("modal-title").textContent =
    card.querySelector(".label").textContent;
  document.getElementById("modal-val").textContent =
    lastReading?.[activeField] ?? "--";
  document.getElementById("modal-start").textContent = historyTimes[0] ?? "";
  document.getElementById("modal-end").textContent =
    historyTimes[historyTimes.length - 1] ?? "";
  if (vals.length < 2) return;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  document.getElementById("modal-range").textContent =
    `min ${min} · max ${max}`;
  const pts = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * 300;
      const y = 110 - ((v - min) / span) * 100;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  document.querySelector("#modal-svg polyline").setAttribute("points", pts);
}

document.querySelectorAll(".card").forEach((card) => {
  card.addEventListener("click", () => {
    activeField = card.querySelector(".val").id;
    renderModal();
    modal.showModal();
  });
});

modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.close();
});

function renderState(d, recs) {
  lastReading = d;
  records = recs;
  renderRecords();
  historyTimes.push(new Date().toLocaleTimeString());
  if (historyTimes.length > 30) historyTimes.shift();
  for (const f of fields) {
    const el = document.getElementById(f);
    el.textContent = d[f] ?? "--";
    if (typeof d[f] === "number") {
      const [min, max] = ranges[f];
      el.closest(".card").classList.toggle("alert", d[f] < min || d[f] > max);
      history[f].push(d[f]);
      if (history[f].length > 30) history[f].shift();
      draw(f);
    }
  }
  if (modal.open) renderModal();
  if (d.connected) {
    statusEl.textContent = "connected";
    statusEl.className = "ok";
  } else if (d.debug) {
    statusEl.textContent = "mock";
    statusEl.className = "mock";
  } else {
    statusEl.textContent = "disconnected";
    statusEl.className = "";
  }
}

const es = new EventSource("/stream");
es.onmessage = (e) => {
  const { data, records: recs } = JSON.parse(e.data);
  renderState(data, recs);
};
es.onerror = () => {
  statusEl.textContent = "offline";
  statusEl.className = "";
};
