(() => {
  const STORAGE_KEY = 'correios-generador:v1';
  const $ = (selector, ctx = document) => ctx.querySelector(selector);
  const $$ = (selector, ctx = document) => [...ctx.querySelectorAll(selector)];

  const state = {
    step: 1,
    profiles: { recipient: [], collector: [] },
    last: { recipient: null, collector: null },
    tracking: [''],
    date: todayIso(),
    dateManual: false,
    draftPeople: { recipient: null, collector: null }
  };

  const refs = {
    form: $('#wizardForm'),
    trackingList: $('#trackingList'),
    preview: $('#previewText'),
    date: $('#pickupDate'),
    toast: $('#toast'),
    dialog: $('#settingsDialog'),
    savedSummary: $('#savedSummary')
  };

  function todayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function onlyDigits(value) { return String(value || '').replace(/\D/g, ''); }
  function formatCpf(value) {
    const d = onlyDigits(value).slice(0, 11);
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
  }

  function isValidCpf(value) {
    const cpf = onlyDigits(value);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    const calc = (length) => {
      let sum = 0;
      for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
      const digit = (sum * 10) % 11;
      return digit === 10 ? 0 : digit;
    };
    return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
  }

  function loadStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.profiles.recipient = Array.isArray(raw.profiles?.recipient) ? raw.profiles.recipient : [];
      state.profiles.collector = Array.isArray(raw.profiles?.collector) ? raw.profiles.collector : [];
      state.last.recipient = raw.last?.recipient || null;
      state.last.collector = raw.last?.collector || null;
      state.tracking = Array.isArray(raw.draft?.tracking) && raw.draft.tracking.length ? raw.draft.tracking.slice(0, 20) : [''];
      state.dateManual = Boolean(raw.draft?.dateManual);
      state.date = state.dateManual && raw.draft?.date ? raw.draft.date : todayIso();
      state.draftPeople.recipient = raw.draft?.recipient || null;
      state.draftPeople.collector = raw.draft?.collector || null;
    } catch (_) { /* localStorage corrompido: começa limpo */ }
  }

  function saveStore() {
    const data = {
      profiles: state.profiles,
      last: state.last,
      draft: {
        tracking: state.tracking,
        date: state.date,
        dateManual: state.dateManual,
        recipient: profileFromForm('recipient'),
        collector: profileFromForm('collector')
      }
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function profileFromForm(role) {
    const prefix = role === 'recipient' ? 'recipient' : 'collector';
    return {
      name: $(`#${prefix}Name`).value.trim(),
      cpf: formatCpf($(`#${prefix}Cpf`).value),
      rg: $(`#${prefix}Rg`).value.trim(),
      gender: $(`input[name="${prefix}Gender"]:checked`).value
    };
  }

  function fillProfile(role, profile) {
    if (!profile) return;
    const prefix = role === 'recipient' ? 'recipient' : 'collector';
    $(`#${prefix}Name`).value = profile.name || '';
    $(`#${prefix}Cpf`).value = formatCpf(profile.cpf || '');
    $(`#${prefix}Rg`).value = profile.rg || '';
    const gender = $(`input[name="${prefix}Gender"][value="${profile.gender || (role === 'recipient' ? 'f' : 'm')}"]`);
    if (gender) gender.checked = true;
    clearErrors(prefix);
    updatePreview();
  }

  function rememberProfile(role) {
    const profile = profileFromForm(role);
    const cpfKey = onlyDigits(profile.cpf);
    if (!cpfKey) return;
    const list = state.profiles[role].filter(p => onlyDigits(p.cpf) !== cpfKey);
    list.unshift(profile);
    state.profiles[role] = list.slice(0, 8);
    state.last[role] = cpfKey;
    saveStore();
    renderSaved();
  }

  function restoreLastProfiles() {
    ['recipient', 'collector'].forEach(role => {
      const draft = state.draftPeople[role];
      const hasDraft = draft && (draft.name || draft.cpf || draft.rg);
      if (hasDraft) { fillProfile(role, draft); return; }
      const key = state.last[role];
      const profile = state.profiles[role].find(p => onlyDigits(p.cpf) === key) || state.profiles[role][0];
      if (profile) fillProfile(role, profile);
    });
  }

  function renderSaved() {
    ['recipient', 'collector'].forEach(role => {
      const wrap = $(`#${role}SavedWrap`);
      const host = $(`#${role}Saved`);
      host.innerHTML = '';
      const list = state.profiles[role];
      wrap.classList.toggle('hidden', !list.length);
      list.forEach(profile => {
        const btn = document.createElement('button');
        btn.className = 'saved-chip';
        btn.type = 'button';
        btn.textContent = profile.name.split(' ').slice(0, 2).join(' ');
        btn.title = `${profile.name} - ${profile.cpf}`;
        btn.addEventListener('click', () => fillProfile(role, profile));
        host.appendChild(btn);
      });
    });
    renderSavedSummary();
  }

  function renderSavedSummary() {
    const all = [
      ...state.profiles.recipient.map(p => ({ ...p, kind: 'Destinatário' })),
      ...state.profiles.collector.map(p => ({ ...p, kind: 'Pessoa autorizada' }))
    ];
    refs.savedSummary.innerHTML = '';
    if (!all.length) {
      refs.savedSummary.innerHTML = '<div class="saved-person"><strong>Nenhuma pessoa salva ainda.</strong><span>Elas aparecem aqui depois que você avança pelo formulário.</span></div>';
      return;
    }
    const seen = new Set();
    all.forEach(p => {
      const key = `${onlyDigits(p.cpf)}:${p.kind}`;
      if (seen.has(key)) return;
      seen.add(key);
      const item = document.createElement('div');
      item.className = 'saved-person';
      const strong = document.createElement('strong');
      strong.textContent = p.name;
      const span = document.createElement('span');
      span.textContent = `${p.kind} · CPF ${p.cpf}${p.rg ? ` · RG ${p.rg}` : ''}`;
      item.append(strong, span);
      refs.savedSummary.appendChild(item);
    });
  }

  function setStep(next) {
    state.step = next;
    $$('.step').forEach(el => el.classList.toggle('active', Number(el.dataset.step) === next));
    $$('.progress-step').forEach(el => {
      const n = Number(el.dataset.goStep);
      el.classList.toggle('active', n === next);
      el.classList.toggle('done', n < next);
    });
    if (next === 3) updatePreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => $('.step.active input')?.focus({ preventScroll: true }), 180);
  }

  function setError(input, message) {
    input.classList.toggle('invalid', Boolean(message));
    const error = input.closest('.field')?.querySelector('.field-error');
    if (error) error.textContent = message || '';
  }

  function clearErrors(prefix) {
    [`#${prefix}Name`, `#${prefix}Cpf`].forEach(sel => setError($(sel), ''));
  }

  function validateRole(role) {
    const prefix = role;
    const name = $(`#${prefix}Name`);
    const cpf = $(`#${prefix}Cpf`);
    clearErrors(prefix);
    let ok = true;
    if (name.value.trim().split(/\s+/).length < 2) { setError(name, 'Digite o nome completo.'); ok = false; }
    if (!onlyDigits(cpf.value)) { setError(cpf, 'CPF é obrigatório.'); ok = false; }
    else if (!isValidCpf(cpf.value)) { setError(cpf, 'Confira o CPF: ele parece inválido.'); ok = false; }
    if (!ok) $('.invalid')?.focus();
    return ok;
  }

  function renderTracking() {
    refs.trackingList.innerHTML = '';
    state.tracking.forEach((code, index) => {
      const row = document.createElement('div');
      row.className = 'tracking-item';

      const n = document.createElement('span');
      n.className = 'tracking-index';
      n.textContent = String(index + 1).padStart(2, '0');

      const input = document.createElement('input');
      input.type = 'text';
      input.autocapitalize = 'characters';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.placeholder = index === 0 ? 'Código de rastreio' : 'Outro código de rastreio';
      input.value = code;
      input.setAttribute('aria-label', `Código de rastreio ${index + 1}`);
      input.addEventListener('input', e => {
        const start = e.target.selectionStart;
        const upper = e.target.value.toUpperCase().replace(/\s+/g, '');
        e.target.value = upper;
        if (start != null) e.target.setSelectionRange(start, start);
        state.tracking[index] = upper;
        saveStore();
        updatePreview();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-tracking';
      remove.textContent = '×';
      remove.title = 'Remover encomenda';
      remove.setAttribute('aria-label', `Remover código ${index + 1}`);
      remove.disabled = state.tracking.length === 1;
      remove.style.visibility = state.tracking.length === 1 ? 'hidden' : 'visible';
      remove.addEventListener('click', () => {
        state.tracking.splice(index, 1);
        saveStore();
        renderTracking();
        updatePreview();
      });

      row.append(n, input, remove);
      refs.trackingList.appendChild(row);
    });
  }

  function currentData() {
    return {
      recipient: profileFromForm('recipient'),
      collector: profileFromForm('collector'),
      tracking: state.tracking.filter(Boolean),
      date: refs.date.value || state.date || todayIso()
    };
  }

  function previewData() {
    const data = currentData();
    if (!data.recipient.name) data.recipient.name = '[nome do destinatário]';
    if (!data.recipient.cpf) data.recipient.cpf = '[CPF]';
    if (!data.collector.name) data.collector.name = '[nome de quem vai buscar]';
    if (!data.collector.cpf) data.collector.cpf = '[CPF]';
    if (!data.tracking.length) data.tracking = ['[código de rastreio]'];
    return data;
  }

  function updatePreview() {
    refs.preview.textContent = CorreiosPdf.buildAuthorizationText(previewData());
  }

  function validateTrackingAndDate() {
    const codes = state.tracking.map(v => v.trim()).filter(Boolean);
    if (!codes.length) { showToast('Adicione pelo menos um código de rastreio.'); refs.trackingList.querySelector('input')?.focus(); return false; }
    if (!refs.date.value) { showToast('Escolha a data da retirada.'); refs.date.focus(); return false; }
    return true;
  }

  function openPdf(data) {
    const popup = window.open('', '_blank');
    try {
      const pdfBytes = CorreiosPdf.createAuthorizationPdfBytes(data);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (popup) popup.location.href = url;
      else {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      showToast('PDF gerado. Já abri a versão pronta para imprimir.');
    } catch (error) {
      if (popup) popup.close();
      console.error(error);
      showToast('Não consegui gerar o PDF. Recarregue a página e tente de novo.');
    }
  }

  function showToast(message) {
    refs.toast.textContent = message;
    refs.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => refs.toast.classList.remove('show'), 2800);
  }

  function bind() {
    $$('[data-next]').forEach(btn => btn.addEventListener('click', () => {
      const role = state.step === 1 ? 'recipient' : 'collector';
      if (!validateRole(role)) return;
      rememberProfile(role);
      setStep(Number(btn.dataset.next));
    }));

    $$('[data-back]').forEach(btn => btn.addEventListener('click', () => setStep(Number(btn.dataset.back))));
    $$('.progress-step').forEach(btn => btn.addEventListener('click', () => {
      const target = Number(btn.dataset.goStep);
      if (target < state.step) setStep(target);
    }));

    ['recipientCpf', 'collectorCpf'].forEach(id => {
      const input = $(`#${id}`);
      input.addEventListener('input', () => { input.value = formatCpf(input.value); setError(input, ''); saveStore(); updatePreview(); });
    });

    ['recipientName', 'recipientRg', 'collectorName', 'collectorRg'].forEach(id => {
      $(`#${id}`).addEventListener('input', () => { setError($(`#${id}`), ''); saveStore(); updatePreview(); });
    });
    $$('input[type="radio"]').forEach(input => input.addEventListener('change', () => { saveStore(); updatePreview(); }));

    $('#addTracking').addEventListener('click', () => {
      state.tracking.push('');
      saveStore();
      renderTracking();
      refs.trackingList.lastElementChild?.querySelector('input')?.focus();
    });

    refs.date.addEventListener('change', () => {
      state.date = refs.date.value;
      state.dateManual = refs.date.value !== todayIso();
      saveStore();
      updatePreview();
    });

    refs.form.addEventListener('submit', e => {
      e.preventDefault();
      if (!validateRole('recipient')) { setStep(1); return; }
      if (!validateRole('collector')) { setStep(2); return; }
      if (!validateTrackingAndDate()) return;
      rememberProfile('recipient');
      rememberProfile('collector');
      openPdf(currentData());
    });

    refs.form.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.shiftKey || e.target.type === 'date') return;
      if (state.step < 3) {
        e.preventDefault();
        $(`[data-next="${state.step + 1}"]`)?.click();
      }
    });

    $('#settingsButton').addEventListener('click', () => { renderSavedSummary(); refs.dialog.showModal(); });
    $('#clearSaved').addEventListener('click', () => {
      if (!confirm('Apagar as pessoas salvas e o rascunho deste aparelho?')) return;
      localStorage.removeItem(STORAGE_KEY);
      state.profiles = { recipient: [], collector: [] };
      state.last = { recipient: null, collector: null };
      state.tracking = [''];
      state.date = todayIso();
      state.dateManual = false;
      state.draftPeople = { recipient: null, collector: null };
      ['recipientName','recipientCpf','recipientRg','collectorName','collectorCpf','collectorRg'].forEach(id => $(`#${id}`).value = '');
      $('input[name="recipientGender"][value="f"]').checked = true;
      $('input[name="collectorGender"][value="m"]').checked = true;
      refs.date.value = state.date;
      renderSaved();
      renderTracking();
      refs.dialog.close();
      showToast('Dados locais apagados.');
    });
  }

  loadStore();
  refs.date.value = state.date;
  renderTracking();
  renderSaved();
  restoreLastProfiles();
  bind();
  updatePreview();
})();
