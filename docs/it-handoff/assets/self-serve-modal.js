/**
 * After Find Your Setup: checkout for Sonos / app / computer, or the lead form.
 */
(function (root) {
  let currentStep = { playerKey: "app", hardwareValue: "", label: "" };

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(message) {
    const status = $("ssStatus");
    if (!status) return;
    if (!message) {
      status.className = "hidden";
      status.textContent = "";
      return;
    }
    status.className = "block rounded-lg p-3 text-xs bg-rose-50 border border-rose-200 text-rose-800";
    status.textContent = message;
  }

  function openSelfServeModal(step) {
    const modal = $("selfServeModal");
    if (!modal) return;
    currentStep = Object.assign({ playerKey: "app", hardwareValue: "", label: "" }, step || {});
    const summary = $("ssSetupSummary");
    if (summary) {
      summary.textContent = currentStep.label
        ? "You selected " + currentStep.label + "."
        : "Choose how you want to continue.";
    }
    setStatus("");
    modal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
  }

  function closeSelfServeModal() {
    const modal = $("selfServeModal");
    if (!modal) return;
    modal.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
  }

  function goContact() {
    closeSelfServeModal();
    if (typeof goToRegister === "function") goToRegister(currentStep.hardwareValue);
  }

  async function continueToCheckout() {
    const checkout = root.ProgramCheckout;
    if (!checkout) throw new Error("Checkout is not available");
    const programId = "brokenyolk";
    const res = await fetch("/programs/" + programId + ".json", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load program catalog");
    const program = await res.json();
    window.location.href = checkout.beginCheckout(program, {
      playerKey: currentStep.playerKey || "app",
      hardwarePreference: currentStep.hardwareValue
    });
  }

  function applySetupChoice(key) {
    const checkout = root.ProgramCheckout;
    const step = checkout && checkout.setupNextStep ? checkout.setupNextStep(key) : { action: "lead" };
    const select = $("pageHardwareSelect");
    if (select && step.hardwareValue) select.value = step.hardwareValue;

    if (step.action === "checkout") {
      openSelfServeModal(step);
      return step;
    }
    if (typeof goToRegister === "function") goToRegister(step.hardwareValue);
    return step;
  }

  document.addEventListener("keydown", (e) => {
    const modal = $("selfServeModal");
    if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) {
      closeSelfServeModal();
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    $("ssPlayerNext") && $("ssPlayerNext").addEventListener("click", () => {
      continueToCheckout().catch((err) => setStatus(err.message));
    });
    document.querySelectorAll("[data-ss-contact]").forEach((btn) => {
      btn.addEventListener("click", goContact);
    });
  });

  root.openSelfServeModal = openSelfServeModal;
  root.closeSelfServeModal = closeSelfServeModal;
  root.applySetupChoice = applySetupChoice;
})(typeof window !== "undefined" ? window : globalThis);
