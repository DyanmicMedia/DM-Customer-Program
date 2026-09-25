/**
 * Shared Lead Modal & AJAX Handler for Customer Programs
 */

/** Scroll to on-page registration and optionally preselect hardware. */
function goToRegister(preselectedHardware = '') {
  const pageHardwareSelect = document.getElementById('pageHardwareSelect');
  const modalHardwareSelect = document.getElementById('modalHardwareSelect');

  if (preselectedHardware) {
    if (pageHardwareSelect) {
      // Match by value prefix when exact option strings differ slightly
      const options = Array.from(pageHardwareSelect.options);
      const exact = options.find((o) => o.value === preselectedHardware);
      const loose = options.find((o) =>
        o.value.toLowerCase().includes(preselectedHardware.toLowerCase().slice(0, 12))
      );
      pageHardwareSelect.value = (exact || loose || { value: preselectedHardware }).value;
    }
    if (modalHardwareSelect) {
      const options = Array.from(modalHardwareSelect.options);
      const exact = options.find((o) => o.value === preselectedHardware);
      const loose = options.find((o) =>
        o.value.toLowerCase().includes(preselectedHardware.toLowerCase().slice(0, 12))
      );
      if (exact || loose) modalHardwareSelect.value = (exact || loose).value;
    }
  }

  const contact = document.getElementById('contact');
  if (contact) {
    contact.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Focus first empty required field after scroll settles
    setTimeout(() => {
      const first = document.querySelector('#pageLeadForm [name="locationName"]');
      if (first) first.focus({ preventScroll: true });
    }, 450);
  }
}

function openLeadModal(preselectedHardware = '') {
  const leadModal = document.getElementById('leadModal');
  const modalHardwareSelect = document.getElementById('modalHardwareSelect');
  const pageHardwareSelect = document.getElementById('pageHardwareSelect');
  const modalFormStatus = document.getElementById('modalFormStatus');

  if (preselectedHardware) {
    if (modalHardwareSelect) modalHardwareSelect.value = preselectedHardware;
    if (pageHardwareSelect) pageHardwareSelect.value = preselectedHardware;
  }
  if (modalFormStatus) modalFormStatus.className = 'hidden';
  if (leadModal) {
    leadModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }
}

function closeLeadModal() {
  const leadModal = document.getElementById('leadModal');
  if (leadModal) {
    leadModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
}

document.addEventListener('keydown', (e) => {
  const selfServe = document.getElementById('selfServeModal');
  if (selfServe && !selfServe.classList.contains('hidden')) return;
  const leadModal = document.getElementById('leadModal');
  if (e.key === 'Escape' && leadModal && !leadModal.classList.contains('hidden')) {
    closeLeadModal();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  function setupFormHandler(formId, submitBtnId, statusId, isModal = false) {
    const form = document.getElementById(formId);
    const submitBtn = document.getElementById(submitBtnId);
    const formStatus = document.getElementById(statusId);

    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (formStatus) formStatus.className = 'hidden';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-75');
      }
      const originalText = submitBtn ? submitBtn.innerHTML : 'Submit';
      if (submitBtn) submitBtn.innerHTML = '<span>Submitting Registration...</span>';

      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());

      try {
        const res = await fetch('/api/submitLead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
          if (formStatus) {
            formStatus.className = 'block rounded-xl p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-medium';
            formStatus.innerHTML = '&check; ' + (data.message || 'Thank you! Your store registration has been received. Jason Spangler will follow up shortly.');
          }
          form.reset();
          if (isModal) {
            setTimeout(() => { closeLeadModal(); }, 3500);
          }
        } else {
          throw new Error(data.error || 'Server error occurred');
        }
      } catch (err) {
        if (formStatus) {
          const supportEmail = form.dataset.supportEmail;
          const supportMessage = supportEmail
            ? ` Or email <a href="mailto:${supportEmail}" class="font-bold underline">${supportEmail}</a>.`
            : ' - Or call 1-844-229-1217 directly.';
          formStatus.className = 'block rounded-xl p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-medium';
          formStatus.innerHTML = '&#9888; ' + err.message + supportMessage;
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove('opacity-75');
          submitBtn.innerHTML = originalText;
        }
      }
    });
  }

  setupFormHandler('modalLeadForm', 'modalSubmitBtn', 'modalFormStatus', true);
  setupFormHandler('pageLeadForm', 'pageSubmitBtn', 'pageFormStatus', false);
});
