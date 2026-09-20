(() => {
  const chatWindow = document.getElementById("chat-window");
  const emptyState = document.getElementById("empty-state");
  const chatForm = document.getElementById("chat-form");
  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("send-btn");
  const attachBtn = document.getElementById("attach-btn");
  const fileInput = document.getElementById("file-input");
  const attachmentPreview = document.getElementById("attachment-preview");
  const attachmentName = document.getElementById("attachment-name");
  const attachmentRemove = document.getElementById("attachment-remove");
  const typingIndicator = document.getElementById("typing-indicator");

  // Chat history kept client-side and replayed to the backend on every
  // request so the model has conversational context. Only text is kept in
  // history (attached files apply just to the turn they were sent on).
  let history = [];
  let pendingFile = null;

  // ---------------------------------------------------------------------
  // Textarea auto-grow
  // ---------------------------------------------------------------------
  messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 140)}px`;
  });

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      chatForm.requestSubmit();
    }
  });

  // ---------------------------------------------------------------------
  // Attachment handling
  // ---------------------------------------------------------------------
  attachBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    pendingFile = file;
    attachmentName.textContent = `📎 ${file.name} (${formatBytes(file.size)})`;
    attachmentPreview.classList.remove("hidden");
  });

  attachmentRemove.addEventListener("click", () => {
    pendingFile = null;
    fileInput.value = "";
    attachmentPreview.classList.add("hidden");
  });

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ---------------------------------------------------------------------
  // Message rendering
  // ---------------------------------------------------------------------
  function scrollToBottom() {
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function hideEmptyState() {
    if (emptyState) emptyState.remove();
  }

  function addMessage({ role, text, file, isError }) {
    hideEmptyState();

    const wrapper = document.createElement("div");
    wrapper.className = `message message--${role === "user" ? "user" : "ai"}`;

    const bubble = document.createElement("div");
    bubble.className = "message__bubble" + (isError ? " error" : "");
    bubble.textContent = text;
    wrapper.appendChild(bubble);

    if (file) {
      const attachmentEl = document.createElement("div");
      attachmentEl.className = "message__attachment";

      if (file.type.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        attachmentEl.appendChild(img);
      } else {
        attachmentEl.textContent = `📎 ${file.name}`;
      }
      wrapper.appendChild(attachmentEl);
    }

    chatWindow.appendChild(wrapper);
    scrollToBottom();
    return bubble;
  }

  function setBusy(isBusy) {
    sendBtn.disabled = isBusy;
    attachBtn.disabled = isBusy;
    messageInput.disabled = isBusy;
    typingIndicator.classList.toggle("hidden", !isBusy);
    if (isBusy) scrollToBottom();
  }

  // ---------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const text = messageInput.value.trim();
    const file = pendingFile;

    if (!text && !file) return;

    // Render the user's message immediately.
    addMessage({ role: "user", text, file });

    // Reset input state right away for responsiveness.
    messageInput.value = "";
    messageInput.style.height = "auto";
    fileInput.value = "";
    pendingFile = null;
    attachmentPreview.classList.add("hidden");

    setBusy(true);

    try {
      const formData = new FormData();
      formData.append("message", text);
      formData.append("history", JSON.stringify(history));
      if (file) formData.append("file", file);

      const res = await fetch("/api/chat", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Request failed.");
      }

      addMessage({ role: "model", text: data.reply });

      // Update history with this turn (text only).
      history.push({ role: "user", text: text || `[Attached file: ${file?.name}]` });
      history.push({ role: "model", text: data.reply });
    } catch (err) {
      addMessage({
        role: "model",
        text: `Error: ${err.message}`,
        isError: true,
      });
    } finally {
      setBusy(false);
      messageInput.focus();
    }
  });
})();
