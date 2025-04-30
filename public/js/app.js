const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const chatLog = document.getElementById('chat-log');

let sessionId = localStorage.getItem('solomonSession') || crypto.randomUUID();
localStorage.setItem('solomonSession', sessionId);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const userMessage = input.value.trim();
  if (!userMessage) return;

  appendMessage('You', userMessage);
  input.value = '';

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
});

function appendMessage(sender, message) {
  const msg = document.createElement('div');
  msg.innerHTML = `<strong>${sender}:</strong> ${message}`;
  chatLog.appendChild(msg);
  chatLog.scrollTop = chatLog.scrollHeight;
}
document.addEventListener("DOMContentLoaded", function () {
const dragArea = document.getElementById("drag-area");
const fileInput = document.getElementById("file-upload");
const submitBtn = document.getElementById("photo-submit");
const skipBtn = document.getElementById("photo-skip");
const thumbnailWrapper = document.getElementById("thumbnail-wrapper");

if (dragArea && fileInput) {
  dragArea.addEventListener("click", (e) => {
    const isInsideRemovable = e.target.closest('.remove-button') || e.target.closest('.thumbnail-container');
    const isFileInput = e.target.tagName === 'INPUT';

    if (!isInsideRemovable && !isFileInput) {
      fileInput.click();
    }
  });
}

if (fileInput) {
  fileInput.addEventListener("change", function (event) {
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
}

if (submitBtn) {
  submitBtn.addEventListener("click", async () => {
    const files = fileInput.files;
    if (!files.length) {
      console.log("❌ No files selected.");
      return;
    }

    const sessionId = localStorage.getItem("solomonSession");
    const formData = new FormData();
    for (const file of files) {
      formData.append("photos", file);
    }

    try {
      const res = await fetch("/upload-photos", {
        method: "POST",
        headers: {
          "x-session-id": sessionId
        },
        body: formData
      });

      if (res.ok) {
        console.log("✅ Photos uploaded successfully!");
        await fetch("/submit-final-intake", {
          method: "POST",
          headers: {
            "x-session-id": sessionId
          }
        });
        console.log("✅ Final intake summary requested after photo upload.");
      } else {
        console.error("❌ Photo upload failed.");
      }
    } catch (err) {
      console.error("❌ Error uploading photos:", err.message);
    }
  });
}

if (skipBtn) {
  skipBtn.addEventListener("click", async () => {
    const sessionId = localStorage.getItem("solomonSession");

    try {
      await fetch("/skip-photo-upload", {
        method: "POST",
        headers: {
          "x-session-id": sessionId
        }
      });

      console.log("✅ Photo upload skipped.");
      await fetch("/submit-final-intake", {
        method: "POST",
        headers: {
          "x-session-id": sessionId
        }
      });

      console.log("✅ Final intake summary requested after skipping photo.");
    } catch (err) {
      console.error("❌ Error skipping photo upload:", err.message);
    }
  });
  }
});

// Count how many required fields are filled
const filledCount = [
  data.full_name,
  data.email,
  data.phone,
  data.garage_goals,
  data.square_footage,
  data.must_have_features,
  data.budget,
  data.start_date,
  data.final_notes
].filter(Boolean).length;

if (filledCount === 9) {
  document.getElementById('summary-container').classList.remove('hidden');
  document.getElementById('summary-container').scrollIntoView({ behavior: 'smooth' });
  showSummary(data);
} else {
  alert("❌ You're missing some required intake steps. Please finish the questions first.");
}


        } else {
          alert("❌ Upload failed. Please try again.");
        }
      } catch (err) {
        console.error("❌ Upload error:", err.message);
        alert("❌ Upload error. Please check your connection.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = ""; // Put back SVG if you want, or just text
      }
    });
  }

const data = await res.json();

// Count how many required fields are filled
const filledCount = [
  data.full_name,
  data.email,
  data.phone,
  data.garage_goals,
  data.square_footage,
  data.must_have_features,
  data.budget,
  data.start_date,
  data.final_notes
].filter(Boolean).length;

if (filledCount === 9) {
  document.getElementById('summary-container').classList.remove('hidden');
  document.getElementById('summary-container').scrollIntoView({ behavior: 'smooth' });
  showSummary(data);
} else {
  alert("❌ You're missing some required intake steps. Please finish the questions first.");
}


      } catch (err) {
        console.error("❌ Error skipping photo upload:", err.message);
        alert("❌ Error skipping. Please try again.");
      }
    });
    // --- Summary generation logic ---

function showSummary(data) {
  const summaryContainer = document.getElementById('summary-container');
  const summaryContent = document.getElementById('summary-content');
  const downloadSection = document.getElementById('summary-download'); // ✅ Make sure to select the hidden div

  // Fill the summary with data
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

  // Smooth scroll to the summary section
  summaryContainer.scrollIntoView({ behavior: 'smooth' });

  // ✅ Now reveal the download button section
  downloadSection.style.display = 'block';
}

// 📄 Download the project summary when button is clicked
document.getElementById('download-summary').addEventListener('click', () => {
  const summary = document.getElementById('summary-content').innerText;
  const blob = new Blob([summary], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'garage_project_summary.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});


document.getElementById('confirm-summary').addEventListener('click', async () => {
  alert('✅ Project summary confirmed. Our team will reach out soon!');
  // Redirect or reset UI here if you want
});
