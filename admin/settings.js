let configData = {};

async function loadSettings() {
  const res = await fetch('/admin/settings');
  configData = await res.json();

  renderToggles(configData, document.getElementById('toggle-group'));
  renderLists(configData, document.getElementById('list-group'));
  renderTextareas(configData, document.getElementById('textarea-group'));
}

function renderToggles(data, container) {
  for (const key in data) {
    const setting = data[key];
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

      container.appendChild(wrapper);
    }
  }
}

function renderLists(data, container) {
  for (const key in data) {
    const setting = data[key];
    if (setting.type === 'list') {
      const wrapper = document.createElement('div');
      wrapper.className = 'list-container';

      const label = document.createElement('label');
      label.innerText = setting.label;

      const list = document.createElement('ul');
      list.id = `${key}-list`;
      list.style.paddingLeft = '1rem';

      (setting.value || []).forEach(item => {
        const li = document.createElement('li');
        li.style.marginBottom = '0.5rem';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = item;
        input.className = 'list-input';

        li.appendChild(input);
        list.appendChild(li);
      });

      const addBtn = document.createElement('button');
      addBtn.innerText = '+ Add Field';
      addBtn.type = 'button';
      addBtn.onclick = () => {
        const li = document.createElement('li');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'list-input';
        li.appendChild(input);
        list.appendChild(li);
      };

      wrapper.appendChild(label);
      wrapper.appendChild(list);
      wrapper.appendChild(addBtn);
      container.appendChild(wrapper);
    }
  }
}

function renderTextareas(data, container) {
  for (const key in data) {
    const setting = data[key];
    if (setting.type === 'textarea') {
      const label = document.createElement('label');
      label.innerText = setting.label;

      const textarea = document.createElement('textarea');
      textarea.id = key;
      textarea.value = setting.value || '';
      container.appendChild(label);
      container.appendChild(textarea);
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
    } else if (setting.type === 'list') {
      const listEls = document.querySelectorAll(`#${key}-list input`);
      newConfig[key] = {
        ...setting,
        value: Array.from(listEls)
          .map(el => el.value.trim())
          .filter(val => val.length > 0)
      };
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
