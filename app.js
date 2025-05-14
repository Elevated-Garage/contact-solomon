
const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const chatLog = document.getElementById('chat-log');
const dragArea = document.getElementById("drag-area");
const fileInput = document.getElementById("file-upload");
const submitBtn = document.getElementById("photo-submit");
const skipBtn = document.getElementById("photo-skip");
const thumbnailWrapper = document.getElementById("thumbnail-wrapper");
const sessionId = localStorage.getItem('solomonSession') || crypto.randomUUID();
localStorage.setItem('solomonSession', sessionId);

// Append message to chat log
function appendMessage(sender, message) {
  const msg = document.createElement('div');
  msg.innerHTML = `<strong>${sender}:</strong> ${message}`;
  chatLog.appendChild(msg);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Check if all required fields are filled
function isIntakeComplete(data) {
  const filledCount = [
    data.full_name, data.email, data.phone,
    data.goals, data.square_footage,
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
    <p><strong>Goals:</strong> ${data.goals || 'N/A'}</p>
    <p><strong>Square Footage:</strong> ${data.square_footage || 'N/A'}</p>
    <p><strong>Must-Have Features:</strong> ${data.must_have_features || 'N/A'}</p>
    <p><strong>Budget:</strong> ${data.budget || 'N/A'}</p>
    <p><strong>Start Date:</strong> ${data.start_date || 'N/A'}</p>
    <p><strong>Final Notes:</strong> ${data.final_notes || 'N/A'}</p>
    <p><strong>Photo Upload:</strong> ${data.photo_upload || 'N/A'}</p>
  `;
  summaryContainer.classList.remove('hidden');
  summaryContainer.scrollIntoView({ behavior: 'smooth' });
  downloadSection.style.display = 'block';

  const downloadBtn = document.getElementById("download-summary");
if (downloadBtn && data.drive_file_id) {
  downloadBtn.setAttribute("data-drive-id", data.drive_file_id);
  console.log("✅ Attached drive_file_id to button:", data.drive_file_id);

  downloadBtn.onclick = () => {
    console.log("⬇️ Download button clicked! Opening:", `https://drive.google.com/uc?export=download&id=${data.drive_file_id}`);
    window.open(`https://drive.google.com/uc?export=download&id=${data.drive_file_id}`, "_blank");
  };
} else {
  console.warn("❌ download-summary button not found or drive_file_id missing.");
}

// Call this after upload or skip
async function finalizeIntakeFlow() {
  try {
    const res = await fetch("/submit-final-intake", {
      method: "POST",
      headers: { "x-session-id": sessionId }
    });
    const data = await res.json();

    if (data.triggerUpload) {
      const uploader = document.getElementById("photo-uploader");
      if (uploader) {
        console.log("📸 Displaying photo uploader");
        uploader.classList.remove("hidden");
        uploader.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }


    if (isIntakeComplete(data)) {
      showSummary(data);
    } else {
      alert("❌ You're missing some required intake steps. Please finish the questions first.");
    }
  } catch (err) {
    console.error("❌ Intake submission failed:", err.message);
    alert("❌ Error completing intake. Please try again.");
  }
}

// Form submission (chat)
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const userMessage = input.value.trim();
  if (!userMessage) return;

  appendMessage('You', userMessage);
  input.value = '';

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
    console.log("🧪 AI Response:", data);

    if (data.triggerUpload) {
      const uploader = document.getElementById("photo-uploader");
      if (uploader) {
        console.log("📸 Displaying photo uploader");
        uploader.classList.remove("hidden");
        uploader.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        console.warn("❌ Photo uploader element not found in DOM.");
      }
    }

    if (typeof data.reply === 'string') {
      appendMessage('Solomon', data.reply);
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

// Confirm summary
document.getElementById('confirm-summary')?.addEventListener('click', () => {
  alert('✅ Project summary confirmed. Our team will reach out soon!');
});


// --- Begin field definitions and Solomon-style prompts ---
const intakeFieldPrompts = {
  full_name: "What’s your full name?",
  email: "Could you provide your email address?",
  phone: "What’s the best phone number to reach you at?",
  goals: "Tell me a bit about your Goals. What would you love to see?",
  square_footage: "Approximately how many square feet is your garage?",
  must_have_features: "What are your must-have features?",
  budget: "What’s your ideal budget for this garage project?",
  start_date: "When are you hoping to get started?",
  final_notes: "Any final notes or specific requests you'd like us to know?"
};

function getMissingFields(data) {
  return Object.keys(intakeFieldPrompts).filter(field => !data[field]);
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
    const answer = input.value.trim();
    if (!answer) return;
    appendMessage("You", answer);
    input.value = "";

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

    if (data.triggerUpload) {
      const uploader = document.getElementById("photo-uploader");
      if (uploader) {
        console.log("📸 Displaying photo uploader");
        uploader.classList.remove("hidden");
        uploader.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }


    if (isIntakeComplete(data)) {
      showSummary(data);
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
