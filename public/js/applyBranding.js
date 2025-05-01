export function applyBranding(uiBranding) {
  // Update title and subtitle
  const titleEl = document.querySelector("h1");
  const subtitleEl = document.querySelector(".header p, h2, .subheading");

  if (titleEl) titleEl.textContent = uiBranding.title;
  if (subtitleEl) subtitleEl.textContent = uiBranding.subtitle;

  // Update background color
  document.body.style.backgroundColor = uiBranding.backgroundColor || "#ffffff";

  // Logo
  const logoEl = document.querySelector(".logo, #logo");
  if (logoEl) logoEl.src = uiBranding.logoPath;

  // Watermark (via body::before)
  const watermarkStyle = document.createElement("style");
  watermarkStyle.innerHTML = `
    body::before {
      content: "";
      background: url('${uiBranding.watermarkImage}') center center no-repeat;
      background-size: contain;
      opacity: ${uiBranding.watermarkOpacity || 0.05};
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 0;
      pointer-events: none;
    }
  `;
  document.head.appendChild(watermarkStyle);

  // Inject dynamic CSS for bubbles and buttons
  const style = document.createElement("style");
  style.textContent = `
    .message.bot {
      background-color: ${uiBranding.bubbleColorBot};
      border-radius: ${uiBranding.borderRadius};
    }
    .message.user {
      background-color: ${uiBranding.bubbleColorUser};
      border-radius: ${uiBranding.borderRadius};
    }
    button, #send-button {
      background-color: ${uiBranding.primaryColor};
      border-radius: ${uiBranding.borderRadius};
      color: white;
      font-family: ${uiBranding.buttonFont || "inherit"};
      text-transform: ${uiBranding.buttonTextTransform || "none"};
    }
    button:hover, #send-button:hover {
      background-color: ${uiBranding.accentColor};
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}
