(() => {
  "use strict";

  const fields = ["hum", "temp", "ec", "ph", "n", "p", "k", "fert"];

  function openChart(key) {
    window.dispatchEvent(new CustomEvent("fertilifix:metric-chart", {
      detail: { key },
    }));
  }

  for (const key of fields) {
    const value = document.getElementById(key);
    const card = value?.closest(".card");
    if (!card) continue;

    const label = card.querySelector(".label")?.textContent.trim() || "medición";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-controls", "metric-detail-panel");
    card.setAttribute("aria-label", `Abrir gráfica de ${label}`);
    card.addEventListener("click", () => openChart(key));
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openChart(key);
    });
  }
})();
