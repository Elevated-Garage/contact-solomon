
const form = document.getElementById('chat-form');
console.log("✅ form element:", form);
const input = document.getElementById('input-field');
document.getElementById("input-field")?.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    document.getElementById("send-button")?.click();
  }
});
// update from 'user-input'
const chatLog = document.getElementById('chat-log');
appendMessage("Solomon", "👋 Hey there! Before we get started, I have a few quick questions to help design your perfect garage.");
const dragArea = document.getElementById("drag-area");
const fileInput = document.getElementById("file-upload");
const submitBtn = document.getElementById("photo-submit");
const skipBtn = document.getElementById("photo-skip");
const thumbnailWrapper = document.getElementById("thumbnail-wrapper");

let sessionId = localStorage.getItem('solomonSession');
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem('solomonSession', sessionId);
}
console.log("🧭 Using session ID:", sessionId);

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const userMessage = input.innerText.trim();
  if (!userMessage) return;

  appendMessage('You', userMessage);
  input.innerText = '';

  // 👇 Show typing indicator
  showTyping();

  try {
    const res = await fetch('/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({ message: userMessage })
    });

    // 👇 Hide typing indicator when response arrives
    hideTyping();

    const data = await res.json();
    appendMessage('Solomon', data.reply);

    if (data.triggerUpload) {
      const uploader = document.getElementById("photo-uploader");
      if (uploader) {
        uploader.classList.remove("hidden");
        uploader.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    if (data.show_summary || data.open_upload) {
      finalizeIntakeFlow();
    }

  } catch (err) {
    hideTyping(); // 👈 Also hide on error
    appendMessage('Solomon', '❌ Error responding. Please try again.');
  }
});



// Append message to chat log
function appendMessage(sender, message) {
  const msg = document.createElement('div');
  msg.classList.add('message', sender === 'You' ? 'user' : 'bot');
  msg.innerHTML = `<div class="bubble">${message}</div>`;
  chatLog.appendChild(msg);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Typing indicator control
function showTyping() {
  const typing = document.getElementById('typing');
  if (typing) typing.style.display = 'block';
}

function hideTyping() {
  const typing = document.getElementById('typing');
  if (typing) typing.style.display = 'none';
}

 function shouldTriggerPhotoStep(data) {
  const requiredFields = [
    "full_name",
    "email",
    "phone",
    "garage_goals",
    "square_footage",
    "must_have_features",
    "budget",
    "start_date",
    "final_notes"
  ];
  return requiredFields.every(field => data[field] && data[field].trim() !== "");
}

// Check if all required fields are filled
function isIntakeComplete(data) {
  const filledCount = [
    data.full_name, data.email, data.phone,
    data.garage_goals, data.square_footage,
    data.must_have_features, data.budget,
    data.start_date, data.final_notes
  ].filter(Boolean).length;
  return filledCount === 9;
}

// Display summary data
function showSummary(data) {
  const summaryContainer = document.getElementById('summary-container');
  const summaryContent = document.getElementById('summary-content');
  const downloadSection = document.getElementById('summary-download');

  summaryContent.innerHTML = `
    <p><strong>Full Name:</strong> ${data.full_name || 'N/A'}</p>
    <p><strong>Email:</strong> ${data.email || 'N/A'}</p>
    <p><strong>Phone:</strong> ${data.phone || 'N/A'}</p>
    <p><strong>Garage Goals:</strong> ${data.garage_goals || 'N/A'}</p>
    <p><strong>Square Footage:</strong> ${data.square_footage || 'N/A'}</p>
    <p><strong>Must-Have Features:</strong> ${data.must_have_features || 'N/A'}</p>
    <p><strong>Budget:</strong> ${data.budget || 'N/A'}</p>
    <p><strong>Start Date:</strong> ${data.start_date || 'N/A'}</p>
    <p><strong>Final Notes:</strong> ${data.final_notes || 'N/A'}</p>
    <p><strong>Garage Photo Upload:</strong> ${data.garage_photo_upload || 'N/A'}</p>
  `;
  summaryContainer.classList.remove('hidden');
  summaryContainer.scrollIntoView({ behavior: 'smooth' });
  downloadSection.style.display = 'block';
}

// Form submission (chat)
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const userMessage = input.innerText.trim(); // ✅ use innerText for contenteditable div
  if (!userMessage) return;

  appendMessage('You', userMessage);
  input.innerText = '';

  try {
    const res = await fetch('/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({ message: userMessage })
    });

    const data = await res.json();
    appendMessage('Solomon', data.reply);
    
    if (data.triggerUpload) {
  const uploader = document.getElementById("photo-uploader");
  if (uploader) {
    uploader.classList.remove("hidden");
    uploader.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

    if (data.show_summary || data.open_upload) {
      finalizeIntakeFlow();
    }

  } catch (err) {
    appendMessage('Solomon', '❌ Error responding. Please try again.');
  }
});


// Drag-click area to open file dialog
dragArea?.addEventListener("click", (e) => {
  const isInside = e.target.closest('.remove-button') || e.target.closest('.thumbnail-container');
  const isFileInput = e.target.tagName === 'INPUT';
  if (!isInside && !isFileInput) fileInput?.click();
});

// Preview image thumbnails
fileInput?.addEventListener("change", (event) => {
  const files = event.target.files;
  thumbnailWrapper.innerHTML = '';
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = function (e) {
      const container = document.createElement('div');
      container.className = 'thumbnail-container';

      const img = document.createElement('img');
      img.className = 'thumbnail';
      img.src = e.target.result;

      const removeButton = document.createElement('button');
      removeButton.className = 'remove-button';
      removeButton.innerHTML = '&times;';
      removeButton.onclick = function (event) {
        event.stopPropagation();
        container.remove();
      };

      container.appendChild(img);
      container.appendChild(removeButton);
      thumbnailWrapper.appendChild(container);
    };
    reader.readAsDataURL(file);
  });
});

// Upload photos
submitBtn?.addEventListener("click", async () => {
  if (!fileInput.files.length) return alert("❌ No files selected.");
  const formData = new FormData();
  for (const file of fileInput.files) {
    formData.append("photos", file);
  }

  try {
    const res = await fetch("/upload-photos", {
      method: "POST",
      headers: { "x-session-id": sessionId },
      body: formData
    });

    if (res.ok) {
      console.log("✅ Photos uploaded.");
      await finalizeIntakeFlow();
    } else {
      alert("❌ Upload failed. Please try again.");
    }
  } catch (err) {
    console.error("❌ Upload error:", err.message);
    alert("❌ Upload error. Please check your connection.");
  }
});

// Skip upload
skipBtn?.addEventListener("click", async () => {
  try {
    await fetch("/skip-photo-upload", {
      method: "POST",
      headers: { "x-session-id": sessionId }
    });
    console.log("✅ Photo upload skipped.");
    await finalizeIntakeFlow();
  } catch (err) {
    console.error("❌ Error skipping photo upload:", err.message);
    alert("❌ Error skipping. Please try again.");
  }
});

// Summary Download
document.getElementById('download-summary')?.addEventListener('click', () => {
  const summary = document.getElementById('summary-content')?.innerText;
  const blob = new Blob([summary], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'garage_project_summary.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

// Confirm summary
document.getElementById('confirm-summary')?.addEventListener('click', () => {
  alert('✅ Project summary confirmed. Our team will reach out soon!');
});


// --- Begin field definitions and Solomon-style prompts ---
const intakeFieldPrompts = {
  full_name: "What’s your full name?",
  email: "Could you provide your email address?",
  phone: "What’s the best phone number to reach you at?",
  garage_goals: "Tell me a bit about your garage goals. What would you love to see?",
  square_footage: "Approximately how many square feet is your garage?",
  must_have_features: "What are your must-have features?",
  budget: "What’s your ideal budget for this garage project?",
  start_date: "When are you hoping to get started?",
  final_notes: "Any final notes or specific requests you'd like us to know?"
};

function getMissingFields(data) {
  return Object.keys(intakeFieldPrompts).filter(field => {
    const value = data[field];
    return !value || value.trim() === "";
  });
}



let missingFieldsQueue = [];
let currentMissingIndex = 0;

// Send Solomon-style prompt for the next missing field
function promptNextMissingField() {
  if (currentMissingIndex >= missingFieldsQueue.length) {
    finalizeIntakeFlow(); // Retry summary once all fields are captured
    return;
  }

  const field = missingFieldsQueue[currentMissingIndex];
  const prompt = intakeFieldPrompts[field];
  appendMessage("Solomon", prompt);

  // Temporarily repurpose form submission for this missing field
  const tempListener = async function (e) {
    e.preventDefault();
    const answer = input.innerText.trim();
    if (!answer) return;
    appendMessage("You", answer);
    input.innerText = "";

    try {
      // Save field value back to server (simulate patch/update)
      await fetch("/update-intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId
        },
        body: JSON.stringify({ field, value: answer })
      });

      currentMissingIndex++;
      promptNextMissingField(); // Ask next one
    } catch (err) {
      console.error("❌ Error updating intake field:", err.message);
      appendMessage("Solomon", "Oops! Something went wrong while saving your answer.");
    }
    form.removeEventListener("submit", tempListener);
  };

  form.addEventListener("submit", tempListener);
}

// Enhanced finalizeIntakeFlow with fallback prompting
async function finalizeIntakeFlow() {
  try {
    const res = await fetch("/submit-final-intake", {
      method: "POST",
      headers: { "x-session-id": sessionId }
    });
    const data = await res.json();

console.log("📦 Intake data received:", data);
console.log("🔍 shouldTriggerPhotoStep:", shouldTriggerPhotoStep(data));

if (shouldTriggerPhotoStep(data)) {
  console.log("📸 Attempting to show photo uploader...");
  const uploader = document.getElementById("photo-uploader");
  if (uploader) {
    console.log("✅ Found uploader. Displaying it.");
    uploader.classList.remove("hidden");
    uploader.scrollIntoView({ behavior: 'smooth' });
  } else {
    console.warn("❌ #photo-uploader not found in DOM.");
  }

} else {
  missingFieldsQueue = getMissingFields(data);
  currentMissingIndex = 0;
  promptNextMissingField();
}

  } catch (err) {
    console.error("❌ Intake submission failed:", err.message);
    appendMessage("Solomon", "Sorry, something went wrong submitting your answers. Please try again.");
  }
}
