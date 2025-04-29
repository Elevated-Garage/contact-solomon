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
  const fileInput = document.getElementById("fileElem");
  const thumbnailWrapper = document.getElementById("thumbnail-wrapper");
  const submitBtn = document.getElementById("photo-submit");
  const skipBtn = document.getElementById("photo-skip");
  const uploadBox = document.getElementById("photo-uploader");

  const sessionId = localStorage.getItem("solomonSession");

  if (dragArea) {
    dragArea.addEventListener("click", () => fileInput.click());
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

          container.appendChild(img);
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
        alert("❌ No files selected!");
        return;
      }

      const formData = new FormData();
      for (const file of files) {
        formData.append("photos", file);
      }

      // Disable button while uploading
      submitBtn.disabled = true;
      submitBtn.innerText = "Uploading...";

      try {
        const res = await fetch("/upload-photos", {
          method: "POST",
          headers: {
            "x-session-id": sessionId
          },
          body: formData
        });

        if (res.ok) {
          alert("✅ Upload Successful!");
          if (uploadBox) uploadBox.style.display = "none"; // Hide uploader
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

  if (skipBtn) {
    skipBtn.addEventListener("click", async () => {
      try {
        await fetch("/skip-photo-upload", {
          method: "POST",
          headers: {
            "x-session-id": sessionId
          }
        });
        alert("✅ Skipped photo upload.");
        if (uploadBox) uploadBox.style.display = "none"; // Hide uploader
      } catch (err) {
        console.error("❌ Error skipping photo upload:", err.message);
        alert("❌ Error skipping. Please try again.");
      }
    });
  }
});
