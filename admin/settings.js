
let configData = {};

async function loadSettings() {
  const res = await fetch('/admin/settings');
  configData = await res.json();

  const form = document.getElementById('admin-form');
  form.innerHTML = '';

  for (const key in configData) {
    const setting = configData[key];

    if (setting.type === 'toggle') {
      const wrapper = document.createElement('div');
      wrapper.className = 'toggle-container';

      const switchLabel = document.createElement('label');
      switchLabel.className = 'switch';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = setting.enabled;
      input.id = key;

      const slider = document.createElement('span');
      slider.className = 'slider';

      switchLabel.appendChild(input);
      switchLabel.appendChild(slider);

      const labelText = document.createElement('span');
      labelText.textContent = setting.label;

      wrapper.appendChild(switchLabel);
      wrapper.appendChild(labelText);

      form.appendChild(wrapper);
    } else if (setting.type === 'textarea') {
      const label = document.createElement('label');
      label.innerText = setting.label;

      const textarea = document.createElement('textarea');
      textarea.id = key;
      textarea.value = setting.value || '';
      form.appendChild(label);
      form.appendChild(textarea);
    }
  }
}

async function saveSettings() {
  const newConfig = {};
  for (const key in configData) {
    const setting = configData[key];
    if (setting.type === 'toggle') {
      newConfig[key] = { ...setting, enabled: document.getElementById(key).checked };
    } else if (setting.type === 'textarea') {
      newConfig[key] = { ...setting, value: document.getElementById(key).value };
    }
  }

  const res = await fetch('/admin/save-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newConfig)
  });

  alert(res.ok ? "Settings saved successfully!" : "Failed to save settings.");
}

window.onload = loadSettings;
